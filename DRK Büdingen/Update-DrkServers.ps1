<#
.SYNOPSIS
    Prueft eine Liste von Windows-Servern in der Domaene drkbuedingen.local auf ausstehende
    Microsoft-Updates und installiert diese optional automatisch.

.DESCRIPTION
    Das Skript verbindet sich per PowerShell-Remoting (WinRM) nacheinander mit jedem Server aus
    der Serverliste, durchsucht dort ueber die im Betriebssystem enthaltene Windows Update Agent
    (WUA) COM-Schnittstelle nach ausstehenden Updates und installiert sie bei Bedarf.

    Es wird KEIN Zusatzmodul (z. B. PSWindowsUpdate) und KEIN Internetzugriff auf den Zielservern
    benoetigt - es wird ausschliesslich die Windows-Bordmittel-Komponente fuer Windows Update
    verwendet, so wie sie auch ueber WSUS/interne Update-Quellen konfiguriert sein kann.

    Voraussetzungen auf jedem Zielserver:
      - PowerShell-Remoting ist aktiviert (Enable-PSRemoting), auf Servern per GPO/Standard meist
        schon aktiv, bei Windows 11 Clients ggf. einmalig manuell aktivieren.
      - Das ausfuehrende Konto (henrydunant) hat lokale Admin-Rechte auf dem Zielserver.
      - Firewall erlaubt WinRM (Port 5985/5986) innerhalb der Domaene.

.PARAMETER ComputerName
    Liste der Servernamen, die geprueft/aktualisiert werden sollen.
    Standardmaessig die komplette DRK-Buedingen-Serverliste.

.PARAMETER ReportOnly
    Wenn gesetzt, werden ausstehende Updates nur aufgelistet, aber NICHT installiert.

.PARAMETER AutoReboot
    Wenn gesetzt, werden Server, die nach der Installation einen Neustart benoetigen, automatisch
    neu gestartet. Domaenencontroller (siehe $DomainControllers) werden hiervon grundsaetzlich
    ausgenommen und muessen manuell neu gestartet werden.

.PARAMETER LogFolder
    Ordner, in dem Transcript-Log und CSV-Bericht abgelegt werden. Standard: .\Logs

.EXAMPLE
    .\Update-DrkServers.ps1 -ReportOnly
    Zeigt nur an, welche Updates auf welchen Servern ausstehen, installiert nichts.

.EXAMPLE
    .\Update-DrkServers.ps1
    Fragt Zugangsdaten ab und installiert ausstehende Updates auf allen Servern der Liste.
    Server, die einen Neustart benoetigen, werden NICHT automatisch neu gestartet.

.EXAMPLE
    .\Update-DrkServers.ps1 -ComputerName 'W22TS1.drkbuedingen.local','W22TS2Datev.drkbuedingen.local' -AutoReboot
    Installiert Updates nur auf den angegebenen Terminalservern und startet sie bei Bedarf
    automatisch neu (Domaenencontroller sind von -AutoReboot ausgenommen).

.NOTES
    Ausfuehren auf einer Verwaltungsstation mit PowerShell 5.1+ und Zugriff auf die Domaene
    drkbuedingen.local, z. B.:  .\Update-DrkServers.ps1
#>

[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [Parameter()]
    [string[]]$ComputerName = @(
        'DRK-Careman.drkbuedingen.local'
        'HV61024DC1.drkbuedingen.local'
        'W11Immo.drkbuedingen.local'
        'W22DC2.drkbuedingen.local'
        'W22DatevArchiv.drkbuedingen.local'
        'W22LEO.drkbuedingen.local'
        'W22TS1.drkbuedingen.local'
        'W22TS2Datev.drkbuedingen.local'
        'W2K16TS-2.drkbuedingen.local'
        'swing.drkbuedingen.local'
        'w11sbc3cx.drkbuedingen.local'
        'w2K16DATEV.drkbuedingen.local'
        'w2k12dc.drkbuedingen.local'
        'w2k16Senso.drkbuedingen.local'
        'w2k16TS.drkbuedingen.local'
    ),

    [Parameter()]
    [switch]$ReportOnly,

    [Parameter()]
    [switch]$AutoReboot,

    [Parameter()]
    [string]$LogFolder
)

