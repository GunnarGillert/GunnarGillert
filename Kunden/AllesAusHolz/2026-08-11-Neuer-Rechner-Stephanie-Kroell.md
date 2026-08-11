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
- [ ] Passwort für `allesausholz@yahoo.de` in KeePass ablegen

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

## Notizen

- Alle vergebenen Passwörter sind in KeePass hinterlegt.
