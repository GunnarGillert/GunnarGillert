"""Kernlogik der Hochverfügbarkeit zwischen den beiden Alamos-Standorten.

Ablauf pro Aufruf von run_once():
  1. Status der Gegenstelle über die Tailscale-API abfragen. Ist die API selbst nicht
     erreichbar, wird NICHTS entschieden (die eigene Verbindung könnte gestört sein -
     die API dient als unabhängiger Zeuge/Quorum, ohne sie keine Übernahme).
  2. Ist die Gegenstelle laut Tailscale-Heartbeat aktuell (online), bleibt alles wie es ist.
  3. Erscheint sie offline, wird über mehrere Zyklen (Hysterese) gezählt, um kurze Aussetzer
     nicht als Ausfall zu werten.
  4. Erst wenn die Schwelle erreicht ist, wird zusätzlich direkt bei der Gegenstelle
     nachgefragt (Konflikt-Check) - antwortet sie entgegen der Tailscale-Meldung doch als
     Master, wird die Übernahme sicherheitshalber abgebrochen, um doppelte Alarmierung zu
     vermeiden.
  5. Erst dann wird dieser Standort zum Master befördert und der Alamos-Dienst gestartet.

Ein Standort, der bereits Master ist, gibt die Rolle NICHT automatisch wieder ab, sobald die
Gegenstelle zurückkommt (Flapping- und Unterbrechungsschutz für einen laufenden Alarm) - es
sei denn, auto_failback ist explizit aktiviert. Die Rückgabe erfolgt sonst über die manuelle
Bedienung (force_role).
"""

from __future__ import annotations

from datetime import timedelta

from alamos_ha.abstractions import (
    AlarmServiceController,
    Clock,
    PeerStatusClient,
    RoleStateStore,
    TailscaleClient,
)
from alamos_ha.models import AppConfig, NodeRole, PeerReportedRole, PollResult


class FailoverEngine:
    def __init__(
        self,
        config: AppConfig,
        tailscale_client: TailscaleClient,
        service_controller: AlarmServiceController,
        peer_status_client: PeerStatusClient,
        role_store: RoleStateStore,
        clock: Clock,
    ) -> None:
        self._config = config
        self._tailscale_client = tailscale_client
        self._service_controller = service_controller
        self._peer_status_client = peer_status_client
        self._role_store = role_store
        self._clock = clock

        self._initialized = False
        self._consecutive_offline_checks = 0
        self.current_role = NodeRole.UNKNOWN

    async def initialize(self) -> None:
        """Lädt die zuletzt gespeicherte Rolle bzw. legt bei einem echten Erststart die
        konfigurierte Default-Rolle fest und sorgt dafür, dass der Alamos-Dienst-Zustand
        dazu passt."""
        if self._initialized:
            return

        stored_role = self._role_store.load_role()
        if stored_role != NodeRole.UNKNOWN:
            self.current_role = stored_role
        else:
            self.current_role = NodeRole.MASTER if self._config.is_primary_by_default else NodeRole.STANDBY
            self._role_store.save_role(self.current_role)

        await self._ensure_service_matches_role()
        self._initialized = True

    async def run_once(self) -> PollResult:
        if not self._initialized:
            await self.initialize()

        try:
            peer = await self._tailscale_client.get_peer_status(self._config.peer_device_id)
        except Exception as ex:  # noqa: BLE001 - Netzwerkfehler jeder Art sind hier erwartbar
            self._consecutive_offline_checks = 0
            return PollResult.api_unreachable(self.current_role, str(ex))

        if peer is None:
            self._consecutive_offline_checks = 0
            return PollResult.peer_not_found(self.current_role)

        age = self._clock.utcnow() - peer.last_seen
        peer_online = age <= timedelta(seconds=self._config.offline_threshold_seconds)

        if peer_online:
            self._consecutive_offline_checks = 0

            if (
                self.current_role == NodeRole.MASTER
                and self._config.auto_failback
                and not self._config.is_primary_by_default
            ):
                await self._demote_to_standby()
                return PollResult.auto_failback(self.current_role)

            return PollResult.peer_online(self.current_role, age)

        self._consecutive_offline_checks += 1

        if self.current_role == NodeRole.MASTER:
            return PollResult.already_master(self.current_role, age)

        if self._consecutive_offline_checks < self._config.consecutive_offline_checks_required:
            return PollResult.offline_suspected(
                self.current_role, age, self._consecutive_offline_checks, self._config.consecutive_offline_checks_required
            )

        peer_reported_role = await self._peer_status_client.get_peer_role()
        if peer_reported_role == PeerReportedRole.MASTER:
            return PollResult.conflict(self.current_role, age)

        await self._promote_to_master()
        return PollResult.promoted_to_master(self.current_role, age)

    async def force_role(self, role: NodeRole) -> None:
        """Manuelle Bedienung über die Oberfläche - überschreibt die automatische Entscheidung sofort."""
        if role == NodeRole.MASTER:
            await self._promote_to_master()
        elif role == NodeRole.STANDBY:
            await self._demote_to_standby()
        else:
            raise ValueError(f"Rolle muss MASTER oder STANDBY sein, nicht {role!r}.")

    async def _promote_to_master(self) -> None:
        self.current_role = NodeRole.MASTER
        self._role_store.save_role(self.current_role)
        await self._service_controller.start()
        self._consecutive_offline_checks = 0

    async def _demote_to_standby(self) -> None:
        self.current_role = NodeRole.STANDBY
        self._role_store.save_role(self.current_role)
        await self._service_controller.stop()
        self._consecutive_offline_checks = 0

    async def _ensure_service_matches_role(self) -> None:
        running = await self._service_controller.is_running()
        if self.current_role == NodeRole.MASTER and not running:
            await self._service_controller.start()
        elif self.current_role == NodeRole.STANDBY and running:
            await self._service_controller.stop()
