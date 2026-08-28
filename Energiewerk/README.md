# Energiewerk – BAFA-Förderprozess für Fensterbauer (Maler Luft)

Skizze für ein Programm, das den wiederkehrenden BAFA-Förderprozess für die
Fensterbauer-Kunden von Maler Luft systematisiert: von der Stammdatenpflege
über die BAFA-Antragstellung und U-Wert-Prüfung bis zu Zuwendungsbescheid,
Rechnungsstellung und (soweit zulässig automatisiert) Kommunikation.

**Status: Konzept-Skizze, noch keine Implementierung.**

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

```
Fensterbauer               Kunde
  - id, Name, Kürzel         - id, Vorname, Nachname, Firma
  - Kontakt (E-Mail To/CC)   - Adresse, E-Mail, Telefon
  - Aktiv/Inaktiv            - fensterbauerId (FK)
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
                    ├── Rechnung[]   (E-Rechnungsformat)
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
- `ueberfaellig` – abgeleitet aus Frist + heutigem Datum (wie bei
  Parkwerk), kein gespeicherter Wert.
- `freigabeAusstehend` – ob eine automatisch erzeugte Mail/Rechnung noch
  auf den Freigeber wartet.

## Oberfläche (Reiter)

Wie bei Parkwerk eine Reiter-basierte Single-Page-Oberfläche (React, ein
Reiter = eine Ansicht mit eigener Liste/Suche/Detailansicht). Aktuell
angefragt/festgelegt: Startseite, Auftragsverwaltung, Kundenverwaltung,
Fensterbauerverwaltung – dazu kommen (aus dem bisherigen Aufbau bereits
absehbar) noch die Reiter Dokumente/Eingang, Vorlagen, Einstellungen,
Benutzer.

### Startseite (Übersicht)

Dashboard mit Kennzahlen-Kacheln, analog zu Parkwerks Kachel „Überfällige
Zahlungen" (aus Frist + aktuellem Datum abgeleitet, kein eigener
gespeicherter Status):

- Vorgänge je Status (offen / wartet auf Bescheid / Umsetzung /
  Verwendungsnachweis fällig / abgeschlossen)
- **Verwendungsnachweis überfällig** – eigene, rot hervorgehobene Kachel,
  da das der bekannte manuelle Engpass ist
- Ausstehende Freigaben (Mails/Rechnungen, die auf den Freigeber warten)
- Letzte Aktivitäten (jüngste Statuswechsel/Versände aus `audit.log`)

Klick auf eine Kachel springt direkt in die Auftragsverwaltung, dort
bereits mit passendem Status-Filter vorbelegt.

### Auftragsverwaltung (Vorgänge) mit Suche

Tabellenansicht aller Vorgänge (entspricht Parkwerks Fälle-Reiter):

- Freitextsuche oberhalb der Liste nach Vorgangsnummer, BAFA-Vorgangs-ID,
  Kundenname oder Fensterbauer – kombinierbar mit Status-Filter (wie bei
  Parkwerks Fälle-Suche, die sich mit dem Status-Filter kombinieren lässt)
- Spalten: Vorgangsnummer, Kunde, Fensterbauer, Status, Bescheid-Betrag,
  Verwendungsnachweis-Frist, „Überfällig"-Kennzeichen
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

### Projektstruktur (Vorschlag)

```
energiewerk-lokal/
  Start.bat / Start.ps1 / Start-Hidden.vbs
  Service-Install.bat / Service-Uninstall.bat
  Client-Install.bat / Client-Install.ps1
  Caddyfile.beispiel
  server.js          Node-Server: Login, Dokument-Erkennung, Vorgangs-
                      verwaltung, PDF, E-Rechnung, Mailversand, Claude-Proxy
  package.json
  _env.example
  public/
    index.html
    app.jsx / entry.jsx / bundle.js

Energiewerk-Daten/ (Datenordner, DATA_DIR in .env, im SharePoint/
                     OneDrive-synchronisierten Bereich)
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

### KI-Anbindung (zwei Verwendungen, ein Proxy)

Wie bei Parkwerks „KI-Textvorschlag" läuft die Anthropic-API ausschließlich
serverseitig über `/api/claude`; der Key steht nie im Client.

1. **U-Wert-Prüfung**: Prompt aus Angebots-U-Werten + aktueller
   BAFA-Merkblatt-Version (als Referenztext/Datei hinterlegt,
   Vorlage editierbar wie Parkwerks KI-Textvorschlag-Prompt). Ergebnis
   wird **immer** als Protokoll gespeichert (nicht nur angezeigt) –
   das ist der Compliance-Nachweis.
2. **Bescheid-Parsing**: Prompt/Extraktion aus dem gescannten
   Zuwendungsbescheid (Name, Betrag, Vorgangs-ID), analog zu Parkwerks
   PDF-Textebene-zuerst/OCR-Fallback-Ansatz bei Kundenantworten
   (`pdf-parse` zuerst, `tesseract.js` nur falls kein Text erkennbar).

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
