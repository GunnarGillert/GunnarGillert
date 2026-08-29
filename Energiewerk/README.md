# Energiewerk – BAFA-Förderprozess für Fensterbauer (Maler Luft)

Skizze für ein Programm, das den wiederkehrenden BAFA-Förderprozess für die
Fensterbauer-Kunden von Maler Luft systematisiert: von der Stammdatenpflege
über die BAFA-Antragstellung und U-Wert-Prüfung bis zu Zuwendungsbescheid,
Rechnungsstellung und (soweit zulässig automatisiert) Kommunikation.

**Status:** Konzept-Skizze, dazu ein erster lauffähiger **Prototyp**
(`server.js` + `public/`) mit Startseite, Auftrags-, Kunden- und
Fensterbauerverwaltung inkl. Suche/Filter, gefüllt mit Beispieldaten, einem
Unterlagen-Upload direkt am Vorgang mit automatischer Dokumenttyp-Erkennung
(Dateiname, bei Bedarf PDF-Textebene/OCR + KI-Vorschlag) sowie einem
Einstellungen-Reiter mit Merkblatt-Ablage (KfW) für die automatische
U-Wert-Prüfung. Login, Mailversand, PDF/E-Rechnung und der eigenständige
Eingangs-Ordner-Watcher aus dieser Skizze sind im Prototyp noch **nicht**
umgesetzt. Lokal starten:

```
cd Energiewerk
npm install     # baut dabei automatisch die Oberfläche (esbuild)
npm start       # http://localhost:4000, Beispieldaten werden beim ersten
                # Start automatisch angelegt (Energiewerk-Daten/)
```

(Das ist der schnelle Weg für Entwicklung/Test. Für eine echte
Windows-Installation siehe Abschnitt **Installation** unten.)

Aufbau bewusst **analog zu Parkwerk**
(`GunnarGillert/Maler_Luft/Parkraumprogramm`), also derselbe Baukasten:
ein einzelner Node.js/Express-Server + React-Oberfläche, **keine
Datenbank**, sondern datei-basierte JSON-Collections in einem geteilten
SharePoint/OneDrive-Ordner, bcrypt-Nutzerkonten mit Rollen, PDF-Erzeugung
aus Vorlagen mit Platzhaltern, ein serverseitiger Claude-API-Proxy und
Windows-Dienst-/Update-Mechanik. Der Grund, dieses Muster zu übernehmen:
Es ist bei Maler Luft bereits im Einsatz, bekannt und gewartet (ein
Node-Prozess, ein Datenordner, ein Update-Weg) – Energiewerk muss dieses
Rad nicht neu erfinden, sondern denselben Rahmen mit anderen Feldern und
Vorlagen füllen.

## Installation (Windows)

Wie bei Parkwerk/Farbwerk: 1:1 dieselben Installations-/Betriebsskripte,
damit sich nichts Neues einarbeiten lässt, wenn man eines der drei
Programme schon kennt.

### Empfohlen: die Installationsdatei

`Install.bat` per Doppelklick starten. Das Installationsprogramm übernimmt
automatisch:

- Prüft, ob Node.js vorhanden ist, und installiert es bei Bedarf selbst
  (über winget oder direkt von nodejs.org).
- Kopiert das Programm nach `C:\Program Files\Energiewerk`.
- Installiert die benötigten Programmbausteine (`npm install`, baut dabei
  auch die Oberfläche).
- Schlägt einen Datenordner vor (erkennt verbundene OneDrive-/SharePoint-
  Konten – bei mehreren wird nachgefragt) und legt die `.env` an.
- Erstellt eine Start-Verknüpfung auf dem Desktop sowie einen eigenen
  Ordner „Energiewerk" im Startmenü mit den Verknüpfungen
  **„Energiewerk starten"** und **„Energiewerk aktualisieren"**.

Windows fragt dabei einmal nach Administratorrechten – das ist normal, kurz
bestätigen. Nach der Installation über die Verknüpfung „Energiewerk"
starten, dann im Reiter **Einstellungen** den Claude-API-Key sowie das
Merkblatt (KfW) hinterlegen.

Auf weiteren Rechnern im Team: `Install.bat` dort ebenfalls einmal
ausführen und beim Datenordner denselben geteilten Pfad angeben, damit
alle auf dieselben Vorgänge zugreifen.

**Aktualisieren:** `Update.bat` lädt die neueste Version aus
`GunnarGillert/Maler_Luft` (Unterordner `Energiewerk` wird automatisch
gefunden - auch wenn im selben Repo noch Parkraumprogramm und Farbwerk mit
identischem Aufbau liegen) und installiert sie über dieselbe Routine nach –
Datenordner und `.env` bleiben unberührt.

### Alternative: manuelle Einrichtung ohne Installationsdatei

1. Node.js installieren (Version 20, LTS) von nodejs.org.
2. Diesen Ordner an einen festen Ort legen, z. B. `C:\Programme\Energiewerk`.
3. `_env.example` kopieren, in `.env` umbenennen und `DATA_DIR` auf einen
   Unterordner im lokal gesyncten SharePoint/OneDrive-Ordner setzen.
4. In diesem Ordner `npm install` ausführen (baut beim ersten Mal auch
   automatisch die Oberfläche).
5. `Start.bat` doppelklicken (mit sichtbarem Fenster, gut zur Fehlersuche)
   oder eine Verknüpfung auf `Start-Hidden.vbs` anlegen (ohne Fenster).
6. Auf jedem weiteren Rechner im Team denselben Ordner ablegen und
   Schritt 3–5 wiederholen, dabei denselben `DATA_DIR` eintragen.

### Betrieb auf einem (Windows-)Server statt lokal

Wie bei Parkwerk empfohlen: zentral auf einem Rechner betreiben (z. B.
Windows 11 mit Autoanmeldung oder als echter Windows-Dienst über
`Service-Install.bat`), statt auf jedem PC einzeln – vermeidet
OneDrive-Sync-Konflikte, weil nur noch ein Prozess schreibt.

- **Mit Autoanmeldung**: bei `Install.bat` die Frage nach dem Server-Modus
  mit „j" beantworten (Autostart-Verknüpfung + Energiesparmodus aus).
  Autoanmeldung selbst separat mit dem Microsoft-Sysinternals-Tool
  „Autologon" einrichten (verschlüsselt das Passwort, im Unterschied zu
  `netplwiz`).
