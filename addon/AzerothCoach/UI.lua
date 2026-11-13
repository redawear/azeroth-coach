local AC = AzerothCoach
AC.UI = {}
local U = AC.UI
local function frame(kind, parent, template)
    local ok, result = pcall(CreateFrame, kind, nil, parent, template)
    if ok then return result end
    return CreateFrame(kind, nil, parent)
end
local function color(text, key)
    local c = OBJECTIVE_TRACKER_COLOR and OBJECTIVE_TRACKER_COLOR[key] or NORMAL_FONT_COLOR
    if c then text:SetTextColor(c.r, c.g, c.b) end
end

function U.TrackerHeader(parent, text)
    local h = frame("Frame", parent, "ObjectiveTrackerModuleHeaderTemplate")
    h:SetSize(260, 26)
    h:SetPoint("TOPLEFT")
    if not h.Text then
        h.Text = h:CreateFontString(nil, "OVERLAY", "ObjectiveTrackerHeaderFont")
        h.Text:SetPoint("LEFT", 7, 0); h.Text:SetWidth(200)
    end
    h.Text:SetText(text)
    if not h.Background then
        h.Background = h:CreateTexture(nil, "BACKGROUND")
        h.Background:SetAllPoints()
        pcall(h.Background.SetAtlas, h.Background, "UI-QuestTracker-Secondary-Objective-Header")
    end
    local b = h.MinimizeButton
    if not b then b = frame("Button", h, "ObjectiveTrackerModuleMinimizeButtonTemplate"); b:SetSize(16, 16); b:SetPoint("RIGHT", 1, 0) end
    b:SetScript("OnClick", function() parent:ToggleCollapsed() end)
    h.MinimizeButton = b
    return h
end
function U.TrackerBlock(parent)
    local b = CreateFrame("Frame", nil, parent)
    b:SetPoint("TOPLEFT", 20, -36); b:SetSize(240, 95)
    return b
end
function U.TrackerHighlight(text, on) color(text, on and "HeaderHighlight" or "Header") end
function U.TrackerLine(parent, text, title)
    local s = parent:CreateFontString(nil, "OVERLAY", "ObjectiveTrackerLineFont")
    s:SetJustifyH("LEFT"); s:SetWordWrap(true)
    color(s, title and "Header" or "Normal")
    s:SetText(text or "")
    return s
