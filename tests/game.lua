-- A small test client. Unknown frame methods fail instead of silently passing.
STUB = {now = 1000, epoch = 1800000000, frames = {}, timers = {}, sounds = {}, loaded = {}, combat = false}
local M = {}
local function frame(kind, name, parent)
    local f = setmetatable({kind = kind, parent = parent, shown = true, scripts = {}, events = {}, textures = {}, width = 420, height = 360}, {__index = M})
    if name then _G[name] = f end
    STUB.frames[#STUB.frames + 1] = f
    return f
end
function M:SetScript(key, fn) self.scripts[key] = fn end
function M:RegisterEvent(event) self.events[event] = true end
function M:Show() self.shown = true end
function M:Hide() self.shown = false end
function M:IsShown() return self.shown and (not self.parent or self.parent:IsShown()) end
function M:SetShown(value) self.shown = value end
function M:SetText(text) self.text = text end
function M:GetText() return self.text or "" end
function M:GetWidth() return self.width end
function M:GetHeight() return self.height end
function M:SetSize(w, h) self.width, self.height = w, h end
function M:SetWidth(w) self.width = w end
function M:SetHeight(h) self.height = h end
function M:GetStringHeight() return math.max(14, math.ceil(#(self.text or "") / 40) * 14) end
function M:GetVerticalScroll() return self.scroll or 0 end
function M:SetVerticalScroll(value) self.scroll = value end
function M:GetBottom() return self.bottom or 400 end
function M:GetPoint() return "CENTER", nil, "CENTER", 0, 0 end
function M:SetPoint(...) self.point = {...} end
function M:SetChecked(value) self.checked = value end
function M:GetChecked() return self.checked end
function M:SetEnabled(value) self.enabled = value end
function M:SetParent(parent) self.parent = parent end
function M:SetColorTexture(r,g,b) self.color = {r,g,b} end
function M:SetAlpha(value) self.alpha = value end
function M:GetAlpha() return self.alpha or 1 end
function M:CreateFontString(name) return frame("FontString", name, self) end
function M:CreateTexture(name) local t = frame("Texture", name, self); self.textures[#self.textures + 1] = t; return t end
for name in ("ClearAllPoints ClearFocus HighlightText SetAllPoints SetAtlas SetAutoFocus SetBackdrop SetBackdropColor SetClampedToScreen SetFocus SetFontObject SetFrameLevel SetFrameStrata SetHighlightTexture SetIgnoreParentScale SetJustifyH SetMaxLetters SetMaxLines SetMovable SetNormalFontObject SetNormalTexture SetOwner SetPushedTexture SetResizable SetResizeBounds SetRotation SetScale SetScrollChild SetTextColor SetTexture SetWordWrap EnableMouse RegisterForDrag StartMoving StartSizing StopMovingOrSizing AddLine AddMessage"):gmatch("%S+") do M[name] = function() end end
CreateFrame = frame
UIParent = frame("Frame", "UIParent")
MinimapCluster = frame("Frame", "MinimapCluster", UIParent)
ObjectiveTrackerFrame = frame("Frame", "ObjectiveTrackerFrame", UIParent)
ObjectiveTrackerFrame.NineSlice = frame("Frame", nil, ObjectiveTrackerFrame)
GameTooltip = frame("Frame", "GameTooltip", UIParent)
DEFAULT_CHAT_FRAME = frame("Frame", nil, UIParent)
ChatFontNormal, GameFontNormalSmall, NORMAL_FONT_COLOR = {}, {}, {r=1,g=1,b=1}
UISpecialFrames, SlashCmdList = {}, {}
function GetTime() return STUB.now end
function time() return STUB.epoch + math.floor(STUB.now) end
function InCombatLockdown() return STUB.combat end
function IsShiftKeyDown() return false end
function GetPhysicalScreenSize() return 1920, 1080 end
function PlaySoundFile(path) return STUB.sounds[path] == true end
function StopSound() end
function UnitLevel() return 12 end
function UnitClass() return "Warrior", "WARRIOR", 1 end
function UnitRace() return "Human", "Human", 1 end
function UnitFactionGroup() return "Alliance" end
function GetZoneText() return "Test Meadow" end
function GetPlayerFacing() return 0 end
function UnitIsDeadOrGhost() return STUB.dead end
function IsInInstance() return STUB.instance end
C_Map = {
    GetBestMapForUnit = function() return 10 end,
    GetPlayerMapPosition = function() return {GetXY = function() return 0.2, 0.3 end} end,
    GetMapInfo = function(id) return {name = "Test Meadow", mapType = id == 1 and 2 or 3, parentMapID = 1} end,
    GetMapRectOnMap = function() return 0, 1, 0, 1 end,
    GetMapWorldSize = function() return 1000, 1000 end
}
C_QuestLog = {
    GetAllCompletedQuestIDs = function() return {} end,
    GetNumQuestLogEntries = function() return 0 end,
    GetMaxNumQuestsCanAccept = function() return 20 end,
    GetTrivialRange = function() return 5 end
}
C_AddOns = {
    IsAddOnLoaded = function(name) return STUB.loaded[name] == true end,
    LoadAddOn = function(name) STUB.loaded[name] = true; if STUB.onLoad then STUB.onLoad(name) end; return true end
}
C_Timer = {
    After = function(delay, fn) STUB.timers[#STUB.timers + 1] = {at = STUB.now + delay, fn = fn} end,
    NewTicker = function(delay, fn) local t = {at = STUB.now + delay, fn = fn, interval = delay}; STUB.timers[#STUB.timers + 1] = t; return t end
}
function STUB.Advance(seconds)
    STUB.now = STUB.now + seconds
    local due = STUB.timers; STUB.timers = {}
    for _, timer in ipairs(due) do
        if timer.at <= STUB.now then timer.fn(); if timer.interval then timer.at = STUB.now + timer.interval; STUB.timers[#STUB.timers + 1] = timer end
        else STUB.timers[#STUB.timers + 1] = timer end
    end
end
function STUB.Event(event, ...)
    for _, f in ipairs(STUB.frames) do if f.events[event] and f.scripts.OnEvent then f.scripts.OnEvent(f, event, ...) end end
end
local quests = {
    [101] = {name="A Meadow Errand", requiredLevel=10, questLevel=12, zoneOrSort=20, startedBy={{201}}, finishedBy={{201}}},
    [102] = {name="A Cave Errand", requiredLevel=10, questLevel=14, zoneOrSort=30, preQuestGroup={101}, startedBy={{201}}}
}
LibQuestieDB = {
    Enum = {raceMaskById={[1]=1,[95]=4294967296,[96]=8589934592}},
    RequireContract = function(v) return v == 4 end, flavor = {name="Forever"},
    Quest = {GetAllIds=function() return {101,102} end, Get=function(id,key) return quests[id] and quests[id][key] end},
    Npc = {Get=function(id,key) if id == 201 then if key == "name" then return "Meadow Keeper" elseif key == "spawns" then return {[20]={{20,30}}} end end end},
    Support = {Get=function() return {private={areaIdToUiMapId="return {[20]=10,[30]=11}", uiMapIdToAreaId="return {[10]=20}", dungeons={[30]={"Test Cave"}}}} end}
}
