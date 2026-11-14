$ErrorActionPreference = 'Stop'
node scripts/prepare-installer.js
if ($LASTEXITCODE -ne 0) { throw 'Cannot prepare the installer.' }
$iscc = Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'
if (-not (Test-Path $iscc)) {
  $setup = Join-Path $env:RUNNER_TEMP 'innosetup-6.4.3.exe'
  Invoke-WebRequest 'https://github.com/jrsoftware/issrc/releases/download/is-6_4_3/innosetup-6.4.3.exe' -OutFile $setup
  if ((Get-FileHash $setup -Algorithm SHA256).Hash.ToLower() -ne 'f3c42116542c4cc57263c5ba6c4feabfc49fe771f2f98a79d2f7628b8762723b') { throw 'The Inno Setup checksum failed.' }
  $process = Start-Process $setup -ArgumentList '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART' -PassThru -Wait
  if ($process.ExitCode -ne 0) { throw 'Cannot install Inno Setup 6.' }
}
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
if ($env:GITHUB_REF_TYPE -eq 'tag') { $version = $env:GITHUB_REF_NAME.TrimStart('v') }
& $iscc /Qp "/DAppVersion=$version" installer/AzerothCoach.iss
if ($LASTEXITCODE -ne 0) { throw 'Cannot build the installer.' }
