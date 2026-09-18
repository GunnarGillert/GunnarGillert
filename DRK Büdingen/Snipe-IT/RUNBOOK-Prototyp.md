# Runbook: Snipe-IT-Prototyp auf Ubuntu (mit TLS)

Ziel: Snipe-IT auf einem frischen Ubuntu-Server zum Testen aufsetzen, per
HTTPS im Browser erreichbar (selbstsigniertes Zertifikat) – rein für den
internen Prototyp, **kein öffentlicher DNS-Name, kein Internetzugriff
nötig**. Companies-Feature (Hauptamt/Ehrenamt) und SAML/Entra-Anbindung
können auf dieser Basis getestet werden, bevor der Produktivbetrieb über
Microsoft Entra Application Proxy aufgesetzt wird (siehe `README.md`).

Geschätzte Dauer: 20–30 Minuten.

## Voraussetzungen

- Frischer Server/VM mit **Ubuntu Server 22.04 LTS oder 24.04 LTS**
  (2 vCPU / 4 GB RAM / 20 GB Disk reichen für den Prototyp).
- SSH-Zugriff mit einem Benutzer, der `sudo`-Rechte hat.
- Server ist im internen Netz erreichbar (Ping/SSH von deinem Arbeitsplatz
  aus funktioniert).

## Schritt 1: Ubuntu vorbereiten

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl ca-certificates
```

Server-IP notieren (wird gleich für den Browser-Zugriff gebraucht):

```bash
hostname -I
```

## Schritt 2: Docker installieren

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
```

Danach einmal aus- und wieder einloggen (oder `newgrp docker`), damit die
Gruppenmitgliedschaft greift. Prüfen:

```bash
docker compose version   # sollte Docker Compose v2.x anzeigen
```

## Schritt 3: SSH-Key-Login einrichten (empfohlen)

Statt mit Passwort meldest du dich künftig mit einem SSH-Schlüsselpaar an –
deutlich sicherer, da kein Passwort mehr über das Netz übertragen wird und
Brute-Force-Angriffe auf SSH ins Leere laufen.

**Auf deinem Arbeitsplatz-Rechner** (nicht auf dem Server!) – falls noch
kein Schlüssel vorhanden ist:

```bash
ssh-keygen -t ed25519 -C "snipe-it-admin@drkbuedingen"
```

Vorgeschlagenen Speicherort mit Enter bestätigen, eine Passphrase vergeben
(schützt den privaten Schlüssel zusätzlich, falls der Rechner kompromittiert
wird).

Öffentlichen Schlüssel auf den Server übertragen (ersetzt `<server-ip>`):

```bash
# Linux/macOS:
ssh-copy-id snipe-it-admin@<server-ip>

# Falls ssh-copy-id nicht verfügbar ist (u. a. Windows/PowerShell):
cat ~/.ssh/id_ed25519.pub | ssh snipe-it-admin@<server-ip> "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

**Wichtig – vor dem Deaktivieren von Passwort-Login testen:** in einem
**neuen**, zweiten Terminalfenster (die bisherige Verbindung offen lassen!)
prüfen, dass der Login mit Schlüssel funktioniert:

```bash
ssh snipe-it-admin@<server-ip>
```

Es sollte höchstens nach der SSH-Key-Passphrase fragen, **nicht** mehr nach
dem Konto-Passwort. Erst wenn das zuverlässig klappt, weitermachen.

**Auf dem Server**: Passwort-Login für SSH deaktivieren:

```bash
sudo nano /etc/ssh/sshd_config
```

Folgende Zeilen setzen (bestehende auskommentierte Zeilen entsprechend
anpassen/ergänzen):

```
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
```

Konfiguration auf Syntaxfehler prüfen, bevor der Dienst neu gestartet wird:

```bash
sudo sshd -t
sudo systemctl restart ssh
```

Sicherheitsnetz: Da der Server als Hyper-V-VM läuft, bleibt die
VM-Konsole (das Fenster aus dem Screenshot vorhin) auch bei einer
Fehlkonfiguration von SSH erreichbar – ein vollständiges Aussperren ist
damit nicht zu befürchten, trotzdem lohnt der Test in Schritt 3 vor dem
Neustart.

## Schritt 4: Firewall öffnen

Nur HTTPS für den Prototyp-Zugriff freigeben (SSH bleibt offen, falls
`ufw` schon aktiv ist):

```bash
sudo ufw allow 22/tcp
sudo ufw allow 443/tcp
sudo ufw enable   # falls ufw noch nicht aktiv war
sudo ufw status
```

## Schritt 5: Repository holen und konfigurieren

```bash
git clone https://github.com/GunnarGillert/GunnarGillert.git
cd "GunnarGillert/DRK Büdingen/Snipe-IT"
cp .env.example .env
```

In der `.env` folgende Werte setzen (Editor z. B. `nano .env`):

- `APP_URL=https://<server-ip>` – die IP aus Schritt 1, z. B.
  `https://192.168.1.50` (kein Port nötig, HTTPS läuft auf 443).