- **Ohne Autoanmeldung**: `Service-Install.bat` als Administrator ausführen
  – richtet Energiewerk als Windows-Dienst „Energiewerk" ein (nutzt
  `node-windows`), läuft dann unabhängig von jeder Anmeldung.
  `Service-Uninstall.bat` entfernt ihn wieder.

**HTTPS einrichten** – ohne eigene Domain (empfohlen):

1. Bei `Install.bat` die Frage „HTTPS-Zertifikat jetzt erstellen?" mit „j"
   beantworten, feste IP-Adresse und einen Namen (z. B. `energiewerk`)
   eingeben. Erzeugt ein zehn Jahre gültiges Zertifikat, trägt `PORT=443`
   plus PFX-Zugangsdaten in die `.env` ein und legt den Ordner
   `Client-Installation` an.
2. Diesen Ordner an alle Kolleginnen und Kollegen verteilen (Netzlaufwerk,
   USB-Stick, E-Mail-Anhang als ZIP).
3. Jede Person führt darin `Client-Install.bat` als Administrator aus –
   trägt einen hosts-Eintrag ein, stuft das Zertifikat als
   vertrauenswürdig ein (Edge/Chrome, **nicht** Firefox) und legt eine
   Desktop-Verknüpfung an.
4. Danach ist Energiewerk unter `https://energiewerk/` ohne
   Browser-Warnung erreichbar.

Mit eigener Domain stattdessen **Caddy als Reverse Proxy**
(`Caddyfile.beispiel`) – kümmert sich automatisch um ein echtes
Let's-Encrypt-Zertifikat; Energiewerk läuft dann intern auf einem anderen
Port (z. B. 4020, siehe Kommentar in der Datei), zusätzlich `TRUST_PROXY=1`
in der `.env` setzen.

> **Ungetestet gegen echtes Windows:** Diese komplette Installations-/
> Betriebskette (`Install.ps1`, `Service-Install.bat`/`node-windows`,
> Zertifikatserstellung/-verteilung, `Update.ps1`) ist 1:1 von Parkwerk
> übernommen und dort nach eigener Aussage ebenfalls nur teilweise gegen
> einen echten Windows-Rechner getestet – für Energiewerk gilt dieselbe
> Einschränkung, zusätzlich verschärft dadurch, dass die Übernahme hier
> nur gelesen, nicht selbst nochmal auf Windows nachvollzogen wurde. Vor
> dem produktiven Einsatz unbedingt einmal auf einem echten Windows-Server
> durchspielen.

**Beim ersten echten Windows-Test bestätigt:** Der Start schlug mit
Exit-Code 1 fehl, ohne dass die eigentliche Ursache irgendwo sichtbar war
– `Start.ps1` protokollierte bis dahin nur „npm start beendet, Exit-Code
1", die tatsächliche Node-Fehlermeldung (z. B. `listen EADDRINUSE`, wenn
Port 443 schon von IIS/einem anderen Programm belegt ist – genau das im
README als offene Frage benannte Risiko) landete nur im unsichtbaren
Konsolenfenster von `Start-Hidden.vbs` und ging damit verloren. Behoben:
`Start.ps1` protokolliert `npm start` jetzt vollständig mit (wie schon
`npm install`/`npm run build`) und erkennt `EADDRINUSE`/`EACCES` im
Protokoll für eine konkrete Fehlermeldung statt nur „Exit-Code 1";
`server.js` selbst gibt bei einem Listen-Fehler jetzt ebenfalls eine
klare, auf Windows zugeschnittene Handlungsanweisung aus (Port prüfen mit
`netstat -ano | findstr :443`, alternativ `PORT` in der `.env` ändern)
statt nur den rohen Node-Stacktrace. Die zugrunde liegende Frage, *ob*
Port 443 auf dem jeweiligen Windows-Rechner frei ist, bleibt weiterhin
pro Maschine zu prüfen – das lässt sich nicht pauschal beheben.

**Ebenfalls beim ersten echten Windows-Test aufgefallen:** Die gerade neu
protokollierte `npm start`-Ausgabe erschien "verstreut" mit einem
Leerzeichen nach jedem Buchstaben (z. B. `n o d e   s e r v e r . j s`).
Ein erster Versuch, das über `chcp 65001` plus erzwungene UTF-8-
Konsolenkodierung zu beheben, schlug beim erneuten Test **nachweislich
fehl** - derselbe Fehler trat identisch wieder auf. Tatsächliche Ursache
(nach Korrektur der ursprünglichen Kodierungs-Theorie): **PowerShells
eigene Pipeline-/Anzeigeformatierung**, nicht die Konsolen-Codepage - das
exakte Muster (ein Leerzeichen nach jedem Zeichen, zwei nach dem
ursprünglichen Leerzeichen selbst) entspricht genau dem, wie PowerShell
ein Array beim Anzeigen mit Leerzeichen zusammenfügt, wenn die Ausgabe
eines `.cmd`-Batch-Wrappers (`npm.cmd`, läuft intern über cmd.exe) per
`2>&1 | Tee-Object` abgegriffen wird (bereits bei `npm install`/
`npm run build` latent vorhanden, dort aber nie aufgefallen, weil
node_modules/bundle.js bei jedem bisherigen Testlauf schon vorhanden
waren). Endgültig behoben, strukturell statt über Kodierungs-Parameter:
`Start.ps1` fängt die Ausgabe aller drei `npm`-/Node-Aufrufe jetzt über
`Start-Process -RedirectStandardOutput/-RedirectStandardError` auf
Dateiebene ab (umgeht PowerShells Pipeline-Formatierung komplett) und
ruft für den eigentlichen Serverstart außerdem direkt `node server.js`
statt `npm start` auf (spart die `cmd.exe`-Zwischenschicht ganz ein -
`npm start` tut laut `package.json` ohnehin nichts anderes). **Lehre für
nächstes Mal:** Bei diesem Fehlerbild nicht wieder zuerst an der
Zeichenkodierung drehen, sondern direkt strukturell über Datei-Umleitung
gehen.

