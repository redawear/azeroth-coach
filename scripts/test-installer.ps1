$ErrorActionPreference = 'Stop'
$work = Join-Path $env:RUNNER_TEMP 'azeroth-installer-test'
$client = Join-Path $work '_forever_'
$app = Join-Path $env:LOCALAPPDATA 'Programs\AzerothCoach'
$runtime = Join-Path $env:LOCALAPPDATA 'AzerothCoach'
$addons = Join-Path $client 'Interface\AddOns'
New-Item -ItemType Directory -Force $addons | Out-Null
New-Item -ItemType File -Force (Join-Path $client 'Wow.exe') | Out-Null
$questie = Join-Path $addons 'QuestieDB'
New-Item -ItemType Directory -Force $questie | Out-Null
Set-Content (Join-Path $questie 'keep.txt') 'Keep this addon.'
$installer = (Resolve-Path 'dist\AzerothCoach-Setup.exe').Path
$parameters = "/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /CLIENT=`"$client`" /PROVIDER=none /SKIPQUESTIEDB=1 /LOG=`"$work\install.log`""
function Install-Coach {
  $p = Start-Process $installer -ArgumentList $parameters -PassThru -Wait
  if ($p.ExitCode -ne 0) { Get-Content "$work\install.log"; throw "The silent install failed: $($p.ExitCode)" }
}
Install-Coach
node scripts/test-installed.js $app $client $work
if ($LASTEXITCODE -ne 0) { throw 'The installed runtime check failed.' }
Install-Coach
$config = Get-Content (Join-Path $runtime 'config.json') -Raw | ConvertFrom-Json
if ($config.provider -ne 'none' -or $config.jobs.chat.model -ne 'keep-this-model' -or $config.limits.chat -ne 2) { throw 'The upgrade changed saved settings.' }
if (-not (Test-Path (Join-Path $runtime 'cache.sqlite')) -or -not (Test-Path (Join-Path $runtime 'state.json'))) { throw 'The upgrade deleted runtime files.' }
$start = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
if ($start.PSObject.Properties.Name -contains 'AzerothCoach') { throw 'No AI must not start at sign-in.' }
$p = Start-Process (Join-Path $app 'unins000.exe') -ArgumentList '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART' -PassThru -Wait
if ($p.ExitCode -ne 0) { throw 'The silent uninstall failed.' }
for ($i = 0; $i -lt 100 -and (Test-Path $app); $i++) { Start-Sleep -Milliseconds 100 }
if (Test-Path (Join-Path $app 'AzerothCoach.exe')) { throw 'The uninstaller kept the app.' }
if (Test-Path (Join-Path $addons 'AzerothCoach')) { throw 'The uninstaller kept the addon.' }
if (@(Get-ChildItem $addons -Filter 'AzerothCoach_S*').Count -ne 0) { throw 'The uninstaller kept reply addons.' }
if (-not (Test-Path (Join-Path $questie 'keep.txt'))) { throw 'The uninstaller deleted QuestieDB.' }
if (-not (Test-Path (Join-Path $runtime 'config.json')) -or -not (Test-Path (Join-Path $runtime 'cache.sqlite'))) { throw 'The uninstaller deleted saved settings.' }
if (Test-Path 'HKCU:\Software\AzerothCoach') { throw 'The uninstaller kept its registry key.' }
Write-Output 'The silent install, GUI MCP pipes, single instance, upgrade, and uninstall checks passed.'
