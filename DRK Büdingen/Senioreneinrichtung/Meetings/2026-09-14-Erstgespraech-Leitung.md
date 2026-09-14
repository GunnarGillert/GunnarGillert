# Erstgespräch mit der Einrichtungsleitung

**Datum:** 2026-09-14
**Teilnehmer:** Gunnar, Einrichtungsleitung (u. a. zu Frau Kuhn, Herrn Beißer, Herrn Thomas)

## Übersicht

Das Gespräch behandelte wiederkehrende Netzwerk- und WLAN-Probleme in der Einrichtung:
nächtliche Netzwerk-Ausfälle durch große Backup-Transfers, langsame/instabile
WLAN-Verbindungen in zu Büros umgewidmeten Räumen (ehemalige Lagerräume) sowie Zugriffs- und
Organisationsfragen zu E-Mail-Accounts und gemeinsamen Dateiablagen. Vor Ort sind eine alte
Telekom-Digibox, eine FritzBox und eine SecurePoint-Firewall im Einsatz; die
WLAN-Ausleuchtung ist historisch gewachsen und unvollständig.

Hauptprobleme: nächtliche Netzausfälle wegen externer Backups, tagsüber langsames/instabiles
WLAN (u. a. für Medifox) und fehlende strukturierte IT-Organisation (z. B. zentrale Ablagen
für „Leitung Soziale Betreuung").

Ziel: Entlastung des Netzwerks durch Cloud-Backups, schrittweiser Austausch veralteter
Hardware, strukturiertes LAN-Verkabelungsprojekt für feste Arbeitsplätze, temporäre
Leitungsüberwachung sowie Einrichtung zentraler Zugriffs- und Ordnerstrukturen.

## Hintergrund

- Nächtliche Backups vom Kreisverband werden „runtergeschoben" und überlasten die Leitung;
  geplant ist die Umstellung: Backup direkt in die Cloud, um den nächtlichen Traffic zum
  Standort zu eliminieren.
- Vorhandene Infrastruktur: alte Telekom-Digibox („richtig alt") soll ersetzt werden; hinter
  der FritzBox hängt SecurePoint, die das Haus-Netz organisiert und freie Ports hat.
- WLAN wurde nie korrekt ausgeleuchtet; Access Points wurden „irgendwo" platziert; bauliche
  Faktoren (Stahl in Wänden, Brandschutzabschnitte) beeinträchtigen das Signal.
- Räume wurden aus Lagern zu Büros umgewidmet, ohne passende IT-Vorbereitung
  (LAN/Dosen/Brandschotts).
- Tagsüber treten Ausfälle auf; geplant ist eine „Überwachungsbox" zur Messung (Google
  erreichbar vs. Kreisverband erreichbar), um Segment-/Leitungsprobleme zu isolieren.
- E-Mail/Zugriff: Frau Kuhn (Leitung Soziale Betreuung) längere Krankheit; Passwortrücksetzung
  und Zugriff für Herrn Beißer erforderlich; Umstellung auf Funktionsordner/SharePoint für
  zentrale Zusammenarbeit.
- Arbeitsweise: Für stationäre Arbeitsplätze wird Kabel (LAN) bevorzugt, WLAN hauptsächlich
  für Tablets/Mobilgeräte.

## Schmerzpunkte

### 1. Nächtliche Netzwerküberlastung durch große Backup-Transfers vom Kreisverband

Die nächtlichen externen Backups sind so datenintensiv, dass das Netzwerk „zugeht" und der
Standort nachts „nicht mehr rauskommt".

- **Impact:** Nächtliche Erreichbarkeit bricht ein, potenzielle Auswirkungen auf zeitkritische
  Dienste/Updates; vereinzelt „Glück", wenn Segmente anders hängen oder Reserven bestehen.
- **Aktuelle Situation:** Backup wird im Kreisverband erstellt und nachts an den Standort
  übertragen; Datenmenge ist „so groß geworden", dass es spürbar ist.
- **Metriken:** Keine spezifischen Zahlen; qualitative Feststellung wiederkehrender
  nächtlicher Ausfälle.
- **Beispiel:** „Manchmal habt ihr noch mal Glück … genügend Reserven."
- **Kontext:** Infrastruktur zwischen Kreisverband und Standort; Bandbreitenbegrenzung; keine
  Deduplikation/Optimierung erwähnt.
- **Stakeholder:** IT/Administration, Mitarbeitende mit nächtlichen Prozessen, ggf. externe
  Systeme, Kreisverband.

### 2. Instabiles/langsames WLAN in umgewidmeten Büros (ehemalige Lagerräume)

WLAN-Verbindungen sind unzuverlässig und schwankend, besonders in Räumen mit
dicken/brandschutzrelevanten Wänden; zwei Mitarbeiterinnen (Praxisanleiterin und QM) sowie
weitere (z. B. Frau Kudic, Nachbarin) können „dauerhaft" nicht vernünftig arbeiten.

- **Impact:** Produktivitätsverlust, Klicks reagieren nicht, Systeme (Medifox) sehr langsam,
  bei zwei Personen „geht meistens gar nichts mehr"; Frustration seit „letztem Jahr".
- **Aktuelle Situation:** Provisorische WLAN-Nutzung; keine saubere Ausleuchtung;
  Repeater/Verstärker sind bei schlechtem Grundsignal nicht zielführend; bessere Verbindung
  nur durch physisches Umstellen im Raum.
- **Metriken:** Messhinweis: „muss normalerweise schon unter 10 sein, und Sie hängen hier bei
  15" (vermutlich Latenz-/Signalmetrik) → 15 statt < 10.
- **Beispiele:** Frau Kudic im ehemaligen Lager; im Wohnbereich 1 ähnliche Lage; bei Bewegung
  in Richtung besseren Empfangs wird es „besser arbeiten".
- **Kontext:** Brandschutzabschnitte, abgehängte Decken, Stahl in Wänden; historisch
  gewachsene AP-Platzierung; fehlende vorbereitete LAN-Dosen.
- **Stakeholder:** Praxisanleiterin, QM, Frau Kudic, Nachbarin, weitere Büro-Mitarbeitende, IT.

### 3. Veraltete/unnötige Netzwerk-Hardware und unklare Gerätekaskaden

Die alte Telekom-Digibox ist „richtig alt" und soll ersetzt werden; gleichzeitige FritzBox und
SecurePoint im Einsatz führen zu Gerätemehrung und potenzieller Komplexität.

- **Impact:** Erhöhte Ausfall-/Fehleranfälligkeit, unnötige Komplexität, potenzieller
  Flaschenhals; beeinflusst WLAN-/Netzwerksituation.
- **Aktuelle Situation:** SecurePoint hat freie Ports und „macht eigentlich alles hier im
  Haus"; Ziel: Digibox einsparen und Funktionen über SecurePoint abbilden.
- **Beispiel:** „Haben wir wieder ein Gerät weniger."
- **Kontext:** Konsolidierung, Vereinfachung der Netzstruktur.
- **Stakeholder:** IT, alle Mitarbeitenden, externe Supporter.

### 4. Fehlende strukturierte Dateiablage und Zugriffsverwaltung (E-Mail/SharePoint)

Frau Kuhn speichert „alles auf dem Desktop"; Herr Beißer braucht Zugriff auf den Account;
fehlende Schulung in der Nutzung zentraler Ablagen für Funktionsbereiche.

- **Impact:** Single-Point-of-Failure, fehlende Vertretungsfähigkeit, ineffiziente
  Zusammenarbeit; Risiken bei Krankheit/Abwesenheit.
- **Aktuelle Situation:** Passwort-Rücksetzung und Weitergabe geplant; Anlegen eines
  A&P-Ordners „Soziale Betreuung" mit Mehrpersonen-Zugriff; Schulungsbedarf.
- **Metriken:** „Schon seit einigen Monaten krank" (keine exakten Zahlen).
- **Beispiele:** Funktionspostfach/SharePoint, OneDrive vs. Desktop-Nutzung.
- **Kontext:** Umstellung auf zentrale Arbeitsweise; Governance nötig.
- **Stakeholder:** Leitung Soziale Betreuung (Frau Kuhn), Herr Beißer, IT, Team Soziale
  Betreuung.

### 5. Fehlende systematische Planung für zukünftige Büros und Netzwerkinfrastruktur

Umwidmung von Räumen ohne IT-Planung; Brandschotts/Brandschutzanforderungen erschweren
nachträgliche Kabelverlegung.

- **Impact:** Wiederkehrende Ad-hoc-Arbeiten, höhere Kosten/Aufwände, Verzögerungen;
  Qualitätseinbußen bei IT-Versorgung.
- **Aktuelle Situation:** Vorschlag, vorausschauend Kabel in abgehängten Decken vorzuhalten
  (z. B. 2 Meter Reserve), Planung, welche Räume künftig Büros werden; Brandschutz-Zertifikate
  (Hilti) und Dokumentation erforderlich.
- **Metriken:** Kabelkosten-Hinweis: „50 Cent" pro Meter; Brandschutzprüfung typischerweise
  nach „10" oder „15 Jahren" (unsicher im Gespräch).
- **Beispiele:** „Nicht einfach nur für den einen Raum … nächstes Mal wieder anderes";
  Aufkleber mit Mörteltyp, Unterschrift.
- **Kontext:** Neubau mit späteren Änderungen; Behördenanforderungen (Wetteraukreis).
- **Stakeholder:** Haustechnik/Hausmeister, IT, Bau-/Brandschutzbeauftragte, Verwaltung,
  zukünftige Mitarbeitende in neuen Büros.

## Erwartungen

### 1. Umstellung der Backups in die Cloud

Das nächtliche Backup soll künftig nur in die Cloud laufen, damit nachts nichts mehr zum
Standort übertragen wird.

- **Zeitrahmen:** kurzfristig, nächster Schritt, hohe Priorität
- **Ressourcen:** Cloud-Backup-Lösung, Bandbreiten-/Policy-Anpassungen, ggf.
  Deduplikation/Throttle
- **Erfolgskriterien:** keine nächtlichen Ausfälle, stabile Erreichbarkeit, Monitoring
  bestätigt Entlastung
- **Stakeholder:** IT/Kreisverband, Standort-IT, betroffene Mitarbeitende

### 2. Austausch/Konsolidierung von Netzwerk-Hardware

Veraltete Telekom-Digibox soll entfernt/ersetzt werden; Funktionen möglichst über SecurePoint
abbilden, Gerätezahl reduzieren.

- **Zeitrahmen:** schrittweise („Stufe für Stufe"), nach Cloud-Backup-Umstellung
- **Ressourcen:** Hardware-Beschaffung/Konfiguration, Test, Rollout
- **Erfolgskriterien:** stabileres Netz, weniger Geräte, keine Funktionsverluste
- **Stakeholder:** IT, Lieferanten/Telekom, Nutzende

### 3. Strukturierte LAN-Verkabelung für feste Arbeitsplätze

Für Arbeitsplätze mit Dauerbetrieb sollen LAN-Kabel installiert werden; WLAN primär für
Tablets. Übergangslösungen bis Projektabschluss sind nötig.

- **Zeitrahmen:** geplantes Wochenend-Assessment vor Ort, danach Umsetzung; kurzfristig
  Übergang für Mitarbeitende wie Frau Kutsch
- **Ressourcen:** Kabel, Kabelkanäle, Brandschutzkit, Hilti-Zertifizierung, Raumliste/Planung,
  Personal
- **Erfolgskriterien:** stabile, schnelle Verbindungen, keine Klick-Verzögerungen, Messwerte
  < 10 (statt 15)
- **Stakeholder:** Praxisanleiterin, QM, Frau Kudic, Nachbarin, IT, Hausmeister/Brandschutz

### 4. Überwachungsbox zur Ausfall-Diagnose tagsüber

Kleine Monitoring-Box soll Ausfälle und Erreichbarkeit (Google vs. Kreisverband) protokollieren.

- **Zeitrahmen:** kurzfristig, parallel zur Hardware-/Backup-Umstellung
- **Ressourcen:** Monitoring-Gerät, Netztests, Logging/Alarmierung
- **Erfolgskriterien:** klare Identifikation von Leitungs-/Segmentproblemen, belastbare Logs
- **Stakeholder:** IT, Standort-Administration

### 5. Zentrale E-Mail- und Dateiablage für „Leitung Soziale Betreuung"

Zugriff für Herrn Beißer auf den Account von Frau Kuhn, Passwort-Rücksetzung; Einrichtung
eines A&P-Ordners „Soziale Betreuung"; Schulung in zentraler Ablagepraxis.

- **Zeitrahmen:** kurzfristig nach Erhalt der „freundlichen E-Mail" mit CC an Herrn Thomas
- **Ressourcen:** Admin-Rechte, SharePoint/OneDrive-Konfiguration, Schulungsunterlagen/Handbuch
- **Erfolgskriterien:** Mehrpersonen-Zugriff funktionsfähig, keine lokale
  Desktop-Abhängigkeit, geordnete Ablage
- **Stakeholder:** Frau Kuhn, Herr Beißer, IT, Team Soziale Betreuung

## Sonstige Informationen

- WLAN-Verstärker sind nur sinnvoll, wenn das Grundsignal gut ist; ein schlechtes Signal zu
  verstärken „bringt nichts".
- Bauliche Details: dicke/Brandschutz-Wände blocken Signale; pro Brandschutzabschnitt sind
  eigene Lösungen nötig.
- Abgehängte Decken erleichtern Kabelverlegung; Brandschotts müssen fachgerecht
  geöffnet/geschlossen werden, inkl. Dokumentation/Aufkleber/Unterschrift.
- Medifox-Leistung hängt mit WLAN-/Netzqualität zusammen; bei zwei Personen im Raum
  verschlechtert sich die Performance erheblich.
- Gunnar plant KI-gestützte Handbücher/Anleitungen, um Wissenslücken zu schließen und
  Nachschlagewerke bereitzustellen.
- VPN-Zugang für Frau Matthäus ist eingerichtet; funktioniert analog zu anderen.
- Messhinweis: Zielwerte „unter 10", aktueller Zustand „15" (vermutlich Latenz-/
  Response-Metrik).

## Aufgabenliste

Siehe [`../Aufgaben.md`](../Aufgaben.md) für die laufend gepflegte, priorisierte
Aufgabenliste mit Verantwortlichkeiten und Fristen.