**Server-seitiges Logging grundlegend nachgezogen** (Auslöser: genau die
beiden obigen Debugging-Runden zeigten, dass `debug.log` bis dahin viel zu
wenig hergab). Vorher protokollierte der Server praktisch nichts außer
einzelnen KI-/OCR-Ereignissen; ein Fehler in einer normalen API-Anfrage
(z. B. eine beschädigte JSON-Datei im Datenordner - real möglich bei einem
geteilten OneDrive-Ordner mit unterbrochenem Schreibvorgang oder
Sync-Konflikt) hätte die Anfrage außerdem einfach **lautlos hängen
lassen**, da Express 4 einen Fehler in einem `async`-Routen-Handler nicht
automatisch an die Fehlerbehandlung weiterreicht. Jetzt:

- **Jede Anfrage** wird mit Methode, Pfad, Status und Dauer in `debug.log`
  protokolliert (`[request] GET /api/vorgaenge -> 200 (4ms)`).
- **`express-async-errors`** sorgt dafür, dass ein Fehler in jedem
  Routen-Handler tatsächlich bei der Fehlerbehandlung ankommt, statt die
  Anfrage hängen zu lassen.
- Ein Fehler dort landet **mit vollständigem Stacktrace** in `debug.log`
  und die Anfrage bekommt sofort eine saubere `500`-JSON-Antwort statt
  gar keiner Antwort.
- Beim Start protokolliert der Server einmalig seine aufgelöste
  Konfiguration (Node-Version, Plattform, Port, HTTPS an/aus, `DATA_DIR`,
  ob ein `ANTHROPIC_API_KEY` aus der `.env` gefunden wurde).
- `uncaughtException`/`unhandledRejection` (siehe OCR-Sicherheitsnetz
  oben) loggen jetzt den vollen Stacktrace statt nur der Fehlermeldung.

Mit einer absichtlich beschädigten JSON-Datei im Datenordner end-to-end
verifiziert: Anfrage kommt sofort mit `500` zurück (statt zu hängen), voller
Stacktrace erscheint in `debug.log`.

## Warum

Das Fördergeschäft ist operativ klar, aber technologisch fragmentiert:
Stammdaten, Portal-Schritte, U-Wert-Prüfung, Bescheid-Verarbeitung sowie
Rechnungs- und Mail-Erstellung laufen heute isoliert bzw. manuell. Der
Verwendungsnachweis bleibt zwingend händisch im BAFA-Portal (keine
Automatisierung möglich/erlaubt) – alles davor und danach soll dagegen
maximal automatisiert werden, um Durchsatz zu skalieren, ohne
Portal-Restriktionen zu verletzen.

## Prozesskette (Soll)

1. **Eingang**: Fensterbauer übermittelt im Namen des Kunden den
   ausgefüllten Auftrag inkl. BAFA-Vollmacht.
2. **Stammdaten**: Kundenanlage; Zuordnung Kunde ↔ Fensterbauer (aktuell
   drei Fensterbauer).
3. **Technische Projektbeschreibung**: Erstellung im BAFA-Portal (manuell);
   Erhalt der Projekt-ID; Antragstellung.
4. **U-Wert-Compliance**: Angebots-U-Werte gegen BAFA-Merkblatt prüfen
   (KI-Prompt mit Merkblatt als Referenz).
5. **Benachrichtigung**: E-Mail an Kunde **und** Fensterbauer nach
   Antragstellung ("Vergabe möglich").
6. **Zuwendungsbescheid**: Eingang scannen; Name/Betrag/Vorgangs-ID
   identifizieren; Bescheid an Kunde/Fensterbauer versenden; Rechnung
   automatisch erstellen und versenden.
7. **Umsetzung**: Fenster werden eingebaut; Kunde liefert Rechnungen und
   Zahlungsnachweise.
8. **Verwendungsnachweis**: Erstellung und **händische** Eingabe im
   BAFA-Portal; Zuschuss beantragen; Festsetzungsbescheid; Versand an
   Kunden; Auszahlung.

Schritt 3 und 8 sind Portal-Pflichtschritte ohne Automatisierungsoption –
alle anderen Schritte sind Automatisierungskandidaten, analog zu den
Mahnstufen bei Parkwerk (dort: Import → Fall → Halterabfrage → Anschreiben
→ Zahlungsabgleich, hier: Eingang → Vorgang → Antrag → Bescheid →
Rechnung → Verwendungsnachweis).

## Kernentitäten (Datenmodell)

Wie bei Parkwerk (dort: `faelle`) ist der **Vorgang** die zentrale
Klammer – jedes Dokument, jede Mail und jede Rechnung hängt eindeutig an
genau einem Vorgang, jeder Vorgang eindeutig an genau einem Kunden und
einem Fensterbauer.

Fensterbauer und Kunde tragen bewusst dieselben Kontaktfelder (Vorname,
Name, Firma, Straße, PLZ, Ort, Telefon, E-Mail, Bemerkungen) – beim
Fensterbauer sind Vorname/Name der Ansprechpartner, Firma der eigentliche
Betrieb; dazu kommen Kürzel (Kurzreferenz, z. B. für Dateinamen) und
Aktiv/Inaktiv.

```
Fensterbauer                    Kunde
  - id, Kürzel, Aktiv/Inaktiv     - id, fensterbauerId (FK)
  - Vorname, Name                - Vorname, Name, Firma
    (Ansprechpartner)            - Straße, PLZ, Ort
  - Firma                        - Telefon, E-Mail
  - Straße, PLZ, Ort              - Bemerkungen
  - Telefon, E-Mail (To/CC)
  - Bemerkungen
        \                    /
         \                  /
              Vorgang (Förderfall)
              - id (Fallnummer, z. B. EW-2026-00042 - eigener
                Nummernkreis wie bei Parkwerk, Präfix/Zähler in
                settings.json)
              - bafaVorgangsId (sobald aus Projektbeschreibung bekannt)
              - kundeId (FK), fensterbauerId (FK)
              - status (Enum, siehe unten)
              - uWertPruefung { ergebnis, protokollDokumentId, geprueftAm }
              - bescheid { betrag, datum, dokumentId }
              - rechnungId (FK)
              - verwendungsnachweisStatus, verwendungsnachweisFrist
              - historie[] (wer/was/wann - wie Parkwerks Fall-Historie)
                    |
                    ├── Dokument[]   (typisiert, siehe Ablage unten)
                    ├── Rechnung[]   { betrag, faelligkeitsdatum,
                    │                  zahlungsstatus (offen/teilweise/
                    │                  bezahlt), zahlungseingaenge[],
                    │                  E-Rechnungsformat }
                    └── Versandprotokoll[] (wer/was/wann/Freigabe durch wen)
```

