# E-Rechnungspostfächer & DATEV-Weiterleitung

Ziel: Pro Firma ein eigenes Postfach für eingehende E-Rechnungen. Jedes Postfach
leitet automatisch an die DATEV-Eingangsadresse (Belegtransfer / DATEV Unternehmen
online) der jeweiligen Firma weiter.

## 1. Übersicht

| Firma | E-Rechnungspostfach | Postfach vorhanden | Weiterleitung an DATEV | Absender bei DATEV freigegeben |
|---|---|---|---|---|
| Maler Luft | faktura@maler-luft.de | ja | offen | offen |
| Energieberatung Kehm | rechnung@eb-kehm.de | angelegt (STRATO) | offen | offen |
| DK Immobilien GmbH | rechnung@dkimmobiliengmbh.de | angelegt (STRATO) | offen | offen |

## 2. DATEV-Konten / Zuordnung (auszufüllen)

| Firma | Mandantennr. | Berater-Nr. | DATEV-Eingangsadresse | Freigegebene Absenderadresse | Bemerkung |
|---|---|---|---|---|---|
| Maler Luft | ? | ? | 5c9df7d1-b974-43ce-89c5-652392a8edc0@uploadmail.datev.de | faktura@maler-luft.de | |
| Energieberatung Kehm | ? | ? | 6631caf3-784a-46cb-a3ba-7a47963cf11d@uploadmail.datev.de | rechnung@eb-kehm.de | |
| DK Immobilien GmbH | ? | ? | 19bdd967-fd63-46c9-afdb-ea6f6cba9658@uploadmail.datev.de | rechnung@dkimmobiliengmbh.de | |

Weitere bestehende DATEV-E-Mail-Konten hier ergänzen und der jeweiligen Firma
zuordnen:

| Konto / Adresse | Zugeordnete Firma | Zweck |
|---|---|---|
| ? | | |

## 2a. Neue Postfächer (STRATO)

| Firma | Adresse | Webmail-Login | Speicher |
|---|---|---|---|
| Energieberatung Kehm | rechnung@eb-kehm.de | rechnung@eb-kehm.de | 5 GB |
| DK Immobilien GmbH | rechnung@dkimmobiliengmbh.de | rechnung@dkimmobiliengmbh.de | 5 GB |

- Webmail: https://webmail.strato.com/appsuite/signin
- Server (SSL/TLS): IMAP `imap.strato.de` 993, POP3 `pop3.strato.de` 995,
  SMTP `smtp.strato.de` 465
- Passwörter: in KeePass (nicht im Repo ablegen).
- Hinweis: Die Kehm-Adresse lautet `rechnung@eb-kehm.de` (nicht
  `…@energieberatung-kehm.de`). Bitte E-Rechnungs-Absender/Lieferanten mit der
  richtigen Adresse versorgen.

### Weiterleitung bei STRATO einrichten

Im STRATO Kundenservice unter E-Mail → Postfach `rechnung@…` → Weiterleitung
(Menünamen können abweichen) bzw. alternativ im Webmail eine Regel
„Weiterleiten an" anlegen:

1. Ziel: die DATEV-Eingangsadresse der Firma (Tabelle 2).
2. Option „Kopie im Postfach behalten" aktivieren.
3. Speichern und mit einer Test-Mail inkl. PDF prüfen.

## 3. Checkliste je Firma

1. [ ] Postfach existiert und empfängt E-Mails (Test-Mail senden).
2. [ ] DATEV-Eingangsadresse der Firma ermitteln (DATEV Unternehmen online →
   Belege → E-Mail-Eingang) und in Tabelle 2 eintragen.
3. [ ] Weiterleitung einrichten (Regel oder Weiterleitung im Mailsystem, Original
   mit Anhang weiterleiten, Kopie im Postfach behalten).
4. [ ] Absenderadresse (das Postfach) bei DATEV als zulässiger Absender
   freigeben bzw. vom Steuerberater freigeben lassen.
5. [ ] Test: E-Rechnung (PDF und/oder XML, ZUGFeRD/XRechnung) senden und prüfen,
   dass sie in DATEV ankommt.
6. [ ] Postfach auf Rechnungsstellern/Lieferanten als Rechnungsadresse hinterlegen.

## 4. Hinweise

- Anhänge: DATEV verarbeitet nur zulässige Formate (PDF, XML u. a.); Mails mit
  anderen Anhängen oder reinem HTML-Text ohne Anhang werden nicht übernommen.
- Bei E-Rechnungen (XRechnung/ZUGFeRD) das XML unverändert mitweiterleiten.
- Die Weiterleitung muss die Absenderadresse des Postfachs verwenden, die bei
  DATEV freigegeben ist, nicht die des Rechnungsstellers.

## Offene Fragen

- Postfach für Maler Luft (`faktura@maler-luft.de`): ebenfalls bei STRATO?
- Mandanten- und Berater-Nr. der drei Firmen (Eingangsadressen sind eingetragen).
