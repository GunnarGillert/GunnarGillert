"""Domänenmodelle für die Alamos-Hochverfügbarkeit."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum


class NodeRole(str, Enum):
    """Rolle dieses Standorts im Alamos-Verbund."""

    UNKNOWN = "unknown"
    MASTER = "master"
    STANDBY = "standby"


class PeerReportedRole(str, Enum):
    """Ergebnis der direkten Rückfrage bei der Gegenstelle (Konflikt-Check)."""

    UNREACHABLE = "unreachable"
    UNKNOWN = "unknown"
    MASTER = "master"
    STANDBY = "standby"


class PollResultKind(str, Enum):
    API_UNREACHABLE = "api_unreachable"
    PEER_NOT_FOUND = "peer_not_found"
    PEER_ONLINE = "peer_online"
    OFFLINE_SUSPECTED = "offline_suspected"
    ALREADY_MASTER = "already_master"
    PROMOTED_TO_MASTER = "promoted_to_master"
    CONFLICT = "conflict"
    AUTO_FAILBACK = "auto_failback"


@dataclass(frozen=True)
class TailscaleDeviceStatus:
    """Von der Tailscale-API gemeldeter Status der Gegenstelle."""

    id: str
    name: str
    last_seen: datetime


@dataclass(frozen=True)
class PollResult:
    kind: PollResultKind
    role_after: NodeRole
    message: str

    @staticmethod
    def api_unreachable(role: NodeRole, reason: str) -> "PollResult":
        return PollResult(
            PollResultKind.API_UNREACHABLE,
            role,
            f"Tailscale-API nicht erreichbar ({reason}). Keine Änderung - eigene Verbindung könnte gestört sein.",
        )

    @staticmethod
    def peer_not_found(role: NodeRole) -> "PollResult":
        return PollResult(
            PollResultKind.PEER_NOT_FOUND,
            role,
            "Gegenstelle wurde im Tailnet nicht gefunden. Bitte Konfiguration (peer_device_id) prüfen.",
        )

    @staticmethod
    def peer_online(role: NodeRole, age: timedelta) -> "PollResult":
        return PollResult(
            PollResultKind.PEER_ONLINE,
            role,
            f"Gegenstelle online (letzter Kontakt vor {_format_age(age)}).",
        )

    @staticmethod
    def offline_suspected(role: NodeRole, age: timedelta, count: int, required: int) -> "PollResult":
        return PollResult(
            PollResultKind.OFFLINE_SUSPECTED,
            role,
            f"Gegenstelle erscheint offline (letzter Kontakt vor {_format_age(age)}), Prüfung {count}/{required}.",
        )

    @staticmethod
    def already_master(role: NodeRole, age: timedelta) -> "PollResult":
        return PollResult(
            PollResultKind.ALREADY_MASTER,
            role,
            f"Bereits Master. Gegenstelle weiterhin offline (letzter Kontakt vor {_format_age(age)}).",
        )

    @staticmethod
    def promoted_to_master(role: NodeRole, age: timedelta) -> "PollResult":
        return PollResult(
            PollResultKind.PROMOTED_TO_MASTER,
            role,
            f"Gegenstelle bestätigt offline (letzter Kontakt vor {_format_age(age)}) - Alamos-Dienst wird jetzt hier gestartet.",
        )

    @staticmethod
    def conflict(role: NodeRole, age: timedelta) -> "PollResult":
        return PollResult(
            PollResultKind.CONFLICT,
            role,
            "KONFLIKT: Tailscale meldet die Gegenstelle offline, sie antwortet aber selbst als Master. "
            "Übernahme abgebrochen - bitte manuell prüfen!",
        )

    @staticmethod
    def auto_failback(role: NodeRole) -> "PollResult":
        return PollResult(
            PollResultKind.AUTO_FAILBACK,
            role,
            "Primary-Standort wieder online - automatisch in den Standby-Modus zurückgeschaltet.",
        )


def _format_age(age: timedelta) -> str:
    seconds = age.total_seconds()
    if seconds < 120:
        return f"{int(seconds)}s"
    return f"{int(seconds // 60)}min"


@dataclass
class AppConfig:
    """Konfiguration eines Standorts (Nidda oder Büdingen)."""

    site_name: str
    tailnet: str
    api_key: str
    peer_device_id: str
    peer_tailscale_host: str
    alamos_service_name: str
    is_primary_by_default: bool
    poll_interval_seconds: int = 20
    offline_threshold_seconds: int = 180
    consecutive_offline_checks_required: int = 3
    auto_failback: bool = False
    peer_status_port: int = 57575
    web_host: str = "127.0.0.1"
    web_port: int = 8080
    adb_path: str = "adb"
    adb_device_serial: str | None = None
    fast_status_interval_seconds: int = 5


@dataclass(frozen=True)
class AdbStatus:
    """Ergebnis der ADB-Verbindungsprüfung zum DE-Alarm-Handy."""

    connected: bool
    serial: str | None
    state: str
    message: str
