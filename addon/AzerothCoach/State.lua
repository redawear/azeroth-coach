local AC = AzerothCoach
AC.State = {api = {}}
local S = AC.State

function S.Try(name, fn, ...)
    if type(fn) ~= "function" then S.api[name] = "missing"; return nil end
    local function pack(...) return {n = select("#", ...), ...} end
    local result = pack(pcall(fn, ...))
    if not result[1] then S.api[name] = "failed"; return nil end
    S.api[name] = "found"
    return unpack(result, 2, result.n)
end

local function quote(value)
    return '"' .. tostring(value):gsub('[%z\1-\31\\"]', function(c)
        if c == '"' then return '\\"' end
        if c == '\\' then return '\\\\' end
        return string.format('\\u%04x', c:byte())
    end) .. '"'
end
function S.JSON(value, depth)
    depth = depth or 0
    if depth > 10 then return "null" end
    if type(value) == "string" then return quote(value) end
    if type(value) == "boolean" then return value and "true" or "false" end
    if type(value) == "number" then return value == value and tostring(value) or "null" end
    if type(value) ~= "table" then return "null" end
    local parts, array = {}, #value > 0
    if array then
        for _, item in ipairs(value) do parts[#parts + 1] = S.JSON(item, depth + 1) end
        return "[" .. table.concat(parts, ",") .. "]"
    end
    local keys = {}
    for key in pairs(value) do keys[#keys + 1] = key end
    table.sort(keys, function(a, b) return tostring(a) < tostring(b) end)
    for _, key in ipairs(keys) do parts[#parts + 1] = quote(key) .. ":" .. S.JSON(value[key], depth + 1) end
    return "{" .. table.concat(parts, ",") .. "}"
end

function S.Read()
    if InCombatLockdown and InCombatLockdown() then return nil end
    local p = {active = {}, completed = {}, skills = {}, reputation = {}, spells = {}}
    p.level = S.Try("UnitLevel", UnitLevel, "player") or 1
    p.class, p.className, p.classId = S.Try("UnitClass", UnitClass, "player")
    local race, token, raceId = S.Try("UnitRace", UnitRace, "player")
    p.race = race
    p.classBit = p.classId and 2 ^ (p.classId - 1)
    p.raceBit = raceId and AC.Data.RaceBit(raceId)
    p.faction = S.Try("UnitFactionGroup", UnitFactionGroup, "player")
    p.zone = S.Try("GetZoneText", GetZoneText) or ""
    p.map = S.Try("C_Map.GetBestMapForUnit", C_Map and C_Map.GetBestMapForUnit, "player")
    local pos = p.map and S.Try("C_Map.GetPlayerMapPosition", C_Map and C_Map.GetPlayerMapPosition, p.map, "player")
    if pos and pos.GetXY then p.x, p.y = pos:GetXY() end
    p.xp = S.Try("UnitXP", UnitXP, "player")
    p.maxXP = S.Try("UnitXPMax", UnitXPMax, "player")
    p.restedXP = S.Try("GetXPExhaustion", GetXPExhaustion)
    p.money = S.Try("GetMoney", GetMoney)
    p.hearthstone = S.Try("GetBindLocation", GetBindLocation)
    p.group = S.Try("GetNumGroupMembers", GetNumGroupMembers) or 0
    p.instance = S.Try("IsInInstance", IsInInstance) or false
    p.dead = S.Try("UnitIsDeadOrGhost", UnitIsDeadOrGhost, "player") or false
    p.taxi = S.Try("UnitOnTaxi", UnitOnTaxi, "player") or false
    p.resting = S.Try("IsResting", IsResting) or false
    p.area = AC.Data.Area(p.map)
    p.questMax = S.Try("C_QuestLog.GetMaxNumQuestsCanAccept", C_QuestLog and C_QuestLog.GetMaxNumQuestsCanAccept)
    local done = S.Try("C_QuestLog.GetAllCompletedQuestIDs", C_QuestLog and C_QuestLog.GetAllCompletedQuestIDs)
    if type(done) == "table" then
        p.completedKnown = true
        for _, id in ipairs(done) do p.completed[id] = true end
    end
    local completedFn = C_QuestLog and C_QuestLog.IsQuestFlaggedCompleted or IsQuestFlaggedCompleted
    if type(completedFn) == "function" then
        p.checkCompleted = function(id) return S.Try("IsQuestFlaggedCompleted", completedFn, id) end
    end
    local num = S.Try("C_QuestLog.GetNumQuestLogEntries", C_QuestLog and C_QuestLog.GetNumQuestLogEntries)
        or S.Try("GetNumQuestLogEntries", GetNumQuestLogEntries) or 0
    local count = 0
    for i = 1, num do
        local info = S.Try("C_QuestLog.GetInfo", C_QuestLog and C_QuestLog.GetInfo, i)
        if not info then
            local title, level, _, header, _, complete, _, id = S.Try("GetQuestLogTitle", GetQuestLogTitle, i)
            if id then info = {questID = id, title = title, level = level, isHeader = header, isComplete = complete == 1} end
        end
        if info and not info.isHeader and info.questID and info.questID > 0 then
            count = count + 1
            local complete = S.Try("C_QuestLog.IsComplete", C_QuestLog and C_QuestLog.IsComplete, info.questID)
            if complete == nil then complete = info.isComplete == true end
            p.active[info.questID] = {id = info.questID, title = info.title, level = info.level, complete = complete,
                objectives = S.Try("C_QuestLog.GetQuestObjectives", C_QuestLog and C_QuestLog.GetQuestObjectives, info.questID)}
        end
    end
    p.questCount = count
    p.trivialRange = S.Try("UnitQuestTrivialLevelRange", UnitQuestTrivialLevelRange, "player")
        or S.Try("GetQuestGreenRange", GetQuestGreenRange)
        or S.Try("C_QuestLog.GetTrivialRange", C_QuestLog and C_QuestLog.GetTrivialRange)
    if GetProfessions and GetProfessionInfo then
        local indices = {S.Try("GetProfessions", GetProfessions)}
        for _, index in pairs(indices) do
            if index then
                local _, _, rank, _, _, _, skillId = S.Try("GetProfessionInfo", GetProfessionInfo, index)
                if skillId and rank then p.skills[skillId] = rank end
            end
        end
    end
    p.bags, p.equipment, p.talents = {}, {}, {}
    if C_Container then
        for bag = 0, 4 do
            local slots = S.Try("C_Container.GetContainerNumSlots", C_Container.GetContainerNumSlots, bag) or 0
            for slot = 1, slots do
                local item = S.Try("C_Container.GetContainerItemInfo", C_Container.GetContainerItemInfo, bag, slot)
                if item and item.itemID then p.bags[item.itemID] = (p.bags[item.itemID] or 0) + (item.stackCount or 1) end
            end
        end
    end
    for slot = 1, 19 do
        local id = S.Try("GetInventoryItemID", GetInventoryItemID, "player", slot)
        if id then p.equipment[slot] = id end
    end
    local tabs = S.Try("GetNumTalentTabs", GetNumTalentTabs) or 0
    for tab = 1, tabs do
        local name, _, points = S.Try("GetTalentTabInfo", GetTalentTabInfo, tab)
        if name then p.talents[#p.talents + 1] = {name = name, points = points} end
    end
    -- Each distinct restriction needs one API call, regardless of quest count.
    for id in pairs(AC.Data.reputationIds) do
        local info = S.Try("C_Reputation.GetFactionDataByID", C_Reputation and C_Reputation.GetFactionDataByID, id)
        if info then p.reputation[id] = info.currentStanding end
    end
    for id in pairs(AC.Data.spellIds) do p.spells[id] = S.Try("IsPlayerSpell", IsPlayerSpell or IsSpellKnown, id) end
    return p
end

function S.Context(p, tip, question)
    local lines = {
        "Game: World of Warcraft: Forever",
        "Level: " .. p.level .. "; class: " .. (p.class or "unknown") .. "; faction: " .. (p.faction or "unknown"),
        "Zone: " .. p.zone .. "; quests: " .. p.questCount,
        "XP: " .. tostring(p.xp or "unknown") .. "/" .. tostring(p.maxXP or "unknown") .. "; rested: " .. tostring(p.restedXP or 0),
        "Money: " .. tostring(p.money or 0) .. "; group: " .. tostring(p.group),
        "Hearthstone: " .. tostring(p.hearthstone or "unknown"),
        "Professions: " .. S.JSON(p.skills) .. "; talents: " .. S.JSON(p.talents),
        "Bags (item ID:count): " .. S.JSON(p.bags),
        "Equipment (slot:item ID): " .. S.JSON(p.equipment)
    }
    if tip then lines[#lines + 1] = "Trigger: " .. tip.key end
    local kept, bytes = {}, 0
    for _, line in ipairs(lines) do
        if bytes + #line + 1 <= 900 then kept[#kept + 1] = line; bytes = bytes + #line + 1 end
    end
    local context = table.concat(kept, "\n")
    return context .. "\n--- facts ---\n" .. S.JSON(AC.Data.Facts(p, tip, question))
end
