-- Adapted from wow-ai. See third_party/wow-ai/LICENSE and provenance.json.
local AC = AzerothCoach
AC.Link = {pending = {}, queue = {}, free = 200, lastSeen = nil, provider = nil}
local L = AC.Link
local Codec = AzerothCoachCodec
local RS, US = "\30", "\31"
local strip, pool, signalOK, presenceIndex, presenceReady = nil, {}, false, 0, false
local function wire(s) return (tostring(s or ""):gsub("[\30\31]", " ")) end
local function slot(id) return ((id - 1) % 200) + 1 end
local function sound(kind, id)
    if not signalOK or not PlaySoundFile then return false end
    local file = string.format("Interface\\AddOns\\AzerothCoach\\%s\\%03d.wav", kind, slot(id))
    local ok, valid, handle = pcall(PlaySoundFile, file, "Master")
    if handle and StopSound then pcall(StopSound, handle) end
    return ok and valid == true
end
local function draw(id, payload)
    if #payload > Codec.MAX_PAYLOAD then return false end
    if not strip then
        strip = CreateFrame("Frame", "AzerothCoachStrip", UIParent)
        strip:SetFrameStrata("TOOLTIP"); strip:SetFrameLevel(10000)
        local _, h = AC.State.Try("GetPhysicalScreenSize", GetPhysicalScreenSize)
        if strip.SetIgnoreParentScale then strip:SetIgnoreParentScale(true) end
        strip:SetScale(768 / (h or 1080)); strip:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 0, 0)
        strip:SetSize(800, 192)
    end
    local cells = Codec.Encode(id % 65536, payload)
    local total = math.ceil(#cells / 200) * 200
    for i = 1, total do
        local t = pool[i]
        if not t then
            t = strip:CreateTexture(nil, "OVERLAY"); t:SetSize(4, 4)
            t:SetPoint("TOPLEFT", strip, "TOPLEFT", ((i - 1) % 200) * 4, -math.floor((i - 1) / 200) * 4)
            pool[i] = t
        end
        t:SetColorTexture(Codec.CellColor(cells[i] or 0)); t:Show()
    end
    for i = total + 1, #pool do pool[i]:Hide() end
    strip:Show()
    return true
end
local function hide() if strip then strip:Hide() end end
local function loadAPI()
    return C_AddOns and C_AddOns.LoadAddOn or LoadAddOn, C_AddOns and C_AddOns.IsAddOnLoaded or IsAddOnLoaded
end
local function presenceSound(index)
    if not signalOK or not PlaySoundFile then return false end
    local path = string.format("Interface\\AddOns\\AzerothCoach\\presence\\%04d.wav", index)
    local ok, valid, handle = pcall(PlaySoundFile, path, "Master")
    if handle and StopSound then pcall(StopSound, handle) end
    return ok and valid == true
end
local function findPresenceHead()
    -- Find the empty section of the circular counter, then its preceding head.
    -- Old valid files establish a baseline. They are never evidence of a live companion.
    local empty
    for index = 1, 2000, 25 do if not presenceSound(index) then empty = index; break end end
    if not empty then presenceIndex = 0; presenceReady = true; return end
    local offset = 1
    local function batch()
        local last = math.min(offset + 63, 2000)
        for step = offset, last do
            local index = ((empty - step - 1) % 2000) + 1
            if presenceSound(index) then presenceIndex = index; presenceReady = true; return end
        end
        offset = last + 1
        if offset <= 2000 then C_Timer.After(0, batch)
        else presenceIndex = 0; presenceReady = true end
    end
    batch()
end
function L.IsOnline()
    return L.lastSeen ~= nil and GetTime() - L.lastSeen < (signalOK and 90 or 720)
end
function L.Status()
    if L.IsOnline() then return "online" end
    if L.lastSeen and GetTime() - L.lastSeen < (signalOK and 300 or 1320) then return "stale" end
    return "down"
end
local function acknowledge(request)
    if request.acked then return end
    request.acked = true
    if L.queue[1] == request then hide() end
    if request.shot and AC.ChatWindow then AC.ChatWindow.HideForShot() end
end
function L.Receive(data)
    if type(data) ~= "table" or data.session ~= AC.db.session then return end
    if type(data.now) == "number" and math.abs(time() - data.now) <= 120 then L.lastSeen = GetTime() end
    L.provider = data.provider or L.provider
    for _, reply in ipairs(data.replies or {}) do
        local request = L.pending[reply.id]
        if request and reply.chat == request.chat then
            acknowledge(request)
            if reply.shotDone and AC.ChatWindow then AC.ChatWindow.ResumeShot() end
            if reply.status == "done" or reply.status == "error" then
                L.pending[reply.id] = nil
                if request.shot and AC.ChatWindow then AC.ChatWindow.ResumeShot() end
                if request.callback then request.callback(reply, request) end
                if AC.db.outbox and AC.db.outbox.id == reply.id then AC.db.outbox = nil end
            elseif request.progress then request.progress(reply) end
        end
    end
    if data.restore and #AC.db.history == 0 then
        for _, message in ipairs(data.restore) do
            if type(message.text) == "string" and #AC.db.history < 50 then AC.db.history[#AC.db.history + 1] = message end
        end
    end
    if AC.ChatWindow then AC.ChatWindow.dirty = true; AC.ChatWindow.Refresh() end
end
function L.Poll()
    if InCombatLockdown and InCombatLockdown() then return end
    local load, loaded = loadAPI()
    if not load or not loaded then return end
    for i = 1, 200 do
        local name = string.format("AzerothCoach_S%03d", i)
        if not loaded(name) then
            AzerothCoach_SlotData = nil
            local ok, success = pcall(load, name)
            if ok and success then L.free = L.free - 1; L.Receive(AzerothCoach_SlotData)
            else AC.Log("Cannot load " .. name .. ". Run npm run setup, then restart the game.") end
            return
        end
    end
    L.free = 0
    AC.Log("Reply slots are used up. Type /reload to continue.")
end
function L.Send(job, context, text, callback, shot, trigger, progress)
    if InCombatLockdown and InCombatLockdown() then return nil, "You are in combat. Ask again after the fight." end
    if #text > 1600 then return nil, "Message too long. Use 400 characters or less." end
    local chars = select(2, text:gsub("[\1-\127\194-\244]", ""))
    if chars > 400 then return nil, "Message too long. Use 400 characters or less." end
    if #L.queue >= 8 then return nil, "The companion is busy. Wait for the current answer." end
    if L.free <= 0 then return nil, "Reply slots are used up. Type /reload to continue." end
    AC.db.nextId = AC.db.nextId + 1
    local id = AC.db.nextId
    local flags = "c;job=" .. job .. (shot and ";shot" or "") .. (trigger and ";trig=" .. wire(trigger) or "")
    local chat = job == "coach" and "coach" or "chat"
    local payload = table.concat({wire(AC.db.session), chat, tostring(id), "", flags, "", wire(context), wire(text)}, US)
    if #payload > Codec.MAX_PAYLOAD then
        local _, facts = context:match("^(.-)\n%-%-%- facts %-%-%-\n(.*)$")
        context = "\n--- facts ---\n" .. (facts or "{}")
        payload = table.concat({wire(AC.db.session), chat, tostring(id), "", flags, "", wire(context), wire(text)}, US)
        if #payload > Codec.MAX_PAYLOAD then return nil, "This question has too much context. Ask a shorter question." end
    end
    local request = {id = id, chat = chat, job = job, hello = trigger == "hello", payload = payload, callback = callback, progress = progress, tries = 0, started = GetTime(), shot = shot, ackAtStart = sound("ack", id), sigAtStart = sound("sig", id), pollAt = GetTime() + 5}
    L.pending[id] = request; L.queue[#L.queue + 1] = request
    if chat == "chat" and not request.hello then
        local hex = payload:gsub(".", function(c) return string.format("%02x", c:byte()) end)
        AC.db.outbox = {id = id, hex = hex, chat = chat, job = job}
    end
    return id
end
function L.Hello(callback)
    for _, request in pairs(L.pending) do if request.hello then return end end
    L.Send("chat", "", "", callback or function() end, false, "hello")
end
function L.Tick()
    if InCombatLockdown and InCombatLockdown() then
        hide(); L.combatAt = L.combatAt or GetTime()
        if L.queue[1] then L.queue[1].shownAt = nil end
        return
    end
    if L.combatAt then
        local pause = GetTime() - L.combatAt
        for _, request in pairs(L.pending) do request.started = request.started + pause; if request.pollAt then request.pollAt = request.pollAt + pause end end
        L.combatAt = nil
    end
    local request = L.queue[1]
    while request and (request.acked or not L.pending[request.id]) do table.remove(L.queue, 1); request = L.queue[1]; hide() end
    if request then
        if not request.shownAt then draw(request.id, request.payload); request.shownAt = GetTime(); request.tries = request.tries + 1 end
        if not request.ackAtStart and sound("ack", request.id) then acknowledge(request) end
        local limit = request.hello and 10 or 40
        if not request.acked and GetTime() - request.shownAt >= limit then
            hide()
            if not request.hello and request.tries < 3 then request.shownAt = nil
            else
                request.captureEnded = true
                if not request.hello then
                    L.pending[request.id] = nil
                    if AC.db.outbox and AC.db.outbox.id == request.id then AC.db.outbox = nil end
                    if request.callback then request.callback({status = "error", code = "capture", text = "The companion cannot see the game window. Use windowed or borderless mode. Keep the top-left corner visible."}, request) end
                end
            end
        end
        if request.captureEnded then hide() end
    else hide() end
    local needsPoll = false
    for _, pending in pairs(L.pending) do
        if not pending.sigAtStart and not pending.signalled and sound("sig", pending.id) then pending.signalled = true; needsPoll = true end
        if pending.pollAt and GetTime() >= pending.pollAt then
            needsPoll = true
            pending.pollAt = ((not signalOK or pending.sigAtStart) and not pending.hello) and GetTime() + 15 or nil
        end
        local deadline = pending.hello and 20 or (pending.job == "deep" and 360 or 180)
        if GetTime() - pending.started > deadline then
            L.pending[pending.id] = nil
            if AC.db.outbox and AC.db.outbox.id == pending.id then AC.db.outbox = nil end
            if not pending.hello and pending.callback then pending.callback({status = "error", code = "timeout", text = "No answer arrived. Ask again."}, pending) end
        end
    end
    if needsPoll then L.Poll() end
    if signalOK and presenceReady then
        local index = (presenceIndex % 2000) + 1
        if presenceSound(index) then presenceIndex = index; L.lastSeen = GetTime() end
    end
end
function L.Initialize()
    if PlaySoundFile then
        local ok1, empty, h1 = pcall(PlaySoundFile, "Interface\\AddOns\\AzerothCoach\\ctl\\empty.wav", "Master")
        local ok2, valid, h2 = pcall(PlaySoundFile, "Interface\\AddOns\\AzerothCoach\\ctl\\valid.wav", "Master")
        if h1 and StopSound then pcall(StopSound, h1) end
        if h2 and StopSound then pcall(StopSound, h2) end
        signalOK = ok1 and ok2 and empty == false and valid == true
    end
    L.signals = signalOK
    if signalOK then presenceReady = false; findPresenceHead() end
    local outbox = AC.db.outbox
    if outbox and outbox.hex and outbox.id and outbox.chat == "chat" then
        local payload = outbox.hex:gsub("..", function(byte) return string.char(tonumber(byte, 16)) end)
        local request = {id = outbox.id, chat = "chat", job = outbox.job or "chat", payload = payload, tries = 0, started = GetTime(), pollAt = GetTime() + 5, callback = function(reply)
            AC.ChatWindow.Add("coach", reply.text or "No answer arrived. Ask again.", reply)
        end}
        L.pending[request.id] = request; L.queue[#L.queue + 1] = request
    end
    L.Receive(AzerothCoach_Inbox)
    C_Timer.NewTicker(0.25, L.Tick)
    if not signalOK then C_Timer.After(3, function() if #L.queue == 0 then L.Hello() end end) end
end
