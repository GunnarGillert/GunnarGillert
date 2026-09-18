# Snipe-IT – Verwaltung Digitalfunkgeräte & Funkmeldeempfänger

Selbst gehostetes [Snipe-IT](https://snipeitapp.com/) (Open Source, AGPL) zur
Verwaltung der Digitalfunkgeräte und Funkmeldeempfänger, getrennt nach
Hauptamt und Ehrenamt. Läuft als Docker-Compose-Stack auf einem eigenen
Linux-Server, extern erreichbar ausschließlich über den **Microsoft Entra
Application Proxy** (kein öffentlicher Port am Server selbst).

## Architektur

```
Nutzer (Browser)
   |  https://assets.<eure-domain>
   v
Microsoft Entra ID (Pre-Authentication, SSO)
   |
   v
Entra Application Proxy Connector (im internen Netz installiert)
   |  http://<Snipe-IT-Server>:8080
   v
Docker Compose: snipeit-app (Snipe-IT/PHP) + snipeit-db (MariaDB)
```

Die Trennung Hauptamt/Ehrenamt erfolgt **innerhalb** von Snipe-IT über die
Companies-Funktion (Kapitel weiter unten) – nicht durch getrennte Instanzen.

## Voraussetzungen

- Neuer Linux-Server/VM (Debian/Ubuntu empfohlen), mind. 2 vCPU / 4 GB RAM /
  20 GB Disk für den Anfang.
- Docker Engine + Docker-Compose-Plugin installiert:
  ```bash
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER   # neu einloggen danach
  docker compose version          # sollte v2.x anzeigen
  ```
- Ein DNS-Name für den späteren öffentlichen Zugriff (z. B.
  `assets.drkbuedingen.de`), auch wenn dieser nur beim Entra Application
  Proxy hinterlegt wird und nicht direkt auf den Server zeigt.
- Zugriff auf einen Microsoft Entra ID Tenant mit **Entra ID P1**-Lizenz (für
  Application Proxy und SAML-SSO nötig) sowie Rechte, Enterprise-Anwendungen
  anzulegen.

## Installation

1. Dieses Verzeichnis auf den Server kopieren bzw. dort auschecken:
   ```bash
   git clone https://github.com/GunnarGillert/GunnarGillert.git
   cd "GunnarGillert/DRK Büdingen/Snipe-IT"
   ```
2. `.env` aus der Vorlage anlegen:
   ```bash
   cp .env.example .env
   ```
3. `DB_PASSWORD`, `DB_ROOT_PASSWORD` in der `.env` auf starke, zufällige
   Passwörter setzen (z. B. `openssl rand -base64 32`).
4. `APP_URL` auf die spätere öffentliche HTTPS-Adresse setzen (siehe oben,
   z. B. `https://assets.drkbuedingen.de`) – auch wenn diese Adresse noch
   nicht existiert, muss sie jetzt schon feststehen.
5. Container starten (Datenbank wird beim ersten Start automatisch
   initialisiert):
   ```bash
   docker compose up -d
   ```
6. `APP_KEY` erzeugen und in die `.env` eintragen:
   ```bash
   docker compose run --rm snipeit-app php artisan key:generate --show
   # Ausgabe (Format base64:...) in .env bei APP_KEY= eintragen
   docker compose up -d   # neu starten, damit der Key greift
   ```
7. Erreichbarkeit lokal prüfen, bevor der Application Proxy eingerichtet
   wird:
   ```bash
   curl -I http://127.0.0.1:8080
   ```

## Ersteinrichtung in Snipe-IT

Solange der Application Proxy noch nicht steht, per SSH-Tunnel testen:

```bash
ssh -L 8080:127.0.0.1:8080 <user>@<server>
# dann lokal im Browser: http://127.0.0.1:8080
```

Der Setup-Assistent führt durch Admin-Account, Firmenname, Locale (Deutsch,
Europe/Berlin ist über die `.env` schon vorbelegt).

## Companies-Feature: Trennung Hauptamt / Ehrenamt

Das ist der zentrale Mechanismus, damit Ehrenamt-Verwaltungspersonen **nur**
Ehrenamt-Geräte sehen:

1. **Admin → Einstellungen → Allgemein**: "Multiple Company Support"
   aktivieren.
2. Dort zusätzlich **"Full Multiple Company Support"** aktivieren. Erst das
   sorgt dafür, dass Nicht-Superadmin-Nutzer nur noch Assets ihrer eigenen
   Company sehen – ohne diese Option ist "Company" nur ein Info-Feld ohne
   Zugriffsbeschränkung.
3. **Admin → Firmen**: zwei Einträge anlegen, z. B. `Hauptamt` und
   `Ehrenamt`.
4. Beim Anlegen/Import jedes Digitalfunkgeräts und Funkmeldeempfängers die
   passende Company setzen (Pflichtfeld – am besten bei den Asset-Models
   vorbelegen oder beim CSV-Import mitgeben, damit nichts falsch zugeordnet
   wird).
5. **Admin → Benutzer**: für jede Verwaltungsperson die Company setzen
   (Ehrenamt-Verwaltungspersonen → Company `Ehrenamt`).
6. **Admin → Berechtigungsgruppen**: eine Gruppe z. B. `Ehrenamt-Verwaltung`
   mit den benötigten Rechten (Assets ansehen/ausgeben/zurücknehmen o. ä.,
   aber **ohne** "Superuser" oder "View all companies") anlegen und den
   Ehrenamt-Verwaltungspersonen zuweisen. Hauptamt-Verwaltungspersonen
   entsprechend einer eigenen Gruppe, ggf. mit "View all companies", falls
   sie auch das Ehrenamt sehen sollen dürfen.

**Wichtig:** Superadmin-Konten sehen unabhängig von der Company immer alles –
diese Rolle daher nur an wenige zentrale IT-Verantwortliche vergeben, nicht
an die Verwaltungspersonen selbst.

## Microsoft Entra ID SSO (SAML) einrichten

1. Im Entra Admin Center: **Enterprise-Anwendungen → Neue Anwendung →
   Eigene Anwendung erstellen** → "Andere Anwendung, die Sie nicht in der
   Katalogliste finden" → SSO-Modus **SAML**.
2. Basis-SAML-Konfiguration:
   - **Entity ID**: `<APP_URL>` (aus der `.env`)
   - **Reply URL (ACS URL)**: `<APP_URL>/saml/acs`
   - **Sign-on URL**: `<APP_URL>/login`
3. Zertifikat der App herunterladen (Base64) sowie App Federation Metadata
   URL notieren.
4. In Snipe-IT: **Admin → Einstellungen → SAML**
   - SAML aktivieren
   - IdP Metadata URL bzw. Zertifikat/Entity-ID/SSO-URL aus Entra eintragen
   - Attribut-Mapping: mind. E-Mail-Adresse und Anzeigename mappen
5. Nutzerzuweisung in Entra: unter der Enterprise-App → **Benutzer und
   Gruppen** die zwei Azure-AD-Gruppen (z. B. `SnipeIT-Hauptamt`,
   `SnipeIT-Ehrenamt`) zuweisen. Optional, aber empfohlen: per
   Attribut-Mapping die Gruppenmitgliedschaft als SAML-Claim mitsenden, damit
   künftige Snipe-IT-Versionen/Provisioning die Company-Zuordnung direkt aus
   Azure AD übernehmen können. Bis dahin: Company weiterhin manuell in
   Snipe-IT je Nutzer pflegen (Schritt 5 oben).

## Microsoft Entra Application Proxy einrichten

1. **Entra Admin Center → Application Proxy**: Application Proxy aktivieren
   (Tenant-weit, einmalig).
2. **Connector installieren**: auf einem Windows-Server im internen Netz
   (Konnektivität zum Snipe-IT-Server muss gegeben sein) den "Application
   Proxy Connector" installieren und mit dem Tenant verbinden. Läuft bei
   euch bereits ein für diesen Zweck geeigneter Server in der Domäne
   `drkbuedingen.local` (siehe `Update-DrkServers.ps1` in diesem Repo für die
   vorhandene Serverliste), bietet sich dieser an.
3. Bei der oben erstellten Enterprise-Anwendung: **Application Proxy**
   konfigurieren:
   - **Interne URL**: `http://<Snipe-IT-Server-IP-oder-Name>:8080`
   - **Externe URL**: `https://assets.drkbuedingen.de` (muss zu `APP_URL`
     in der `.env` passen)
   - **Pre-Authentication**: "Microsoft Entra ID" (nicht "Passthrough") –
     damit findet der Login/die SSO-Prüfung **vor** dem Erreichen von
     Snipe-IT statt.
4. Test: externe URL im Browser aufrufen → Entra-Login → Weiterleitung zu
   Snipe-IT. Danach greift zusätzlich das SAML-Login *innerhalb* von
   Snipe-IT (Schritt oben) für die Benutzer-Zuordnung/Session.
5. Optional, aber empfohlen: **Bedingter Zugriff** (Conditional Access) auf
   diese Enterprise-App anwenden (z. B. MFA erzwingen, Zugriff nur von
   verwalteten/kompatiblen Geräten oder bestimmten Standorten).

## Backup (TerraCloud)

Die eigentliche Datensicherung übernimmt **TerraCloud Backup** – nicht ein
eigenes Skript. TerraCloud sichert Dateien/Ordner vom Host, daher liegen
Datenbank und Uploads bewusst in Host-Ordnern statt in unsichtbaren
Docker-internen Volumes:

| Ordner | Inhalt | In TerraCloud einplanen? |
|---|---|---|
| `./dumps/` | Tägliche komprimierte SQL-Dumps der Datenbank (`db-dump.sh`) | ✅ ja |
| `./data/uploads/` | Hochgeladene Dateien (Fotos, Lizenzdateien, Anhänge) | ✅ ja |
| `./data/db/` | Laufende MariaDB-Datendateien | ❌ nein – laufende Datenbankdateien im Dateibetrieb zu sichern kann ein inkonsistentes Backup ergeben; dafür dient der Dump in `./dumps/` |
| `.env` | Enthält Datenbank-Passwörter/App-Key | ✅ ja, aber **verschlüsselt/Zugriff eingeschränkt** ablegen (Secret!) |

Schritte:

1. `db-dump.sh` erzeugt einen konsistenten Datenbank-Dump nach `./dumps/`
   (Datei-Backup einer laufenden Datenbank wäre sonst potenziell
   inkonsistent). Als tägliche Cron-Aufgabe einrichten, zeitlich **vor** dem
   TerraCloud-Lauf:
   ```bash
   chmod +x db-dump.sh
   crontab -e
   # Dump jede Nacht um 02:00 Uhr, TerraCloud-Lauf z. B. 03:00 Uhr
   0 2 * * * cd /pfad/zu/"DRK Büdingen/Snipe-IT" && ./db-dump.sh >> dumps/db-dump.log 2>&1
   ```
2. In der TerraCloud-Konsole eine Sicherungsaufgabe für diesen Server
   anlegen, die die Ordner `./dumps/`, `./data/uploads/` und `.env` erfasst
   (Pfade oben entsprechend dem tatsächlichen Ablageort auf dem Server
   anpassen, z. B. `/opt/snipeit/dumps`).
3. Restore-Test nach Einrichtung einmal durchspielen (siehe unten) – ein
   ungetestetes Backup ist kein verlässliches Backup.

### Wiederherstellung

```bash
# Datenbank aus TerraCloud-wiederhergestelltem Dump zurückspielen
gunzip -c dumps/snipeit-db_<timestamp>.sql.gz | \
  docker compose exec -T snipeit-db mariadb -u root -p"$DB_ROOT_PASSWORD" "$DB_DATABASE"

# Dateianhänge: TerraCloud stellt ./data/uploads direkt wieder her,
# danach reicht ein Neustart der Container
docker compose up -d
```

## Updates

```bash
docker compose pull
docker compose up -d
```

Vor größeren Versionssprüngen immer zuerst einen Dump erstellen
(`./db-dump.sh`) und die
[Snipe-IT-Release-Notes](https://github.com/snipe/snipe-it/releases) auf
Breaking Changes prüfen.