end
function U.Panel(name, width, height)
    local p = frame("Frame", UIParent, "BackdropTemplate")
    _G[name] = p
    p:SetSize(width, height); p:SetFrameStrata("MEDIUM"); p:SetClampedToScreen(true)
    p:SetMovable(true); p:EnableMouse(true); p:RegisterForDrag("LeftButton")
    p:SetScript("OnDragStart", p.StartMoving); p:SetScript("OnDragStop", p.StopMovingOrSizing)
    if p.SetBackdrop then
        p:SetBackdrop({bgFile = "Interface\\Tooltips\\UI-Tooltip-Background", edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border", tile = true, tileSize = 16, edgeSize = 16, insets = {left = 4, right = 4, top = 4, bottom = 4}})
        p:SetBackdropColor(0, 0, 0, 0.92)
    end
    p:SetResizable(true)
    if p.SetResizeBounds then p:SetResizeBounds(320, 240, 640, 600) end
    local grip = frame("Button", p)
    grip:SetSize(16, 16); grip:SetPoint("BOTTOMRIGHT", -4, 4)
    grip:SetNormalTexture("Interface\\ChatFrame\\UI-ChatIM-SizeGrabber-Up")
    grip:SetHighlightTexture("Interface\\ChatFrame\\UI-ChatIM-SizeGrabber-Highlight")
    grip:SetPushedTexture("Interface\\ChatFrame\\UI-ChatIM-SizeGrabber-Down")
    grip:SetScript("OnMouseDown", function() p:StartSizing("BOTTOMRIGHT") end)
    grip:SetScript("OnMouseUp", function() p:StopMovingOrSizing() end)
    p:Hide()
    UISpecialFrames = UISpecialFrames or {}
    table.insert(UISpecialFrames, name)
    return p
end
function U.Font(variant)
    local fonts = {normal = "GameFontNormal", muted = "GameFontDisableSmall", chat = "ChatFontNormal", small = "GameFontNormalSmall"}
    return _G[fonts[variant or "normal"]]
end
function U.Text(parent, text, variant)
    local f = parent:CreateFontString(nil, "OVERLAY")
    f:SetFontObject(U.Font(variant))
    f:SetJustifyH("LEFT"); f:SetText(text or "")
    return f
end
-- The transcript uses the wow-ai message structure and role colors.
function U.Bubble(parent)
    local b = CreateFrame("Frame", nil, parent)
    b.bg = b:CreateTexture(nil, "BACKGROUND"); b.bg:SetAllPoints()
    b.accent = b:CreateTexture(nil, "BORDER"); b.accent:SetPoint("TOPLEFT"); b.accent:SetPoint("BOTTOMLEFT"); b.accent:SetWidth(3)
    b.who = U.Text(b, "", "small"); b.who:SetPoint("TOPLEFT", 10, -6)
    b.text = U.Text(b, "", "chat"); b.text:SetWordWrap(true)
    return b
end
function U.BubbleText(b, text, variant, role, width)
    local colors = {you = {0.49, 0.78, 1, 0.25, 0.45, 0.75, 0.16}, coach = {1, 0.82, 0.25, 0.85, 0.70, 0.30, 0.10}}
    local c = colors[role]
    b.text:ClearAllPoints(); b.text:SetFontObject(U.Font(variant or "chat"))
    b.bg:SetShown(c ~= nil); b.accent:SetShown(c ~= nil); b.who:SetShown(c ~= nil)
    if c then
        b.bg:SetColorTexture(c[4], c[5], c[6], c[7]); b.accent:SetColorTexture(c[1], c[2], c[3], 0.9)
        b.who:SetText(role == "you" and "You" or "Coach"); b.who:SetTextColor(c[1], c[2], c[3])
        b.text:SetPoint("TOPLEFT", b.who, "BOTTOMLEFT", 0, -4); b.text:SetWidth(width - 18)
    else b.text:SetPoint("TOPLEFT"); b.text:SetWidth(width) end
    b.text:SetText(text); b:SetHeight(math.max(20, b.text:GetStringHeight()) + (c and 32 or 5))
end
function U.Button(parent, text, callback, width)
    local b = frame("Button", parent, "UIPanelButtonTemplate")
    b:SetSize(width or 76, 20); b:SetText(text)
    if b.SetNormalFontObject then b:SetNormalFontObject(GameFontNormalSmall) end
    b:SetScript("OnClick", callback)
    return b
end
function U.Close(parent)
    local b = frame("Button", parent, "UIPanelCloseButton")
    b:SetPoint("TOPRIGHT", -2, -2); b:SetScript("OnClick", function() parent:Hide() end)
    return b
end
function U.Scroll(parent)
    local scroll = frame("ScrollFrame", parent, "UIPanelScrollFrameTemplate")
    local content = CreateFrame("Frame", nil, scroll)
    content:SetSize(350, 1); scroll:SetScrollChild(content)
    return scroll, content
end
function U.Input(parent)
    local input = frame("EditBox", parent, "InputBoxTemplate")
    input:SetFontObject(ChatFontNormal); input:SetAutoFocus(false); input:SetMaxLetters(400)
    input:SetScript("OnEscapePressed", function(self) self:ClearFocus() end)
    return input
end
function U.Check(parent, label)
    local check = frame("CheckButton", parent, "UICheckButtonTemplate")
    check:SetSize(22, 22)
    check.Text = check.Text or U.Text(check, "", "small")
    check.Text:SetPoint("LEFT", check, "RIGHT", 0, 0); check.Text:SetText(label)
    return check
end
function U.StatusDot(parent)
    local dot = parent:CreateTexture(nil, "OVERLAY")
    dot:SetSize(12, 12)
    return dot
end
function U.SetStatus(dot, state)
    local names = {online = "Online", stale = "Away", down = "DnD", working = "DnD"}
    dot:SetTexture("Interface\\FriendsFrame\\StatusIcon-" .. (names[state] or "Offline"))
end
function U.Tooltip(owner, title, text)
    GameTooltip:SetOwner(owner, "ANCHOR_LEFT"); GameTooltip:AddLine(title)
    if text then GameTooltip:AddLine(text, nil, nil, nil, true) end
    GameTooltip:Show()
end
function U.Menu(owner, entries)
    if MenuUtil and MenuUtil.CreateContextMenu then
        MenuUtil.CreateContextMenu(owner, function(_, root)
            for _, row in ipairs(entries) do
                local b = root:CreateButton(row[1], row[2])
                if b.SetEnabled then b:SetEnabled(row[3] ~= false) end
            end
        end)
    else
        U.menu = U.menu or U.Panel("AzerothCoachMenu", 320, 240)
        U.menu.rows = U.menu.rows or {}
        for _, b in ipairs(U.menu.rows) do b:Hide() end
        for i, row in ipairs(entries) do
            local b = U.menu.rows[i] or U.Button(U.menu, "", nil, 280)
            U.menu.rows[i] = b
            b:SetPoint("TOPLEFT", 20, -12 - (i - 1) * 25); b:SetText(row[1]); b:SetEnabled(row[3] ~= false)
            b:SetScript("OnClick", function() U.menu:Hide(); row[2]() end); b:Show()
        end
        U.menu:ClearAllPoints(); U.menu:SetPoint("CENTER", owner, "CENTER"); U.menu:Show()
    end
end
function U.Arrow(parent)
    local arrow = parent:CreateTexture(nil, "OVERLAY")
    arrow:SetTexture("Interface\\Minimap\\MinimapArrow"); arrow:SetSize(16, 16)
    return arrow
end
function U.Pin(parent, number)
    local pin = CreateFrame("Button", nil, parent)
    pin:SetSize(20, 20)
    local icon = pin:CreateTexture(nil, "BACKGROUND")
    icon:SetAtlas("QuestNormal"); icon:SetAllPoints()
    local label = U.Text(pin, tostring(number), "small")
    label:SetPoint("CENTER")
    return pin
end
function U.Fade(frame, show, seconds)
    if show then frame:Show() end
    local start = GetTime()
    frame:SetScript("OnUpdate", function(self)
        local amount = math.min(1, (GetTime() - start) / seconds)
        self:SetAlpha(show and amount or 1 - amount)
        if amount >= 1 then self:SetScript("OnUpdate", nil); if not show then self:Hide() end end
    end)
end
