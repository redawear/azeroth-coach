local AC = AzerothCoach
AC.Tips = {}
local M = AC.Tips
local dungeonPlayer, dungeonPlans

local function tip(kind, subject, title, body, ids)
    return {kind = kind, key = kind .. ":" .. tostring(subject), title = title, body = body,
        questIds = ids or {}, createdAt = time(), from = "data"}
end

function M.ResolveDungeon(area, p, saved)
    if saved.settings.dungeons == false or not AC.Data.IsDungeon(area) then return nil end
    local preference = saved.dungeons[tostring(area)]
    if preference == "no" or (type(preference) == "number" and preference > time()) then return nil end
    local continent = p.map and AC.Geo.Continent(p.map)
    local entrance = AC.Data.EntranceMap(area)
    if not continent or not entrance or AC.Geo.Continent(entrance) ~= continent then return nil end
    if dungeonPlayer ~= p then dungeonPlayer, dungeonPlans = p, {} end
    local plan = dungeonPlans[area]
    if not plan then
        plan = AC.Planner.Dungeon(AC.Data.InZone(area), p, AC.Data.Quest)
        dungeonPlans[area] = plan
    end
    if not plan.inRange or (preference == nil and plan.completed * 2 >= plan.total) or not plan.nextStep then return nil end
    local missing = plan.nextStep
    local step, ids = missing.chain[1], {}
    for _, q in ipairs(missing.chain) do ids[#ids + 1] = q.id end
    local progress = "You finished " .. plan.completed .. " of " .. plan.total .. " quests."
    local body = preference == nil and ("Levels " .. plan.minLevel .. "–" .. plan.maxLevel .. ". " .. progress .. " Do you want tips for this dungeon?") or (progress .. " The next quest is {q:" .. step.id .. "}.")
    if preference == nil and #body > 110 then body = progress .. " Do you want tips for this dungeon?" end
    local item = tip("dungeon", area, AC.Data.dungeons[area], body, ids)
    item.dungeon, item.question = area, preference == nil
    return item
end

function M.Build(event, p, previous, saved, argument)
    local out = {}
    local zoneQuests = AC.Data.InMap(p.map)
    local ranked = AC.Planner.Rank(zoneQuests, p, function(q, mode) return AC.Data.Point(q, mode, p) end)
    local first = ranked[1]
    local function add(value) out[#out + 1] = value end
    local open = 0
    for _, q in ipairs(zoneQuests) do if AC.Planner.Available(q, p) then open = open + 1 end end
    if event == "PLAYER_LEVEL_UP" and open > 0 then
        add(tip("level", p.level, "New quests", "Level " .. p.level .. ". " .. p.zone .. " has " .. open .. (open == 1 and " open quest." or " open quests."), first and {first.quest.id}))
    end
    if (event == "ZONE_CHANGED_NEW_AREA" or event == "PLAYER_LOGIN") and first then
        add(tip("zone", p.area or p.zone, "Quests in this zone", (first.turnIn and "Turn in {q:" or "Start with {q:") .. first.quest.id .. "}.", {first.quest.id}))
    end
    if event == "QUEST_TURNED_IN" and argument then
        local oldQuest = AC.Data.Quest(argument)
        local ids = AC.Data.Followups(argument); if oldQuest and (oldQuest.nextQuest or 0) > 0 then ids[#ids+1] = oldQuest.nextQuest end
        for _, id in ipairs(oldQuest and oldQuest.children or {}) do ids[#ids+1] = id end
        for _, id in ipairs(ids) do
            local nextQuest = AC.Data.Quest(id)
            if nextQuest and AC.Planner.Available(nextQuest, p) then
                add(tip("turnin", argument, "The next step", "Continue with {q:" .. id .. "}.", {id}))
                break
            end
        end
    end
    for id, entry in pairs(p.active) do
        if p.trivialRange and entry.level and entry.level > 0 and entry.level < p.level - p.trivialRange and AC.Data.Quest(id) then
            add(tip("gray", id, "A low-level quest", "{q:" .. id .. "} is gray now. Check its chain before you abandon it.", {id}))
        end
    end
    if p.questMax and p.questMax > 0 and p.questCount >= p.questMax - 1 then
        add(tip("full", p.questMax, "Your quest log is almost full", p.questCount .. " of " .. p.questMax .. " quests. Make room before you accept more.", first and {first.quest.id}))
    end
    if event == "PLAYER_LEVEL_UP" and p.level % 2 == 0 then
        add(tip("spells", p.level, "New class spells", "Level " .. p.level .. ". Your class trainer can have new spells."))
    end
    local capitals = {[1519] = true, [1537] = true, [1657] = true, [1637] = true, [1638] = true, [1497] = true}
    if event == "ZONE_CHANGED_NEW_AREA" and capitals[p.area] then
        add(tip("capital", p.area, "In the capital", "Check your trainer, your bags, and your hearthstone before you leave."))
    end
    if event == "PLAYER_DEAD" and AC.deathReady then
        add(tip("deaths", p.area or p.zone, "This area may be too hard", "You died 3 times here in 10 minutes. Do easier quests first, or find a group."))
    end
    if saved.settings.dungeons ~= false and (event == "PLAYER_LOGIN" or event == "ZONE_CHANGED_NEW_AREA" or event == "PLAYER_LEVEL_UP") then
        for area in pairs(AC.Data.dungeons) do
            add({kind = "dungeon", key = "dungeon:" .. tostring(area), dungeon = area, createdAt = time()})
        end
    end
    return out
end
