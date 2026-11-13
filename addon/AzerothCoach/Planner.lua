local AC = AzerothCoach or {}
AzerothCoach = AC
AC.Planner = {}
local P = AC.Planner

local function hasBit(mask, value)
    return not mask or mask == 0 or (value and value > 0 and math.floor(mask / value) % 2 == 1)
end
P.HasBit = hasBit

function P.Completed(player, id)
    if player.completed and player.completed[id] then return true end
    if player.checkCompleted then return player.checkCompleted(id) end
    if player.completedKnown then return false end
    return nil
end

local function listDone(ids, player, all)
    if not ids or #ids == 0 then return true end
    local unknown = false
    for _, raw in ipairs(ids) do
        local done
        if raw < 0 then done = player.active[math.abs(raw)] ~= nil
        else done = P.Completed(player, raw) end
        if all and done == false then return false end
        if not all and done == true then return true end
        if done == nil then unknown = true end
    end
    if unknown then return nil end
    return all
end

function P.Restrictions(q, player, future)
    if not q then return false, "Quest data is missing." end
    if not hasBit(q.races, player.raceBit) or not hasBit(q.classes, player.classBit) then
        return false, "This quest has a race or class limit."
    end
    if not future and (q.minLevel or 0) > player.level then return false, "Your level is too low." end
    if (q.maxLevel or 0) > 0 and player.level > q.maxLevel then return false, "You are above the level limit." end
    for _, id in ipairs(q.exclusive or {}) do
        if player.active[id] or P.Completed(player, id) then return false, "A different quest branch is active or complete." end
    end
    for _, id in ipairs({q.nextQuest or 0, q.untilQuest or 0}) do
        if id > 0 and P.Completed(player, id) then return false, "This quest is no longer available." end
    end
    if (q.nextQuest or 0) > 0 and player.active[q.nextQuest] then return false, "The next quest is already active." end
    if (q.disabledBy or 0) > 0 and player.active[q.disabledBy] then return false, "An active quest blocks this quest." end
    if q.skill and #q.skill > 0 and (player.skills[q.skill[1]] or 0) < (q.skill[2] or 1) then
        return false, "The required profession rank is not known."
    end
    if q.ranks and #q.ranks > 0 then
        local found = false
        for _, rank in ipairs(q.ranks) do
            if (player.skills[rank[1]] or 0) >= (rank[2] or 1) then found = true end
        end
        if not found then return false, "The required profession rank is not known." end
    end
    if (q.spell or 0) < 0 then return false, "The spell exclusion needs a client check." end
    if (q.spell or 0) > 0 and not player.spells[q.spell] then return false, "The required spell is not known." end
    if (q.specialization or 0) ~= 0 then return false, "The profession specialization needs a client check." end
    for _, spec in ipairs({{q.minRep, false}, {q.maxRep, true}}) do
        local pair = spec[1]
        if pair and #pair > 0 then
            local value = player.reputation[pair[1]]
            if value == nil then return false, "The required reputation is not known." end
            if (not spec[2] and value < pair[2]) or (spec[2] and value >= pair[2]) then
                return false, "The reputation limit is not met."
            end
        end
    end
    return true
end

function P.Available(q, player)
    local ok, why = P.Restrictions(q, player)
    if not ok then return false, why end
    if P.Completed(player, q.id) == nil then return false, "Completed quest data is not available." end
    if player.active[q.id] or P.Completed(player, q.id) then return false, "This quest is active or complete." end
    if (q.parent or 0) > 0 and not player.active[q.parent] then return false, "The parent quest must be active." end
    if (q.startingWith or 0) > 0 and not player.active[q.startingWith] and not P.Completed(player, q.startingWith) then
        return false, "The starting quest is not active or complete."
    end
    local group, single = listDone(q.all, player, true), listDone(q.any, player, false)
    if group == nil or single == nil then return false, "Completed quest data is not available." end
    if not group or not single then return false, "Finish the quest prerequisites first." end
    return true
end

