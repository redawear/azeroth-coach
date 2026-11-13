local AC = AzerothCoach
AC.Settings = {}
local S = AC.Settings
function S.Initialize()
    if not Settings or not Settings.RegisterVerticalLayoutCategory or not Settings.RegisterAddOnCategory then return end
    local ok, category = pcall(Settings.RegisterVerticalLayoutCategory, "Azeroth Coach")
    if not ok then return end
    S.category = category; Settings.RegisterAddOnCategory(category)
    if not Settings.RegisterAddOnSetting or not Settings.CreateCheckbox then return end
    for _, spec in ipairs({{"enabled", "Enable the coach", true}, {"dungeons", "Suggest dungeon quests", true}}) do
        local good, setting = pcall(Settings.RegisterAddOnSetting, category, "AzerothCoach_" .. spec[1], spec[1], AC.db.settings, Settings.VarType.Boolean, spec[2], spec[3])
        if good then Settings.CreateCheckbox(category, setting, spec[2]) end
    end
    if not Settings.CreateDropdown or not Settings.CreateControlTextContainer then return end
    for _, row in ipairs({
        {"tipPause", "Pause between tips", 600, {{300,"5 minutes"},{600,"10 minutes"},{1200,"20 minutes"},{1800,"30 minutes"}}},
        {"tipAge", "Remove tips after", 600, {{300,"5 minutes"},{600,"10 minutes"},{0,"Never"}}}
    }) do
        local ok, setting = pcall(Settings.RegisterAddOnSetting, category, "AzerothCoach_" .. row[1], row[1], AC.db.settings, Settings.VarType.Number, row[2], row[3])
        if ok then Settings.CreateDropdown(category, setting, function()
            local choices = Settings.CreateControlTextContainer()
            for _, option in ipairs(row[4]) do choices:Add(option[1], option[2]) end
            return choices:GetData()
        end, row[2]) end
    end
end
function S.Open()
    if S.category and Settings.OpenToCategory then Settings.OpenToCategory(S.category:GetID())
    else AC.Print("Settings: /coach on, off, interval 5|10|20|30, expire 5|10|never, dungeons on|off.") end
end