**Vorgangsstatus (Hauptlinie, genau einer aktiv):**

| # | Status | Bedeutung |
|---|---|---|
| 1 | `eingang` | Auftrag inkl. Vollmacht eingegangen |
| 2 | `stammdaten_erfasst` | Kunde angelegt, Fensterbauer zugeordnet |
| 3 | `u_wert_geprueft` | Angebot gegen Merkblatt geprüft, Ergebnis konform |
| 4 | `antrag_gestellt` | Techn. Projektbeschreibung erstellt, BAFA-ID vorhanden, Antrag eingereicht |
| 5 | `vergabe_freigegeben` | Kunde + Fensterbauer informiert, Beauftragung/Kauf kann erfolgen |
| 6 | `bescheid_erhalten` | Zuwendungsbescheid identifiziert und weitergeleitet |
| 7 | `rechnung_versendet` | Rechnung erstellt und an Kunden versendet |
| 8 | `in_umsetzung` | Einbau läuft, Kunde liefert Rechnungen/Zahlungsnachweise |
| 9 | `verwendungsnachweis_faellig` | Umsetzung abgeschlossen, Nachweis muss erstellt/eingereicht werden |
| 10 | `verwendungsnachweis_eingereicht` | händisch im Portal eingereicht |
| 11 | `festgesetzt` | Festsetzungsbescheid erhalten, an Kunden versendet |
| 12 | `abgeschlossen` | Auszahlung bestätigt |

Status 3 (U-Wert-Prüfung) ist bewusst **vor** Status 4 (Antrag) einsortiert,
da die technische Projektbeschreibung die geprüften U-Werte enthalten
sollte – abweichend von der ursprünglichen Aufzählungsreihenfolge in der
Prozessbeschreibung. Falls die Projektbeschreibung in der Praxis mit
vorläufigen Werten gestellt und erst später final geprüft wird, muss diese
Reihenfolge angepasst werden.

**Ausnahmezustände** (verlassen die Hauptlinie, statt sie pro Schritt zu
verdoppeln):

- `abgelehnt` – BAFA lehnt Antrag **oder** Verwendungsnachweis ab.
- `storniert` – Kunde/Fensterbauer bricht ab (meist vor der Umsetzung).

**Flags statt eigener Status** (verhindert eine Kombinationsexplosion wie
„antrag_gestellt_mit_rueckfrage"):

- `rueckfrageOffen` (bool + Freitext + Datum) – BAFA fordert Nachbesserung
  an; kann in mehreren Hauptstatus auftreten, ist aber kein eigener
  Prozessschritt.
- `verwendungsnachweisUeberfaellig` – abgeleitet aus
  `verwendungsnachweisFrist` + heutigem Datum, nur solange Status noch
  nicht `verwendungsnachweis_eingereicht`/`festgesetzt`/`abgeschlossen`
  ist (wie bei Parkwerk), kein gespeicherter Wert.
- **`zahlungUeberfaellig`** – abgeleitet aus `rechnung.faelligkeitsdatum`
  + heutigem Datum, solange `rechnung.zahlungsstatus` noch nicht
  `bezahlt` ist **und** der Vorgang nicht `storniert`/`abgelehnt` ist –
  exakt dieselbe Ableitungslogik wie Parkwerks Filter/Dashboard-Kachel
  „Zahlung überfällig" (dort: Zahlungsfrist verstrichen, Fall weder
  erledigt noch eskaliert noch abgebrochen).
- `freigabeAusstehend` – ob eine automatisch erzeugte Mail/Rechnung noch
  auf den Freigeber wartet.

## Oberfläche (Reiter)

Wie bei Parkwerk eine Reiter-basierte Single-Page-Oberfläche (React, ein
Reiter = eine Ansicht mit eigener Liste/Suche/Detailansicht). Aktuell
angefragt/festgelegt: Startseite, Auftragsverwaltung, Kundenverwaltung,
Fensterbauerverwaltung, dazu bereits im Prototyp ein **Einstellungen**-
Reiter mit der Merkblatt-Ablage (s. u.) – dazu kommen (aus dem bisherigen
Aufbau bereits absehbar) noch die Reiter Dokumente/Eingang, Vorlagen,
Benutzer.

### Startseite (Übersicht)

Dashboard mit Kennzahlen-Kacheln, analog zu Parkwerks Kachel „Überfällige
Zahlungen" (aus Frist + aktuellem Datum abgeleitet, kein eigener
gespeicherter Status):

- Vorgänge je Status (offen / wartet auf Bescheid / Umsetzung /
  Verwendungsnachweis fällig / abgeschlossen)
- **Verwendungsnachweis überfällig** – eigene, rot hervorgehobene Kachel,
  da das der bekannte manuelle Engpass ist
- **Zahlung überfällig** – eigene, rot hervorgehobene Kachel (Rechnung an
  den Kunden versendet, Fälligkeitsdatum verstrichen, noch nicht als
  bezahlt erfasst) – Live-Zähler wie bei Parkwerks gleichnamiger Kachel
- Ausstehende Freigaben (Mails/Rechnungen, die auf den Freigeber warten)
- Letzte Aktivitäten (jüngste Statuswechsel/Versände aus `audit.log`)

Klick auf eine Kachel springt direkt in die Auftragsverwaltung, dort
bereits mit passendem Status-Filter vorbelegt.

### Auftragsverwaltung (Vorgänge) mit Suche

Tabellenansicht aller Vorgänge (entspricht Parkwerks Fälle-Reiter):

- Freitextsuche oberhalb der Liste nach Vorgangsnummer, BAFA-Vorgangs-ID,
  Kundenname oder Fensterbauer – kombinierbar mit Status-Filter sowie den
  Zusatzfiltern „Verwendungsnachweis überfällig" und **„Zahlung
  überfällig"** (mit Live-Zähler, exakt wie Parkwerks gleichnamiger
  Filter im Fälle-Reiter)