- `SNIPEIT_HOSTNAME=<server-ip>` – dieselbe IP, **ohne** `https://`.
- `DB_PASSWORD` und `DB_ROOT_PASSWORD` auf zufällige Passwörter setzen:
  ```bash
  openssl rand -base64 32
  ```

`APP_KEY` bleibt vorerst leer, kommt in Schritt 7.

## Schritt 6: Container starten

```bash
docker compose -f docker-compose.yml -f docker-compose.prototype.yml up -d
docker compose ps
```

Alle drei Dienste (`snipeit-db`, `snipeit-app`, `snipeit-caddy`) sollten
`running`/`healthy` sein. Bei `snipeit-db` kann der Healthcheck bis zu
30 Sekunden brauchen.

## Schritt 7: APP_KEY erzeugen

```bash
docker compose run --rm snipeit-app php artisan key:generate --show
```

Ausgabe (Format `base64:...`) in `.env` bei `APP_KEY=` eintragen, dann neu
starten, damit der Key greift:

```bash
docker compose -f docker-compose.yml -f docker-compose.prototype.yml up -d
```

## Schritt 8: Im Browser öffnen

`https://<server-ip>` aufrufen (die IP aus Schritt 5). Der Browser zeigt
eine Zertifikatswarnung, weil das Zertifikat selbstsigniert ist – das ist
für den Prototyp erwartet und unbedenklich (Verbindung ist trotzdem
verschlüsselt). Warnung bestätigen/fortfahren ("Erweitert" → "Trotzdem
fortfahren" bzw. je nach Browser).

Der Snipe-IT-Setup-Assistent führt danach durch Admin-Account, Firmenname
und Locale (Deutsch, Europe/Berlin ist bereits vorbelegt).

## Was als Nächstes zu testen ist

- **Companies-Feature** für Hauptamt/Ehrenamt-Trennung einrichten und mit
  zwei Testnutzern verifizieren (Anleitung: `README.md`, Abschnitt
  "Companies-Feature").
- Ein paar Beispiel-Assets (Digitalfunkgerät, Funkmeldeempfänger) anlegen
  und die Sichtbarkeit je Company/Berechtigungsgruppe prüfen.
- Optional: SAML-Testverbindung zu Entra ID aufbauen (Anleitung ebenfalls
  in `README.md`) – dafür wird auf Entra-Seite trotzdem eine erreichbare
  ACS-URL benötigt; für einen reinen SAML-Konfigurationstest reicht die
  interne HTTPS-URL, für den echten Login-Flow braucht es später den
  Application Proxy.

## Prototyp wieder abbauen

```bash
docker compose -f docker-compose.yml -f docker-compose.prototype.yml down
```

Mit `-v` zusätzlich alle Daten (Datenbank, Uploads, Caddy-Zertifikate)
löschen, falls der Prototyp komplett zurückgesetzt werden soll:

```bash
docker compose -f docker-compose.yml -f docker-compose.prototype.yml down -v
sudo rm -rf ./data
```

## Übergang zum Produktivbetrieb

Der Prototyp ersetzt **nicht** den in `README.md` beschriebenen
Produktivweg. Für den echten Betrieb:

1. `docker compose -f docker-compose.yml -f docker-compose.prototype.yml down`
   (Caddy/selbstsigniertes Zertifikat werden nicht mehr gebraucht).
2. `APP_URL` in `.env` auf die echte externe HTTPS-Adresse ändern (z. B.
   `https://assets.drkbuedingen.de`).
3. Ab dort README.md ab Abschnitt "Microsoft Entra ID SSO (SAML)
   einrichten" weiterverfolgen – inklusive Application-Proxy-Einrichtung
   und TerraCloud-Backup-Konfiguration.
4. Nur noch `docker compose up -d` (ohne das `prototype.yml`-Overlay)
   verwenden.
