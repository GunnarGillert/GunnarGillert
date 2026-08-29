param(
    [string]$Owner  = "GunnarGillert",
    [string]$Repo   = "Maler_Luft",
    [string]$Branch = "",                # leer = tatsaechlicher Standard-Branch (per API ermittelt)
    [string]$Token  = ""                 # optional; sonst automatisch aus Einstellungen bzw. GITHUB_TOKEN
)

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Hinweis: Der Programmcode liegt im Repo im Unterordner "Energiewerk".
# Die Suche unten sucht deshalb gezielt zuerst nach diesem Ordnernamen.
# ---------------------------------------------------------------------------

function Abschnitt($text) {
    Write-Host ""
    Write-Host "=== $text ===" -ForegroundColor Cyan
}

$InstallDir = Join-Path $env:ProgramFiles "Energiewerk"

# ---------------------------------------------------------------------------
# Repo/Branch/Token aus den Programm-Einstellungen laden (Reiter
# "Einstellungen" -> GitHub-Repo, sofern dort vorhanden), sofern nicht
# ausdruecklich als Parameter uebergeben. So muss fuer einen abweichenden
# Fork/Branch nichts am Skript selbst geaendert werden. (Stand jetzt bietet
# die Energiewerk-Oberflaeche diesen Einstellungen-Abschnitt noch nicht an -
# die Werte werden dann einfach nicht gefunden und die obigen Standardwerte
# greifen.)
# ---------------------------------------------------------------------------
$einstellungen = $null
try {
    $EnvPath = Join-Path $InstallDir ".env"
    if (Test-Path $EnvPath) {
        $dataDirZeile = Get-Content $EnvPath | Where-Object { $_ -match '^\s*DATA_DIR\s*=' } | Select-Object -First 1
        if ($dataDirZeile) {
            $DataDir = ($dataDirZeile -split '=', 2)[1].Trim()
            $SettingsPath = Join-Path $DataDir "settings.json"
            if (Test-Path $SettingsPath) {
                $einstellungen = Get-Content $SettingsPath -Raw | ConvertFrom-Json
            }
        }
    }
} catch {
    Write-Host "Hinweis: Einstellungen konnten nicht gelesen werden ($($_.Exception.Message))." -ForegroundColor Yellow
}

if ($einstellungen -and $einstellungen.github) {
    if (-not $PSBoundParameters.ContainsKey('Owner') -and $einstellungen.github.owner) { $Owner = $einstellungen.github.owner }
    if (-not $PSBoundParameters.ContainsKey('Repo') -and $einstellungen.github.repo) { $Repo = $einstellungen.github.repo }
    if (-not $PSBoundParameters.ContainsKey('Branch') -and $einstellungen.github.branch) { $Branch = $einstellungen.github.branch }
}

Abschnitt "Energiewerk-Update"
Write-Host "Repository: https://github.com/$Owner/$Repo"
Write-Host "Ziel:       $InstallDir"

if (-not (Test-Path $InstallDir)) {
    Write-Host ""
    Write-Host "Energiewerk ist unter '$InstallDir' nicht installiert." -ForegroundColor Red
    Write-Host "Bitte zuerst die normale Installation (Install.bat) ausfuehren." -ForegroundColor Red
    Read-Host "Enter zum Beenden druecken"
    exit 1
}

# ---------------------------------------------------------------------------
# 1. Laufende Instanz beenden
# ---------------------------------------------------------------------------
Abschnitt "Laufende Instanz wird beendet"
$prozesse = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*server.js*" -and $_.CommandLine -like "*Energiewerk*" }