- Spalten: Vorgangsnummer, Kunde, Fensterbauer, Status, Bescheid-Betrag,
  Rechnungsbetrag + Fälligkeitsdatum, Verwendungsnachweis-Frist, sowie
  getrennte „Überfällig"-Kennzeichen für Verwendungsnachweis und Zahlung
  (ein Vorgang kann beides gleichzeitig sein, z. B. Umsetzung verzögert
  sich **und** Kunde zahlt die Rechnung nicht fristgerecht)
- Klick auf eine Zeile öffnet die Detailansicht: Historie, zugeordnete
  Dokumente, Rechnung, Versandprotokoll, U-Wert-Prüfprotokoll –
  strukturell wie Parkwerks Fall-Detailansicht

### Kundenverwaltung mit Suche

- Liste aller Kunden, Suche nach Name, Adresse, E-Mail oder zugeordnetem
  Fensterbauer
- Anlegen/Bearbeiten der Stammdaten; Detailansicht zeigt alle Vorgänge
  dieses Kunden (Verknüpfung wie im Datenmodell oben)

### Fensterbauerverwaltung mit Suche

- Liste der Fensterbauer (aktuell drei, aber nicht hart codiert – neue
  Fensterbauer müssen ohne Codeänderung anlegbar sein), Suche nach Name
  oder Kürzel
- Aktiv/Inaktiv-Schalter sowie Kontakt-E-Mail(s) für die automatische
  To/CC-Logik beim Versand
- Detailansicht zeigt alle zugeordneten Kunden und Vorgänge dieses
  Fensterbauers

Alle vier Suchen laufen wie bei Parkwerk als einfacher In-Memory-Filter
über die bereits geladene JSON-Collection (kein Suchindex/keine
Datenbank nötig bei den zu erwartenden Datenmengen von wenigen hundert
bis tausend Vorgängen/Kunden).

## Technischer Aufbau (wie Parkwerk)

| Baustein | Wie bei Parkwerk umgesetzt | Für Energiewerk übernommen |
|---|---|---|
| Server | Node.js (≥18) + Express, ein einzelner Prozess | gleich |
| Oberfläche | React als SPA, mit `esbuild` zu `bundle.js` gebaut (`npm install` baut automatisch) | gleich |
| Datenhaltung | keine Datenbank, JSON-Dateien pro Datensatz in `DATA_DIR` (geteilter SharePoint/OneDrive-Ordner) | gleich |
| Login | `users.json`, nur bcrypt-Hashes, `express-session` | gleich |
| Rollen | Administrator / Bearbeiter, serverseitig durchgesetzt (nicht nur UI) | Administrator / Sachbearbeiter / **Freigeber** (neu, s. u.) |
| PDF-Erzeugung | `pdf-lib`, Vorlagen mit `{{platzhalter}}`, gemeinsamer Briefkopf/Fußzeile-Code | gleich (Antrag-Begleitschreiben, Bescheid-Weiterleitung, Rechnung) |
| E-Mail-Versand | `nodemailer` gegen das bestehende Postfach (SMTP, bei Parkwerk Strato) | gleich für den Versand; **zusätzlich IMAP-APPEND** in den „Gesendet"-Ordner des Postfachs, damit versendete Mails im normalen Mail-Client sichtbar sind (entschieden, s. u.) |
| KI-Anbindung | serverseitiger Proxy `/api/claude`, Key nur serverseitig (`settings.json`/`.env`), nie im Client | gleich, zwei Verwendungen: U-Wert-Prüfung, Bescheid-Parsing |
| Dokument-Import | Arivo-ZIP per (S)FTP/API, idempotent über eindeutige ID, Feld-Mapping mit Fallback-Namen | Scan-/Upload-Ordner in `DATA_DIR`, idempotent über Dateiname (Dokumenttyp + Vorgangs-ID), s. u. |
| Backup | tägliches Cloud-Backup zu fester Uhrzeit (R2) | gleich |
| Betrieb | Windows-Dienst (`node-windows`) oder Autostart, HTTPS über Caddy/selbstsigniertes Zertifikat | gleich |
| Update | `Update.bat` zieht neuesten Commit aus konfiguriertem GitHub-Repo/Unterordner | gleich, Unterordner `Energiewerk` statt `Parkraumprogramm` |
| Protokollierung | `audit.log` (wer hat was geändert), `debug.log` (technisch), Client-Fehler zusätzlich ans Server-Log | gleich, `audit.log` dient hier zugleich als BAFA-Compliance-Nachweis für U-Wert-Prüfung und Versand |

### Projektstruktur

Die Programmdateien (linke Spalte) sind inzwischen umgesetzt - 1:1 nach dem
Muster von Parkwerk/Farbwerk (gleiches Repo, gleicher Aufbau), damit
Installation/Update/Betrieb auf einem Windows-Rechner genauso funktionieren
wie bei den beiden Schwesterprogrammen. Der Datenordner (rechts/unten) ist
teilweise noch Vorschlag - siehe Markierungen.

