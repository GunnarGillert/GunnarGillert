# Energiewerk – BAFA-Förderprozess für Fensterbauer (Maler Luft)

Skizze für ein Programm, das den wiederkehrenden BAFA-Förderprozess für die
Fensterbauer-Kunden von Maler Luft systematisiert: von der Stammdatenpflege
über die BAFA-Antragstellung und U-Wert-Prüfung bis zu Zuwendungsbescheid,
Rechnungsstellung und (soweit zulässig automatisiert) Kommunikation.
Aufbau und Aufteilung orientieren sich an **Parkwerk** (gleiches Baukasten-
Prinzip: Stammdaten ↔ Vorgang ↔ Dokumente ↔ Automatisierung).

**Status: Konzept-Skizze, noch keine Implementierung.**

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
alle anderen Schritte sind Automatisierungskandidaten.

## Kernentitäten (Datenmodell)

```
Fensterbauer               Kunde
  - ID, Name, Kürzel         - ID, Name, Adresse, Kontakt (E-Mail)
  - Kontakt (E-Mail/CC)      - Fensterbauer-ID (FK)
  - Aktiv/Inaktiv
        \                    /
         \                  /
              Vorgang (Förderfall)
              - ID (= BAFA-Vorgangs-/Projekt-ID sobald vorhanden)
              - Kunde-ID (FK), Fensterbauer-ID (FK)
              - Status (Enum, siehe unten)
              - Angebots-U-Werte + Prüfergebnis (Referenz auf Protokoll)
              - Bescheid-Betrag, Bescheid-Datum
              - Rechnungs-ID (FK), Verwendungsnachweis-Status
                    |
                    ├── Dokument[] (typisiert, siehe Ablage unten)
                    ├── Rechnung[] (E-Rechnungsformat)
                    └── Versandprotokoll[] (wer/was/wann/Freigabe durch wen)
```

**Vorgangsstatus (Enum)**: `Eingang` → `Stammdaten_angelegt` →
`Projektbeschreibung_erstellt` → `Antrag_gestellt` →
`U_Wert_geprueft` → `Vergabe_mitgeteilt` → `Bescheid_erhalten` →
`Rechnung_versendet` → `Umsetzung` → `Verwendungsnachweis_eingereicht` →
`Festgesetzt` → `Ausgezahlt` (plus `Abgebrochen`/`Nachfrage_offen` als
Ausnahmepfade).

Der Vorgang ist die zentrale Klammer – jedes Dokument, jede Mail und jede
Rechnung hängt eindeutig an genau einem Vorgang, jeder Vorgang eindeutig an
genau einem Kunden und einem Fensterbauer.

## Systemkomponenten

| Komponente | Aufgabe |
|---|---|
| **Stammdatenregister** | Fensterbauer-Liste (aktuell 3), Kunden-Liste, Zuordnung, E-Mail-Verteiler (To/CC je Fensterbauer) |
| **Dokumentablage (SharePoint)** | Zentrale Quelle für Angebote, Anträge, Bescheide, Rechnungen; Upload/Scan als Event-Trigger |
| **KI-Modul** | (a) U-Wert-Prüfung Angebot vs. BAFA-Merkblatt, inkl. Prüfprotokoll als Nachweis; (b) Bescheid-Parsing (Name, Betrag, Vorgangs-ID) |
| **Automatisierungs-/Workflow-Engine** | Reagiert auf Dokument-Ereignisse (z. B. "Bescheid erkannt" → Rechnung + Mails generieren), führt Statuswechsel im Vorgang nach |
| **Kommunikationsmodul** | IMAP-basierter Versand, Text-Templates + PDF-Anhänge, Freigabe-Schalter (manuell/straight-through) |
| **Rechnungsmodul** | Erstellung PDF im E-Rechnungsformat (ZUGFeRD/XRechnung-konform), Betrag aus Bescheid oder Vorkalkulation |
| **Portal-Interaktionsschicht** | Nur Statuspflege/Ablage der Portal-Ergebnisse (ID, PDF-Exporte); **kein** automatisierter Zugriff auf das BAFA-Portal, insbesondere nicht beim Verwendungsnachweis |

## Ablage- und Namenskonvention (SharePoint)

Vorschlag, damit Event-Trigger und KI-Suche zuverlässig funktionieren:

```
/Energiewerk
  /01_Fensterbauer
    /<Fensterbauer-Kürzel>/
  /02_Vorgaenge
    /<VorgangsID>_<Kundenname>/
      Angebot_<VorgangsID>.pdf
      Antrag_<VorgangsID>.pdf
      Bescheid_<VorgangsID>.pdf
      Rechnung_<VorgangsID>.pdf
      Zahlungsnachweis_<VorgangsID>.pdf
      Verwendungsnachweis_<VorgangsID>.pdf
      Protokoll_UWert_<VorgangsID>.pdf
```

