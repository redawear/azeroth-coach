local AC = AzerothCoach
AC.MinimapButton = {}
local M, U = AC.MinimapButton, AC.UI

function M.Position()
    local angle = math.rad(AC.db.minimap.angle)
    local radius = Minimap:GetWidth() / 2 + 10
    M.frame:ClearAllPoints(); M.frame:SetPoint("CENTER", Minimap, "CENTER", math.cos(angle) * radius, math.sin(angle) * radius)
end
local function drag()
    local x, y = GetCursorPosition()
    local cx, cy = Minimap:GetCenter()
    if not cx or not cy then return end
    local scale = Minimap:GetEffectiveScale()
    AC.db.minimap.angle = math.deg(math.atan2(y / scale - cy, x / scale - cx)) % 360
    M.Position()
end
function M.MarkRead()
    M.readTip, M.readWaiting = AC.CoachSection.tip, AC.waiting
    M.Refresh()
end
function M.Refresh()
    if not M.frame then return end
    local c = AC.CoachSection
    local function unread(tip) return tip and tip ~= M.readTip and tip ~= M.readWaiting end
    local hidden = not c.frame:IsShown() or not c.block:IsShown()
    M.frame.badge:SetShown(unread(AC.waiting) or (hidden and unread(c.tip)) or false)
    M.frame:SetShown(not AC.db.minimap.hide)
end
function M.SetShown(show)
    AC.db.minimap.hide = not show; M.Position(); M.Refresh()
end
function M.Initialize()
    local saved = AC.db.minimap or {}; AC.db.minimap = saved
    saved.angle = tonumber(saved.angle) or 225; saved.hide = saved.hide == true
    M.frame = U.MinimapButton("AzerothCoachMinimapButton")
    local b = M.frame
    b:SetScript("OnMouseDown", function() M.dragged = false end)
    b:SetScript("OnDragStart", function() M.dragged = true; b:SetScript("OnUpdate", drag); drag() end)
    b:SetScript("OnDragStop", function() b:SetScript("OnUpdate", nil); drag() end)
    b:SetScript("OnClick", function(_, button)
        if M.dragged then M.dragged = false; return end
        if button == "RightButton" then AC.CoachSection.Menu(b) else AC.ChatWindow.Toggle() end
    end)
    b:SetScript("OnEnter", function()
        local names = {online = "online", stale = "no signal", down = "not connected"}
        U.Tooltip(b, "Azeroth Coach", names[AC.Link.Status()], "Click: open the chat. Right-click: options.")
    end)
    b:SetScript("OnLeave", function() GameTooltip:Hide() end)
    M.Position(); M.Refresh()
end