if ($prozesse) {
    foreach ($p in $prozesse) {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Write-Host "Energiewerk wurde beendet."
    Start-Sleep -Seconds 1
} else {
    Write-Host "Energiewerk lief aktuell nicht."
}

# ---------------------------------------------------------------------------
# 2. Neueste Version von GitHub herunterladen
# ---------------------------------------------------------------------------
Abschnitt "Repository wird geprueft"

$Headers = @{ "User-Agent" = "Energiewerk-Update"; "Accept" = "application/vnd.github+json" }

if (-not $Token -and $einstellungen -and $einstellungen.githubToken) {
    $Token = $einstellungen.githubToken
    Write-Host "GitHub-Token aus den Programm-Einstellungen uebernommen."
}
if (-not $Token -and $env:GITHUB_TOKEN) {
    $Token = $env:GITHUB_TOKEN
}
if ($Token) {
    $Headers["Authorization"] = "token $Token"
    Write-Host "Verwende GitHub-Token."
}

$TempDir = Join-Path $env:TEMP ("Energiewerk-Update-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $TempDir | Out-Null
$ZipPath = Join-Path $TempDir "source.zip"

$StandardBranch = $null
try {
    $repoInfo = Invoke-RestMethod -Uri "https://api.github.com/repos/$Owner/$Repo" -Headers $Headers
    $StandardBranch = $repoInfo.default_branch
    Write-Host "Repository gefunden: $Owner/$Repo"
    Write-Host "Standard-Branch: $StandardBranch"
    if ($repoInfo.private) { Write-Host "(privates Repository - Token wurde akzeptiert)" }
} catch {
    $statusCode = $null
    if ($_.Exception.Response) { $statusCode = $_.Exception.Response.StatusCode.value__ }
    Write-Host ""
    Write-Host "Repository-Abfrage fehlgeschlagen (HTTP $statusCode)." -ForegroundColor Red
    if ($statusCode -eq 401) {
        Write-Host "Der hinterlegte Token ist ungueltig oder abgelaufen." -ForegroundColor Red
    } elseif ($statusCode -eq 404 -or $statusCode -eq 403) {
        Write-Host "Entweder gibt es https://github.com/$Owner/$Repo nicht, oder der" -ForegroundColor Red
        Write-Host "Token hat keinen Zugriff darauf (Repository-Auswahl/Berechtigung" -ForegroundColor Red
        Write-Host "'Contents: Read-only' des Fine-grained Tokens pruefen)." -ForegroundColor Red
    } else {
        Write-Host $_.Exception.Message -ForegroundColor Red
    }
    Remove-Item -Path $TempDir -Recurse -Force -ErrorAction SilentlyContinue
    Read-Host "Enter zum Beenden druecken"
    exit 1
}

Abschnitt "Neueste Version wird heruntergeladen"
$BranchKandidaten = if ($Branch) { @($Branch) } else { @($StandardBranch) }

$heruntergeladen = $false
$GeladenerBranch = $null
foreach ($b in $BranchKandidaten) {
    $DownloadUrl = "https://api.github.com/repos/$Owner/$Repo/zipball/$b"
    Write-Host "Lade Branch '$b' ..."
    try {
        Invoke-WebRequest -Uri $DownloadUrl -Headers $Headers -OutFile $ZipPath
        Write-Host "Heruntergeladen: Branch '$b'"
        $heruntergeladen = $true
        $GeladenerBranch = $b
        break
    } catch {
        $statusCode = $null
        if ($_.Exception.Response) { $statusCode = $_.Exception.Response.StatusCode.value__ }
        if ($statusCode) { Write-Host "  nicht gefunden oder kein Zugriff (HTTP $statusCode)." }
        else { Write-Host "  fehlgeschlagen: $($_.Exception.Message)" }
    }
}

if (-not $heruntergeladen) {
    Write-Host ""
    Write-Host "Download fehlgeschlagen, obwohl das Repository erreichbar war." -ForegroundColor Red
    Remove-Item -Path $TempDir -Recurse -Force -ErrorAction SilentlyContinue
    Read-Host "Enter zum Beenden druecken"
    exit 1
}

# Commit-SHA merken, damit Energiewerk spaeter selbst pruefen koennte, ob
# eine neuere Version vorliegt (analog zu Parkwerks "Nach Updates suchen" -
# in Energiewerk selbst noch nicht als Button in den Einstellungen umgesetzt).
$AktuellerCommitSha = $null
try {
    $CommitInfo = Invoke-RestMethod -Uri "https://api.github.com/repos/$Owner/$Repo/commits/$GeladenerBranch" -Headers $Headers
    $AktuellerCommitSha = $CommitInfo.sha
} catch {
    Write-Host "Hinweis: Commit-SHA konnte nicht ermittelt werden (Update funktioniert trotzdem)." -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# 3. Entpacken - Programmordner "Energiewerk" gezielt suchen.
#
#    WICHTIG: Im selben Repo liegen auch die unabhaengigen Projekte
#    "Parkraumprogramm" und "Farbwerk" mit identischem Aufbau (ebenfalls
#    server.js + package.json im Wurzelverzeichnis) - eine rein generische
#    Suche nach "irgendeinem Ordner mit server.js + package.json" wuerde
#    je nach Dateisystem-Reihenfolge leicht eines der beiden anderen
#    Programme finden und installieren. Deshalb zuerst gezielt nach dem
#    Ordnernamen "Energiewerk" suchen; die allgemeine Suche dient nur als
#    Rueckfallebene, falls der Ordner umbenannt wurde.
# ---------------------------------------------------------------------------
Abschnitt "Wird entpackt"
$ExtractDir = Join-Path $TempDir "extracted"
Expand-Archive -Path $ZipPath -DestinationPath $ExtractDir -Force

$QuellOrdner = Get-ChildItem -Path $ExtractDir -Recurse -Directory -Filter "Energiewerk" -ErrorAction SilentlyContinue |
    Where-Object { (Test-Path (Join-Path $_.FullName "server.js")) -and (Test-Path (Join-Path $_.FullName "package.json")) } |
    Select-Object -First 1 -ExpandProperty FullName

if (-not $QuellOrdner) {
    Write-Host "Ordner 'Energiewerk' nicht gefunden - weiche auf allgemeine Suche aus." -ForegroundColor Yellow
    $QuellOrdner = Get-ChildItem -Path $ExtractDir -Recurse -Filter "server.js" -File -ErrorAction SilentlyContinue |
        Where-Object { Test-Path (Join-Path $_.DirectoryName "package.json") } |
        Select-Object -First 1 -ExpandProperty DirectoryName
}

if (-not $QuellOrdner) {
    Write-Host ""
    Write-Host "In der heruntergeladenen Version wurden keine Programmdateien" -ForegroundColor Red
    Write-Host "(server.js + package.json) gefunden. Liegt das Programm im Repo" -ForegroundColor Red
    Write-Host "tatsaechlich im Ordner 'Energiewerk'?" -ForegroundColor Red
    Read-Host "Enter zum Beenden druecken"
    exit 1
}
Write-Host "Gefundene Programmdateien in: $QuellOrdner"

# ---------------------------------------------------------------------------
# 4. Installationsprogramm aus der neuen Version ausfuehren (kopiert die
#    Dateien nach Program Files, ohne .env oder den Datenordner anzufassen).
# ---------------------------------------------------------------------------
$InstallScript = Join-Path $QuellOrdner "Install.ps1"
if (-not (Test-Path $InstallScript)) {
    Write-Host ""
    Write-Host "Install.ps1 wurde im heruntergeladenen Ordner nicht gefunden." -ForegroundColor Red
    Read-Host "Enter zum Beenden druecken"
    exit 1
}

Abschnitt "Installation der neuen Version"
& $InstallScript

if ($AktuellerCommitSha) {
    $VersionsInfo = @{
        commitSha    = $AktuellerCommitSha
        branch       = $GeladenerBranch
        installiertAm = (Get-Date).ToString("o")
    } | ConvertTo-Json
    Set-Content -Path (Join-Path $InstallDir "version-info.json") -Value $VersionsInfo
    Write-Host "Versionskennung gespeichert (Commit $($AktuellerCommitSha.Substring(0,7)))."
}

# ---------------------------------------------------------------------------
# 5. Aufraeumen und neu starten
# ---------------------------------------------------------------------------
Remove-Item -Path $TempDir -Recurse -Force -ErrorAction SilentlyContinue

Abschnitt "Energiewerk wird neu gestartet"
$StartScript = Join-Path $InstallDir "Start-Hidden.vbs"
if (Test-Path $StartScript) {
    Start-Process "wscript.exe" -ArgumentList "`"$StartScript`""
    Write-Host "Energiewerk wurde neu gestartet - der Browser oeffnet sich gleich automatisch."
} else {
    Write-Host "Start-Hidden.vbs wurde nicht gefunden - bitte manuell ueber die Desktop-Verknuepfung starten." -ForegroundColor Yellow
}

Abschnitt "Fertig"
Write-Host "Energiewerk wurde erfolgreich aktualisiert."
Write-Host ""
Write-Host "Dieses Fenster schliesst sich automatisch." -ForegroundColor DarkGray
for ($i = 5; $i -ge 1; $i--) {
    Write-Host "`r  ($i) ..." -NoNewline -ForegroundColor DarkGray
    Start-Sleep -Seconds 1
}
