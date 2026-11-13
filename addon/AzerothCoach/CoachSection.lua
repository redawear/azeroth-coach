local AC = AzerothCoach
AC.CoachSection = {}
local C, U = AC.CoachSection, AC.UI

function C.Dock()
    AC.db.position = nil
    C.frame:ClearAllPoints()
    local tracker = ObjectiveTrackerFrame
    if tracker then
        if tracker:IsShown() and tracker.NineSlice then C.frame:SetPoint("TOPLEFT", tracker.NineSlice, "BOTTOMLEFT", 30, 0)
        else C.frame:SetPoint("TOPLEFT", tracker, "TOPLEFT") end
    else C.frame:SetPoint("TOPRIGHT", MinimapCluster or UIParent, "BOTTOMRIGHT", 0, -10) end
end
function C.Menu()
    U.Menu(C.frame, {
        {"Ask the coach", function() AC.ChatWindow.Open(C.tip) end},
        {"Show route", function() if C.tip and C.tip.point then AC.Route.Start({C.tip.point}) end end, C.tip ~= nil and C.tip.point ~= nil},
        {"Dismiss", C.Dismiss},
        {"Pause 15 minutes", function() AC.db.pauseUntil = time() + 900 end},
        {"Pause 1 hour", function() AC.db.pauseUntil = time() + 3600 end},
        {"Dock to quest tracker", C.Dock},
        {"Settings", function() AC.Settings.Open() end}
    })
end
function C.Dismiss()
    C.tip = nil
    C.Refresh()
end
function C.Show(tip)
    C.tip, C.shownAt = tip, time()
    C.block:SetScript("OnUpdate", nil); C.block:SetAlpha(1)
    AC.Triggers.Mark(tip, AC.db, time())
    C.Refresh()
    if C.frame:IsShown() then U.Fade(C.frame, true, 0.5) end
end
function C.Refresh()
    if not C.frame then return end
    local p = AC.player
    if not p or AC.db.settings.enabled == false or AC.Triggers.Hidden(p, AC.flags, AC.db, time()) then C.frame:Hide(); return end
    if not C.tip and not AC.Route.points then C.frame:Hide(); return end
    if not AC.db.position then C.Dock() end
    if C.tip then C.title:SetText(AC.Limit(AC.Data.Expand(C.tip.title), 32)); C.body:SetText(AC.Limit(AC.Data.Expand(C.tip.body), 110)) end
    local blockHeight = C.tip and (C.title:GetStringHeight() + 4 + C.body:GetStringHeight() + (C.tip.question and 24 or 0)) or 0
    local height = 26 + (C.tip and (10 + blockHeight) or 0) + (AC.Route.points and 32 or 0)
    local tracker = ObjectiveTrackerFrame
    local anchor = tracker and (tracker.NineSlice or tracker)
    local bottom = not AC.db.position and anchor and anchor:GetBottom()
    local noRoom = bottom and bottom - 10 - height < 120
    local collapsed = AC.db.collapsed or noRoom
    if C.header.SetCollapsed then C.header:SetCollapsed(AC.db.collapsed == true) end
    C.header.Text:SetText(noRoom and C.tip and AC.Data.Expand(C.tip.title) or (AC.db.collapsed and C.tip and "Coach (1)" or "Coach"))
    C.block:SetShown(not collapsed and C.tip ~= nil)
    if C.tip then
        C.title:SetText(AC.Limit(AC.Data.Expand(C.tip.title), 32))
        C.body:SetText(AC.Limit(AC.Data.Expand(C.tip.body), 110))
        for _, b in ipairs(C.answers) do b:SetShown(not collapsed and C.tip.question == true) end
    else for _, b in ipairs(C.answers) do b:Hide() end end
    C.route:SetShown(not collapsed and AC.Route.points ~= nil)
    C.block:SetHeight(blockHeight)
    C.route:ClearAllPoints()
    if C.tip then C.route:SetPoint("TOPLEFT", C.block, "BOTTOMLEFT", 0, -10)
    else C.route:SetPoint("TOPLEFT", C.header, "BOTTOMLEFT", 20, -10) end
    C.frame:SetHeight(collapsed and 26 or height)
    C.frame:SetAlpha(1); C.frame:Show()
end
function C.Initialize()
    local f = CreateFrame("Frame", "AzerothCoachSection", UIParent)
    C.frame = f; f:SetSize(260, 180); f:SetFrameStrata("LOW"); f:SetClampedToScreen(true); f:SetMovable(true)
    function f:ToggleCollapsed() AC.db.collapsed = not AC.db.collapsed; C.Refresh() end
    C.header = U.TrackerHeader(f, "Coach")
    C.header:EnableMouse(true); C.header:RegisterForDrag("LeftButton")
    C.header:SetScript("OnDragStart", function() if IsShiftKeyDown() then C.dragging = true; f:StartMoving() end end)
    C.header:SetScript("OnDragStop", function()
        if not C.dragging then return end
        C.dragging = false; f:StopMovingOrSizing()
        local point, _, relative, x, y = f:GetPoint()
        AC.db.position = {point, relative, x, y}
    end)
    C.header:SetScript("OnMouseUp", function(_, button) if button == "RightButton" then C.Menu() end end)
    C.block = U.TrackerBlock(f); C.block:EnableMouse(true)
    C.title = U.TrackerLine(C.block, "", true); C.title:SetPoint("TOPLEFT"); C.title:SetWidth(240); C.title:SetMaxLines(1)
    C.body = U.TrackerLine(C.block, ""); C.body:SetPoint("TOPLEFT", C.title, "BOTTOMLEFT", 0, -4); C.body:SetWidth(240); C.body:SetMaxLines(3)
    C.block:SetScript("OnMouseUp", function(_, b) if b == "RightButton" then C.Menu() else AC.ChatWindow.Open(C.tip) end end)
    C.block:SetScript("OnEnter", function()
        C.hover = true; U.TrackerHighlight(C.title, true)
        U.Tooltip(C.block, C.tip and C.tip.from ~= "data" and ("Written by " .. C.tip.from .. " from the quest data") or (C.tip and C.tip.kind == "data" and "Quest data is not available" or "From the quest data"), "Click: ask the coach. Right-click: options.")
    end)
    C.block:SetScript("OnLeave", function() C.hover = false; U.TrackerHighlight(C.title, false); GameTooltip:Hide() end)
    C.answers = {}
    for i, label in ipairs({"Yes", "No", "Later"}) do
        local answer = label:lower()
        local b = U.Button(C.block, label, function()
            if C.tip and C.tip.dungeon then AC.db.dungeons[tostring(C.tip.dungeon)] = answer == "later" and time() + 3600 or answer end
            C.Dismiss()
        end)
        b:SetPoint("TOPLEFT", C.body, "BOTTOMLEFT", (i - 1) * 80, -4); C.answers[i] = b
    end
    C.route = CreateFrame("Frame", nil, f); C.route:SetSize(240, 22); C.route:EnableMouse(true)
    C.arrow = U.Arrow(C.route); C.arrow:SetPoint("LEFT")
    C.distance = U.TrackerLine(C.route, ""); C.distance:SetPoint("LEFT", 20, 0); C.distance:SetWidth(220)
    C.route:SetScript("OnMouseUp", function(_, b) if b == "RightButton" then U.Menu(C.route, {{"Stop route", AC.Route.Stop}}) end end)
    if AC.db.position then local p = AC.db.position; f:SetPoint(p[1], UIParent, p[2], p[3], p[4]) else C.Dock() end
    f:Hide()
end
