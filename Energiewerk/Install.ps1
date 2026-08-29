$ErrorActionPreference = "Stop"
$QuellOrdner = $PSScriptRoot
$ZielOrdner = Join-Path $env:ProgramFiles "Energiewerk"

function Abschnitt($text) {
    Write-Host ""
    Write-Host "=== $text ===" -ForegroundColor Cyan
}

Abschnitt "Energiewerk-Installation"
Write-Host "Quelle: $QuellOrdner"
Write-Host "Ziel:   $ZielOrdner"

# ---------------------------------------------------------------------------
# 1. Node.js pruefen, bei Bedarf installieren
# ---------------------------------------------------------------------------
Abschnitt "Node.js wird geprueft"
$node = Get-Command node -ErrorAction SilentlyContinue

if (-not $node) {
    Write-Host "Node.js wurde nicht gefunden - Installation wird versucht."
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
        Write-Host "Installiere ueber winget (OpenJS.NodeJS.LTS) ..."
        try {
            winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
        } catch {
            Write-Host "winget-Installation fehlgeschlagen: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
    # Nach winget (oder falls winget fehlt) erneut pruefen; sonst direkt von nodejs.org laden.
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path", "User")
    $node = Get-Command node -ErrorAction SilentlyContinue

    if (-not $node) {
        Write-Host "Lade Node.js LTS direkt von nodejs.org ..."
        $installerUrl = "https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi"
        $installerPfad = Join-Path $env:TEMP "node-lts.msi"
        Invoke-WebRequest -Uri $installerUrl -OutFile $installerPfad
        Write-Host "Installiere Node.js (kurz Geduld) ..."
        Start-Process msiexec.exe -ArgumentList "/i `"$installerPfad`" /qn /norestart" -Wait
        Remove-Item $installerPfad -ErrorAction SilentlyContinue
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                    [System.Environment]::GetEnvironmentVariable("Path", "User")
        $node = Get-Command node -ErrorAction SilentlyContinue
    }

    if (-not $node) {
        Write-Host ""
        Write-Host "Node.js konnte nicht automatisch installiert werden." -ForegroundColor Red
        Write-Host "Bitte manuell von https://nodejs.org (Version 'LTS') installieren," -ForegroundColor Red
        Write-Host "den Rechner danach neu starten und dieses Skript erneut ausfuehren." -ForegroundColor Red
        Read-Host "Enter zum Beenden druecken"
        exit 1
    }
    Write-Host "Node.js wurde erfolgreich installiert: $(& node -v)"
} else {
    Write-Host "Node.js bereits vorhanden: $(& node -v)"
}

# ---------------------------------------------------------------------------
# 2. Laufende Instanz beenden (falls ein Update ueber eine bestehende
#    Installation laeuft) und Programmdateien nach Program Files kopieren.
#    .env und ein evtl. vorhandener lokaler Datenordner werden NICHT
#    ueberschrieben - nur die Programmdateien selbst.
#    Der Prozessfilter prueft zusaetzlich zu "server.js" auch den Pfad
#    "Energiewerk", damit auf demselben Server laufende Schwesterprogramme
#    (Parkwerk, Farbwerk - gleicher Aufbau, ebenfalls server.js) NICHT
#    versehentlich mit beendet werden.
#
#    WICHTIG (Windows-Dienst): Laeuft Energiewerk als Windows-Dienst (per
#    Service-Install.bat, siehe scripts/install-service.js), dann darf der
#    node.exe-Prozess NICHT einfach per Stop-Process gekillt werden. Der
#    Dienst hat ueber node-windows eine EIGENE Absturz-Wiederanlauf-Logik
#    (maxRestarts) und wuerde einen so beendeten Prozess vermutlich sofort
#    wieder hochfahren - mit dem noch ALTEN server.js, weil die neuen
#    Dateien unten erst noch kopiert werden. Ergebnis: neue Oberflaeche
#    (bundle.js wird bei jedem Aufruf frisch von der Platte ausgeliefert),
#    aber weiterhin alter Server-Code im Hintergrund. Deshalb hier zuerst
#    gezielt pruefen, ob "Energiewerk" als Dienst registriert ist, und ihn
#    dann sauber ueber Stop-Service anhalten (das unterbindet den
#    automatischen Wiederanlauf, bis der Dienst weiter unten in Abschnitt 8
#    wieder bewusst gestartet wird).
# ---------------------------------------------------------------------------
Abschnitt "Programmdateien werden kopiert"

$dienst = Get-Service -Name "Energiewerk" -ErrorAction SilentlyContinue
if ($dienst) {
    if ($dienst.Status -ne "Stopped") {
        Write-Host "Energiewerk laeuft als Windows-Dienst - wird angehalten ..."
        Stop-Service -Name "Energiewerk" -Force -ErrorAction SilentlyContinue
        try { $dienst.WaitForStatus("Stopped", (New-TimeSpan -Seconds 30)) } catch {}
    }
    Write-Host "Windows-Dienst 'Energiewerk' angehalten."
}

$prozesse = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*server.js*" -and $_.CommandLine -like "*Energiewerk*" }
if ($prozesse) {
    foreach ($p in $prozesse) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
    Write-Host "Laufende Energiewerk-Instanz wurde beendet."
    Start-Sleep -Seconds 1
}

New-Item -ItemType Directory -Force -Path $ZielOrdner | Out-Null
$vorhandeneEnv = Join-Path $ZielOrdner ".env"
$envSicherung = $null
if (Test-Path $vorhandeneEnv) {
    $envSicherung = Get-Content $vorhandeneEnv -Raw
}

if ((Resolve-Path $QuellOrdner).Path -ne (Resolve-Path $ZielOrdner -ErrorAction SilentlyContinue).Path) {
    Copy-Item -Path (Join-Path $QuellOrdner "*") -Destination $ZielOrdner -Recurse -Force `
        -Exclude @(".env", "node_modules")
}

if ($envSicherung) {
    Set-Content -Path $vorhandeneEnv -Value $envSicherung
    Write-Host "Vorhandene .env wurde beibehalten."
}

Set-Location $ZielOrdner

# ---------------------------------------------------------------------------
# 3. Abhaengigkeiten installieren (baut ueber postinstall auch die
#    Oberflaeche neu).
# ---------------------------------------------------------------------------
Abschnitt "Programmbausteine werden installiert"
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "npm install ist fehlgeschlagen." -ForegroundColor Red
    Read-Host "Enter zum Beenden druecken"
    exit 1
}

# ---------------------------------------------------------------------------
# 4. Datenordner vorschlagen (OneDrive-/SharePoint-Sync-Ordner erkennen)
# ---------------------------------------------------------------------------
Abschnitt "Datenordner wird eingerichtet"

if (Test-Path $vorhandeneEnv) {
    Write-Host "Es besteht bereits eine .env - Datenordner-Einrichtung wird uebersprungen."
} else {
    $konten = @()
    $onedriveRegPfad = "HKCU:\Software\Microsoft\OneDrive\Accounts"
    if (Test-Path $onedriveRegPfad) {
        Get-ChildItem $onedriveRegPfad | ForEach-Object {
            $userFolder = (Get-ItemProperty -Path $_.PSPath -ErrorAction SilentlyContinue).UserFolder
            if ($userFolder -and (Test-Path $userFolder)) { $konten += $userFolder }
        }
    }
    # Zusaetzlich ueber Umgebungsvariablen (z. B. geschaeftliches OneDrive/SharePoint)
    foreach ($var in @("OneDriveCommercial", "OneDrive")) {
        $wert = [System.Environment]::GetEnvironmentVariable($var)
        if ($wert -and (Test-Path $wert) -and ($konten -notcontains $wert)) { $konten += $wert }
    }

    $vorschlag = $null
    if ($konten.Count -eq 1) {
        $vorschlag = Join-Path $konten[0] "Energiewerk-Daten"
    } elseif ($konten.Count -gt 1) {
        Write-Host "Mehrere OneDrive-/SharePoint-Konten gefunden:"
        for ($i = 0; $i -lt $konten.Count; $i++) { Write-Host "  [$i] $($konten[$i])" }
        $auswahl = Read-Host "Welches Konto soll fuer den Datenordner genutzt werden? (Zahl eingeben)"
        if ($auswahl -match '^\d+$' -and [int]$auswahl -lt $konten.Count) {
            $vorschlag = Join-Path $konten[[int]$auswahl] "Energiewerk-Daten"
        }
    }
    if (-not $vorschlag) {
        $vorschlag = Join-Path $env:USERPROFILE "OneDrive\Energiewerk-Daten"
        Write-Host "Kein OneDrive automatisch erkannt - bitte Pfad manuell pruefen/anpassen." -ForegroundColor Yellow
    }

    Write-Host ""
    $eingabe = Read-Host "Datenordner [$vorschlag] (Enter fuer Vorschlag uebernehmen)"
    $dataDir = if ([string]::IsNullOrWhiteSpace($eingabe)) { $vorschlag } else { $eingabe }

    $envInhalt = @"
DATA_DIR=$dataDir
PORT=443
"@
    Set-Content -Path $vorhandeneEnv -Value $envInhalt
    Write-Host "Datenordner eingetragen: $dataDir"
    Write-Host "Claude-API-Key und Merkblatt bitte im Reiter 'Einstellungen' hinterlegen,"
    Write-Host "sobald Energiewerk zum ersten Mal laeuft."
}

# ---------------------------------------------------------------------------
# 5. Verknuepfungen anlegen:
#    - Desktop: eine einzelne "Energiewerk"-Verknuepfung zum Starten
#    - Startmenü: ein eigener Ordner "Energiewerk" (erscheint als Gruppe in
#      der Windows-App-Liste) mit zwei benannten Verknuepfungen darin
# ---------------------------------------------------------------------------
Abschnitt "Verknuepfungen werden angelegt"

$iconPfad = Join-Path $ZielOrdner "icon.ico"
$iconReferenz = "$iconPfad,0"
$startSkript = Join-Path $ZielOrdner "Start-Hidden.vbs"
$updateSkript = Join-Path $ZielOrdner "Update.bat"
$shell = New-Object -ComObject WScript.Shell

$programsOrdner = Join-Path ([System.Environment]::GetFolderPath("StartMenu")) "Programs"
$alteVerknuepfung = Join-Path $programsOrdner "Energiewerk.lnk"
if (Test-Path $alteVerknuepfung) {
    Remove-Item $alteVerknuepfung -Force -ErrorAction SilentlyContinue
    Write-Host "Alte Startmenue-Verknuepfung (ohne eigenen Ordner) entfernt."
}

# Desktop: eine einzelne Verknuepfung zum Starten
$desktopLink = Join-Path ([System.Environment]::GetFolderPath("Desktop")) "Energiewerk.lnk"
$verknuepfung = $shell.CreateShortcut($desktopLink)
$verknuepfung.TargetPath = "wscript.exe"
$verknuepfung.Arguments = "`"$startSkript`""
$verknuepfung.WorkingDirectory = $ZielOrdner
if (Test-Path $iconPfad) { $verknuepfung.IconLocation = $iconReferenz }
$verknuepfung.Save()

# Startmenü: eigener Ordner "Energiewerk" mit "Energiewerk starten" und
# "Energiewerk aktualisieren" darin.
$startmenueOrdner = Join-Path $programsOrdner "Energiewerk"
New-Item -ItemType Directory -Force -Path $startmenueOrdner | Out-Null

$startLink = $shell.CreateShortcut((Join-Path $startmenueOrdner "Energiewerk starten.lnk"))
$startLink.TargetPath = "wscript.exe"
$startLink.Arguments = "`"$startSkript`""
$startLink.WorkingDirectory = $ZielOrdner
if (Test-Path $iconPfad) { $startLink.IconLocation = $iconReferenz }
$startLink.Save()

$updateLink = $shell.CreateShortcut((Join-Path $startmenueOrdner "Energiewerk aktualisieren.lnk"))
$updateLink.TargetPath = $updateSkript
$updateLink.WorkingDirectory = $ZielOrdner
if (Test-Path $iconPfad) { $updateLink.IconLocation = $iconReferenz }
$updateLink.Save()

Write-Host "Desktop-Verknuepfung angelegt."
Write-Host "Startmenue-Ordner 'Energiewerk' angelegt mit 'Energiewerk starten' und 'Energiewerk aktualisieren'."
Write-Host "Hinweis: Windows cacht App-Icons manchmal kurz nach - falls das alte"
Write-Host "Icon noch angezeigt wird, hilft ein Ab-/Anmelden oder ein Neustart."

# ---------------------------------------------------------------------------
# 6. Server-Modus (optional): fuer den Betrieb auf einem Rechner, auf dem
#    sich mehrere Mitarbeiter per Browser einloggen, statt eines einzelnen
#    Desktop-Arbeitsplatzes. Setzt eine eingerichtete Windows-Autoanmeldung
#    voraus (siehe README, Abschnitt "Autoanmeldung einrichten") - dieses
#    Skript richtet KEINE Autoanmeldung ein, das macht ihr separat z. B. mit
#    dem Microsoft-Sysinternals-Tool "Autologon".
# ---------------------------------------------------------------------------
Abschnitt "Server-Modus (optional)"
Write-Host "Falls dieser Rechner mit Windows-Autoanmeldung als Server fuer mehrere"
Write-Host "Mitarbeiter laufen soll (statt eines einzelnen Arbeitsplatzes), kann"
Write-Host "dieses Installationsprogramm zwei Dinge zusaetzlich einrichten:"
Write-Host "  - Energiewerk startet automatisch nach der (automatischen) Anmeldung"
Write-Host "  - der Rechner geht nicht mehr in den Energiesparmodus/Standby"
Write-Host ""
Write-Host "WICHTIG: Dieser Weg setzt eine angemeldete Windows-Sitzung voraus (per" -ForegroundColor Yellow
Write-Host "Autoanmeldung) - startet Energiewerk NICHT von selbst, wenn (noch) niemand" -ForegroundColor Yellow
Write-Host "angemeldet ist, z. B. direkt nach einem automatischen Windows-Update-" -ForegroundColor Yellow
Write-Host "Neustart. Soll Energiewerk auch DANN zuverlaessig starten, ganz ohne" -ForegroundColor Yellow
Write-Host "Benutzeranmeldung: stattdessen 'Service-Install.bat' als Administrator" -ForegroundColor Yellow
Write-Host "ausfuehren (richtet Energiewerk als echten Windows-Dienst ein, der schon" -ForegroundColor Yellow
Write-Host "beim Systemstart laeuft) - siehe README.md, Abschnitt 'Betrieb auf einem" -ForegroundColor Yellow
Write-Host "(Windows-)Server statt lokal'." -ForegroundColor Yellow
Write-Host ""
$serverModus = Read-Host "Server-Modus (Autostart-Verknuepfung) jetzt trotzdem einrichten? (j/N)"

if ($serverModus -eq "j" -or $serverModus -eq "J") {
    # Verknuepfung im Autostart-Ordner der aktuellen Windows-Anmeldung
    $autostartOrdner = [System.Environment]::GetFolderPath("Startup")
    $autostartLink = Join-Path $autostartOrdner "Energiewerk.lnk"
    $verknuepfung = $shell.CreateShortcut($autostartLink)
    $verknuepfung.TargetPath = "wscript.exe"
    $verknuepfung.Arguments = "`"$startSkript`""
    $verknuepfung.WorkingDirectory = $ZielOrdner
    if (Test-Path $iconPfad) { $verknuepfung.IconLocation = $iconReferenz }
    $verknuepfung.Save()
    Write-Host "Autostart-Verknuepfung angelegt: $autostartLink"
    Write-Host "(startet Energiewerk automatisch, sobald sich dieser Windows-Benutzer anmeldet)"

    # Energiesparmodus/Standby verhindern, damit der "Server" nicht mitten in
    # der Nacht einschlaeft. Bildschirm darf sich weiterhin abschalten
    # (spart Strom, Energiewerk laeuft trotzdem im Hintergrund weiter).
    powercfg /change standby-timeout-ac 0    | Out-Null
    powercfg /change standby-timeout-dc 0    | Out-Null
    powercfg /change hibernate-timeout-ac 0  | Out-Null
    Write-Host "Energiesparmodus/Standby deaktiviert (Bildschirm-Abschaltung bleibt erlaubt)."

    Write-Host ""
    Write-Host "Noch zu erledigen (nicht durch dieses Skript automatisiert):" -ForegroundColor Yellow
    Write-Host "  1. Windows-Autoanmeldung einrichten - siehe README.md, Abschnitt" -ForegroundColor Yellow
    Write-Host "     'Autoanmeldung einrichten (Windows 11)'." -ForegroundColor Yellow
    Write-Host "  2. Firewall-Port freigeben (Standard 443) - siehe README.md." -ForegroundColor Yellow
} else {
    Write-Host "Server-Modus (Autostart-Verknuepfung) uebersprungen - Energiewerk startet"
    Write-Host "weiterhin nur ueber die Desktop-Verknuepfung, wenn sich jemand aktiv"
    Write-Host "anmeldet. Fuer automatischen Start unabhaengig von jeder Anmeldung:"
    Write-Host "'Service-Install.bat' als Administrator ausfuehren (Windows-Dienst)."
}

# ---------------------------------------------------------------------------
# 7. HTTPS-Zertifikat (optional): erzeugt ein selbstsigniertes Zertifikat auf
#    IP-Adresse UND Name dieses Servers, traegt es in die .env ein und legt
#    eine Zertifikatsdatei + einen Client-Installer im Ordner
#    "Client-Installation" ab - diesen Ordner dann an die Kolleginnen und
#    Kollegen verteilen (Netzlaufwerk/USB/E-Mail), siehe README.
# ---------------------------------------------------------------------------
Abschnitt "HTTPS-Zertifikat (optional)"

# Prueft, ob bereits ein funktionierendes Zertifikat aus einer frueheren
# Installation vorhanden ist (PFX-Datei existiert und wird in der .env
# referenziert). Falls ja: NICHT erneut fragen/erzeugen - sonst wuerde
# jedes Update ein komplett NEUES Zertifikat mit neuem Fingerabdruck
# anlegen, das alle bereits eingerichteten Client-Rechner nicht mehr als
# vertrauenswuerdig erkennen wuerden (Client-Install.ps1 muesste dann auf
# JEDEM Rechner erneut ausgefuehrt werden). Das macht Updates ausserdem
# unbeaufsichtigt moeglich, statt bei der Frage haengen zu bleiben.
$bestehendesPfx = $null
if (Test-Path $vorhandeneEnv) {
    $pfxZeile = (Get-Content $vorhandeneEnv | Where-Object { $_ -match '^\s*HTTPS_PFX_PATH\s*=\s*\S' } | Select-Object -First 1)
    if ($pfxZeile) {
        $pfxPfadBestehend = ($pfxZeile -split '=', 2)[1].Trim()
        $passphraseZeile = (Get-Content $vorhandeneEnv | Where-Object { $_ -match '^\s*HTTPS_PFX_PASSPHRASE\s*=\s*\S' } | Select-Object -First 1)
        $passphraseBestehend = if ($passphraseZeile) { ($passphraseZeile -split '=', 2)[1].Trim() } else { "" }

        # Nicht blind vertrauen, dass eine vorhandene Datei auch tatsaechlich
        # brauchbar ist - genau das fuehrte beim ersten echten Windows-Test zu
        # einer Endlosschleife: ein mit dem Legacy-Algorithmus erzeugtes PFX
        # (siehe Kommentar bei Export-PfxCertificate unten) wurde nach dem Fix
        # trotzdem unveraendert "wiederverwendet", weil die Datei ja noch da
        # war - das eigentliche Problem (Node kann sie nicht laden) bestand
        # dadurch nach jedem Update unveraendert weiter. Deshalb hier aktiv
        # versuchen, das Zertifikat mit dem hinterlegten Passwort zu oeffnen;
        # schlaegt das fehl, wird unten ein neues erzeugt statt die kaputte
        # Datei endlos zu behalten.
        if (Test-Path $pfxPfadBestehend) {
            try {
                $testZertifikat = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($pfxPfadBestehend, $passphraseBestehend)
                $testZertifikat.Dispose()
                $bestehendesPfx = $pfxPfadBestehend
            } catch {
                Write-Host "Vorhandenes Zertifikat '$pfxPfadBestehend' laesst sich nicht oeffnen" -ForegroundColor Yellow
                Write-Host "($($_.Exception.Message)) - wird durch ein neues ersetzt." -ForegroundColor Yellow
            }
        }
    }
}

if ($bestehendesPfx) {
    Write-Host "Bestehendes HTTPS-Zertifikat gefunden ($bestehendesPfx) - wird unveraendert" -ForegroundColor Green
    Write-Host "weiterverwendet, damit bereits eingerichtete Client-Rechner nicht neu" -ForegroundColor Green
    Write-Host "vertrauen muessen. Falls wirklich ein neues Zertifikat noetig ist (z. B." -ForegroundColor Green
    Write-Host "IP-Adresse des Servers hat sich geaendert): die Datei '$bestehendesPfx'" -ForegroundColor Green
    Write-Host "loeschen und dieses Installationsprogramm erneut ausfuehren." -ForegroundColor Green

    # Bei Installationen von VOR diesem Fix fehlt HTTPS_SERVER_NAME evtl.
    # noch in der .env (Start.ps1 braucht das, um die richtige Adresse statt
    # "localhost" zu oeffnen) - einmalig aus der bereits beim urspruenglichen
    # Einrichten angelegten verbindungsdaten.json nachtragen, ohne sonst
    # etwas am bestehenden Zertifikat/.env zu veraendern.
    $hatServerName = (Get-Content $vorhandeneEnv | Where-Object { $_ -match '^\s*HTTPS_SERVER_NAME\s*=\s*\S' }).Count -gt 0
    if (-not $hatServerName) {
        $verbindungsdatenPfad = Join-Path $ZielOrdner "Client-Installation\verbindungsdaten.json"
        if (Test-Path $verbindungsdatenPfad) {
            try {
                $verbindungsdaten = Get-Content $verbindungsdatenPfad -Raw | ConvertFrom-Json
                if ($verbindungsdaten.name) {
                    $envZeilen = Get-Content $vorhandeneEnv
                    # @(...) erzwingt ein Array, auch wenn nur eine Zeile übrig bleibt -
                    # sonst macht PowerShell aus dem Where-Object-Ergebnis eine einzelne
                    # Zeichenkette, und "+=" haengt dann OHNE Zeilenumbruch an (siehe
                    # ausführlicher Kommentar beim identischen Muster weiter unten).
                    $envZeilen = @($envZeilen | Where-Object { $_ -notmatch '^\s*HTTPS_SERVER_NAME\s*=' })
                    $envZeilen += "HTTPS_SERVER_NAME=$($verbindungsdaten.name)"
                    Set-Content -Path $vorhandeneEnv -Value $envZeilen
                    Write-Host "HTTPS_SERVER_NAME nachgetragen: $($verbindungsdaten.name) (aus verbindungsdaten.json)." -ForegroundColor Green
                }
            } catch {
                Write-Host "HTTPS_SERVER_NAME konnte nicht automatisch nachgetragen werden - bitte" -ForegroundColor Yellow
                Write-Host "notfalls manuell in der .env ergaenzen: HTTPS_SERVER_NAME=<servername>" -ForegroundColor Yellow
            }
        }
    }
} else {
Write-Host "Ohne HTTPS wird die Verbindung unverschluesselt uebertragen (fuer reines"
Write-Host "LAN/VPN vertretbar, aber nicht ideal). Dieses Installationsprogramm kann"
Write-Host "ein selbstsigniertes Zertifikat erzeugen, das auf den Rechnern der"
Write-Host "Kolleginnen und Kollegen als vertrauenswuerdig eingestuft wird - danach"
Write-Host "keine Browser-Warnung mehr."
Write-Host ""
$httpsEinrichten = Read-Host "HTTPS-Zertifikat jetzt erstellen? (j/N)"

if ($httpsEinrichten -eq "j" -or $httpsEinrichten -eq "J") {
    $vorschlagIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
        Select-Object -First 1 -ExpandProperty IPAddress)
    if (-not $vorschlagIp) { $vorschlagIp = "192.168.1.1" }

    Write-Host ""
    $serverIp = Read-Host "IP-Adresse dieses Servers [$vorschlagIp] (Enter fuer Vorschlag, MUSS fest reserviert sein, siehe README)"
    if ([string]::IsNullOrWhiteSpace($serverIp)) { $serverIp = $vorschlagIp }
    $serverName = Read-Host "Name fuer den Server (nur Buchstaben/Ziffern, z. B. 'energiewerk') [energiewerk]"
    if ([string]::IsNullOrWhiteSpace($serverName)) { $serverName = "energiewerk" }

    Abschnitt "Zertifikat wird erzeugt"
    try {
        $zertifikat = New-SelfSignedCertificate `
            -DnsName $serverIp, $serverName `
            -CertStoreLocation "Cert:\LocalMachine\My" `
            -NotAfter (Get-Date).AddYears(10) `
            -KeyExportPolicy Exportable `
            -KeyUsage DigitalSignature, KeyEncipherment `
            -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.1") `
            -FriendlyName "Energiewerk ($serverName / $serverIp)"

        # Ordner fuer die Client-Verteilung anlegen
        $ClientOrdner = Join-Path $ZielOrdner "Client-Installation"
        New-Item -ItemType Directory -Force -Path $ClientOrdner | Out-Null

        # Oeffentliches Zertifikat (OHNE privaten Schluessel) fuer die Client-PCs
        Export-Certificate -Cert $zertifikat -FilePath (Join-Path $ClientOrdner "energiewerk-zertifikat.cer") | Out-Null

        # Verbindungsdaten fuer den Client-Installer (welcher Name/welche IP)
        @{ ip = $serverIp; name = $serverName } | ConvertTo-Json |
            Set-Content -Path (Join-Path $ClientOrdner "verbindungsdaten.json")

        # PFX (mit privatem Schluessel) fuer den Node-Server selbst
        $pfxPasswortBytes = New-Object byte[] 24
        [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($pfxPasswortBytes)
        $pfxPasswort = [Convert]::ToBase64String($pfxPasswortBytes) -replace '[+/=]', ''
        $securePasswort = ConvertTo-SecureString -String $pfxPasswort -Force -AsPlainText
        $pfxPfad = Join-Path $ZielOrdner "energiewerk-server.pfx"
        # -CryptoAlgorithmOption AES256_SHA256 ist WICHTIG: Ohne diese Angabe
        # verschlüsselt Export-PfxCertificate standardmäßig mit einem älteren
        # Verfahren (TripleDES/SHA1), das Node.js ab Version 18 (nutzt
        # OpenSSL 3.x) beim Laden mit "Error: mac verify failure" ablehnt -
        # unabhängig davon, ob das Passwort stimmt. Genau das ist beim ersten
        # echten Windows-Test aufgetreten. AES256_SHA256 wird von Node/OpenSSL
        # 3.x direkt gelesen, ganz ohne Zusatzkonfiguration.
        Export-PfxCertificate -Cert $zertifikat -FilePath $pfxPfad -Password $securePasswort -CryptoAlgorithmOption AES256_SHA256 | Out-Null

        # Aus dem Zertifikatsspeicher wieder entfernen - die PFX-Datei reicht,
        # ein zusaetzlicher Eintrag im Speicher wuerde nur unnoetig verwalten.
        Remove-Item -Path "Cert:\LocalMachine\My\$($zertifikat.Thumbprint)" -Force -ErrorAction SilentlyContinue

        # .env ergaenzen: PORT auf 443, PFX-Pfad + Passwort eintragen, sowie
        # den Servernamen (HTTPS_SERVER_NAME) - Start.ps1 braucht den, um
        # den Browser mit der richtigen Adresse zu oeffnen (das Zertifikat
        # ist auf $serverName/$serverIp ausgestellt, NICHT auf "localhost" -
        # https://localhost wuerde daher immer einen Zertifikatsfehler zeigen).
        $envZeilen = Get-Content $vorhandeneEnv
        # @(...) erzwingt ein Array, auch wenn nur eine Zeile uebrig bleibt (z. B.
        # bei einer frischen Installation, wo die .env bis hierhin nur DATA_DIR
        # enthaelt und die PORT-Zeile herausgefiltert wird): Ohne das macht
        # PowerShell aus einem einzeiligen Where-Object-Ergebnis automatisch eine
        # einzelne Zeichenkette statt eines 1-Element-Arrays - und "+=" haengt bei
        # einer Zeichenkette den Text dann OHNE Zeilenumbruch direkt an ("string
        # concatenation" statt "array append"). Genau das hat beim ersten echten
        # Windows-Test die .env auf eine einzige, zusammengeklebte Zeile zusammen-
        # gequetscht ("...Energiewerk-DatenPORT=443HTTPS_PFX_PATH=...") und den
        # Start mit "ENOENT: no such file or directory, mkdir '...'" zum Absturz
        # gebracht.
        $envZeilen = @($envZeilen | Where-Object { $_ -notmatch '^\s*PORT\s*=' -and $_ -notmatch '^\s*HTTPS_(CERT|KEY|PFX|SERVER_NAME)' })
        $envZeilen += "PORT=443"
        $envZeilen += "HTTPS_PFX_PATH=$pfxPfad"
        $envZeilen += "HTTPS_PFX_PASSPHRASE=$pfxPasswort"
        $envZeilen += "HTTPS_SERVER_NAME=$serverName"
        Set-Content -Path $vorhandeneEnv -Value $envZeilen

        # Client-Installer (statische Dateien aus diesem Paket) mit in den
        # Verteilungsordner kopieren, falls vorhanden.
        foreach ($datei in @("Client-Install.bat", "Client-Install.ps1")) {
            $quelle = Join-Path $ZielOrdner $datei
            if (Test-Path $quelle) { Copy-Item $quelle $ClientOrdner -Force }
        }

        Write-Host ""
        Write-Host "Zertifikat erstellt (gueltig bis $((Get-Date).AddYears(10).ToString('dd.MM.yyyy')))." -ForegroundColor Green
        Write-Host "Fuer die Kolleginnen und Kollegen: den kompletten Ordner" -ForegroundColor Green
        Write-Host "  $ClientOrdner" -ForegroundColor Green
        Write-Host "verteilen (Netzlaufwerk/USB/E-Mail) und dort Client-Install.bat" -ForegroundColor Green
        Write-Host "als Administrator ausfuehren." -ForegroundColor Green
        Write-Host ""
        Write-Host "Energiewerk ist danach unter https://$serverName/ erreichbar (nach einem Neustart)." -ForegroundColor Green
    } catch {
        Write-Host ""
        Write-Host "Zertifikatserstellung fehlgeschlagen: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "Energiewerk laeuft weiterhin per HTTP - siehe README fuer Alternativen." -ForegroundColor Red
    }
} else {
    Write-Host "HTTPS-Einrichtung uebersprungen - Energiewerk laeuft per HTTP."
}
} # Ende: kein bestehendes Zertifikat gefunden