```
Energiewerk/
  Install.bat / Install.ps1              Ersteinrichtung (Node.js, npm
                                          install, Datenordner, Verknüpfungen,
                                          optional HTTPS-Zertifikat)
  Start.bat / Start.ps1 / Start-Hidden.vbs  Programm starten
  Stop.ps1 / Stop-Hidden.vbs             Programm beenden
  Service-Install.bat / Service-Uninstall.bat  Als Windows-Dienst (auto)
                                          ein-/ausrichten (Server-Betrieb)
  scripts/install-service.js / uninstall-service.js  (von den .bat genutzt)
  Update.bat / Update.ps1                Holt die neueste Version aus
                                          github.com/GunnarGillert/Maler_Luft
                                          (Unterordner "Energiewerk")
  Caddyfile.beispiel                     Beispiel für HTTPS per Reverse Proxy
  Client-Install.bat / Client-Install.ps1  Für Kolleg:innen - Zertifikat
                                          vertrauen, hosts-Eintrag,
                                          Desktop-Verknüpfung
  Client-Installation/  (entsteht bei der HTTPS-Einrichtung) - dieser
                       komplette Ordner wird an Kolleg:innen verteilt
    energiewerk-zertifikat.cer   öffentliches Zertifikat (ohne privaten
                                 Schlüssel)
    verbindungsdaten.json        IP + Name für den Client-Installer
  energiewerk-server.pfx  (entsteht bei der HTTPS-Einrichtung) Zertifikat
                       MIT privatem Schlüssel - bleibt auf dem Server, wird
                       NICHT verteilt (Pfad + Passwort stehen in der .env)
  server.js          Node-Server: Stammdaten, Vorgangsverwaltung, Unterlagen-
                      Upload + Erkennung, Merkblatt/U-Wert-Prüfung
  package.json
  _env.example
  _gitignore           Repo-Konvention wie bei Parkwerk/Farbwerk (node_modules,
                       public/bundle.js, .env, Energiewerk-Daten/ werden beim
                       Commit bewusst ausgelassen statt per echtem
                       .gitignore-Mechanismus ausgeschlossen)
  public/
    index.html
    app.jsx           Die eigentliche Anwendung (React)
    entry.jsx         Einstiegspunkt für den Build
    bundle.js         Fertig gebautes Paket (entsteht bei npm install)
  icon.ico           Programm-Icon (stilisierter Blitz, Marken-Grün) -
                      sichtbar als Favicon, im Header sowie für die
                      Desktop-/Startmenü-Verknüpfungen

Energiewerk-Daten/ (Datenordner, DATA_DIR in .env, im SharePoint/
                     OneDrive-synchronisierten Bereich) - **aktuell
                     tatsächlich vorhanden:** settings.json, collections/
                     {fensterbauer,kunden,vorgaenge,dokumente}/, merkblatt/,
                     logs/debug.log. Die übrigen Einträge unten (users.json,
                     .session-secret, rechnungen/, protokolle/, vorlagen/,
                     audit.log, backup.log) sind weiterhin **Vorschlag**,
                     sobald Login, E-Rechnung, U-Wert-Protokoll-Ablage,
                     Mailvorlagen bzw. Cloud-Backup umgesetzt werden:
  settings.json       Firmendaten, Fensterbauer-Liste, Mail-/IMAP-
                       Zugangsdaten-Referenz, Nummernkreis, KI-Prompt-
                       Vorlagen (U-Wert-Prüfung, Bescheid-Parsing)
  users.json          Benutzerkonten (bcrypt)
  .session-secret
  eingang/            Scan-/Upload-Ordner - hier landen neue Angebote/
                       Bescheide, werden erkannt und einsortiert
  collections/
    fensterbauer/*.json
    kunden/*.json
    vorgaenge/*.json
    dokumente/*.pdf        Angebote, Anträge, Bescheide (Originale)
    rechnungen/*.pdf|xml   E-Rechnung (PDF + eingebettetes XRechnung/
                            ZUGFeRD-XML)
    protokolle/*.json      U-Wert-Prüfprotokolle (KI-Ergebnis + Prompt +
                            Merkblattversion, als Nachweis)
    vorlagen/*.json        Mailtexte, Anschreiben, Rechnungslayout
  logs/
    audit.log
    debug.log
    backup.log
```

### Ablage- und Namenskonvention im Eingangs-Ordner

Analog zu Parkwerks Arivo-Import (idempotent über eine eindeutige ID)
läuft die Erkennung über den Dateinamen, nicht über den Ordner:

```
<Dokumenttyp>_<VorgangsID>_<Datum>.pdf
Angebot_EW-2026-00042_2026-08-01.pdf
Bescheid_EW-2026-00042_2026-08-20.pdf
```

Regel: **Dateiname beginnt mit Dokumenttyp, enthält immer die
Vorgangs-ID.** Ein Datei-Watcher/Polling auf `eingang/` (wie Parkwerks
periodischer FTP-Import) erkennt neue Dateien, ordnet sie per Vorgangs-ID
zu, verschiebt sie nach `collections/dokumente/` und löst je nach Typ die
passende Automatisierung aus (z. B. `Bescheid_...` → Bescheid-Parsing →
Rechnung + Mails). Bereits verarbeitete Dateien werden wie beim
Arivo-Import in einer Verarbeitungs-Liste vermerkt, damit ein erneuter
Sync (OneDrive-Konflikt, doppeltes Ablegen) nichts doppelt auslöst.

### Unterlagen-Upload am Vorgang (im Prototyp umgesetzt)

Ergänzend zum künftigen, noch nicht umgesetzten `eingang/`-Ordner-Watcher
oben gibt es im Prototyp bereits einen direkten Upload in der
Vorgangs-Detailansicht (`POST /api/vorgaenge/:id/dokumente`), der
dieselbe Erkennungsidee sofort nutzbar macht, ohne auf SharePoint-Sync
zu warten:

1. **Dateiname-Erkennung zuerst**: Schlüsselwort-Suche im gesamten
   Dateinamen (nicht nur als striktes Präfix, damit auch abweichend
   benannte Scans erkannt werden), spezifischere Begriffe vor
   allgemeineren geprüft (z. B. "zuwendungsbescheid" vor "bescheid").
