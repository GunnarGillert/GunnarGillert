"""Lädt/speichert die Konfiguration als config.json. Der Tailscale-API-Key wird dabei nicht im
Klartext abgelegt, sondern mit einem lokal erzeugten Schlüssel (Fernet/AES) verschlüsselt.

Hinweis zur Absicherung: Der Schlüssel liegt als separate Datei (key.bin) neben config.json und
wird beim ersten Speichern mit möglichst restriktiven Dateirechten angelegt. Das ist kein
Ersatz für eine echte Betriebssystem-Datenschutz-API (wie Windows DPAPI), reicht aber aus, um
den API-Key nicht im Klartext auf der Platte liegen zu haben. Der Konfigurationsordner sollte
zusätzlich nur für das Konto lesbar sein, unter dem AlamosHA läuft.
"""

from __future__ import annotations

import json
import os
import stat
from pathlib import Path

from cryptography.fernet import Fernet

from alamos_ha.models import AppConfig


def _load_or_create_key(key_path: Path) -> bytes:
    if key_path.exists():
        return key_path.read_bytes()

    key_path.parent.mkdir(parents=True, exist_ok=True)
    key = Fernet.generate_key()
    key_path.write_bytes(key)
    try:
        os.chmod(key_path, stat.S_IRUSR | stat.S_IWUSR)
    except OSError:
        pass  # Unter Windows nur eingeschränkt wirksam - Ordner-ACLs manuell absichern.
    return key


def load(config_path: str | Path, key_path: str | Path) -> AppConfig:
    config_path = Path(config_path)
    key_path = Path(key_path)

    data = json.loads(config_path.read_text(encoding="utf-8"))
    fernet = Fernet(_load_or_create_key(key_path))
    api_key = fernet.decrypt(data["api_key_encrypted"].encode("ascii")).decode("utf-8")

    return AppConfig(
        site_name=data["site_name"],
        tailnet=data["tailnet"],
        api_key=api_key,
        peer_device_id=data["peer_device_id"],
        peer_tailscale_host=data["peer_tailscale_host"],
        alamos_service_name=data["alamos_service_name"],
        is_primary_by_default=data["is_primary_by_default"],
        poll_interval_seconds=data.get("poll_interval_seconds", 20),
        offline_threshold_seconds=data.get("offline_threshold_seconds", 180),
        consecutive_offline_checks_required=data.get("consecutive_offline_checks_required", 3),
        auto_failback=data.get("auto_failback", False),
        peer_status_port=data.get("peer_status_port", 57575),
        web_host=data.get("web_host", "127.0.0.1"),
        web_port=data.get("web_port", 8080),
        adb_path=data.get("adb_path", "adb"),
        adb_device_serial=data.get("adb_device_serial"),
        fast_status_interval_seconds=data.get("fast_status_interval_seconds", 5),
    )


def save(config_path: str | Path, key_path: str | Path, config: AppConfig) -> None:
    config_path = Path(config_path)
    key_path = Path(key_path)

    fernet = Fernet(_load_or_create_key(key_path))
    api_key_encrypted = fernet.encrypt(config.api_key.encode("utf-8")).decode("ascii")

    data = {
        "site_name": config.site_name,
        "tailnet": config.tailnet,
        "api_key_encrypted": api_key_encrypted,
        "peer_device_id": config.peer_device_id,
        "peer_tailscale_host": config.peer_tailscale_host,
        "alamos_service_name": config.alamos_service_name,
        "is_primary_by_default": config.is_primary_by_default,
        "poll_interval_seconds": config.poll_interval_seconds,
        "offline_threshold_seconds": config.offline_threshold_seconds,
        "consecutive_offline_checks_required": config.consecutive_offline_checks_required,
        "auto_failback": config.auto_failback,
        "peer_status_port": config.peer_status_port,
        "web_host": config.web_host,
        "web_port": config.web_port,
        "adb_path": config.adb_path,
        "adb_device_serial": config.adb_device_serial,
        "fast_status_interval_seconds": config.fast_status_interval_seconds,
    }

    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
