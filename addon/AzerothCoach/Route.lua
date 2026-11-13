-- Map projection and heading math adapted from wow-ai Map.lua (MIT).
local AC = AzerothCoach
AC.Route = {pins = {}}
local R, U, Try = AC.Route, AC.UI, AC.State.Try
function R.Project(map, x, y, target)
    if map == target then return x, y end
    local a, b, c, d = Try("C_Map.GetMapRectOnMap", C_Map and C_Map.GetMapRectOnMap, map, target)
    if type(a) == "number" and b ~= a and d ~= c then return a + (b - a) * x, c + (d - c) * y end
    a, b, c, d = Try("C_Map.GetMapRectOnMap", C_Map and C_Map.GetMapRectOnMap, target, map)
    if type(a) == "number" and b ~= a and d ~= c then return (x - a) / (b - a), (y - c) / (d - c) end
end
local function continent(map)
    for _ = 1, 10 do
        local info = Try("C_Map.GetMapInfo", C_Map and C_Map.GetMapInfo, map)
        if not info then return end
        if info.mapType == 2 then return map end
        map = info.parentMapID
        if not map or map == 0 then return end
    end
end
function R.Heading(p, target)
    if not p.map or not p.x or not p.y then return end
    local cont = continent(p.map)
    if not cont or continent(target.map) ~= cont then return end
    local x, y = R.Project(p.map, p.x, p.y, cont)
    local tx, ty = R.Project(target.map, target.x, target.y, cont)
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
function R.Start(points)
    R.points, R.index, R.arrivedAt = points, 1, nil
    AC.CoachSection.Refresh(); R.Pins()
end
function R.Stop()
    R.points, R.arrivedAt = nil, nil
    R.Pins(); AC.CoachSection.Refresh()
end
function R.Pins()
    for _, pin in ipairs(R.pins) do pin:Hide() end
    local map = WorldMapFrame
    local canvas = map and map.ScrollContainer and map.ScrollContainer.Child
    if not R.points or not canvas or not map:IsShown() then return end
    local target = map.GetMapID and map:GetMapID()
    if not target then return end
    for i, point in ipairs(R.points) do
        local x, y = R.Project(point.map, point.x, point.y, target)
        if x and y and x >= 0 and y >= 0 and x <= 1 and y <= 1 then
            local pin = R.pins[i] or U.Pin(canvas, i); R.pins[i] = pin
            pin:SetParent(canvas); pin:ClearAllPoints(); pin:SetPoint("CENTER", canvas, "TOPLEFT", x * canvas:GetWidth(), -y * canvas:GetHeight())
            pin:SetScript("OnEnter", function() U.Tooltip(pin, point.label or "Quest route") end)
            pin:SetScript("OnLeave", function() GameTooltip:Hide() end); pin:Show()
        end
    end
end
function R.Tick()
    if not R.points or not AC.CoachSection.route:IsShown() then return end
    if R.arrivedAt then if GetTime() - R.arrivedAt >= 5 then R.Stop() end; return end
    local map = Try("C_Map.GetBestMapForUnit", C_Map and C_Map.GetBestMapForUnit, "player")
    local pos = map and Try("C_Map.GetPlayerMapPosition", C_Map and C_Map.GetPlayerMapPosition, map, "player")
    local x, y; if pos and pos.GetXY then x, y = pos:GetXY() end
    local point = R.points[R.index]
    local distance, bearing = R.Heading({map = map, x = x, y = y}, point)
    local facing = Try("GetPlayerFacing", GetPlayerFacing)
    if not distance or not facing then AC.CoachSection.distance:SetText("No position here."); AC.CoachSection.arrow:Hide(); return end
    AC.CoachSection.arrow:Show(); AC.CoachSection.arrow:SetRotation(bearing - facing)
    AC.CoachSection.distance:SetText(math.floor(distance) .. " yd · " .. (point.label or "Quest"))
    if distance <= 12 then
        if R.index < #R.points then R.index = R.index + 1
        else R.arrivedAt = GetTime(); AC.CoachSection.distance:SetText("You are here.") end
    end
end
