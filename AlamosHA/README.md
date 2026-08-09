# AlamosHA

Wächter-Programm für den redundanten Betrieb von Alamos über zwei Standorte
(z. B. Nidda und Büdingen), verbunden per Tailscale. Entscheidet automatisch,
welcher Standort aktiv über Alamos alarmiert ("Master") und welcher in
Bereitschaft ("Standby") bleibt, und übernimmt bei einem bestätigten Ausfall
des jeweils anderen Standorts.

## Wie die Umschaltung funktioniert

Auf beiden Standorten läuft dieselbe App. Alle paar Sekunden (konfigurierbar):

1. Der Status der Gegenstelle wird über die **offizielle Tailscale-API**
   abgefragt (nicht nur über die lokale Tailscale-Verbindung). Ist die
   API selbst nicht erreichbar, wird **nichts** entschieden - die eigene
   Internetverbindung könnte gestört sein, dann darf nicht blind übernommen
   werden.
2. Meldet die Tailscale-API die Gegenstelle als online, bleibt alles wie es
   ist.
3. Erscheint sie offline, wird über mehrere Prüfungen hintereinander
   gezählt (Hysterese), damit ein kurzer Aussetzer keinen Failover auslöst.
4. Erst wenn die Schwelle erreicht ist, wird zusätzlich **direkt** bei der
   Gegenstelle über das Tailscale-Netz nachgefragt, welche Rolle sie gerade
   zu haben glaubt. Antwortet sie entgegen der Tailscale-Meldung als
   "Master", wird die Übernahme **abgebrochen** und als Konflikt angezeigt -
   das verhindert doppelte Alarmierung durch zwei gleichzeitig aktive
   Master.
5. Erst dann wird dieser Standort Master und startet den Alamos-Dienst.

Ein Standort, der einmal Master geworden ist, gibt die Rolle **nicht**
automatisch wieder ab, sobald die Gegenstelle zurückkommt - das würde sonst
einen laufenden Alarm unterbrechen können. Die Rückschaltung erfolgt bewusst
manuell über die Oberfläche (Button "Diese Seite auf Standby setzen"), es sei
denn, `AutoFailback` wird explizit in der Konfiguration aktiviert.

## Voraussetzungen

- Windows 10/11 auf beiden Surface Pro-Geräten
- Tailscale installiert und auf beiden Geräten im selben Tailnet verbunden
- Alamos als Windows-Dienst installiert (Dienstname wird bei der
  Ersteinrichtung abgefragt, siehe `services.msc`)
- .NET 8 Desktop Runtime (bei `dotnet publish --self-contained` nicht
  zusätzlich nötig)
- Je ein Tailscale-API-Key mit Scope **`devices:core`, nur Lesezugriff**
  ("Read-only"): Tailscale-Adminkonsole → Settings → Keys → "Generate
  access token"

## Projektstruktur

```
AlamosHA.sln
src/
  AlamosHA.Core/   Plattformunabhängige Kernlogik (Failover-Engine, Tailscale-API-Client, ...)
  AlamosHA.App/    WPF-Oberfläche für Windows (Tray-App)
tests/
  AlamosHA.Core.Tests/   Unit-Tests der Kernlogik
```

`AlamosHA.Core` baut und testet unter Linux/macOS/Windows gleichermaßen
(genutzt in der CI-Pipeline, siehe `.github/workflows/build.yml`).
`AlamosHA.App` benötigt zwingend Windows zum Bauen (Windows Desktop SDK).

## Bauen

