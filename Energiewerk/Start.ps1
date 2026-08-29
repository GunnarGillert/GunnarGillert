$ErrorActionPreference = "Stop"
$InstallDir = $PSScriptRoot
Set-Location $InstallDir

# npm ist unter Windows ein .cmd-Batch-Wrapper (ruft intern cmd.exe auf) -
# wird dessen Ausgabe wie unten per Tee-Object/Pipe erfasst, kann die
# Konsolen-Codepage von der tatsaechlichen Textkodierung abweichen. Das
# aeussert sich als "verstreute" Ausgabe mit einem Leerzeichen nach jedem
# Buchstaben (z. B. "n o d e   s e r v e r . j s") - beim ersten echten
# Windows-Test genau so aufgetreten. Behoben, indem die Konsole VOR jedem
# npm-Aufruf auf UTF-8 gezwungen wird.
chcp 65001 | Out-Null
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Windows.Forms | Out-Null

$LogDir = Join-Path $env:LOCALAPPDATA "Energiewerk"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$LogFile = Join-Path $LogDir "Start.log"

function Log($text) {
    $zeitstempel = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $LogFile -Value "$zeitstempel  $text"
}

function Fehlerblock($titel, [string[]]$zeilen) {
    Write-Host ""
    Write-Host "=======================================================" -ForegroundColor Red
    Write-Host "  $titel" -ForegroundColor Red
    Write-Host ""
    foreach ($z in $zeilen) { Write-Host "  $z" -ForegroundColor Red }
    Write-Host ""
    Write-Host "  Protokoll dieser Sitzung: $LogFile" -ForegroundColor Red
    Write-Host "=======================================================" -ForegroundColor Red
    Write-Host ""

    $meldungstext = "$titel`n`n" + ($zeilen -join "`n") + "`n`nProtokoll: $LogFile"
    [System.Windows.Forms.MessageBox]::Show(
        $meldungstext, "Energiewerk",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
}

Set-Content -Path $LogFile -Value "============================================"
Log "Energiewerk - Start"
Log "Ordner: $InstallDir"

# ---------------------------------------------------------------------------
# Node.js finden
# ---------------------------------------------------------------------------
Write-Host "Pruefe Node.js ..."
$node = Get-Command node -ErrorAction SilentlyContinue

if (-not $node) {
    Log "Ueber PATH nicht gefunden, suche in bekannten Ordnern ..."
    $pf86 = ${env:ProgramFiles(x86)}
    $kandidaten = @(
        (Join-Path $env:ProgramFiles "nodejs\node.exe")
    )
    if ($pf86) { $kandidaten += (Join-Path $pf86 "nodejs\node.exe") }
    $kandidaten += (Join-Path $env:LocalAppData "Programs\nodejs\node.exe")

    $gefunden = $kandidaten | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($gefunden) {
        $nodeDir = Split-Path $gefunden -Parent
        $env:Path = "$nodeDir;$env:Path"
        Log "Gefunden: $gefunden"
        $node = Get-Command node -ErrorAction SilentlyContinue
    } else {
        Log "In keinem bekannten Ordner gefunden."
    }
}

if (-not $node) {
    Log "Node.js weiterhin nicht gefunden."
    Fehlerblock "Node.js wurde nicht gefunden." @(
        "Falls Node.js gerade erst installiert wurde: bitte den Rechner",
        "einmal neu starten und es erneut versuchen - Windows muss den",
        "neuen Pfad zu Node.js erst uebernehmen.",
        "",
        "Falls Node.js noch gar nicht installiert ist:",
        "https://nodejs.org  (die Version mit 'LTS')"
    )
    exit 1
}

$nodeVersion = & node -v
Write-Host "Node.js gefunden: $nodeVersion ($($node.Source))"
Log "Node.js gefunden: $nodeVersion ($($node.Source))"

# ---------------------------------------------------------------------------
# Abhaengigkeiten installieren (nur beim allerersten Start noetig)
# ---------------------------------------------------------------------------
if (-not (Test-Path "node_modules\dotenv")) {
    Write-Host "Erste Einrichtung: Bausteine werden installiert, einen Moment..."
    Log "Fuehre npm install aus ..."
    npm install 2>&1 | Tee-Object -FilePath $LogFile -Append | Out-Host
    if ($LASTEXITCODE -ne 0) {
        Log "npm install fehlgeschlagen, Exit-Code $LASTEXITCODE"
        Fehlerblock "Die Installation ist fehlgeschlagen." @(
            "Bitte manuell versuchen: in diesem Ordner eine",
            "Eingabeaufforderung oeffnen und 'npm install' eingeben.",
            "Die dabei angezeigte Fehlermeldung hilft bei der",
            "weiteren Fehlersuche."
        )
        exit 1
    }
    if (-not (Test-Path "node_modules\dotenv")) {
        Log "node_modules\dotenv fehlt weiterhin nach der Installation."
        Fehlerblock "Installation abgeschlossen, aber node_modules ist weiterhin unvollstaendig." @(
            "Bitte manuell versuchen: in diesem Ordner eine",
            "Eingabeaufforderung oeffnen und 'npm install' eingeben."
        )
        exit 1
    }
    Log "Installation erfolgreich abgeschlossen."
}

# ---------------------------------------------------------------------------
# Oberflaeche bauen (nur beim allerersten Start noetig)
# ---------------------------------------------------------------------------
if (-not (Test-Path "public\bundle.js")) {
    Write-Host "Oberflaeche wird einmalig gebaut, einen Moment..."
    Log "Fuehre npm run build aus ..."
    npm run build 2>&1 | Tee-Object -FilePath $LogFile -Append | Out-Host
    if (-not (Test-Path "public\bundle.js")) {
        Log "public\bundle.js fehlt weiterhin nach dem Build."
        Fehlerblock "Die Oberflaeche konnte nicht gebaut werden." @(
            "Bitte manuell versuchen: in diesem Ordner eine",
            "Eingabeaufforderung oeffnen und 'npm run build' eingeben."
        )
        exit 1
    }
}

# ---------------------------------------------------------------------------
# .env pruefen
# ---------------------------------------------------------------------------
if (-not (Test-Path ".env")) {
    Log ".env fehlt."
    Fehlerblock "Es wurde keine .env-Datei gefunden." @(
        "Bitte _env.example kopieren, in '.env' umbenennen und darin",
        "den DATA_DIR-Pfad eintragen. Siehe README.md."
    )
    exit 1
}

# ---------------------------------------------------------------------------
# Starten
# ---------------------------------------------------------------------------
Log "Starte Energiewerk ..."
Write-Host "Starte Energiewerk..."

$envZeilen = Get-Content ".env"
$port = ($envZeilen | Where-Object { $_ -match '^\s*PORT\s*=' } | Select-Object -First 1) -replace '^\s*PORT\s*=\s*', ''
if ([string]::IsNullOrWhiteSpace($port)) { $port = "443" }
$httpsAktiv = ($envZeilen | Where-Object { $_ -match '^\s*HTTPS_(CERT|PFX)_PATH\s*=\s*\S' }).Count -gt 0
$protokoll = if ($httpsAktiv) { "https" } else { "http" }
# Bei Standardports (80/443) braucht die URL keine explizite Portangabe.
$portTeil = if (($protokoll -eq "https" -and $port -eq "443") -or ($protokoll -eq "http" -and $port -eq "80")) { "" } else { ":$port" }

# WICHTIG: "localhost" darf hier NICHT verwendet werden, sobald HTTPS aktiv
# ist - das selbstsignierte Zertifikat ist auf den tatsaechlichen Servernamen
# (bzw. dessen IP-Adresse) ausgestellt, siehe Install.ps1. Mit "localhost"
# wuerde der Browser deshalb immer einen Zertifikats-Namensfehler zeigen
# (im schlimmsten Fall wirkt es dann so, als wuerde "nichts angezeigt").
# HTTPS_SERVER_NAME wird von Install.ps1 beim Erzeugen des Zertifikats in
# die .env geschrieben; ohne HTTPS bzw. bei sehr alten Installationen ohne
# diesen Eintrag faellt es auf "localhost" zurueck (dann meist ohnehin nur
# per HTTP betrieben, wo das kein Problem darstellt).
$serverName = ($envZeilen | Where-Object { $_ -match '^\s*HTTPS_SERVER_NAME\s*=\s*\S' } | Select-Object -First 1) -replace '^\s*HTTPS_SERVER_NAME\s*=\s*', ''
$host_ = if ($httpsAktiv -and -not [string]::IsNullOrWhiteSpace($serverName)) { $serverName.Trim() } else { "localhost" }
$url = "${protokoll}://${host_}$portTeil"

Start-Process $url

# WICHTIG: npm start wird - anders als vorher - jetzt ebenfalls mitprotokolliert
# (wie schon npm install/npm run build oben). Vorher landete die eigentliche
# Fehlermeldung von Node bei einem Absturz (z. B. "listen EADDRINUSE") NUR im
# unsichtbaren Konsolenfenster von Start-Hidden.vbs und nirgends sonst - im
# Protokoll stand dann nur "Exit-Code 1" ohne jede Erklaerung.
npm start 2>&1 | Tee-Object -FilePath $LogFile -Append | Out-Host
$exitCode = $LASTEXITCODE
Log "npm start beendet, Exit-Code $exitCode"

if ($exitCode -ne 0) {
    $protokollText = Get-Content $LogFile -Raw
    $portBelegt = $protokollText -match "EADDRINUSE"
    $keineBerechtigung = $protokollText -match "EACCES"

    if ($portBelegt) {
        Fehlerblock "Port $port ist bereits belegt." @(
            "Ein anderes Programm nutzt bereits Port $port (z. B. IIS/die",
            "'World Wide Web Publishing Service', ein anderer lokaler Webserver,",
            "oder eine zweite Energiewerk-Instanz).",
            "",
            "Pruefen, was den Port belegt: in einer Eingabeaufforderung",
            "  netstat -ano | findstr :$port",
            "eingeben und die dort angezeigte PID im Task-Manager nachschlagen.",
            "",
            "Alternativ in der .env einen anderen Port eintragen (z. B. PORT=4020)",
            "und danach Energiewerk ueber den Browser mit Portangabe aufrufen."
        )
    } elseif ($keineBerechtigung) {
        Fehlerblock "Keine Berechtigung fuer Port $port." @(
            "Windows hat den Zugriff auf Port $port verweigert.",
            "Pruefen, ob der Port reserviert ist:",
            "  netsh http show urlacl",
            "  netsh int ipv4 show excludedportrange protocol=tcp",
            "",
            "Alternativ in der .env einen anderen Port eintragen (z. B. PORT=4020)."
        )
    } else {
        Fehlerblock "Energiewerk wurde unerwartet beendet." @(
            "Moeglicherweise laeuft bereits eine andere Instanz, oder ein",
            "anderer Fehler ist aufgetreten. Die genaue Fehlermeldung steht",
            "im Protokoll direkt oberhalb dieser Meldung."
        )
    }
}
