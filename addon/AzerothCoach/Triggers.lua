local AC = AzerothCoach
AC.Triggers = {}
local T = AC.Triggers
local priorities = {dungeon = 1, level = 2, gray = 3, full = 4, turnin = 5, zone = 6, capital = 7, spells = 8, deaths = 9}

function T.Choose(candidates, saved, now, settings)
    if settings.enabled == false or (saved.pauseUntil or 0) > now then return nil end
    if now - (saved.lastTipAt or -1e9) < (settings.tipPause or 600) then return nil end
    table.sort(candidates, function(a, b)
        local pa, pb = priorities[a.kind] or 99, priorities[b.kind] or 99
        if pa == pb then return a.key < b.key end
        return pa < pb
    end)
    for _, tip in ipairs(candidates) do
        local seen = saved.seen[tip.key]
        if not seen or (tip.kind ~= "gray" and now - seen >= 86400) then return tip end
    end
end

function T.Hidden(p, flags, saved, now)
    return flags.combat or flags.cinematic or flags.editMode or flags.trackerCollapsed
        or p.instance or p.dead or p.taxi or (saved.pauseUntil or 0) > now
        or (flags.afterCombatUntil or 0) > now
end

function T.Death(saved, zone, now)
    saved.deaths = saved.deaths or {}
    local events = saved.deaths
    events[#events + 1] = {zone = zone, at = now}
    local recent, count = {}, 0
    for _, row in ipairs(events) do
        if now - row.at <= 600 then
            recent[#recent + 1] = row
            if row.zone == zone then count = count + 1 end
        end
    end
    saved.deaths = recent
    return count >= 3
end

function T.Mark(tip, saved, now)
    saved.seen[tip.key] = now
    saved.lastTipAt = now
end
