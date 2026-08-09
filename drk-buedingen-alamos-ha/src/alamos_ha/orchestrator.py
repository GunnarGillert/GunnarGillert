"""Verdrahtet die FailoverEngine mit den echten Adaptern und betreibt zwei Hintergrund-Loops:

- poll_loop: der eigentliche Failover-Entscheidungszyklus (Tailscale-Quorum-Check), im
  konfigurierten poll_interval_seconds-Takt.
- fast_status_loop: aktualisiert unabhängig davon in kürzerem Takt (fast_status_interval_seconds)
  den tatsächlich beobachteten Dienst- und Handy-Status fürs Dashboard, damit die Anzeige auch
  Abweichungen zeigt (z. B. Dienst manuell/abgestürzt gestoppt, obwohl die Rolle Master ist).
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from alamos_ha.abstractions import AlarmServiceController, PeerStatusClient, RoleStateStore, TailscaleClient
from alamos_ha.adapters.adb_status import check_adb_status
from alamos_ha.adapters.clock import SystemClock
from alamos_ha.adapters.peer_status import PeerRoleAnnouncer
from alamos_ha.engine import FailoverEngine
from alamos_ha.models import AdbStatus, AppConfig, NodeRole, PollResult, PollResultKind

logger = logging.getLogger("alamos_ha")


class Orchestrator:
    def __init__(
        self,
        config: AppConfig,
        tailscale_client: TailscaleClient,
        service_controller: AlarmServiceController,
        peer_status_client: PeerStatusClient,
        role_store: RoleStateStore,
        announcer: PeerRoleAnnouncer,
    ) -> None:
        self.config = config
        self._service_controller = service_controller
        self._announcer = announcer
        self.engine = FailoverEngine(config, tailscale_client, service_controller, peer_status_client, role_store, SystemClock())

        self.automatic_enabled = True
        self.last_poll_result: PollResult | None = None
        self.last_poll_time: datetime | None = None
        self.internet_ok: bool = False
        self.alamos_running: bool = False
        self.adb_status: AdbStatus | None = None
        self.log: list[dict] = []

        self._tasks: list[asyncio.Task] = []
        self._stopping = asyncio.Event()

    async def start(self) -> None:
        await self._announcer.start()
        await self.engine.initialize()
        self._announcer.current_role = self.engine.current_role
        self._tasks = [
            asyncio.create_task(self._poll_loop(), name="poll_loop"),
            asyncio.create_task(self._fast_status_loop(), name="fast_status_loop"),
        ]

    async def stop(self) -> None:
        self._stopping.set()
        for task in self._tasks:
            task.cancel()
        for task in self._tasks:
            try:
                await task
            except asyncio.CancelledError:
                pass
        await self._announcer.stop()

    async def force_role(self, role: NodeRole) -> None:
        try:
            await self.engine.force_role(role)
            self._announcer.current_role = self.engine.current_role
        except Exception as ex:  # noqa: BLE001
            logger.exception("Manuelle Rollenänderung fehlgeschlagen")
            self._append_log(f"Fehler beim manuellen Umschalten: {ex}")

    def set_automatic(self, enabled: bool) -> None:
        self.automatic_enabled = enabled

    async def _poll_loop(self) -> None:
        while not self._stopping.is_set():
            if self.automatic_enabled:
                await self._poll_once()
            try:
                await asyncio.wait_for(self._stopping.wait(), timeout=self.config.poll_interval_seconds)
            except asyncio.TimeoutError:
                pass

    async def _poll_once(self) -> None:
        try:
            result = await self.engine.run_once()
        except Exception as ex:  # noqa: BLE001 - ein einzelner fehlgeschlagener Zyklus darf den Loop nicht beenden
            logger.exception("Unerwarteter Fehler im Prüfzyklus")
            self._append_log(f"Fehler bei der Prüfung: {ex}")
            return

        self.last_poll_result = result
        self.last_poll_time = datetime.now(timezone.utc)
        self.internet_ok = result.kind != PollResultKind.API_UNREACHABLE
        self._announcer.current_role = self.engine.current_role
        self._append_log(result.message)

    async def _fast_status_loop(self) -> None:
        while not self._stopping.is_set():
            try:
                self.alamos_running = await self._service_controller.is_running()
            except Exception:  # noqa: BLE001
                logger.exception("Konnte Alamos-Dienststatus nicht abfragen")

            try:
                self.adb_status = await check_adb_status(self.config.adb_path, self.config.adb_device_serial)
            except Exception:  # noqa: BLE001
                logger.exception("Konnte ADB-Status nicht abfragen")

            try:
                await asyncio.wait_for(self._stopping.wait(), timeout=self.config.fast_status_interval_seconds)
            except asyncio.TimeoutError:
                pass

    def _append_log(self, message: str) -> None:
        self.log.insert(0, {"timestamp": datetime.now(timezone.utc).isoformat(), "message": message})
        del self.log[200:]

    def status_dict(self) -> dict:
        return {
            "site_name": self.config.site_name,
            "role": self.engine.current_role.value,
            "is_master": self.engine.current_role == NodeRole.MASTER,
            "is_standby": self.engine.current_role == NodeRole.STANDBY,
            "internet_ok": self.internet_ok,
            "alamos_running": self.alamos_running,
            "phone": {
                "connected": self.adb_status.connected if self.adb_status else False,
                "state": self.adb_status.state if self.adb_status else "unknown",
                "message": self.adb_status.message if self.adb_status else "Noch nicht geprüft.",
            },
            "last_update": self.last_poll_time.isoformat() if self.last_poll_time else None,
            "last_message": self.last_poll_result.message if self.last_poll_result else "Noch keine Prüfung durchgeführt.",
            "last_kind": self.last_poll_result.kind.value if self.last_poll_result else None,
            "automatic_enabled": self.automatic_enabled,
            "log": self.log[:50],
        }
