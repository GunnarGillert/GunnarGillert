"""Handgeschriebene Fakes statt einer Mocking-Bibliothek - hält die Tests explizit und lesbar."""

from __future__ import annotations

from datetime import datetime, timezone

from alamos_ha.models import NodeRole, PeerReportedRole, TailscaleDeviceStatus


class FakeTailscaleClient:
    def __init__(self) -> None:
        self.next_status: TailscaleDeviceStatus | None = None
        self.next_exception: Exception | None = None
        self.call_count = 0

    async def get_peer_status(self, peer_device_id: str) -> TailscaleDeviceStatus | None:
        self.call_count += 1
        if self.next_exception is not None:
            raise self.next_exception
        return self.next_status


class FakeServiceController:
    def __init__(self) -> None:
        self.is_running_flag = False
        self.start_call_count = 0
        self.stop_call_count = 0

    async def is_running(self) -> bool:
        return self.is_running_flag

    async def start(self) -> None:
        self.start_call_count += 1
        self.is_running_flag = True

    async def stop(self) -> None:
        self.stop_call_count += 1
        self.is_running_flag = False


class FakePeerStatusClient:
    def __init__(self) -> None:
        self.next_role = PeerReportedRole.UNREACHABLE
        self.call_count = 0

    async def get_peer_role(self) -> PeerReportedRole:
        self.call_count += 1
        return self.next_role


class FakeRoleStateStore:
    def __init__(self, initial_role: NodeRole = NodeRole.UNKNOWN) -> None:
        self._role = initial_role
        self.saved_roles: list[NodeRole] = []

    def load_role(self) -> NodeRole:
        return self._role

    def save_role(self, role: NodeRole) -> None:
        self._role = role
        self.saved_roles.append(role)


class FakeClock:
    def __init__(self) -> None:
        self.now = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)

    def utcnow(self) -> datetime:
        return self.now


class FakeAnnouncer:
    def __init__(self) -> None:
        self.current_role = NodeRole.UNKNOWN
        self.started = False
        self.stopped = False

    async def start(self) -> None:
        self.started = True

    async def stop(self) -> None:
        self.stopped = True
