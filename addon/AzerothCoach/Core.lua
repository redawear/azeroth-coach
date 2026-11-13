local AC = AzerothCoach
AC.flags = {}
AC.candidates = {}
function AC.Limit(text, max)
    local count, last = 0, #text
    for i = 1, #text do
        local byte = text:byte(i)
        if byte < 128 or byte >= 192 then count = count + 1; if count > max then last = i - 1; break end end
    end
    return text:sub(1, last)
end
function AC.Log(text)
    if not AC.db then return end
    AC.db.log[#AC.db.log + 1] = {at = time(), text = tostring(text)}
    while #AC.db.log > 300 do table.remove(AC.db.log, 1) end
end
function AC.Print(text)
    AC.Log(text)
    if DEFAULT_CHAT_FRAME then DEFAULT_CHAT_FRAME:AddMessage("Azeroth Coach: " .. text) end
end
local function windowOpen()
    for _, name in ipairs({"QuestFrame", "GossipFrame", "MerchantFrame", "ClassTrainerFrame"}) do
        if _G[name] and _G[name]:IsShown() then return true end
    end
    return false
end
function AC.Offer(tip)
    if not tip or AC.waiting or AC.offering then return end
    if AC.Triggers.Hidden(AC.player, AC.flags, AC.db, time()) or windowOpen() then AC.waiting = tip; return end
    local token = {}; AC.offerToken = token; AC.offering = true
    local displayed = false
    local function deliver(reply)
        if displayed or AC.offerToken ~= token then return end
        displayed = true; AC.offering = false
        if reply and reply.status == "done" and type(reply.text) == "string" then
            tip.body = AC.Limit(AC.Data.Expand(reply.text), 110)
            tip.from = AC.Link.provider == "codex" and "Codex" or "Claude"
        end
        if AC.Triggers.Hidden(AC.player, AC.flags, AC.db, time()) or windowOpen() then AC.waiting = tip
        else AC.CoachSection.Show(tip) end
    end
    if AC.Link.IsOnline() and not tip.question then
        local context = AC.State.Context(AC.player, tip, "")
        local id = AC.Link.Send("coach", context, tip.body, deliver, false, tip.key)
        if id then C_Timer.After(12, function() deliver() end); return end
    end
    deliver()
end
function AC.Update(event, argument, occurredAt)
    if not AC.db then return end
    occurredAt = occurredAt or time()
    if InCombatLockdown and InCombatLockdown() then
        AC.deferred = AC.deferred or {}
        AC.deferred[event] = {argument = argument, at = occurredAt}
        return
    end
    local old = AC.player
    AC.player = AC.batchPlayer or AC.State.Read()
    if not AC.player then return end
    if event == "PLAYER_DEAD" then
        AC.deathReady = time() - occurredAt < 600 and AC.Triggers.Death(AC.db, AC.player.area or AC.player.zone, occurredAt) or false
    end
    if AC.Data.ready then
        AC.tipEvents = AC.tipEvents or {}
        AC.tipEvents[event] = {argument = argument, at = occurredAt}
        if time() - (AC.db.lastTipAt or -1e9) < AC.db.settings.tipPause then AC.CoachSection.Refresh(); return end
        local events = AC.tipEvents; AC.tipEvents = {}
        for name, row in pairs(events) do
        if name ~= "PLAYER_DEAD" or time() - row.at < 600 then
        for _, tip in ipairs(AC.Tips.Build(name, AC.player, old, AC.db, row.argument)) do
            tip.createdAt = row.at
            AC.candidates[tip.key] = tip
        end
        end
        end
        AC.TryOffer()
    end
    AC.CoachSection.Refresh(); AC.ChatWindow.Refresh()
end
function AC.TryOffer()
    if not AC.player or AC.waiting or AC.offering then return end
    local c = AC.CoachSection
    if c.tip and (c.hover or AC.db.settings.tipAge ~= 0 or time() - c.shownAt < AC.db.settings.tipPause) then return end
    local candidates = {}
    for key, tip in pairs(AC.candidates) do
        local old = time() - tip.createdAt > 86400
        if tip.kind == "deaths" then old = time() - tip.createdAt > 600 end
        if (tip.kind == "level" or tip.kind == "spells") and tonumber(tip.key:match(":(%d+)$")) ~= AC.player.level then old = true end
        if tip.kind == "zone" and tip.key ~= "zone:" .. tostring(AC.player.area or AC.player.zone) then old = true end
        if tip.kind == "capital" and tip.key ~= "capital:" .. tostring(AC.player.area) then old = true end
        local first = tip.questIds and tip.questIds[1]
        if tip.kind == "turnin" and first and (AC.player.active[first] or AC.Planner.Completed(AC.player, first)) then old = true end
        if tip.kind == "gray" and first and not AC.player.active[first] then old = true end
        if old or (AC.db.seen[key] and time() - AC.db.seen[key] < 86400) then AC.candidates[key] = nil
        else candidates[#candidates+1] = tip end
    end
    local tip = AC.Triggers.Choose(candidates, AC.db, time(), AC.db.settings)
    if tip then AC.candidates[tip.key] = nil; AC.Offer(tip) end
end
local function tick()
    if not AC.db then return end
    AC.flags.combat = InCombatLockdown and InCombatLockdown() or false
    AC.flags.editMode = EditModeManagerFrame and EditModeManagerFrame.IsEditModeActive and EditModeManagerFrame:IsEditModeActive() or false
    local tracker = ObjectiveTrackerFrame
    AC.flags.trackerCollapsed = not AC.db.position and tracker and (tracker.isCollapsed == true or (tracker.IsCollapsed and tracker:IsCollapsed())) or false
    if not AC.flags.combat then
        if AC.deferred then
            local events = AC.deferred; AC.deferred = nil
            AC.batchPlayer = AC.State.Read()
            for event, row in pairs(events) do AC.Update(event, row.argument, row.at) end
            AC.batchPlayer = nil
        elseif not AC.lastRead or GetTime() - AC.lastRead >= 5 then AC.player = AC.State.Read(); AC.lastRead = GetTime() end
    end
    if not AC.player then return end
    if not AC.flags.combat then
    AC.player.dead = AC.State.Try("UnitIsDeadOrGhost", UnitIsDeadOrGhost, "player") or false
    AC.player.instance = AC.State.Try("IsInInstance", IsInInstance) or false
    AC.player.taxi = AC.State.Try("UnitOnTaxi", UnitOnTaxi, "player") or false
    end
    if AC.waiting and time() - AC.waiting.createdAt >= 300 then AC.waiting = nil end
    if AC.waiting and not AC.Triggers.Hidden(AC.player, AC.flags, AC.db, time()) and not windowOpen() then
        local tip = AC.waiting; AC.waiting = nil
        if time() - tip.createdAt < 300 then AC.CoachSection.Show(tip) end
    end
    local c = AC.CoachSection
    local age = AC.db.settings.tipAge
    if c.tip and age > 0 and time() - c.shownAt >= age and not c.hover then
        c.tip = nil; AC.UI.Fade(c.block, false, 1)
    else c.Refresh() end
    if AC.tipEvents and next(AC.tipEvents) and time() - (AC.db.lastTipAt or -1e9) >= AC.db.settings.tipPause then AC.Update("DEFERRED") end
    AC.TryOffer(); AC.ChatWindow.Refresh(); AC.Route.Pins()
end
local function initialize()
    AzerothCoachDB = AzerothCoachDB or {}
    AC.db = AzerothCoachDB
    local d = AC.db
    d.settings = d.settings or {}; d.seen = d.seen or {}; d.dungeons = d.dungeons or {}; d.history = d.history or {}; d.log = d.log or {}
    if d.settings.enabled == nil then d.settings.enabled = true end
    d.settings.tipPause = d.settings.tipPause or 600; d.settings.tipAge = d.settings.tipAge or 600
    -- Keep the session for reload recovery. Reply IDs reject old slot messages.
    d.session = d.session or (tostring(time()) .. "-" .. tostring(math.random(100000, 999999))); d.nextId = d.nextId or 0
    AC.CoachSection.Initialize(); AC.ChatWindow.Initialize(); AC.Settings.Initialize()
    AC.Data.Initialize(function(ready)
        AC.Update("PLAYER_LOGIN")
        if not ready and not d.dataWarning then
            d.dataWarning = true
            AC.Offer({kind = "data", key = "data-missing", title = "Quest data", body = AC.Data.error, questIds = {}, createdAt = time(), from = "data"})
        end
    end)
    AC.Link.Initialize()
    C_Timer.NewTicker(1, tick); C_Timer.NewTicker(0.1, AC.Route.Tick)
end
local events = CreateFrame("Frame")
for _, event in ipairs({"PLAYER_LOGIN", "PLAYER_LEVEL_UP", "ZONE_CHANGED_NEW_AREA", "QUEST_TURNED_IN", "QUEST_LOG_UPDATE", "PLAYER_DEAD", "PLAYER_ALIVE", "PLAYER_UNGHOST", "PLAYER_REGEN_DISABLED", "PLAYER_REGEN_ENABLED", "CINEMATIC_START", "CINEMATIC_STOP", "PLAYER_CONTROL_GAINED"}) do events:RegisterEvent(event) end
events:SetScript("OnEvent", function(_, event, argument)
    if event == "PLAYER_LOGIN" then initialize(); return end
    if not AC.db then return end
    if event == "PLAYER_REGEN_DISABLED" then AC.flags.combat = true; AC.CoachSection.Refresh(); return end
    if event == "PLAYER_REGEN_ENABLED" then AC.flags.combat = false; AC.flags.afterCombatUntil = time() + 3 end
    if event == "CINEMATIC_START" then AC.flags.cinematic = true end
    if event == "CINEMATIC_STOP" then AC.flags.cinematic = false end
    AC.eventBatch = AC.eventBatch or {}
    AC.eventBatch[event] = {argument = argument, at = time()}
    if AC.eventTimer then return end
    AC.eventTimer = true
    C_Timer.After(0.25, function()
        AC.eventTimer = false
        local batch = AC.eventBatch; AC.eventBatch = {}
        local keys = {}; for name in pairs(batch) do keys[#keys+1] = name end; table.sort(keys)
        -- All events in this batch share one snapshot.
        AC.batchPlayer = AC.State.Read()
        for _, name in ipairs(keys) do AC.Update(name, batch[name].argument, batch[name].at) end
        AC.batchPlayer = nil
    end)
end)