function P.Chain(id, player, getQuest)
    local visiting, added, steps = {}, {}, {}
    local function visit(qid, depth)
        if depth > 40 or visiting[qid] then return false, "The quest chain has a loop or is too long." end
        if added[qid] or P.Completed(player, qid) then return true end
        if not player.active[qid] and P.Completed(player, qid) == nil then return false, "Completed quest data is not available." end
        local q = getQuest(qid)
        local ok, why = P.Restrictions(q, player, true)
        if not ok then return false, why end
        visiting[qid] = true
        for _, raw in ipairs(q.all or {}) do
            if raw < 0 then
                if not player.active[-raw] then visiting[qid] = nil; return false, "A prerequisite quest must remain active." end
            else
                local good, reason = visit(raw, depth + 1)
                if not good then visiting[qid] = nil; return false, reason end
            end
        end
        if q.any and #q.any > 0 and not listDone(q.any, player, false) then
            local good = false
            for _, raw in ipairs(q.any) do
                if raw < 0 and player.active[-raw] then good = true; break end
                if raw > 0 and not visiting[raw] then
                    local oldCount = #steps
                    local oldAdded = {}; for k, v in pairs(added) do oldAdded[k] = v end
                    local oldVisiting = {}; for k, v in pairs(visiting) do oldVisiting[k] = v end
                    good = visit(raw, depth + 1)
                    if good then break end
                    while #steps > oldCount do table.remove(steps) end
                    added, visiting = oldAdded, oldVisiting
                end
            end
            if not good then visiting[qid] = nil; return false, "No known prerequisite branch fits this character." end
        end
        if (q.parent or 0) > 0 and not player.active[q.parent] then
            visiting[qid] = nil; return false, "The parent quest must remain active."
        end
        if (q.startingWith or 0) > 0 and not player.active[q.startingWith] and not P.Completed(player, q.startingWith) then
            local good, reason = visit(q.startingWith, depth + 1)
            if not good then visiting[qid] = nil; return false, reason end
        end
        visiting[qid], added[qid] = nil, true
        steps[#steps + 1] = q
        return true
    end
    local ok, why = visit(id, 0)
    if not ok then return nil, why end
    return steps
end

function P.Distance(player, point)
    if not point or point.map ~= player.map or not player.x or not player.y then return 1000 end
    return math.sqrt((point.x - player.x) ^ 2 + (point.y - player.y) ^ 2)
end

function P.Level(q, player) return (q.level or 0) > 0 and q.level or player.level end

function P.Rank(quests, player, getPoint)
    local ranked = {}
    for _, q in ipairs(quests) do
        local active = player.active[q.id]
        local allowed = active or P.Available(q, player)
        if allowed and (active or (P.Level(q, player) >= player.level - 5 and P.Level(q, player) <= player.level + 3)) then
            local point
            if not active or active.complete then point = getPoint(q, active and "finish" or "start") end
            if point and point.map == player.map then
                local score = (active and active.complete and 100 or 0) + (active and 20 or 0)
                score = score - P.Distance(player, point) * 60 - math.abs(P.Level(q, player) - player.level)
                ranked[#ranked + 1] = {quest = q, point = point, score = score, turnIn = active and active.complete}
            end
        end
    end
    table.sort(ranked, function(a, b)
        if a.score == b.score then return a.quest.id < b.quest.id end
        return a.score > b.score
    end)
    return ranked
end

function P.Dungeon(quests, player, getQuest)
    local out = {total = 0, active = 0, completed = 0, missing = {}, minLevel = nil, maxLevel = nil}
    for _, q in ipairs(quests) do
        if P.Restrictions(q, player, true) then
            out.total = out.total + 1
            if (q.minLevel or 0) > 0 then out.minLevel = math.min(out.minLevel or 999, q.minLevel) end
            if (q.level or 0) > 0 then out.maxLevel = math.max(out.maxLevel or 0, q.level) end
            if P.Completed(player, q.id) then out.completed = out.completed + 1
            elseif player.active[q.id] then out.active = out.active + 1
            else
                local chain, why = P.Chain(q.id, player, getQuest)
                out.missing[#out.missing + 1] = {quest = q, chain = chain, reason = why}
            end
        end
    end
    return out
end

P.ChainOf = P.Chain
P.DungeonPlan = P.Dungeon
function P.NextStep(id, player, getQuest)
    local chain, reason = P.Chain(id, player, getQuest)
    if not chain then return nil, reason end
    for _, q in ipairs(chain) do
        local active = player.active[q.id]
        if active then return q, active.complete and "finish" or "objective" end
        if P.Available(q, player) then return q, "start" end
    end
    return nil, "No quest step is open now."
end
function P.ChainsInZone(quests, player, getQuest)
    local result = {}
    for _, q in ipairs(quests) do
        local chain = P.Chain(q.id, player, getQuest)
        if chain and #chain > 0 then result[#result + 1] = {quest = q, steps = chain} end
    end
    return result
end
function P.LowValue(player)
    local result = {}
    if not player.trivialRange then return result end
    for id, q in pairs(player.active) do
        if q.level and q.level > 0 and q.level < player.level - player.trivialRange then result[#result + 1] = id end
    end
    table.sort(result)
    return result
end