2. **Kein Treffer → Textauszug + KI-Vorschlag**: Bei PDFs wird zuerst die
   eingebettete Textebene gelesen (`pdf-parse`, funktioniert ohne
   Internetzugang), bei Bildern (JPG/PNG) direkt per OCR (`tesseract.js`).
   Der Textauszug geht an einen serverseitigen Claude-Aufruf (Key nie im
   Client, wie Parkwerks „KI-Textvorschlag"), der einen Dokumenttyp
   vorschlägt.
3. **Kein Vorschlag möglich → klar anzeigen statt stillschweigend
   ignorieren** (wie Parkwerks Import-Diagnose): Das Dokument landet
   trotzdem am Vorgang (Typ „unbekannt"), inkl. Grund (kein API-Key, kein
   Text extrahierbar, OCR ohne Internetzugriff, …), und lässt sich über
   ein Dropdown manuell zuordnen (`PATCH .../dokumente/:dokumentId`).

**Bekannte Grenze im Prototyp:** Eine reine Scan-PDF ohne eingebettete
Textebene wird **nicht** zusätzlich gerastert und per OCR gelesen (das
bräuchte eine PDF-Rasterisierung wie bei Parkwerks
Halterantwort-OCR/`getScreenshot`) – sie landet als „unbekannt" und muss
manuell zugeordnet werden. Ebenso lädt `tesseract.js` deutsche
Sprachdaten beim ersten Gebrauch aus dem Internet nach; ohne
Internetzugriff zu diesem Zeitpunkt schlägt die Texterkennung fehl (mit
Zeitlimit statt Absturz/Hänger, s. u.) – identische, bereits bei
Parkwerk dokumentierte Einschränkung.

**Beim Testen reproduziert und behoben:** `tesseract.js` wirft einen
fehlenden Internetzugriff beim Sprachdaten-Download nicht als normale
Promise-Ablehnung, sondern als unbehandeltes Worker-Event – ohne
Gegenmaßnahme hätte das den ganzen Server abgeschossen. Behoben über
dieselbe Kombination wie bei Parkwerk: ein globales
`process.on("uncaughtException"/"unhandledRejection")`-Sicherheitsnetz
plus ein hartes Zeitlimit um den OCR-Aufruf, damit eine einzelne Anfrage
auch ohne Internetzugriff in absehbarer Zeit mit einer sauberen
Fehlermeldung endet statt unbegrenzt zu hängen.

### KI-Anbindung (zwei Verwendungen, ein Proxy)

Wie bei Parkwerks „KI-Textvorschlag" läuft die Anthropic-API ausschließlich
serverseitig; der Key steht nie im Client (Einstellungen `anthropicApiKey`
bzw. `ANTHROPIC_API_KEY` in der `.env`, dieselbe Auflösungsreihenfolge wie
bei Parkwerk).

1. **U-Wert-Prüfung (im Prototyp umgesetzt)**: Reiter **Einstellungen** →
   Merkblatt (KfW) hochladen (muss eine durchsuchbare PDF sein, wird beim
   Upload einmalig per `pdf-parse` ausgelesen und der Textauszug in
   `settings.json` zwischengespeichert - keine erneute PDF-Verarbeitung
   bei jeder Prüfung). Sobald danach ein Dokument an einem Vorgang als
   **„Angebot"** eingestuft wird - automatisch per Dateiname-Erkennung
   *oder* nachträglich manuell/per KI-Vorschlag bestätigt (siehe
   Unterlagen-Upload oben) - läuft automatisch derselbe Textauszug wie
   beim Upload, plus ein Claude-Aufruf, der das Angebot gegen den
   Merkblatt-Text prüft. Ergebnis (`konform` / `nicht_konform` /
   `unsicher` / `nicht_moeglich` inkl. Begründung, gefundenen U-Werten und
   ggf. Fehlergrund) wird **immer** am Vorgang gespeichert (`uWertPruefung`)
   und in der Historie protokolliert - auch wenn die Prüfung mangels
   API-Key/Merkblatt/lesbarem Text nicht möglich war. Das ist der
   Compliance-Nachweis, kein reines UI-Feedback.
2. **Bescheid-Parsing (noch nicht umgesetzt)**: Prompt/Extraktion aus dem
   gescannten Zuwendungsbescheid (Name, Betrag, Vorgangs-ID) - dieselbe
   Textauszug-Grundlage wie beim Unterlagen-Upload und der U-Wert-Prüfung
   lässt sich dafür wiederverwenden, sobald der Bescheid als Dokument am
   Vorgang hängt.

**Bekannte Grenze:** Ohne hinterlegten API-Key (Standard in dieser
Entwicklungsumgebung) liefert die Prüfung immer `nicht_moeglich` mit
entsprechender Begründung - das End-to-End-Verhalten bei einem echten
Claude-Aufruf (inkl. Prompt-Qualität bei echten Angeboten/Merkblättern)
ist damit noch nicht gegen einen echten Key getestet, nur der komplette
Ablauf drumherum (Merkblatt-Ablage, Trigger-Zeitpunkte, Speichern,
Fehlerfälle).

### Rollen

- **Administrator**: Einstellungen, Fensterbauer-/Nutzerverwaltung,
  Protokolle, Backup/Update – wie bei Parkwerk.
- **Sachbearbeiter**: Vorgänge, Stammdaten, Dokumente – wie Parkwerks
  „Bearbeiter".
- **Freigeber** (neu gegenüber Parkwerk): einzige Rolle, die automatisch
  erzeugte Mails/Rechnungen tatsächlich freigibt/versendet, solange der
  Freigabe-Schalter für den jeweiligen Mailtyp noch auf „manuell" steht.
  Kann mit Sachbearbeiter kombiniert sein oder eigenständig vergeben
  werden (z. B. wenn nur die Geschäftsleitung freigeben soll).

### Mailversand: SMTP + IMAP-APPEND ins Gesendet-Postfach

Entschieden: Versand läuft wie bei Parkwerk klassisch per **SMTP**
(`nodemailer`, Zugangsdaten in `settings.json`/`.env`). Zusätzlich wird
jede versendete Mail per **IMAP-APPEND** in den „Gesendet"-Ordner des
tatsächlich genutzten Postfachs geschrieben, damit Kunde/Fensterbauer-
Korrespondenz für alle Mitarbeitenden im normalen Mail-Client (Outlook
o. ä.) sichtbar bleibt – nicht nur im Energiewerk-eigenen
Versandprotokoll. Technisch z. B. über `node-imap`/`imap-simple` (`APPEND`
auf `INBOX.Sent`/`Gesendete Objekte`, Ordnername je nach Provider
unterschiedlich, ggf. per `LIST`-Befehl ermitteln statt hart zu
kodieren). IMAP-Zugangsdaten wie das SMTP-Passwort bewusst nur in der
lokalen `.env`, nie im Client oder in `settings.json` im Klartext.

Fehlerbild, das zu berücksichtigen ist: Schlägt der IMAP-APPEND fehl
(Postfach kurzzeitig nicht erreichbar), darf das den bereits erfolgten
SMTP-Versand nicht rückgängig machen oder blockieren – Mail gilt als
versendet, der fehlgeschlagene APPEND wird nur geloggt (`debug.log`) und
lässt sich bei Bedarf später nachholen, analog zu Parkwerks Umgang mit
einem einzelnen fehlgeschlagenen OCR-Versuch (Fehler wird protokolliert,
legt aber nicht die eigentliche Aktion lahm).

### E-Rechnung

PDF-Erzeugung wie bei Parkwerk über `pdf-lib` mit gemeinsamer
Briefkopf-/Fußzeile-Funktion, zusätzlich eingebettetes strukturiertes
Datenformat für die E-Rechnungspflicht (ZUGFeRD: XML in die PDF
eingebettet, oder XRechnung als separates XML – Format hängt davon ab, ob
Rechnungsempfänger B2B-Kunde oder öffentliche Stelle ist, siehe offene
Frage unten). Betrag primär aus dem geparsten Bescheid, sonst aus
Vorkalkulation im Vorgang.

### Zahlungsabgleich (für „Zahlung überfällig")

Damit `zahlungUeberfaellig` überhaupt etwas anderes anzeigt als „ewig
überfällig", muss ein bezahlter Betrag irgendwie als „bezahlt" im
Vorgang landen. Zwei Optionen, wie bei Parkwerks Stufe 6:

- **Minimal (Startpunkt)**: Sachbearbeiter markiert die Rechnung nach
  Zahlungseingang manuell als „bezahlt" (Button in der Vorgangs-
  Detailansicht, wie Parkwerks „Als versendet markieren"-Muster).
  Kein zusätzlicher Code nötig, aber laufender manueller Aufwand.
- **Automatisch (Ausbaustufe, optional)**: Datei-Import (MT940/camt.053
  aus dem Online-Banking) oder FinTS-Abruf wie bei Parkwerk, Abgleich
  über die Vorgangsnummer (`EW-JJJJ-NNNNN`) im Verwendungszweck – exakt
  dasselbe Verfahren, das bei Parkwerk für Aktenzeichen bereits gebaut
  und getestet ist (`fints`-Bibliothek bzw. Datei-Import, Zuordnung über
  ein Regex auf den Verwendungszweck).

Empfehlung: mit der manuellen Variante starten (geringer Aufwand, deckt
die Kachel/den Filter bereits vollständig ab) und den automatischen
Abgleich erst nachziehen, falls das Rechnungsvolumen das rechtfertigt.

## Automatisierungsgrad je Schritt

| Schritt | Auslöser | Automatisierungsgrad |
|---|---|---|
| Stammdaten anlegen | Auftragseingang | Teilautomatisch (Formular → Register) |
| Technische Projektbeschreibung / Antrag | – | **Manuell** (BAFA-Portal) |
| U-Wert-Prüfung | Angebot in `eingang/` | Automatisch (KI-Prüfung + Protokoll) |
| Mail "Vergabe möglich" | Antrag gestellt (Statuswechsel) | Automatisch, mit Freigabe-Schalter |
| Bescheid-Erkennung | Scan/Upload in `eingang/` | Automatisch (KI-Parsing) |
| Bescheid-Versand an Kunde/Fensterbauer | Bescheid erkannt | Automatisch, mit Freigabe-Schalter |
| Rechnungserstellung + Versand | Bescheid erkannt | Automatisch, mit Freigabe-Schalter |
| Verwendungsnachweis | Nach Umsetzung | **Manuell** (BAFA-Portal), Frist-Erinnerung automatisch |

## Risiken / offene Punkte

- Fehlende oder uneinheitliche Stammdaten (Fensterbauer, Kunden) gefährden
  Zustellung und Zuordnung → Stammdatenregister ist Vorbedingung, nicht
  Nebenprodukt.
- Uneinheitliche Ablage/Benennung im `eingang/`-Ordner erschwert die
  automatische Erkennung → Namenskonvention muss vor Automatisierung
  stehen (wie bei Parkwerks Import-Diagnose: klar anzeigen, wenn ein
  Dateiname nicht erkannt wurde, statt es stillschweigend zu ignorieren).
- E-Rechnungsformat muss rechtlich geprüfte Kriterien erfüllen (XRechnung/
  ZUGFeRD-Vorgabe klären, s. u.).
- U-Wert-Prüfung per KI muss nachweisbar/regelkonform sein (Prompt +
  Merkblattversion + Ergebnis archivieren, nicht nur anzeigen).
- Verwendungsnachweis bleibt manueller Engpass/Single Point of Failure →
  eigene Fristen-Tracking-Logik nötig, losgelöst von der Automatisierung
  der übrigen Schritte.
- Mehrere Fensterbauer/Sachbearbeiter schreiben gleichzeitig in denselben
  SharePoint/OneDrive-Datenordner – dasselbe Konfliktrisiko wie bei
  Parkwerk. Parkwerks eigene Lösung dafür (ein zentraler Server statt
  „ein Programm pro PC") sollte Energiewerk von Anfang an übernehmen,
  statt das Problem erst im Betrieb zu entdecken.

## Offene Fragen (vor Umsetzung zu klären)

1. Liste der drei Fensterbauer inkl. Kontakt-E-Mails (To/CC-Logik).
2. Aktuelle Version des BAFA-Merkblatts als KI-Referenzdokument, plus wie
   oft/wodurch sich das Merkblatt ändern kann.
3. Konkrete Anforderung ans E-Rechnungsformat (XRechnung vs. ZUGFeRD,
   Pflichtfelder) – abhängig davon, ob Rechnungsempfänger die Kunden
   (B2C) oder ggf. auch öffentliche Stellen sind.
4. SharePoint-Standort/Bibliothek, in der `Energiewerk-Daten` angelegt
   werden soll (und ob sie – wie bei Parkwerk – lokal per OneDrive-Client
   synchronisiert vorliegt, damit `DATA_DIR` direkt darauf zeigen kann).
5. Sollen mehrere Fensterbauer/Mitarbeitende gleichzeitig zugreifen
   können (→ zentraler Server-Betrieb wie bei Parkwerks „Server statt
   lokal"-Modus, empfohlen) oder reicht ein Einzelplatz-Betrieb?
6. Genaue IMAP-Zugangsdaten/Postfach für den APPEND-Schritt (i. d. R.
   dasselbe Postfach wie für SMTP) sowie der exakte Name des
   „Gesendet"-Ordners beim genutzten Provider.

## Nächste Schritte (Vorschlag, nach Freigabe der Skizze)

1. Phase 1: Grundgerüst aus Parkwerk kopieren/anpassen (Server-Skelett,
   Login/Rollen, Datenordner-Struktur), Stammdatenregister +
   Namenskonvention für `eingang/`.
2. Phase 2: Trigger "Bescheid erkannt" → automatische Rechnung + Mails
   (mit Freigabe-Schalter).
3. Phase 3: KI-Pipeline U-Wert-Prüfung inkl. Prüfprotokoll.
4. Phase 4: Straight-Through-Versand für risikoarme Mailtypen, Frist-
   Erinnerung für Verwendungsnachweis.
