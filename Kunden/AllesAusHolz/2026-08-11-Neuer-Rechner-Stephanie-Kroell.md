# Alles aus Holz – Neuer Rechner Stephanie Kröll

- **Kunde:** Alles aus Holz
- **Ansprechpartnerin:** Stephanie Kröll
- **Datum:** 2026-08-11
- **Anlass:** Einrichtung eines neuen Rechners

## Aufgaben

- [x] Office 365 Family auf `info@allesausholz.de` registriert (PW in KeePass)
- [x] OneDrive eingerichtet
- [x] Backup eingerichtet
- [x] Lexware eingerichtet, Kundenkonto angelegt (PW in KeePass)
- [x] Samsung Drucker eingerichtet (IP: `192.168.2.5`)
- [x] Samsung Scanner mit NAPS2 eingerichtet
- [x] FritzBox Update (PW in KeePass)
- [x] Avast Business Hub für Viren- und Patchmanagement, `info@allesausholzgmbh.de` (PW in KeePass)
- [x] Passwort für `allesausholz@yahoo.de` in KeePass ablegen

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

**Falls Autodiscover nicht automatisch funktioniert:**

- Erweiterte Optionen → „Ich möchte mein Konto manuell einrichten" wählen, Outlook fragt danach trotzdem die Exchange-Autodiscover-Adresse ab (keine freie IMAP/SMTP-Eingabe möglich)
- Prüfen, ob der DNS-Autodiscover-Eintrag der Domain `allesausholz.de` korrekt auf IONOS zeigt
- Alternativ im IONOS-Kundenkonto/Hilfe-Center nachsehen oder IONOS-Support kontaktieren

**Quellen:**
- [IONOS Hilfe-Center – Microsoft Exchange einrichten](https://www.ionos.com/help/email/index-for-microsoftr-exchange-articles/setting-up-microsoftr-exchange/setting-up-microsoft-exchanger/)
- [IONOS Hilfe-Center – Exchange in klassischem Outlook (M365) einrichten](https://www.ionos.com/help/email/index-for-microsoftr-exchange-articles/setting-up-microsoftr-exchange/setting-up-microsoft-exchanger-in-classic-outlook-microsoft-365/)

### Fehler beim Einrichten: „Die Aktion kann nicht abgeschlossen werden. Der Name stimmt mit keinem Namen in der Adressliste überein."

Ist beim Einrichten des Exchange-Kontos aufgetreten. Wahrscheinliche Ursache: `info@allesausholz.de` ist gleichzeitig als Microsoft-365-Family-Konto registriert (siehe oben). Outlooks Autodiscover erkennt die Adresse dadurch als Microsoft-365-/Exchange-Online-Konto und versucht, sie gegen das dortige Adressbuch (GAL) aufzulösen – das eigentliche Postfach liegt aber bei IONOS, nicht in Exchange Online. Daher die Namensauflösung-Fehlermeldung.

**Lösungsschritte (der Reihe nach probieren):**

1. Konto entfernen und über „Erweiterte Optionen" → „Ich möchte mein Konto manuell einrichten" neu hinzufügen, damit Outlook nicht automatisch Richtung Microsoft 365 rät
2. Windows-Anmeldeinformationsverwaltung (Systemsteuerung → Benutzerkonten → Anmeldeinformationsverwaltung) öffnen und alle gespeicherten Zugangsdaten zu `info@allesausholz.de` bzw. `outlook.office365.com` entfernen, danach Outlook neu starten
3. Falls weiterhin Probleme: neues Outlook-Profil anlegen (Systemsteuerung → Mail → Profile anzeigen → Hinzufügen) und Konto darin neu einrichten
4. Bei der manuellen Einrichtung sicherstellen, dass tatsächlich „Exchange" (IONOS) und nicht „Outlook.com"/Microsoft 365 als Kontotyp ausgewählt wird

**Quelle:** [Microsoft Q&A – „Microsoft365 Single Abo, Die Aktion kann nicht abgeschlossen werden..."](https://learn.microsoft.com/de-de/answers/questions/4697726/microsoft365-single-abo-die-aktion-kann-nicht-abge)

## Notizen

- Alle vergebenen Passwörter sind in KeePass hinterlegt.