# ---------------------------------------------------------------------------
# 8. Fertig - laeuft Energiewerk als Windows-Dienst (siehe Abschnitt 2 oben),
#    dann jetzt mit den gerade kopierten, neuen Dateien wieder starten.
#    Ohne diesen Schritt bliebe der Dienst nach einem Update dauerhaft
#    angehalten, weil Stop-Service (anders als ein gekillter Prozess) KEINEN
#    automatischen Wiederanlauf ausloest.
# ---------------------------------------------------------------------------
Abschnitt "Installation abgeschlossen"
if ($dienst) {
    Write-Host "Windows-Dienst 'Energiewerk' wird mit den aktualisierten Dateien neu gestartet ..."
    try {
        Start-Service -Name "Energiewerk"
        Write-Host "Energiewerk (Dienst) laeuft wieder - Status/Verwaltung: services.msc -> 'Energiewerk'." -ForegroundColor Green
    } catch {
        Write-Host "Dienst konnte nicht automatisch gestartet werden: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "Bitte manuell ueber services.msc -> 'Energiewerk' -> Starten." -ForegroundColor Yellow
    }
} else {
    Write-Host "Energiewerk ueber die Desktop-Verknuepfung starten."
}
Write-Host "Danach im Reiter 'Einstellungen' den Claude-API-Key sowie das Merkblatt"
Write-Host "(KfW) fuer die U-Wert-Pruefung hinterlegen."
