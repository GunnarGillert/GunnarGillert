# AlamosHA

Wächter-Programm für den redundanten Betrieb von Alamos über zwei Standorte
(z. B. Nidda und Büdingen), verbunden per Tailscale. Entscheidet automatisch,
welcher Standort aktiv über Alamos alarmiert ("Master") und welcher in
Bereitschaft ("Standby") bleibt, übernimmt bei einem bestätigten Ausfall des
jeweils anderen Standorts - und zeigt der Wachbesatzung den aktuellen Zustand
über ein Web-Dashboard an, das sich als Kiosk-Anzeige auf dem
Alarmierungsrechner selbst betreiben lässt.

## Wie die Umschaltung funktioniert

Alle paar Sekunden (konfigurierbar):

1. Der Status der Gegenstelle wird über die **offizielle Tailscale-API**
   abgefragt (nicht nur über die lokale Tailscale-Verbindung). Ist die API
   selbst nicht erreichbar, wird **nichts** entschieden - die eigene
   Internetverbindung könnte gestört sein, dann darf nicht blind übernommen
   werden.
2. Meldet die Tailscale-API die Gegenstelle als online, bleibt alles wie es
   ist.
3. Erscheint sie offline, wird über mehrere Prüfungen hintereinander gezählt
   (Hysterese), damit ein kurzer Aussetzer keinen Failover auslöst.
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
manuell über das Dashboard, es sei denn, `auto_failback` wird explizit in der
Konfiguration aktiviert.

## Kiosk-Dashboard

`http://127.0.0.1:<port>/` (Standardport `8080`) zeigt großformatig:

- **Ich bin Master** / **Ich bin Standby**
- **Ich habe Internet** (abgeleitet davon, ob die Tailscale-API im letzten
  Prüfzyklus erreichbar war)
- **Alamos läuft** (tatsächlicher, unabhängig beobachteter Dienststatus -
  weicht das von der Rolle ab, z. B. Dienst manuell gestoppt oder
  abgestürzt, sieht die Besatzung das sofort)
- **Verbindung zum DE-Alarm-Handy** (per `adb devices` geprüft)
- **Letzte Aktualisierung**

Dazu zwei Buttons für den manuellen Failover/Failback (mit
Sicherheitsabfrage) und ein Schalter, um die automatische Umschaltung
vorübergehend zu pausieren. Die Seite aktualisiert sich selbstständig alle 5
Sekunden.

## Voraussetzungen

- Windows 10/11 auf dem Surface Pro
- Python 3.11 oder neuer
- Tailscale installiert und mit dem anderen Standort im selben Tailnet
  verbunden
