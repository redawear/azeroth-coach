-- Map projection and heading math adapted from wow-ai Map.lua (MIT).
local AC = AzerothCoach
AC.Geo = {}
local G, Try = AC.Geo, AC.State.Try
function G.Project(map, x, y, target)
    if map == target then return x, y end
    local a, b, c, d = Try("C_Map.GetMapRectOnMap", C_Map and C_Map.GetMapRectOnMap, map, target)
    if type(a) == "number" and b ~= a and d ~= c then return a + (b - a) * x, c + (d - c) * y end
    a, b, c, d = Try("C_Map.GetMapRectOnMap", C_Map and C_Map.GetMapRectOnMap, target, map)
    if type(a) == "number" and b ~= a and d ~= c then return (x - a) / (b - a), (y - c) / (d - c) end
end
function G.Continent(map)
    for _ = 1, 10 do
        local info = Try("C_Map.GetMapInfo", C_Map and C_Map.GetMapInfo, map)
        if not info then return end
        if info.mapType == 2 then return map end
        map = info.parentMapID
        if not map or map == 0 then return end
    end
end
function G.Heading(p, target)
    if not p.map or not p.x or not p.y then return end
    local cont = G.Continent(p.map)
    if not cont or G.Continent(target.map) ~= cont then return end
    local x, y = G.Project(p.map, p.x, p.y, cont)
    local tx, ty = G.Project(target.map, target.x, target.y, cont)
    if not x or not tx then return end
    local w, h = Try("C_Map.GetMapWorldSize", C_Map and C_Map.GetMapWorldSize, cont)
    if (not w or not h) and C_Map and C_Map.GetWorldPosFromMapPos and CreateVector2D then
        local _, a = Try("C_Map.GetWorldPosFromMapPos", C_Map.GetWorldPosFromMapPos, cont, CreateVector2D(0, 0))
        local _, b = Try("C_Map.GetWorldPosFromMapPos", C_Map.GetWorldPosFromMapPos, cont, CreateVector2D(1, 0))
        local _, c = Try("C_Map.GetWorldPosFromMapPos", C_Map.GetWorldPosFromMapPos, cont, CreateVector2D(0, 1))
        if a and b and c then w = math.sqrt((b.x-a.x)^2+(b.y-a.y)^2); h = math.sqrt((c.x-a.x)^2+(c.y-a.y)^2) end
    end
    if not w or not h or w <= 0 or h <= 0 then return end
    local east, south = (tx - x) * w, (ty - y) * h
    return math.sqrt(east ^ 2 + south ^ 2), math.atan2(-east, -south)
end
