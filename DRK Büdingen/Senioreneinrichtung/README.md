# Senioreneinrichtung – DRK Büdingen

IT-/Netzwerkprojekt für die Senioreneinrichtung des DRK Büdingen. Ausgangspunkt sind
wiederkehrende Netzwerk- und WLAN-Probleme sowie fehlende Struktur bei E-Mail-Zugriffen
und Dateiablagen.

## Struktur

- `Meetings/` – Protokolle/Zusammenfassungen der Gespräche mit der Einrichtungsleitung
- `Aufgaben.md` – laufende Aufgabenliste (lebendes Dokument, wird nach jedem Termin aktualisiert)

## Ausgangslage (Stand: 2026-09-14)

- Vorhandene Infrastruktur: alte Telekom-Digibox, FritzBox, SecurePoint-Firewall
  (SecurePoint übernimmt die Netzorganisation und hat freie Ports)
- Zwei Hauptprobleme:
  1. **Nächtliche Netzausfälle** durch große Backup-Transfers vom Kreisverband
  2. **Langsames/instabiles WLAN** in zu Büros umgewidmeten Räumen (ehemalige Lagerräume,
     Brandschutzwände, nie sauber ausgeleuchtet)
- Zusätzlich: fehlende strukturierte IT-Organisation (zentrale Ablagen, Vertretungsregelung
  bei E-Mail-Zugriffen)

## Zielbild

- Cloud-Backup statt nächtlichem Transfer zum Standort → Netz wird entlastet
- Schrittweiser Hardware-Austausch (Digibox weg, Funktionen über SecurePoint bündeln)
- Strukturiertes LAN-Verkabelungsprojekt für feste Arbeitsplätze, WLAN primär für mobile Geräte
- Temporäre Monitoring-Box zur Ausfalldiagnose (Google vs. Kreisverband erreichbar)
- Zentrale, rollenbasierte Ordnerstruktur (SharePoint/Funktionspostfächer) statt lokaler
  Desktop-Ablage

Details siehe [`Meetings/2026-09-14-Erstgespraech-Leitung.md`](Meetings/2026-09-14-Erstgespraech-Leitung.md)
und die laufende [`Aufgaben.md`](Aufgaben.md).