- Alamos als Windows-Dienst installiert
- [Android Platform Tools](https://developer.android.com/tools/releases/platform-tools)
  (`adb.exe`) installiert, falls die Handy-Verbindung überwacht werden soll
- Ein Tailscale-API-Key mit Scope **`devices:core`, nur Lesezugriff**
  ("Read-only"): Tailscale-Adminkonsole → Settings → Keys → "Generate access
  token"

## Installation

```powershell
py -3 -m venv .venv
.venv\Scripts\activate
pip install -e .
```

## Einrichtung

```powershell
alamos-ha setup
```

Fragt interaktiv ab:

- **Standortname** (z. B. "Büdingen")
- **Tailnet-Name** (aus der Tailscale-Adminkonsole, oder `-` für den
  Standard-Tailnet des API-Keys)
- **Tailscale API-Key** (wird verschlüsselt unter
  `%PROGRAMDATA%\AlamosHA\config.json` abgelegt, der Schlüssel dazu liegt in
  `%PROGRAMDATA%\AlamosHA\key.bin`)
- **Alamos-Dienstname** (`services.msc` → Eigenschaften → Dienstname)
- **Gegenstelle** (Geräte-ID/Hostname sowie Tailscale-Host für den direkten
  Konflikt-Check)
- **Ob dieser Standort beim allerersten Start Master ist** - genau bei
  **einem** der beiden Standorte mit "j" beantworten, beim anderen mit "n".

Weitere Feineinstellungen (Prüfintervall, Schwellwerte, Ports, ADB-Pfad, Web-
Host/Port) lassen sich danach direkt in `config.json` anpassen - nur das
Feld `api_key_encrypted` darf nicht von Hand bearbeitet werden.

## Starten

```powershell
alamos-ha run
```

Startet den Hintergrunddienst und den Webserver. Zum dauerhaften Betrieb
ohne offenes Konsolenfenster empfiehlt sich
[NSSM](https://nssm.cc/) ("Non-Sucking Service Manager"), um `alamos-ha run`
als echten Windows-Dienst laufen zu lassen:

```powershell
nssm install AlamosHA "C:\Pfad\zu\.venv\Scripts\alamos-ha.exe" run
nssm start AlamosHA
```

## Kiosk-Modus einrichten

Auf dem Surface Pro einen Browser im Kiosk-Modus auf das lokale Dashboard
zeigen lassen, z. B. mit Microsoft Edge und einer Verknüpfung im
Autostart-Ordner (`shell:startup`):

```
msedge.exe --kiosk http://127.0.0.1:8080 --edge-kiosk-type=fullscreen --no-first-run
```

Zum Verlassen des Kiosk-Modus für Wartungsarbeiten: <kbd>Alt</kbd>+<kbd>F4</kbd>
oder über den Task-Manager (<kbd>Strg</kbd>+<kbd>Shift</kbd>+<kbd>Esc</kbd>).

## Handy-Verbindung (ADB)

1. Auf dem DE-Alarm-Handy: Entwickleroptionen aktivieren, USB-Debugging
   einschalten.
2. Handy per USB an das Surface Pro anschließen.
3. Beim ersten Anschließen erscheint auf dem Handy eine Bestätigungsabfrage
   ("USB-Debugging zulassen?") - **muss am Handy bestätigt werden**, sonst
   bleibt der Status auf "nicht autorisiert".
4. Prüfen: `adb devices` sollte das Gerät mit Status `device` zeigen.
5. Falls mehrere ADB-Geräte am selben PC hängen können, die Seriennummer in
   `config.json` unter `adb_device_serial` eintragen, damit eindeutig
   geprüft wird.

## Projektstruktur

```
pyproject.toml
src/alamos_ha/
  models.py           Domänenmodelle (NodeRole, PollResult, AppConfig, ...)
  abstractions.py      Protocols, gegen die die Engine programmiert ist
  engine.py             FailoverEngine (Kernlogik)
  orchestrator.py        Verdrahtung + Hintergrund-Loops
  main.py                 CLI-Einstieg (setup / run)
  adapters/                Tailscale-API, Windows-Dienststeuerung, ADB-Check, ...
  web/                      FastAPI-App + Kiosk-Dashboard (Jinja2-Template)
tests/                       pytest-Tests (Engine + Web-API)
```

## Bekannte Grenzen / vor dem Produktivbetrieb zu prüfen

- **DE-Alarm-SMS-Empfang**: Diese Version prüft nur, ob das Handy per ADB
  erreichbar/autorisiert ist. Das eigentliche **Auslesen der Alarm-SMS und
  Einspeisen in Alamos ist bewusst noch nicht gebaut** - es war zum
  Zeitpunkt der Entwicklung unklar, ob das nicht schon an anderer Stelle
  (Alamos selbst oder ein bestehendes Tool) automatisch passiert. Bitte
  klären und diesen Abschnitt aktualisieren, bevor darauf verlassen wird.
- **Voraussetzung DE-Alarm-Empfang**: Es wird davon ausgegangen, dass beide
  Standorte den Alarm redundant über eigene Rufnummern empfangen.
- **Kein automatisches Failback per Default**: bewusste Design-Entscheidung,
  um einen laufenden Alarm nicht zu unterbrechen. Rückschaltung erfolgt
  manuell über das Dashboard.
- **Windows-spezifische Teile ungetestet auf echter Hardware**: Die
  Kernlogik (Engine + Web-Dashboard) ist automatisiert getestet und wurde in
  der Entwicklungsumgebung auch tatsächlich als laufender Webserver
  durchgespielt. Die Windows-spezifische Dienststeuerung (`sc.exe`) und die
  reale ADB/USB-Anbindung lassen sich nur auf echter Windows-Hardware mit
  angeschlossenem Handy verifizieren - **vor dem Einsatz ausführlich
  testen**, insbesondere: echten Netzwerkausfall simulieren, Konfliktfall
  bewusst provozieren, Handy ab-/anstecken beobachten.
