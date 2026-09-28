# VPN-Zugang – DRK Büdingen (Securepoint)

Dokumentation, wie VPN-User an ihre VPN-Konfiguration kommen.

## Securepoint SSL-VPN Portal

- Adresse: https://62.54.201.235:63654/
- Darüber laden berechtigte User ihre VPN-Konfiguration (Securepoint VPN) herunter.

## Voraussetzung

- Der User muss in der Active-Directory-Gruppe **`sgrp-vpn-sec`** Mitglied sein.
- Ohne Mitgliedschaft in dieser Gruppe ist kein Zugriff auf das Portal bzw. keine
  Konfiguration möglich.

## Ablauf (Neuanlage/Freischaltung)

1. User zur AD-Gruppe `sgrp-vpn-sec` hinzufügen.
2. User ruft das Portal unter https://62.54.201.235:63654/ auf.
3. VPN-Konfiguration für den Securepoint VPN Client herunterladen und einrichten.
