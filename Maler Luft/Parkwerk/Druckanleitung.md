# Parkwerk – Druckanleitung

Kurzanleitung fürs tägliche Drucken im Parkraumprogramm „Parkwerk"
(`GunnarGillert/maler_luft`, Ordner `Parkraumprogramm`). Richtet sich an alle,
die Anschreiben, Halteranfragen oder Sammelausdrucke drucken, ohne selbst am
Programm zu entwickeln – die vollständige technische Doku steht im README des
Programms.

Voraussetzung: Am Rechner ist ein Drucker eingerichtet und im
Browser-Druckdialog auswählbar. Parkwerk erzeugt zum Drucken jeweils ein PDF
im Browser; gedruckt wird über den normalen Browser-/PDF-Druckdialog (nicht
über eine eigene Druckfunktion von Parkwerk).

## 1. Einzelnes Anschreiben drucken

1. Reiter **Fälle** → den Fall anklicken.
2. In der Fall-Detailansicht bei **„Anschreiben"**: passende Vorlage
   auswählen (z. B. Verwarnung, Mahnung, Halteranfrage – je nach Bearbeitungsstand).
3. Button **„PDF erzeugen & drucken"** klicken. Parkwerk öffnet das erzeugte
   PDF in einem neuen Tab bzw. startet den Druckdialog.
4. Im Druckdialog Drucker wählen und drucken.
5. **Wichtig:** Falls der Versand nicht direkt per E-Mail aus Parkwerk
   erfolgt (nur möglich, wenn beim Halter eine E-Mail-Adresse hinterlegt ist),
   danach im Fall auf **„Als versendet markieren"** klicken. Erst dadurch
   beginnt die Zahlungsfrist zu laufen – ohne diesen Schritt läuft die Frist
   nicht und der Fall bleibt technisch „offen".

## 2. Sammelausdruck (mehrere Anschreiben auf einmal)

Sinnvoll, wenn mehrere Fälle mit bekannter Halteradresse zum Versand bereit
sind, statt jeden Fall einzeln zu öffnen.

1. Reiter **Fälle** → Button **„Sammelausdruck"** oben rechts in der Liste.
2. Parkwerk fasst automatisch alle Fälle mit bekannter Halteradresse, die
   noch nicht versendet wurden, in **einem** PDF zusammen (eine Seite pro
   Fahrzeug).
3. Button **„Sammelanfrage erstellen & PDF erzeugen"** bzw. **„PDF erzeugen &
   drucken"** klicken.
4. Das PDF wird gesammelt gedruckt (ein Druckvorgang statt vieler einzelner).
5. Optional lassen sich danach alle enthaltenen Fälle gesammelt als
   „versendet" markieren – Haken im Dialog setzen, bevor der PDF-Ausdruck
   bestätigt wird. Wurde das übersprungen, muss jeder Fall wie unter
   Abschnitt 1 einzeln als versendet markiert werden.
6. Das erzeugte Sammelschreiben lässt sich später jederzeit erneut öffnen:
   in der Fall- bzw. Sammelausdruck-Ansicht über den Link „Sammelschreiben
   (PDF) erneut öffnen".

## 3. Halteranfrage ans Kraftfahrt-Bundesamt (KBA) drucken

Nötig, solange der Halter eines Fahrzeugs noch nicht bekannt ist.

**Einzelne Anfrage:**
1. Fall-Detailansicht → bei „Anschreiben" die Vorlage **„Halteranfrage"**
   wählen.
2. **„PDF erzeugen & drucken"** – erzeugt ein formloses Anfrageschreiben nach
   § 39 StVG.
3. Ausdrucken und postalisch ans KBA schicken (das KBA antwortet
   ausschließlich per Post, aktuell 5,10 € Gebühr je Fahrzeug).

**Sammelanfrage für mehrere Fälle:**
1. Reiter **Halterabfragen** → **„+ Neue Sammelanfrage"**.
2. Alle betroffenen Fälle auswählen (oder „Alle markieren").
3. Parkwerk erzeugt **ein** Schreiben mit einer Anlage-Tabelle aller
   ausgewählten Fahrzeuge (Kennzeichen, Ort/Parkfläche, Ein-/Ausfahrtszeit)
   statt eines Schreibens je Fall.
4. Ausdrucken und ans KBA schicken.
5. Antwortet das KBA (Stapel Einzelblätter), diesen Stapel als **ein** PDF
   einscannen und in der jeweiligen Sammelanfrage hochladen (Drag & Drop).
   Parkwerk liest Kennzeichen, Name und Adresse je Seite automatisch per
   Texterkennung aus – **jede Seite muss trotzdem einzeln geprüft und über
   „Freigeben & übernehmen" bestätigt werden**, bevor die Daten tatsächlich
   in den jeweiligen Fall übernommen werden.

## 4. Antwortschreiben an den Halter drucken

Wenn der Halter geantwortet hat (Einspruch, Rückfrage o. Ä.):

1. Fall-Detailansicht → unter **„Kundenantworten"** die Rückmeldung
   hinterlegen (E-Mail-Text einfügen, Brief/Foto hochladen oder
   E-Mail-Datei per Drag & Drop).
2. Bei **„Antwort verfassen"** den Antworttext erstellen (optional mit
   KI-Textvorschlag) – oder die Vorlage „Antwortschreiben auf
   Kundenrückmeldung" verwenden, die die Rückmeldung automatisch im PDF
   zitiert.
3. **„PDF erzeugen & drucken"** – wie gewohnt drucken oder direkt per E-Mail
   versenden.

## Typische Stolperfallen

- **Frist läuft nicht:** Nach dem Ausdrucken vergessen, den Fall als
  „versendet" zu markieren. Ohne diesen Klick beginnt die Zahlungsfrist
  nicht zu laufen.
- **Druckdialog öffnet sich nicht:** Meist blockiert der Browser das
  automatische Öffnen des PDF-Tabs (Pop-up-Blocker). Für die Parkwerk-Seite
  Pop-ups erlauben.
- **Sammelausdruck enthält unerwartet wenige/viele Fälle:** Der
  Sammelausdruck nimmt automatisch **alle** Fälle mit bekannter
  Halteradresse, die noch nicht versendet wurden – nicht nur eine manuell
  gewählte Auswahl. Fälle, die nicht mit sollen, vorher einzeln bearbeiten
  oder als versendet markieren.

## Weiterführend

Die vollständige Hilfe zum gesamten Ablauf (nicht nur Drucken) steht direkt
in Parkwerk im Reiter **Hilfe** sowie in der technischen Dokumentation im
Repository `GunnarGillert/maler_luft` (`Parkraumprogramm/README.md`).