Auf einem Windows-Rechner mit installiertem [.NET 8 SDK](https://dotnet.microsoft.com/download):

```powershell
dotnet publish src\AlamosHA.App\AlamosHA.App.csproj -c Release -r win-x64 --self-contained -p:PublishSingleFile=true -o publish
```

Das Ergebnis liegt danach als `publish\AlamosHA.exe` vor und lässt sich ohne
weitere Installation auf das jeweilige Surface Pro kopieren.

## Einrichtung auf jedem Surface Pro

1. `AlamosHA.exe` starten. Da noch keine Konfiguration existiert, öffnet
   sich automatisch der Einrichtungsdialog. Dort eintragen:
   - **Standortname**: z. B. "Büdingen"
   - **Tailnet-Name**: aus der Tailscale-Adminkonsole (oder `-` für den
     Standard-Tailnet des API-Keys)
   - **Tailscale API-Key**: der oben erzeugte Read-only-Key
   - **Alamos-Dienstname**: exakter Windows-Dienstname von Alamos
     (`services.msc` → Eigenschaften → Dienstname)
   - **Gegenstelle (Geräte-ID/Hostname)**: wie das andere Gerät in der
     Tailscale-Adminkonsole heißt
   - **Gegenstelle (Tailscale-Host für Konflikt-Check)**: MagicDNS-Name
     oder Tailscale-IP (100.x.x.x) des anderen Geräts
   - **"Dieser Standort ist beim allerersten Start automatisch Master"**:
     Genau bei **einem** der beiden Standorte aktivieren (z. B. Büdingen),
     beim anderen **nicht**.
2. Speichern - der API-Key wird dabei verschlüsselt (Windows DPAPI,
   Benutzerkonto-gebunden) unter
   `%ProgramData%\AlamosHA\config.json` abgelegt.
3. Autostart einrichten: Verknüpfung zu `AlamosHA.exe` in den
   Autostart-Ordner legen (`shell:startup`) oder über die
   Windows-Aufgabenplanung "Bei Anmeldung ausführen" einrichten.
4. Firewall: TCP-Port `57575` (Standard, in der Konfiguration änderbar)
   muss innerhalb des Tailscale-Netzes zwischen den beiden Geräten offen
   sein (für den direkten Konflikt-Check). Die Windows-Firewall fragt beim
   ersten Start üblicherweise automatisch danach.

## Bedienung im Alltag

Die App liegt im Tray (Systray-Symbol). Das Hauptfenster zeigt:

- **Grün = MASTER**: dieser Standort alarmiert aktiv.
- **Gelb = STANDBY**: Bereitschaft, Alamos-Dienst ist hier gestoppt.
- **Rot = KONFLIKT**: automatische Übernahme wurde sicherheitshalber
  abgebrochen, bitte Verlauf prüfen und Rücksprache mit der Führungsgruppe/IT
  halten, bevor manuell eingegriffen wird.

Über die Buttons kann jederzeit manuell "zum Master gemacht" oder "auf
Standby gesetzt" werden (mit Sicherheitsabfrage) - z. B. für geplante
Wartungsarbeiten. Die Checkbox "Automatische Umschaltung aktiv" pausiert bei
Bedarf die automatische Prüfung, ohne die App zu beenden.

## Bekannte Grenzen / vor dem Produktivbetrieb zu prüfen

- **Nicht unter Windows getestet**: Die Kernlogik (`AlamosHA.Core`) ist
  durch automatisierte Tests abgedeckt und läuft in dieser Umgebung
  nachweislich korrekt. Die WPF-Oberfläche (`AlamosHA.App`) konnte in dieser
  Linux-Entwicklungsumgebung nicht gebaut/gestartet werden (Windows Desktop
  SDK ist unter Linux nicht verfügbar) - **vor dem echten Einsatz unbedingt
  auf beiden Surface Pro-Geräten ausführlich durchtesten**, insbesondere:
  - echten Netzwerkausfall zwischen den Standorten simulieren
  - prüfen, dass der Alamos-Dienst tatsächlich sauber startet/stoppt
  - Konflikt-Fall bewusst provozieren (z. B. beide Seiten kurzzeitig manuell
    auf Master setzen) und beobachten, dass die Sicherung greift
- **Voraussetzung DE-Alarm-Empfang**: Diese Lösung geht davon aus, dass
  beide Standorte den Alarm redundant über eigene Rufnummern empfangen
  (wie besprochen). Sie steuert ausschließlich, welcher Standort den
  Alamos-Dienst aktiv laufen lässt.
- **Kein automatisches Failback per Default**: bewusste Design-Entscheidung,
  um einen laufenden Alarm nicht zu unterbrechen. Rückschaltung erfolgt
  manuell.
