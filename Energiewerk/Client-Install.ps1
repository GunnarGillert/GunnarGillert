$ErrorActionPreference = "Stop"
$Ordner = $PSScriptRoot

function Abschnitt($text) {
    Write-Host ""
    Write-Host "=== $text ===" -ForegroundColor Cyan
}

Abschnitt "Energiewerk - Client-Einrichtung"

# ---------------------------------------------------------------------------
# 1. Verbindungsdaten lesen (von der Server-Installation erzeugt)
# ---------------------------------------------------------------------------
$VerbindungsdatenPfad = Join-Path $Ordner "verbindungsdaten.json"
$ZertifikatPfad = Join-Path $Ordner "energiewerk-zertifikat.cer"

if (-not (Test-Path $VerbindungsdatenPfad) -or -not (Test-Path $ZertifikatPfad)) {
    Write-Host ""
    Write-Host "Diese Datei muss zusammen mit 'verbindungsdaten.json' und" -ForegroundColor Red
    Write-Host "'energiewerk-zertifikat.cer' im selben Ordner liegen (kompletten" -ForegroundColor Red
    Write-Host "Ordner 'Client-Installation' vom Server kopieren, nicht nur diese Datei)." -ForegroundColor Red
    Read-Host "Enter zum Beenden druecken"
    exit 1
}

$Verbindung = Get-Content $VerbindungsdatenPfad -Raw | ConvertFrom-Json
$ServerIp = $Verbindung.ip
$ServerName = $Verbindung.name

Write-Host "Server: $ServerName ($ServerIp)"

# ---------------------------------------------------------------------------
# 2. Namensaufloesung: Eintrag in der hosts-Datei, damit "https://$ServerName/"
#    unabhaengig von DNS/NetBIOS/VPN-Konfiguration zuverlaessig funktioniert.
# ---------------------------------------------------------------------------
Abschnitt "Namensaufloesung wird eingerichtet"
$HostsPfad = "$env:WinDir\System32\drivers\etc\hosts"
$HostsInhalt = Get-Content $HostsPfad -ErrorAction SilentlyContinue
$ZeileVorhanden = $HostsInhalt | Where-Object { $_ -match "^\s*[\d\.]+\s+$([regex]::Escape($ServerName))\s*$" }

if ($ZeileVorhanden) {
    # Vorhandenen (evtl. veralteten) Eintrag ersetzen
    $NeuerInhalt = $HostsInhalt | ForEach-Object {
        if ($_ -match "^\s*[\d\.]+\s+$([regex]::Escape($ServerName))\s*$") { "$ServerIp`t$ServerName" } else { $_ }
    }
    Set-Content -Path $HostsPfad -Value $NeuerInhalt -Force
    Write-Host "Bestehender hosts-Eintrag fuer '$ServerName' aktualisiert."
} else {
    Add-Content -Path $HostsPfad -Value "`n$ServerIp`t$ServerName" -Force
    Write-Host "hosts-Eintrag ergaenzt: $ServerIp -> $ServerName"
}

# ---------------------------------------------------------------------------
# 3. Zertifikat als vertrauenswuerdig einstufen (Windows-Zertifikatsspeicher -
#    wird von Edge und Chrome verwendet).
# ---------------------------------------------------------------------------
Abschnitt "Zertifikat wird eingerichtet"
Import-Certificate -FilePath $ZertifikatPfad -CertStoreLocation "Cert:\LocalMachine\Root" | Out-Null
Write-Host "Zertifikat als vertrauenswuerdig eingestuft - keine Browser-Warnung mehr fuer https://$ServerName/."

# ---------------------------------------------------------------------------
# 4. Desktop-Verknuepfung anlegen (Internetverknuepfung, oeffnet im
#    Standardbrowser)
# ---------------------------------------------------------------------------
Abschnitt "Verknuepfung wird angelegt"
$DesktopOrdner = [System.Environment]::GetFolderPath("Desktop")
$VerknuepfungsPfad = Join-Path $DesktopOrdner "Energiewerk.url"
$VerknuepfungsInhalt = @"
[InternetShortcut]
URL=https://$ServerName/
"@
Set-Content -Path $VerknuepfungsPfad -Value $VerknuepfungsInhalt -Force
Write-Host "Desktop-Verknuepfung angelegt: $VerknuepfungsPfad"

Abschnitt "Fertig"
Write-Host "Energiewerk ist jetzt unter https://$ServerName/ erreichbar (Desktop-Verknuepfung"
Write-Host "oder direkt im Browser aufrufen). Ein Neustart des Browsers kann noetig sein,"
Write-Host "falls er gerade schon offen war."
