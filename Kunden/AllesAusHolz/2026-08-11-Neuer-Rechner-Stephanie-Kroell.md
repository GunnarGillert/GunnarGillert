# Alles aus Holz – Neuer Rechner Stephanie Kröll

- **Kunde:** Alles aus Holz
- **Ansprechpartnerin:** Stephanie Kröll
- **Datum:** 2026-08-11
- **Anlass:** Einrichtung eines neuen Rechners

## Aufgaben

- [x] Office 365 Family auf `info@allesausholz.de` registriert (PW in KeePass)
- [x] OneDrive eingerichtet
- [x] Backup eingerichtet
- [x] Lexware eingerichtet, Kundenkonto angelegt auf `info@allesausholzgmbh.de` (PW in KeePass)
- [x] Samsung Drucker eingerichtet (IP: `192.168.2.5`)
- [x] Samsung Scanner mit NAPS2 eingerichtet
- [x] FritzBox Update (PW in KeePass)
- [x] Avast Business Hub für Viren- und Patchmanagement, `info@allesausholzgmbh.de` (PW in KeePass)
- [x] Passwort für `allesausholz@yahoo.de` in KeePass ablegen
- [x] 1&1 (IONOS) Exchange `info@allesausholz.de` in Outlook eingerichtet
- [x] Cloudflare registriert auf `info@allesausholzgmbh.de` (PW in KeePass)
- [ ] Kreditkarte für Cloudflare R2 Storage hinterlegen
- [x] Outlook-Signatur eingerichtet
- [x] Client Install ausgeführt – Angebotswerk funktioniert
- [x] Claude AI kostenloses Konto erstellt für `info@allesausholzgmbh.de`
- [ ] Kreditkarte für Claude API hinterlegen

## Yahoo Mail in Outlook (`allesausholz@yahoo.de`)

In Outlook ist meist keine manuelle Servereinstellung nötig – Yahoo wird per Autodiscover automatisch erkannt (ähnlich wie Gmail, GMX, web.de). Falls doch manuell eingerichtet werden muss, folgende Werte verwenden:

**IMAP (Posteingang):**

- Server: `imap.mail.yahoo.com`
- Port: `993`
- Verschlüsselung: SSL/TLS

**SMTP (Postausgang):**

- Server: `smtp.mail.yahoo.com`
- Port: `465` (SSL/TLS) oder `587` (STARTTLS)

**Wichtig:** Yahoo verlangt heute i. d. R. ein App-Passwort statt des normalen Kontopassworts, sobald ein Mail-Client (auch Outlook) zugreift – besonders bei aktiver 2-Faktor-Authentifizierung.

App-Passwort bei Yahoo erstellen:

1. Auf login.yahoo.com einloggen
2. Zu „Kontoinformationen" → „Kontosicherheit"
3. „App-Passwort generieren" auswählen
4. App auswählen (z. B. „Andere App" → „Outlook" eintippen)
5. Generiertes Passwort kopieren und beim Einrichten in Outlook statt des normalen Passworts eingeben

### Fehler: Kontoname im Ordnerbereich blieb leer (behoben)

Nach dem Einrichten zeigte der Ordnerbereich oben keinen Kontonamen an (leerer Eintrag über Posteingang/Draft/Sent/...). Folgende Fixes haben **nicht** geholfen:

- Rechtsklick auf den leeren Eintrag → „Datendatei-Eigenschaften..." → Name gesetzt
- Kontoeinstellungen → Konto ändern → „Weitere Einstellungen" → Allgemein → „Kontobezeichnung" gesetzt
- `outlook.exe /resetnavpane`

**Was letztlich funktioniert hat:** Konto komplett entfernen (Kontoeinstellungen → Konto auswählen → Entfernen) und neu hinzufügen. Passiert laut Microsoft, wenn beim ursprünglichen Hinzufügen des Kontos etwas nicht sauber durchgelaufen ist.

### Nachrichtenliste zeigte keinen Betreff an (behoben)

