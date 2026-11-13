local AC = AzerothCoach
AC.Data = {quests = {}, zones = {}, dungeons = {}, dungeonQuests = {}, followups = {}, reputationIds = {}, spellIds = {}, ready = false}
local D = AC.Data
local provider, questDB, npcDB, objectDB, itemDB, maps, reverse, dungeonData

local function get(entity, id, key)
    if not entity or not entity.Get then return nil end
    local ok, value = pcall(entity.Get, id, key)
    if ok then return value end
end
local function support(name, field)
    local ok, module = pcall(provider.Support.Get, name)
    local value = ok and module and module.private and module.private[field]
    if type(value) == "string" then
        local fn = loadstring(value)
        if not fn then return {} end
        local good, result = pcall(fn)
        return good and type(result) == "table" and result or {}
    end
    return type(value) == "table" and value or {}
end

function D.Initialize(onReady)
    provider = LibQuestieDB
    if not provider or type(provider.RequireContract) ~= "function" then
        D.error = "Quest data not found. Install the QuestieDB addon, then restart the game."
        onReady(false); return
    end
    local ok, compatible = pcall(provider.RequireContract, 4)
    if not ok or not compatible then
        D.error = "QuestieDB is too old for the coach. Update QuestieDB."
        onReady(false); return
    end
    if not provider.flavor or provider.flavor.name ~= "Forever" then
        D.error = "This QuestieDB is not the Forever version. Install the Forever release."
        onReady(false); return
    end
    questDB, npcDB, objectDB, itemDB = provider.Quest, provider.Npc, provider.Object, provider.Item
    if not questDB or not questDB.GetAllIds or not provider.Support then
        D.error = "QuestieDB is too old for the coach. Update QuestieDB."
        onReady(false); return
    end
    maps = support("ZoneDB", "areaIdToUiMapId")
    reverse = support("ZoneDB", "uiMapIdToAreaId")
    for id, map in pairs(support("ZoneDB", "areaIdToUiMapIdOverride")) do maps[id] = map end
    for map, id in pairs(support("ZoneDB", "uiMapIdToAreaIdOverride")) do reverse[map] = id end
    dungeonData = support("ZoneDB", "dungeons")
    local dungeonByArea = {}
    for area, row in pairs(dungeonData) do
        dungeonByArea[area] = area
        for _, other in ipairs(row[2] or {}) do dungeonByArea[other] = area end
    end
    local ids = questDB.GetAllIds()
    local cursor = 1
    local function batch()
        if InCombatLockdown and InCombatLockdown() then C_Timer.After(1, batch); return end
        local last = math.min(cursor + 99, #ids)
        for i = cursor, last do
            local id = ids[i]
            local zone = get(questDB, id, "zoneOrSort")
            local q = D.Quest(id)
            if q then
                for _, refs in ipairs({q.all or {}, q.any or {}, q.breadcrumbs or {}}) do
                    for _, previous in ipairs(refs) do
                        previous = math.abs(previous)
                        D.followups[previous] = D.followups[previous] or {}
                        D.followups[previous][id] = true
                    end
                end
                if (q.breadcrumbFor or 0) > 0 then
                    D.followups[id] = D.followups[id] or {}; D.followups[id][q.breadcrumbFor] = true
                end
            end
            if zone and zone > 0 then
                local map = maps[zone]
                if map then
                    D.zones[map] = D.zones[map] or {}
                    D.zones[map][#D.zones[map] + 1] = id
                end
                local dungeon = dungeonByArea[zone]
                if dungeon then
                    D.dungeons[dungeon] = dungeonData[dungeon][1]
                    D.dungeonQuests[dungeon] = D.dungeonQuests[dungeon] or {}
                    D.dungeonQuests[dungeon][#D.dungeonQuests[dungeon] + 1] = id
                end
            end
        end
        cursor = last + 1
        if cursor <= #ids then C_Timer.After(0, batch)
        else D.ready = true; onReady(true) end
    end
    batch()
end

function D.Quest(id)
    if D.quests[id] then return D.quests[id] end
    local name = get(questDB, id, "name")
    if not name or name == "" then return nil end
    local q = {id = id, name = name}
    local fields = {
        minLevel = "requiredLevel", level = "questLevel", races = "requiredRaces", classes = "requiredClasses",
        all = "preQuestGroup", any = "preQuestSingle", exclusive = "exclusiveTo", zone = "zoneOrSort",
        nextQuest = "nextQuestInChain", parent = "parentQuest", untilQuest = "availableUntilCompleted",
        startingWith = "availableStartingWith", disabledBy = "disabledByQuest", maxLevel = "requiredMaxLevel",
        skill = "requiredSkill", minRep = "requiredMinRep", maxRep = "requiredMaxRep", ranks = "requiredRanks",
        spell = "requiredSpell", specialization = "requiredSpecialization", start = "startedBy", finish = "finishedBy",
        breadcrumbFor = "breadcrumbForQuestId", children = "childQuests", objectives = "objectives", breadcrumbs = "breadcrumbs"
    }
    for key, field in pairs(fields) do q[key] = get(questDB, id, field) end
    for _, pair in ipairs({q.minRep or {}, q.maxRep or {}}) do if pair[1] then D.reputationIds[pair[1]] = true end end
    if q.spell and q.spell ~= 0 then D.spellIds[math.abs(q.spell)] = true end
    D.quests[id] = q
    return q
end

function D.Zone(area)
    local map = maps and maps[area]
    if type(map) ~= "number" or not C_Map or not C_Map.GetMapInfo then return nil end
    local ok, info = pcall(C_Map.GetMapInfo, map)
    return ok and info and info.name or nil
end
function D.Area(map) return reverse and reverse[map] end
function D.Map(area) return maps and maps[area] end
function D.RaceBit(id) return provider and provider.Enum and provider.Enum.raceMaskById and provider.Enum.raceMaskById[id] end
function D.InMap(map)
    local out = {}
    for _, id in ipairs(D.zones[map] or {}) do
        local q = D.Quest(id)
        if q then out[#out + 1] = q end
    end
    return out
end

function D.InZone(area)
    if not D.dungeonQuests[area] then return D.InMap(D.Map(area)) end
    local out = {}; for _, id in ipairs(D.dungeonQuests[area]) do local q = D.Quest(id); if q then out[#out+1] = q end end
    return out
end
function D.Followups(id)
    local result = {}; for nextId in pairs(D.followups[id] or {}) do result[#result+1] = nextId end
    table.sort(result); return result
end

function D.Point(q, mode, player)
    local refs = mode == "finish" and q.finish or q.start
    local best, distance
    for kind = 1, 2 do
        local entity = kind == 1 and npcDB or objectDB
        for _, id in ipairs((refs and refs[kind]) or {}) do
            local spawns = get(entity, id, "spawns")
            for area, points in pairs(spawns or {}) do
                local map = maps and maps[area]
                if type(map) == "number" and C_Map and C_Map.GetMapInfo and AC.State.Try("C_Map.GetMapInfo", C_Map.GetMapInfo, map) then
                    for _, xy in ipairs(points) do
                        local x, y = xy[1], xy[2]
                        if type(x) == "number" and type(y) == "number" and x >= 0 and y >= 0 and x <= 100 and y <= 100 then
                            local point = {map = map, x = x / 100, y = y / 100, label = get(entity, id, "name"), id = id, kind = kind == 1 and "n" or "o", questId = q.id}
                            local d = AC.Planner.Distance(player, point)
                            if not best or d < distance then best, distance = point, d end
                        end
                    end
                end
            end
        end
    end
    return best
end

function D.Name(kind, id)
    if kind == "q" then local q = D.Quest(id); return q and q.name end
    if kind == "n" then return get(npcDB, id, "name") end
    if kind == "o" then return get(objectDB, id, "name") end
    if kind == "i" then return get(itemDB, id, "name") end
    if kind == "z" then return D.Zone(id) end
end

function D.Expand(text)
    return (tostring(text or ""):gsub("{([qnoiz]):(%d+)}", function(kind, raw)
        return (D.Name(kind, tonumber(raw)) or "[Missing quest data]"):gsub("|", "||")
    end))
end

function D.Facts(player, tip, question)
    local pack = {q = {}, n = {}, o = {}, i = {}, z = {}}
    local function add(id, full)
        local q = D.Quest(id)
        if not q then return end
        local row = {name = q.name, level = q.level, min = q.minLevel}
        if full then row.all, row.any = q.all, q.any end
        row.state = player.active[id] and (player.active[id].complete and "turn-in" or "active") or (AC.Planner.Completed(player, id) and "complete" or "not in log")
        pack.q[tostring(id)] = row
        if full then
            for _, refs in ipairs({q.start or {}, q.finish or {}}) do
                for kind = 1, 3 do
                    local key = ({"n", "o", "i"})[kind]
                    for _, rid in ipairs(refs[kind] or {}) do
                        local name = D.Name(key, rid)
                        if name then pack[key][tostring(rid)] = {name = name} end
                    end
                end
            end
        end
    end
    local function fit(fn)
        local old = pack
        local fresh = {}; for kind, rows in pairs(pack) do fresh[kind] = {}; for id, row in pairs(rows) do fresh[kind][id] = row end end
        pack = fresh; fn()
        if #AC.State.JSON(pack) > 1800 then pack = old end
    end
    for _, id in ipairs(tip and tip.questIds or {}) do fit(function() add(id, true) end) end
    for raw in tostring(question or ""):gmatch("[Qq]uest%s+#?(%d+)") do fit(function() add(tonumber(raw), true) end) end
    for raw in tostring(question or ""):gmatch("|Hquest:(%d+)") do fit(function() add(tonumber(raw), true) end) end
    local area = D.Area(player.map)
    local zoneName = area and D.Zone(area)
    if zoneName then fit(function() pack.z[tostring(area)] = {name = zoneName} end) end
    for raw in tostring(question or ""):gmatch("|Hitem:(%d+)") do
        local name = D.Name("i", tonumber(raw))
        if name then fit(function() pack.i[raw] = {name = name} end) end
    end
    local ids = {}; for id in pairs(player.active) do ids[#ids + 1] = id end; table.sort(ids)
    for _, id in ipairs(ids) do if not pack.q[tostring(id)] then fit(function() add(id, true) end) end end
    return pack
end