Feste Regel: **Dateiname beginnt immer mit Dokumenttyp, endet immer mit der
Vorgangs-ID.** Das macht den Dateinamen selbst zum Trigger-Schlüssel
(Dokumenttyp) und zum Verknüpfungsschlüssel (Vorgangs-ID), unabhängig vom
Ordner.

## Automatisierungsgrad je Schritt

| Schritt | Auslöser | Automatisierungsgrad |
|---|---|---|
| Stammdaten anlegen | Auftragseingang | Teilautomatisch (Formular → Register) |
| Technische Projektbeschreibung / Antrag | – | **Manuell** (BAFA-Portal) |
| U-Wert-Prüfung | Angebot in Ablage | Automatisch (KI-Prüfung + Protokoll) |
| Mail "Vergabe möglich" | Antrag gestellt (Statuswechsel) | Automatisch, mit Freigabe-Schalter |
| Bescheid-Erkennung | Scan/Upload Bescheid | Automatisch (KI-Parsing) |
| Bescheid-Versand an Kunde/Fensterbauer | Bescheid erkannt | Automatisch, mit Freigabe-Schalter |
| Rechnungserstellung + Versand | Bescheid erkannt | Automatisch, mit Freigabe-Schalter |
| Verwendungsnachweis | Nach Umsetzung | **Manuell** (BAFA-Portal), Frist-Erinnerung automatisch |

## Rechte- und Versandlogik

- **Rollen**: Sachbearbeiter (Stammdaten/Vorgänge pflegen), Freigeber
  (schaltet automatisch generierte Mails/Rechnungen frei), Admin
  (Stammdaten Fensterbauer/Vorlagen).
- **To/CC-Logik**: automatisch aus Vorgang → Kunde-E-Mail (To) +
  zugeordneter Fensterbauer (CC), fest über die Stammdaten-Zuordnung, nicht
  manuell pro Mail gepflegt.
- **Freigabe-Schalter** pro Mailtyp: Start konservativ (jede
  automatisch generierte Mail geht zunächst in einen Freigabe-Posteingang),
  später "Straight-Through" für nachweislich risikoarme Typen (z. B.
  Eingangsbestätigung), niemals für Zahlungsrelevantes ohne Freigabe.
- **Protokollpflicht**: jeder automatisierte Versand und jede U-Wert-Prüfung
  wird revisionssicher protokolliert (wer/was/wann/Ergebnis) – dient als
  Compliance-Nachweis gegenüber BAFA-Anforderungen.

## Risiken / offene Punkte

- Fehlende oder uneinheitliche Stammdaten (Fensterbauer, Kunden) gefährden
  Zustellung und Zuordnung → Stammdatenregister ist Vorbedingung, nicht
  Nebenprodukt.
- Uneinheitliche Ablage/Benennung erschwert KI-Trigger →
  Namenskonvention muss vor Automatisierung stehen.
- E-Rechnungsformat muss rechtlich geprüfte Kriterien erfüllen (XRechnung/
  ZUGFeRD-Vorgabe klären).
- U-Wert-Prüfung per KI muss nachweisbar/regelkonform sein (Prompt +
  Merkblattversion + Ergebnis archivieren, nicht nur anzeigen).
- Verwendungsnachweis bleibt manueller Engpass/Single Point of Failure →
  eigene Kapazitätssteuerung/Fristen-Tracking nötig, losgelöst von der
  Automatisierung der übrigen Schritte.

## Offene Fragen (vor Umsetzung zu klären)

1. Liste der drei Fensterbauer inkl. Kontakt-E-Mails (To/CC-Logik).
2. Aktuelle Version des BAFA-Merkblatts als KI-Referenzdokument, plus wie
   oft/wodurch sich das Merkblatt ändern kann.
3. Konkrete Anforderung ans E-Rechnungsformat (XRechnung vs. ZUGFeRD,
   Pflichtfelder).
4. SharePoint-Standort/Bibliothek, in der `Energiewerk` angelegt werden
   soll, und bestehende Berechtigungsgruppen.
5. IMAP-Postfach für den Versand sowie gewünschter Freigabeprozess
   (wer gibt frei, welcher Kanal – Teams/Mail/App).
6. Wie weit Parkwerks bestehende Architektur (Code/Datenmodell) konkret
   wiederverwendet werden soll bzw. kann, sobald sie verfügbar ist.

## Nächste Schritte (Vorschlag, nach Freigabe der Skizze)

1. Phase 1: Stammdatenregister + Ordner-/Namenskonvention in SharePoint.
2. Phase 2: Trigger "Bescheid erkannt" → automatische Rechnung + Mails
   (mit Freigabe-Schalter).
3. Phase 3: KI-Pipeline U-Wert-Prüfung inkl. Prüfprotokoll.
4. Phase 4: Straight-Through-Versand für risikoarme Mailtypen, Frist-
   Erinnerung für Verwendungsnachweis.