In der Nachrichtenliste wurde statt des Betreffs nur der Absender („Yahoo") und eine Vorschauzeile (z. B. eine Bild-URL) angezeigt – kein Betreff sichtbar.

**Fix:** Ansicht → „Nachrichtenvorschau" → „Aus". Die Nachrichtenvorschau hatte den Betreff überdeckt.

(Alternative, falls das nicht reicht: Ansicht → „Ansichtseinstellungen" → „Weitere Einstellungen..." → Häkchen bei „Kompaktdarstellung verwenden" entfernen → OK.)

## 1&1 (IONOS) Exchange in Outlook (`info@allesausholz.de`)

Bei Exchange-Postfächern von IONOS/1&1 gibt es – anders als bei POP/IMAP – keine klassischen manuellen Server-/Port-Einstellungen zum Eintragen. Outlook richtet das Konto über **Autodiscover** ein.

**Automatische Einrichtung (Standardweg):**

1. Outlook → Datei → Konto hinzufügen
2. E-Mail-Adresse `info@allesausholz.de` eingeben
3. Outlook erkennt das Konto automatisch als Exchange-Konto
4. Auf „Verbinden" klicken, danach Passwort eingeben
5. Falls eine Meldung erscheint, dass Outlook die Konfiguration über den Server `autodiscover.1and1.info` (bzw. den Autodiscover-Eintrag der eigenen Domain) laden möchte: Anfrage bestätigen/zulassen und „Nicht mehr nach dieser Website fragen" bzw. „Always use my response for this server" aktivieren

**Benutzername/Login:** volle E-Mail-Adresse `info@allesausholz.de`
**Passwort:** normales Postfach-Passwort (PW in KeePass) – kein App-Passwort nötig, anders als bei Yahoo

**Quellen:**
- [IONOS Hilfe-Center – Microsoft Exchange einrichten](https://www.ionos.com/help/email/index-for-microsoftr-exchange-articles/setting-up-microsoftr-exchange/setting-up-microsoft-exchanger/)
- [IONOS Hilfe-Center – Exchange in klassischem Outlook (M365) einrichten](https://www.ionos.com/help/email/index-for-microsoftr-exchange-articles/setting-up-microsoftr-exchange/setting-up-microsoft-exchanger-in-classic-outlook-microsoft-365/)

### Fehler beim Einrichten: „Die Aktion kann nicht abgeschlossen werden. Der Name stimmt mit keinem Namen in der Adressliste überein." (behoben)

**Ursache:** `info@allesausholz.de` ist gleichzeitig als Microsoft-365-Family-Konto registriert (siehe oben). Outlook fragt beim automatischen Einrichten zuerst immer den fest hinterlegten Office-365-Autodiscover-Endpunkt ab, bevor es den eigenen (IONOS-)Autodiscover-Eintrag der Domain nutzt. Weil unter derselben Adresse ein Microsoft-365-Konto existiert, aber kein Exchange-Online-Postfach, schlägt die Namensauflösung gegen die dortige Adressliste (GAL) fehl. Das ist ein bekanntes Problem bei Domains, die parallel für ein privates Microsoft-365-Abo *und* ein gehostetes Exchange-Postfach woanders (hier: IONOS) genutzt werden.

**Sackgasse (bereits ausprobiert, funktioniert nicht):** Manuelle Einrichtung → Kontotyp „Exchange ActiveSync" mit Server `1.exchange.1and1.eu` → führt zu „Der Server wurde nicht gefunden". Grund: Outlook unterstützt den Kontotyp „Exchange ActiveSync" laut Microsoft grundsätzlich nicht für echte Exchange-Postfächer (auch nicht bei IONOS) – dieser Kontotyp ist nur für ActiveSync-kompatible Fremddienste gedacht, nicht für echtes Exchange/EWS. Diesen Weg nicht weiterverfolgen.

**Tatsächliche Lösung – Office-365-Autodiscover-Abfrage per Registry deaktivieren** (offizieller IONOS-Fix für genau dieses Szenario):

1. Falls gerade ein Konto-Setup-Versuch offen ist: abbrechen bzw. das fehlgeschlagene Konto in Outlook wieder entfernen
2. `Win + R` → `regedit` eingeben → Enter
3. Zum Schlüssel navigieren: `HKEY_CURRENT_USER\Software\Microsoft\Office\16.0\Outlook\AutoDiscover` (Schlüssel `AutoDiscover` ggf. unter `Outlook` neu anlegen, falls er fehlt)
4. Rechtsklick → Neu → DWORD-Wert (32-Bit)
5. Namen vergeben: `ExcludeExplicitO365Endpoint`, Wert auf `1` belassen/setzen
6. Outlook vollständig schließen (auch im Task-Manager prüfen, dass es nicht mehr läuft) und neu starten
7. Konto erneut hinzufügen: `info@allesausholz.de` eingeben, Kontotyp **„Microsoft 365"** wählen (das ist bei modernem Outlook weiterhin der richtige Weg für Exchange-Protokoll-Konten, auch für IONOS – nicht „Exchange ActiveSync") und Passwort eingeben
8. Outlook sollte den Office-365-Endpunkt jetzt überspringen und korrekt per Autodiscover auf `1.exchange.1and1.eu` verbinden

✅ Fix hat funktioniert – Konto ist erfolgreich eingerichtet.

**Falls danach immer noch Probleme auftreten:**

- Windows-Anmeldeinformationsverwaltung (Systemsteuerung → Benutzerkonten → Anmeldeinformationsverwaltung) öffnen und gespeicherte Zugangsdaten zu `info@allesausholz.de` bzw. `outlook.office365.com` entfernen
- Prüfen, ob unter Windows-Einstellungen → Konten → „Auf Arbeit oder Schule zugreifen" bzw. „E-Mail & Konten" bereits ein Konto für `info@allesausholz.de` hinterlegt ist, und dieses ggf. entfernen
- Neues Outlook-Profil anlegen (Systemsteuerung → Mail → Profile anzeigen → Hinzufügen) und Konto darin neu einrichten
- IONOS-Support kontaktieren, falls weiterhin keine Verbindung zustande kommt

**Quellen:**
- [IONOS Hilfe-Center – Deactivating Autodiscover for Microsoft 365 in Outlook](https://www.ionos.com/help/email/index-for-microsoftr-exchange-articles/setting-up-microsoftr-exchange/deactivating-autodiscover-for-microsoft-365-in-outlook/)
- [Microsoft Learn – Outlook kann ActiveSync nicht zum Verbinden von Exchange verwenden](https://learn.microsoft.com/de-de/troubleshoot/outlook/profiles-and-accounts/outlook-cannot-use-activesync-connect-exchange)
- [Microsoft Q&A – „Microsoft365 Single Abo, Die Aktion kann nicht abgeschlossen werden..."](https://learn.microsoft.com/de-de/answers/questions/4697726/microsoft365-single-abo-die-aktion-kann-nicht-abge)

## 1&1 (IONOS) Kundendaten

- **Kundennummer (KD-Nummer)** für 1&1-Exchange und Homepage: `583805328`
- **Passwort:** liegt in KeePass

### E-Mail-Adressen unter `allesausholzgmbh.de`

| Typ | E-Mail-Adresse | Weiterleitung/techn. Adresse | Virenschutz | Archivierung | KI-Assistent |
|---|---|---|---|---|---|
| Postfach | `braun@allesausholzgmbh.de` | `info@allesausholzgmbh.de` | ✅ | ✅ | ✅ |
| Postfach | `charly@allesausholzgmbh.de` | `info@allesausholzgmbh.de` | ✅ | ✅ | ✅ |
| Postfach | `fabian.scherer@allesausholzgmbh.de` | – | ✅ | ✅ | ✅ |
| Weiterleitung (kein eigenes Postfach) | `info@allesausholzgmbh.de` | – | ❌ | ✅ | ❌ |
| Postfach | `info_archiv@allesausholzgmbh.de` | `e564911416@1.exchange.1and1.eu` | ✅ | ✅ | ✅ |
| Postfach | `ipcam@allesausholzgmbh.de` | – | ✅ | ✅ | ✅ |
| Postfach | `webmaster@allesausholzgmbh.de` | `info@allesausholzgmbh.de` | ✅ | ✅ | ✅ |

## Outlook-Signatur

```
Freundliche Grüße aus Echzell

i.A. Stephanie Kröhl

Alles aus Holz GmbH
Michael Braun
Bisseser Str. 22 b
61209 Echzell
Tel.  06008 91 73 500
Fax. 06008 91 73 502
Mail:  info@allesausholzgmbh.de
```

## Windows „Freigeben" öffnet neues statt klassisches Outlook

**Problem:** Wird eine Datei per Rechtsklick → „Freigeben" geteilt, erscheint als Ziel nur „Outlook (neu)" bzw. die Windows-Mail-App – nicht das klassische Outlook.

**Ursache:** Bekannte Windows-Einschränkung, keine Fehlkonfiguration. Die „Freigeben"-Funktion nutzt eine moderne Windows-Schnittstelle (Share-Contract), die klassisches Outlook technisch nicht unterstützt. Eine offizielle Möglichkeit, klassisches Outlook dort einzubinden, gibt es laut Microsoft aktuell nicht.

**Workaround:** Statt „Freigeben" die ältere Funktion nutzen:

1. Rechtsklick auf die Datei
2. „Senden an" → „E-Mail-Empfänger"

Das läuft über MAPI und öffnet zuverlässig das klassische Outlook – vorausgesetzt, es ist als Standard-Mailprogramm hinterlegt: Einstellungen → Apps → Standard-Apps → „Standard-Apps nach Linktyp auswählen" → `MAILTO` → „Outlook" (ohne Zusatz „Neu") auswählen.

## Notfall-/Wiederherstellungskonten (Break Glass)

- `allesausholz@yahoo.de` ist das Break-Glass-/Wiederherstellungskonto für den 1&1-(IONOS-)Zugang
- Der 1&1-(IONOS-)Zugang ist umgekehrt das Break-Glass-/Wiederherstellungskonto für `allesausholz@yahoo.de`
- D. h. beide Konten dienen sich gegenseitig zur Wiederherstellung – Zugangsdaten für beide daher besonders sorgfältig in KeePass pflegen

## Notizen

- Alle vergebenen Passwörter sind in KeePass hinterlegt.
