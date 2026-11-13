local AC = AzerothCoach
AC.ChatWindow = {dirty = true}
local W, U = AC.ChatWindow, AC.UI
function W.Add(role, text, reply)
    local row = {role = role, text = text, by = reply and reply.by, sources = reply and reply.sources, status = reply and reply.status, notes = reply and reply.notes}
    AC.db.history[#AC.db.history + 1] = row
    while #AC.db.history > 50 do table.remove(AC.db.history, 1) end
    W.dirty = true; W.Refresh()
end
function W.HideForShot()
    W.shotVisible = W.frame:IsShown(); W.frame:Hide()
    W.shotUntil = GetTime() + 15
    C_Timer.After(15, function() if W.shotUntil and GetTime() >= W.shotUntil then W.ResumeShot() end end)
end
function W.ResumeShot()
    W.shotUntil = nil
    if W.shotVisible then W.frame:Show(); W.shotVisible = nil; W.dirty = true; W.Refresh() end
end
function W.Copy(url)
    if not W.copy then
        W.copy = U.Panel("AzerothCoachCopy", 420, 240); W.copy:SetPoint("CENTER"); U.Close(W.copy)
        local label = U.Text(W.copy, "Copy this link with Ctrl+C."); label:SetPoint("TOPLEFT", 18, -24)
        W.copy.input = U.Input(W.copy); W.copy.input:SetMaxLetters(2048); W.copy.input:SetPoint("TOPLEFT", 20, -65); W.copy.input:SetSize(375, 30)
    end
    W.copy:Show(); W.copy.input:SetText(url); W.copy.input:SetFocus(); W.copy.input:HighlightText()
end
function W.Send(text, job)
    text = text or W.input:GetText()
    if text:match("^%s*$") then return end
    if not AC.Link.IsOnline() then W.dirty = true; if not AC.Link.signals then AC.Link.Hello() end; W.Refresh(); return end
    local player = AC.State.Read()
    if not player then W.notice = "You are in combat. Ask again after the fight."; W.dirty = true; W.Refresh(); return end
    local shot = W.shot:GetChecked() == true
    W.shot:SetChecked(false)
    local id, why = AC.Link.Send(job or "chat", AC.State.Context(player, W.tip, text), text, function(reply)
        W.working = nil
        W.Add("coach", reply.text or "No answer arrived. Ask again.", reply)
        W.hasAnswer = reply.status == "done"
        W.Refresh()
    end, shot, nil, function(reply) W.progress = reply.text ~= "Working" and reply.text or nil; W.dirty = true; W.Refresh() end)
    if not id then W.notice = why; W.dirty = true; W.Refresh(); return end
    W.notice, W.progress = nil, nil; W.lastQuestion = text; W.working = GetTime()
    W.Add("you", text); W.input:SetText(""); W.input:ClearFocus()

end
function W.Refresh()
    if not W.frame then return end
    local state = AC.Link.Status()
    U.SetStatus(W.dot, state)
    local provider = AC.Link.provider == "codex" and "Codex" or (AC.Link.provider == "claude" and "Claude" or nil)
    W.status:SetText(state == "down" and "Not connected" or ((provider and provider .. " · " or "") .. (state == "online" and "online" or "no signal")))
    W.send:SetEnabled(state == "online" and not W.working)
    W.deep:SetEnabled(state == "online" and W.hasAnswer == true and not W.working)
    local p = AC.player
    W.context:SetText(not AC.Data.ready and "No quest data" or (p and ("Level " .. p.level .. " · " .. p.zone .. " · " .. p.questCount .. " quests") or ""))
    W.about:SetText(W.tip and ("About: " .. AC.Data.Expand(W.tip.title)) or "")
    if not W.frame:IsShown() then return end
    local key = state .. tostring(W.notice) .. tostring(W.working and math.floor(GetTime() - W.working)) .. tostring(W.progress) .. tostring(#AC.db.history)
    if not W.dirty and key == W.renderKey then return end
    W.renderKey = key; W.dirty = false
    local oldScroll = W.scroll:GetVerticalScroll() or 0
    local atEnd = oldScroll >= math.max(0, W.content:GetHeight() - W.scroll:GetHeight() - 20)
    for _, row in ipairs(W.rows) do row:Hide() end
    local y, index = 0, 0
    local function line(text, variant, url, role)
        index = index + 1
        local row = W.rows[index]
        if not row then row = U.Bubble(W.content); W.rows[index] = row end
        row:SetPoint("TOPLEFT", 0, -y); row:SetWidth(math.max(210, W.scroll:GetWidth() - 8))
        U.BubbleText(row, text, variant, role, row:GetWidth())
        row:EnableMouse(url ~= nil); row:SetScript("OnMouseUp", url and function() W.Copy(url) end or nil)
        row:Show(); y = y + row:GetHeight() + 5
    end
    if #AC.db.history == 0 then line("Ask about your quests, your zone, or your next dungeon.") end
    for _, message in ipairs(AC.db.history) do
        line(AC.Data.Expand(message.text), "chat", nil, message.role)
        if message.by and message.status ~= "error" then line(message.by, "muted") end
        for _, note in ipairs(message.notes or {}) do line(note, "muted") end
        if message.role ~= "you" and message.status ~= "error" then
            if not message.sources or #message.sources == 0 then line("No source. Check this answer.", "muted") end
            for _, source in ipairs(message.sources or {}) do line(source.label, "muted", source.url) end
        end
    end
    if W.working then line("Working · " .. math.floor(GetTime() - W.working) .. " s"); if W.progress then line(W.progress) end end
    if state == "down" then line('The companion is not connected. Start it on this PC with "npm start". Tips still come from the quest data.') end
    if W.notice then line(W.notice) end
    W.content:SetSize(math.max(210, W.scroll:GetWidth() - 8), math.max(1, y))
    if atEnd then W.scroll:SetVerticalScroll(math.max(0, y - W.scroll:GetHeight())) else W.scroll:SetVerticalScroll(oldScroll) end
end
function W.Open(tip)
    W.tip = tip; W.dirty = true; W.frame:Show(); W.Refresh(); W.input:SetFocus()
    if not AC.Link.signals and not AC.Link.IsOnline() then AC.Link.Hello() end
end
function W.Initialize()
    W.frame = U.Panel("AzerothCoachChat", 420, 360); local f = W.frame
    f:SetPoint("LEFT", UIParent, "LEFT", 40, 40); U.Close(f)
    local title = U.Text(f, "Azeroth Coach"); title:SetPoint("TOPLEFT", 16, -14)
    W.dot = U.StatusDot(f); W.dot:SetPoint("TOPLEFT", 170, -16)
    W.status = U.Text(f, "", "muted"); W.status:SetPoint("LEFT", W.dot, "RIGHT", 5, 0)
    W.context = U.Text(f, "", "muted"); W.context:SetPoint("TOPLEFT", 16, -38)
    W.about = U.Text(f, "", "muted"); W.about:SetPoint("TOPLEFT", 16, -55)
    W.scroll, W.content = U.Scroll(f); W.scroll:SetPoint("TOPLEFT", 16, -76); W.scroll:SetPoint("BOTTOMRIGHT", -36, 78)
    W.rows = {}
    W.input = U.Input(f); W.input:SetPoint("BOTTOMLEFT", 20, 45); W.input:SetPoint("BOTTOMRIGHT", -90, 45); W.input:SetHeight(24)
    W.input:SetScript("OnEnterPressed", function() W.Send() end)
    W.send = U.Button(f, "Send", function() W.Send() end, 64); W.send:SetHeight(22); W.send:SetPoint("BOTTOMRIGHT", -16, 46)
    W.shot = U.Check(f, "Attach one screenshot"); W.shot:SetPoint("BOTTOMLEFT", 14, 16)
    W.shot:SetScript("OnEnter", function() U.Tooltip(W.shot, "Attach one screenshot", "The image can show game chat.") end)
    W.shot:SetScript("OnLeave", function() GameTooltip:Hide() end)
    W.deep = U.Button(f, "Think harder", function() if W.lastQuestion then W.Send(W.lastQuestion, "deep") end end, 100); W.deep:SetPoint("BOTTOMRIGHT", -16, 16)
    if hooksecurefunc then
        local function insert(text)
            if W.input:HasFocus() and type(text) == "string" then W.input:Insert(text) end
        end
        if ChatFrameUtil and ChatFrameUtil.InsertLink then hooksecurefunc(ChatFrameUtil, "InsertLink", insert)
        elseif ChatEdit_InsertLink then hooksecurefunc("ChatEdit_InsertLink", insert) end
    end
    f:SetScript("OnSizeChanged", function() W.dirty = true; W.Refresh() end)
end