# Domaenencontroller werden nie automatisch neu gestartet, unabhaengig von -AutoReboot.
$DomainControllers = @(
    'HV61024DC1.drkbuedingen.local'
    'W22DC2.drkbuedingen.local'
    'w2k12dc.drkbuedingen.local'
)

if (-not $LogFolder) {
    # $PSScriptRoot ist leer, wenn das Skript nicht als Datei ausgefuehrt wird
    # (z. B. per Copy&Paste in die Konsole oder "Run Selection" in der ISE).
    $scriptRoot = $PSScriptRoot
    if (-not $scriptRoot -and $MyInvocation.MyCommand.Path) {
        $scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
    }
    if (-not $scriptRoot) {
        $scriptRoot = (Get-Location).Path
    }
    $LogFolder = Join-Path $scriptRoot 'Logs'
}

if (-not (Test-Path -Path $LogFolder)) {
    New-Item -Path $LogFolder -ItemType Directory -Force | Out-Null
}

$timestamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$transcriptPath = Join-Path $LogFolder "Update-DrkServers_$timestamp.log"
$reportPath = Join-Path $LogFolder "Update-Report_$timestamp.csv"

Start-Transcript -Path $transcriptPath -Append | Out-Null

# Zugangsdaten werden bei jedem Lauf neu abgefragt, es wird nichts gespeichert.
$Credential = Get-Credential -UserName 'drkbuedingen\henrydunant' `
    -Message 'Zugangsdaten fuer die Verbindung zu den DRK-Buedingen-Servern'

# Scriptblock, der auf jedem Zielserver ausgefuehrt wird.
$UpdateScriptBlock = {
    param(
        [bool]$InstallUpdates,
        [bool]$AutoRebootAllowed
    )

    $result = [PSCustomObject]@{
        ComputerName          = $env:COMPUTERNAME
        Zeitpunkt             = Get-Date
        GefundeneUpdates      = 0
        UpdateTitel           = ''
        Installiert           = 0
        Fehlgeschlagen        = 0
        NeustartNoetig        = $false
        NeustartDurchgefuehrt = $false
        Status                = 'OK'
        Fehler                = ''
    }

    try {
        $session = New-Object -ComObject Microsoft.Update.Session
        $searcher = $session.CreateUpdateSearcher()
        $searchResult = $searcher.Search("IsInstalled=0 and IsHidden=0 and Type='Software'")

        $result.GefundeneUpdates = $searchResult.Updates.Count
        $result.UpdateTitel = ($searchResult.Updates | ForEach-Object { $_.Title }) -join '; '

        if ($searchResult.Updates.Count -eq 0) {
            $result.Status = 'Keine Updates ausstehend'
            return $result
        }

        if (-not $InstallUpdates) {
            $result.Status = 'Updates gefunden (nur Bericht)'
            return $result
        }

        $updatesToDownload = New-Object -ComObject Microsoft.Update.UpdateColl
        foreach ($update in $searchResult.Updates) {
            if (-not $update.EulaAccepted) { $update.AcceptEula() | Out-Null }
            $updatesToDownload.Add($update) | Out-Null
        }

        $downloader = $session.CreateUpdateDownloader()
        $downloader.Updates = $updatesToDownload
        $downloader.Download() | Out-Null

        $updatesToInstall = New-Object -ComObject Microsoft.Update.UpdateColl
        foreach ($update in $updatesToDownload) {
            if ($update.IsDownloaded) { $updatesToInstall.Add($update) | Out-Null }
        }

        if ($updatesToInstall.Count -eq 0) {
            $result.Status = 'Download fehlgeschlagen, keine Installation durchgefuehrt'
            $result.Fehlgeschlagen = $updatesToDownload.Count
            return $result
        }

        $installer = $session.CreateUpdateInstaller()
        $installer.Updates = $updatesToInstall
        $installResult = $installer.Install()

        for ($i = 0; $i -lt $updatesToInstall.Count; $i++) {
            # ResultCode 2 = orcSucceeded
            if ($installResult.GetUpdateResult($i).ResultCode -eq 2) {
                $result.Installiert++
            } else {
                $result.Fehlgeschlagen++
            }
        }

        $result.NeustartNoetig = [bool]$installResult.RebootRequired
        $result.Status = 'Installation abgeschlossen'

        if ($result.NeustartNoetig -and $AutoRebootAllowed) {
            $result.NeustartDurchgefuehrt = $true
            Restart-Computer -Force
        }
    }
    catch {
        $result.Status = 'Fehler'
        $result.Fehler = $_.Exception.Message
    }

    return $result
}

$report = [System.Collections.Generic.List[object]]::new()
$installUpdates = -not $ReportOnly

Write-Host "=== Microsoft-Updates: $($ComputerName.Count) Server ($(if ($ReportOnly) { 'nur Bericht' } else { 'Bericht + Installation' })) ===" -ForegroundColor Cyan

foreach ($computer in $ComputerName) {

    Write-Host "`n--- $computer ---" -ForegroundColor Yellow

    if (-not (Test-Connection -ComputerName $computer -Count 1 -Quiet)) {
        Write-Warning "$computer ist per Ping nicht erreichbar - wird uebersprungen."
        $report.Add([PSCustomObject]@{
            ComputerName          = $computer
            Zeitpunkt             = Get-Date
            GefundeneUpdates      = $null
            UpdateTitel           = ''
            Installiert           = $null
            Fehlgeschlagen        = $null
            NeustartNoetig        = $null
            NeustartDurchgefuehrt = $null
            Status                = 'Nicht erreichbar (Ping)'
            Fehler                = ''
        })
        continue
    }

    $isDomainController = $DomainControllers -contains $computer
    $autoRebootForThisServer = $AutoReboot -and (-not $isDomainController)

    if ($AutoReboot -and $isDomainController) {
        Write-Warning "$computer ist ein Domaenencontroller - automatischer Neustart wird uebersprungen."
    }

    $shouldProcessAction = if ($installUpdates) { 'Updates suchen, installieren und ggf. neu starten' } else { 'Updates nur suchen (Bericht)' }

    if (-not $PSCmdlet.ShouldProcess($computer, $shouldProcessAction)) {
        continue
    }

    try {
        $result = Invoke-Command -ComputerName $computer -Credential $Credential -ScriptBlock $UpdateScriptBlock `
            -ArgumentList $installUpdates, $autoRebootForThisServer -ErrorAction Stop

        $report.Add($result)

        Write-Host ("Status: {0} | Gefunden: {1} | Installiert: {2} | Fehlgeschlagen: {3} | Neustart noetig: {4}" -f `
            $result.Status, $result.GefundeneUpdates, $result.Installiert, $result.Fehlgeschlagen, $result.NeustartNoetig)

        if ($result.GefundeneUpdates -gt 0) {
            Write-Host "Updates: $($result.UpdateTitel)"
        }
    }
    catch {
        Write-Warning "$computer : Verbindung/Ausfuehrung fehlgeschlagen - $($_.Exception.Message)"
        $report.Add([PSCustomObject]@{
            ComputerName          = $computer
            Zeitpunkt             = Get-Date
            GefundeneUpdates      = $null
            UpdateTitel           = ''
            Installiert           = $null
            Fehlgeschlagen        = $null
            NeustartNoetig        = $null
            NeustartDurchgefuehrt = $null
            Status                = 'Verbindungsfehler'
            Fehler                = $_.Exception.Message
        })
    }
}

Write-Host "`n=== Zusammenfassung ===" -ForegroundColor Cyan
$report | Format-Table ComputerName, Status, GefundeneUpdates, Installiert, Fehlgeschlagen, NeustartNoetig, NeustartDurchgefuehrt -AutoSize

$serversNeedingManualReboot = $report | Where-Object { $_.NeustartNoetig -eq $true -and $_.NeustartDurchgefuehrt -ne $true }
if ($serversNeedingManualReboot) {
    Write-Host "`nFolgende Server benoetigen einen manuellen Neustart:" -ForegroundColor Red
    $serversNeedingManualReboot | ForEach-Object { Write-Host " - $($_.ComputerName)" -ForegroundColor Red }
}

$report | Export-Csv -Path $reportPath -NoTypeInformation -Encoding UTF8 -Delimiter ';'
Write-Host "`nBericht gespeichert unter: $reportPath"
Write-Host "Protokoll gespeichert unter: $transcriptPath"

Stop-Transcript | Out-Null
