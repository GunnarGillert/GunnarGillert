"""Abstraktionen (Protocols), gegen die die FailoverEngine programmiert ist.

Die Verwendung von typing.Protocol statt konkreter Basisklassen bedeutet: Fakes in
den Tests müssen nichts erben, sie müssen nur die passenden Methoden haben (structural
typing) - genau wie die Interfaces in der ursprünglichen C#-Fassung.
"""

from __future__ import annotations

from datetime import datetime
from typing import Protocol

from alamos_ha.models import NodeRole, PeerReportedRole, TailscaleDeviceStatus


class TailscaleClient(Protocol):
    """Fragt den Status der Gegenstelle über die offizielle Tailscale-API ab.

    Die Erreichbarkeit dieser API dient als unabhängiger Zeuge ("Quorum") bei der
    Split-Brain-Prüfung: Wirft diese Methode eine Exception, war die API selbst nicht
    erreichbar - dann darf keine Failover-Entscheidung getroffen werden.
    """

    async def get_peer_status(self, peer_device_id: str) -> TailscaleDeviceStatus | None: ...


class AlarmServiceController(Protocol):
    """Steuert den lokalen Alamos-Windows-Dienst."""

    async def is_running(self) -> bool: ...

    async def start(self) -> None: ...

    async def stop(self) -> None: ...


class PeerStatusClient(Protocol):
    """Fragt direkt bei der Gegenstelle über das Tailscale-Mesh nach ihrer aktuellen Rolle."""

    async def get_peer_role(self) -> PeerReportedRole: ...


class RoleStateStore(Protocol):
    """Speichert die zuletzt bekannte Rolle dauerhaft (übersteht Neustarts)."""

    def load_role(self) -> NodeRole: ...

    def save_role(self, role: NodeRole) -> None: ...


class Clock(Protocol):
    """Abstraktion über die Systemzeit, damit die Engine ohne echte Wartezeiten testbar ist."""

    def utcnow(self) -> datetime: ...
