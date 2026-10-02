# E-Rechnungspostfächer & DATEV-Weiterleitung

Ziel: Pro Firma ein eigenes Postfach für eingehende E-Rechnungen. Jedes Postfach
leitet automatisch an die DATEV-Eingangsadresse (Belegtransfer / DATEV Unternehmen
online) der jeweiligen Firma weiter.

## 1. Übersicht

| Firma | E-Rechnungspostfach | Postfach vorhanden | Weiterleitung an DATEV | Absender bei DATEV freigegeben |
|---|---|---|---|---|
| Maler Luft | faktura@maler-luft.de | ja | offen | offen |
| Energieberatung Kehm | rechnung@energieberatung-kehm.de | ja | offen | offen |
| DK Immobilien GmbH | rechnung@dkimmobiliengmbh.de | neu anzulegen? (klären) | offen | offen |

## 2. DATEV-Konten / Zuordnung (auszufüllen)

| Firma | Mandantennr. | Berater-Nr. | DATEV-Eingangsadresse | Freigegebene Absenderadresse | Bemerkung |
|---|---|---|---|---|---|
| Maler Luft | ? | ? | ? | faktura@maler-luft.de | |
| Energieberatung Kehm | ? | ? | ? | rechnung@energieberatung-kehm.de | |
| DK Immobilien GmbH | ? | ? | ? | rechnung@dkimmobiliengmbh.de | |

Weitere bestehende DATEV-E-Mail-Konten hier ergänzen und der jeweiligen Firma
zuordnen:

| Konto / Adresse | Zugeordnete Firma | Zweck |
|---|---|---|
| ? | | |

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

- Wo laufen die Postfächer (M365, IONOS o. Ä.)? Danach richten sich die Schritte
  für die Weiterleitung.
- Existiert `rechnung@dkimmobiliengmbh.de` bereits oder muss es angelegt werden?
- DATEV-Eingangsadressen und Mandantennummern der drei Firmen.
