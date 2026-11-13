local AC = AzerothCoach
function AC.Doctor()
    AC.Print(AC.Data.ready and "QuestieDB contract 4: ready." or AC.Data.error or "Quest data is loading.")
    AC.Print("Link: " .. AC.Link.Status() .. "; sound signals: " .. tostring(AC.Link.signals) .. "; free slots: " .. AC.Link.free)
    local keys = {}; for key in pairs(AC.State.api) do keys[#keys + 1] = key end; table.sort(keys)
    for _, key in ipairs(keys) do AC.Print(key .. ": " .. AC.State.api[key]) end
end
SLASH_AZEROTHCOACH1 = "/coach"
SlashCmdList.AZEROTHCOACH = function(text)
    local cmd, rest = text:match("^(%S+)%s*(.*)$")
    if not cmd then if AC.ChatWindow.frame:IsShown() then AC.ChatWindow.frame:Hide() else AC.ChatWindow.Open() end; return end
    if cmd == "pause" and (rest == "" or tonumber(rest)) then AC.db.pauseUntil = time() + math.max(1, tonumber(rest) or 15) * 60
    elseif cmd == "resume" and rest == "" then AC.db.pauseUntil = 0
    elseif cmd == "dock" and rest == "" then AC.CoachSection.Dock()
    elseif cmd == "route" and rest == "stop" then AC.Route.Stop()
    elseif (cmd == "status" or cmd == "doctor") and rest == "" then AC.Doctor()
    elseif cmd == "settings" and rest == "" then AC.Settings.Open()
    elseif cmd == "ping" and rest == "" then AC.Link.Hello(function(reply) AC.Print(reply.text or "PONG") end)
    elseif (cmd == "on" or cmd == "off") and rest == "" then AC.db.settings.enabled = cmd == "on"
    elseif cmd == "dungeons" and (rest == "on" or rest == "off") then AC.db.settings.dungeons = rest ~= "off"
    elseif cmd == "interval" and ({[5]=true,[10]=true,[20]=true,[30]=true})[tonumber(rest)] then AC.db.settings.tipPause = tonumber(rest) * 60
    elseif cmd == "expire" and (rest == "never" or rest == "5" or rest == "10") then AC.db.settings.tipAge = rest == "never" and 0 or tonumber(rest) * 60
    else AC.ChatWindow.Open(); AC.ChatWindow.Send(text); return end
    if cmd ~= "ping" and cmd ~= "status" and cmd ~= "doctor" and cmd ~= "settings" then AC.Print("Setting applied: " .. cmd .. (rest ~= "" and (" " .. rest) or "") .. ".") end
    AC.CoachSection.Refresh()
end
BINDING_HEADER_AZEROTHCOACH = "Azeroth Coach"
BINDING_NAME_AZEROTHCOACH_CHAT = "Open the coach chat"
