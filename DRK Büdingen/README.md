# DRK Büdingen – Windows-Update-Skript

`Update-DrkServers.ps1` prüft eine Liste von Servern in der Domäne `drkbuedingen.local` per
PowerShell-Remoting auf ausstehende Microsoft-Updates und installiert sie optional automatisch.

## Serverliste (Standard)

- DRK-Careman
- HV61024DC1 (Domänencontroller)
- W11Immo
- W22DC2 (Domänencontroller)
- W22DatevArchiv
- W22LEO
- W22TS1
- W22TS2Datev
- W2K16TS-2
- swing
- w11sbc3cx
- w2K16DATEV
- w2k12dc (Domänencontroller)
- w2k16Senso
- w2k16TS

## Voraussetzungen

- Ausführung von einer Verwaltungsstation innerhalb der Domäne `drkbuedingen.local` mit
  PowerShell 5.1 oder neuer.
- PowerShell-Remoting (WinRM) ist auf allen Zielservern aktiviert (`Enable-PSRemoting`). Auf
  Windows-11-Rechnern (`W11Immo`, `w11sbc3cx`) ggf. einmalig manuell aktivieren.
- Das ausführende Konto (`henrydunant`) hat lokale Administratorrechte auf allen Zielservern.
- Es wird **kein** Zusatzmodul (z. B. PSWindowsUpdate) benötigt – das Skript nutzt ausschließlich
  die im Betriebssystem enthaltene Windows-Update-Agent-Schnittstelle, funktioniert also auch ohne
  Internetzugriff auf den Servern (z. B. bei Updates über WSUS).

## Verwendung

```powershell
# Nur prüfen, welche Updates ausstehen (nichts installieren)
.\Update-DrkServers.ps1 -ReportOnly

# Updates auf allen Servern der Liste installieren (Zugangsdaten werden abgefragt,
# kein automatischer Neustart)
.\Update-DrkServers.ps1

# Updates auf ausgewählten Servern installieren und bei Bedarf automatisch neu starten
# (Domänencontroller werden von -AutoReboot immer ausgenommen)
.\Update-DrkServers.ps1 -ComputerName 'W22TS1.drkbuedingen.local','W22TS2Datev.drkbuedingen.local' -AutoReboot
```

Das Passwort für `henrydunant` wird bei jedem Aufruf neu über einen Anmeldedialog abgefragt und
nirgends gespeichert.

## Protokolle

Jeder Lauf legt im Unterordner `Logs` ein Transcript-Protokoll sowie einen CSV-Bericht
(`Update-Report_<Zeitstempel>.csv`) mit dem Ergebnis je Server ab.

## Hinweis zu Domänencontrollern

`HV61024DC1`, `W22DC2` und `w2k12dc` sind Domänencontroller. Sie werden auch bei `-AutoReboot` nie
automatisch neu gestartet – ein nötiger Neustart wird im Bericht ausgewiesen und muss manuell zu
einem geeigneten Zeitpunkt erfolgen.
