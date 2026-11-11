# Extraction des fichiers CS2 (modeles de couteaux / gants / armes, masques, motifs de peinture) pour les cartes 5-6 etoiles.
# 1er lancement : liste le contenu de pak01_dir.vpk + copie items_game.txt  -> imports\cs2\liste-pak01.txt
# 2e lancement (quand Claude a ecrit imports\cs2\a-extraire.txt) : exporte ces dossiers en GLB + PNG -> imports\cs2\export\
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$out = Join-Path $root 'imports\cs2'
New-Item -ItemType Directory -Force $out | Out-Null

$cli = Get-ChildItem (Join-Path $env:USERPROFILE 'Downloads') -Recurse -Filter 'Source2Viewer-CLI.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $cli) {
  Write-Host "Source2Viewer-CLI.exe introuvable dans Telechargements."
  Write-Host "Le Source2Viewer.exe classique ne suffit pas : prends le zip 'cli-windows' sur"
  Write-Host "https://github.com/ValveResourceFormat/ValveResourceFormat/releases et dezippe-le dans Telechargements."
  exit 1
}
Write-Host "Source 2 Viewer CLI : $($cli.FullName)"

$steam = (Get-ItemProperty 'HKCU:\Software\Valve\Steam' -ErrorAction SilentlyContinue).SteamPath
$libs = @()
if ($steam) {
  $libs += $steam
  $vdf = Join-Path $steam 'steamapps\libraryfolders.vdf'
  if (Test-Path $vdf) {
    $libs += [regex]::Matches((Get-Content $vdf -Raw), '"path"\s+"([^"]+)"') | ForEach-Object { $_.Groups[1].Value -replace '\\\\', '\' }
  }
}
$vpk = $libs | ForEach-Object { Join-Path $_ 'steamapps\common\Counter-Strike Global Offensive\game\csgo\pak01_dir.vpk' } | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $vpk) { Write-Host "CS2 introuvable dans les bibliotheques Steam ($($libs -join ', '))."; exit 1 }
Write-Host "CS2 : $vpk"

function Run($argList, $stdout) {
  $err = Join-Path $out 'erreurs.log'
  if ($stdout) { $p = Start-Process -FilePath $cli.FullName -ArgumentList $argList -NoNewWindow -Wait -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $err }
  else { $p = Start-Process -FilePath $cli.FullName -ArgumentList $argList -NoNewWindow -Wait -PassThru -RedirectStandardError $err }
  if ($p.ExitCode -ne 0) { Write-Host "Erreur (code $($p.ExitCode)), voir imports\cs2\erreurs.log"; Get-Content $err -Tail 20; exit 1 }
}

$todo = Join-Path $out 'a-extraire.txt'
if (-not (Test-Path $todo)) {
  Write-Host "[1/2] liste du contenu de pak01 (1 a 2 minutes)..."
  Run @('-i', "`"$vpk`"", '--vpk_list') (Join-Path $out 'liste-pak01.txt')
  Write-Host "[2/2] items_game.txt..."
  Run @('-i', "`"$vpk`"", '-o', "`"$out\brut`"", '-f', 'scripts/items/items_game.txt') (Join-Path $out 'sortie.log')
  Write-Host "OK. Dis a Claude : liste CS2 prete."
} else {
  $paths = Get-Content $todo | Where-Object { $_ -and -not $_.StartsWith('#') }
  $i = 0
  foreach ($f in $paths) {
    $i++
    $dst = Join-Path $out ('export\' + ($f.TrimEnd('/', '\') -replace '[\\/:*?"<>| ]', '_'))
    if (Test-Path $dst) { Write-Host "[$i/$($paths.Count)] deja fait : $f"; continue }
    Write-Host "[$i/$($paths.Count)] $f"
    Run @('-i', "`"$vpk`"", '-o', "`"$dst`"", '-d', '-f', "`"$f`"", '--gltf_export_format', 'glb', '--gltf_export_materials') (Join-Path $out "sortie-$i.log")
  }
  Write-Host "OK. Dis a Claude : export CS2 fini."
}
