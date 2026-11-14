param([string]$Action)
$ErrorActionPreference = 'Stop'
switch ($Action) {
  'registry' {
    $roots = @('HKCU:\SOFTWARE\Blizzard Entertainment\World of Warcraft', 'HKLM:\SOFTWARE\Blizzard Entertainment\World of Warcraft', 'HKLM:\SOFTWARE\WOW6432Node\Blizzard Entertainment\World of Warcraft')
    $paths = foreach ($root in $roots) {
      if (Test-Path $root) {
        $item = Get-ItemProperty $root
        foreach ($name in @('InstallPath', 'InstallLocation')) {
          if ($item.$name) { [string]$item.$name }
        }
      }
    }
    ConvertTo-Json -InputObject @($paths) -Compress
  }
  'running' {
    $wanted = [IO.Path]::GetFullPath((Join-Path $env:AC_CLIENT 'Wow.exe'))
    $running = @(Get-CimInstance Win32_Process -Filter "Name = 'Wow.exe'" | Where-Object {
      # A missing path can mean that Windows denied access. Ask the player to close the game.
      -not $_.ExecutablePath -or [string]::Equals($_.ExecutablePath, $wanted, [StringComparison]::OrdinalIgnoreCase)
    }).Count -gt 0
    if ($running) { 'true' } else { 'false' }
  }
  'extract' {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($env:AC_ARCHIVE)
    try {
      foreach ($entry in $zip.Entries) {
        $name = $entry.FullName.Replace('\', '/')
        if ($name -notmatch '^QuestieDB/' -or $name -match '(^|/)\.\.(/|$)|:' -or (($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000) {
          throw 'The QuestieDB archive has an unsafe path.'
        }
      }
    } finally { $zip.Dispose() }
    [IO.Compression.ZipFile]::ExtractToDirectory($env:AC_ARCHIVE, $env:AC_EXTRACT)
  }
  default { throw 'Unknown install action.' }
}
