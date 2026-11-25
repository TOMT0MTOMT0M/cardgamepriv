# Lanceur Claude — Bébou cartes (25/11/2026). Ouvre le bon terminal au bon endroit.
# Lancé par LANCEUR-CLAUDE.cmd à la racine du repo. Marche chez Tom et chez Hugo (chemins relatifs).
$ErrorActionPreference = 'Stop'
$journal = Join-Path (Split-Path -Parent $PSScriptRoot) 'logs\lanceur-claude.log'
try {
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$racine = Split-Path -Parent $PSScriptRoot
$master = Join-Path $racine '.wt-master'
$enCours = Join-Path $racine 'docs\chantiers\EN-COURS.md'
$guide = Join-Path $racine 'docs\GUIDE-CLAUDE.md'

function Ouvrir-Claude([string]$dossier, [string]$titre, [string]$options) {
  $ligne = ('claude ' + $options).Trim()
  if (Get-Command wt.exe -ErrorAction SilentlyContinue) {
    Start-Process wt.exe -ArgumentList ('-d "' + $dossier + '" --title "' + $titre + '" cmd /k ' + $ligne)
  } else {
    Start-Process cmd.exe -ArgumentList ('/k title ' + $titre + ' && cd /d "' + $dossier + '" && ' + $ligne)
  }
}

$noir = [System.Drawing.Color]::FromArgb(17, 17, 17)
$gris = [System.Drawing.Color]::FromArgb(150, 150, 150)
$bleu = [System.Drawing.Color]::FromArgb(47, 91, 255)
$blanc = [System.Drawing.Color]::White

function Ouvrir-Labo() {
  $cmdLabo = Join-Path $racine 'outils\labo\LABO.cmd'
  if (Get-Command wt.exe -ErrorAction SilentlyContinue) {
    Start-Process wt.exe -ArgumentList ('-d "' + $racine + '" --title "LABO Fable" cmd /k "' + $cmdLabo + '"')
  } else {
    Start-Process cmd.exe -ArgumentList ('/k title LABO Fable && "' + $cmdLabo + '"')
  }
}

$fenetre = New-Object System.Windows.Forms.Form
$fenetre.Text = 'Claude - Bebou cartes'
$fenetre.BackColor = $noir
$fenetre.ClientSize = New-Object System.Drawing.Size(480, 640)
$fenetre.StartPosition = 'CenterScreen'
$fenetre.FormBorderStyle = 'FixedSingle'
$fenetre.MaximizeBox = $false
$fenetre.Font = New-Object System.Drawing.Font('Segoe UI', 10)

$script:y = 20
function Ajouter-Titre([string]$texte) {
  $l = New-Object System.Windows.Forms.Label
  $l.Text = $texte
  $l.ForeColor = $gris
  $l.Font = New-Object System.Drawing.Font('Segoe UI', 9, [System.Drawing.FontStyle]::Bold)
  $l.Location = New-Object System.Drawing.Point(24, $script:y)
  $l.Size = New-Object System.Drawing.Size(432, 20)
  $fenetre.Controls.Add($l)
  $script:y += 26
}
function Ajouter-Bouton([string]$texte, [string]$detail, $fond, $encre, [int]$hauteur, [scriptblock]$action, [bool]$actif = $true) {
  $b = New-Object System.Windows.Forms.Button
  $b.Text = $texte + "`n" + $detail
  $b.TextAlign = 'MiddleLeft'
  $b.Padding = New-Object System.Windows.Forms.Padding(14, 0, 0, 0)
  $b.FlatStyle = 'Flat'
  $b.FlatAppearance.BorderSize = 0
  $b.BackColor = $fond
  $b.ForeColor = $encre
  $b.Font = New-Object System.Drawing.Font('Segoe UI', 12, [System.Drawing.FontStyle]::Bold)
  $b.Location = New-Object System.Drawing.Point(24, $script:y)
  $b.Size = New-Object System.Drawing.Size(432, $hauteur)
  $b.Cursor = 'Hand'
  $b.Enabled = $actif
  if (-not $actif) { $b.BackColor = [System.Drawing.Color]::FromArgb(60, 60, 60); $b.ForeColor = [System.Drawing.Color]::FromArgb(130, 130, 130) }
  $b.Add_Click($action)
  $fenetre.Controls.Add($b)
  $script:y += $hauteur + 12
}

Ajouter-Titre 'NOUVELLE TACHE (une tache = une session)'
$aMaster = Test-Path $master
$detailPatch = 'Correctif, image, musique - .wt-master - Sonnet'
if (-not $aMaster) { $detailPatch = 'Pas de dossier .wt-master sur ce PC' }
Ajouter-Bouton 'PATCH  -  version en ligne' $detailPatch $bleu $blanc 74 { Ouvrir-Claude $master 'PATCH' '' } $aMaster
Ajouter-Bouton 'V3  -  nouveautes' 'Fonctions, refontes, donnees - dossier racine - Opus' $blanc $noir 74 { Ouvrir-Claude $racine 'V3' '--model opus' }
Ajouter-Bouton 'REPRENDRE la derniere session V3' 'Seulement si elle a ete coupee en plein milieu' ([System.Drawing.Color]::FromArgb(45, 45, 45)) $blanc 64 { Ouvrir-Claude $racine 'V3 (reprise)' '--continue' }
Ajouter-Bouton 'LABO  -  Fable' 'Experiences ouvertures et 6 etoiles - credits API uniquement' ([System.Drawing.Color]::FromArgb(120, 60, 200)) $blanc 64 { Ouvrir-Labo }

$script:y += 8
Ajouter-Titre 'VOIR'
Ajouter-Bouton 'Ou on en est' 'docs\chantiers\EN-COURS.md' ([System.Drawing.Color]::FromArgb(45, 45, 45)) $blanc 56 { Start-Process notepad.exe -ArgumentList ('"' + $enCours + '"') }
Ajouter-Bouton 'Lien V3 (equipe)' 'v2.cardgamepriv.pages.dev' ([System.Drawing.Color]::FromArgb(45, 45, 45)) $blanc 56 { Start-Process 'https://v2.cardgamepriv.pages.dev/jeu/' }
Ajouter-Bouton 'Site des joueurs' 'cardgamepriv.pages.dev' ([System.Drawing.Color]::FromArgb(45, 45, 45)) $blanc 56 { Start-Process 'https://cardgamepriv.pages.dev/jeu/' }

$pied = New-Object System.Windows.Forms.Label
$pied.Text = 'Fin de tache : /cr puis /clear      Guide : docs\GUIDE-CLAUDE.md'
$pied.ForeColor = $gris
$pied.Location = New-Object System.Drawing.Point(24, ($script:y + 4))
$pied.Size = New-Object System.Drawing.Size(432, 20)
$fenetre.Controls.Add($pied)
$fenetre.ClientSize = New-Object System.Drawing.Size(480, ($script:y + 40))

[void]$fenetre.ShowDialog()

} catch {
  $msg = "$(Get-Date -Format s) ERREUR : $($_.Exception.Message) (ligne $($_.InvocationInfo.ScriptLineNumber))"
  try { Add-Content -Path $journal -Value $msg } catch {}
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show($msg, 'Lanceur Claude') | Out-Null
}
