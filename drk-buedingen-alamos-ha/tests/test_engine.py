from __future__ import annotations

from datetime import timedelta

import pytest

from alamos_ha.engine import FailoverEngine
from alamos_ha.models import AppConfig, NodeRole, PeerReportedRole, PollResultKind, TailscaleDeviceStatus
from tests.fakes import FakeClock, FakePeerStatusClient, FakeRoleStateStore, FakeServiceController, FakeTailscaleClient


def make_config(
    *,
    is_primary_by_default: bool = False,
    auto_failback: bool = False,
    consecutive_offline_checks_required: int = 3,
    offline_threshold_seconds: int = 180,
) -> AppConfig:
    return AppConfig(
        site_name="Testwache",
        tailnet="-",
        api_key="tskey-api-test",
        peer_device_id="peer-1",
        peer_tailscale_host="peer-1.tailnet.ts.net",
        alamos_service_name="AlamosService",
        is_primary_by_default=is_primary_by_default,
        auto_failback=auto_failback,
        consecutive_offline_checks_required=consecutive_offline_checks_required,
        offline_threshold_seconds=offline_threshold_seconds,
        poll_interval_seconds=20,
    )


def make_engine(config: AppConfig, *, initial_stored_role: NodeRole = NodeRole.UNKNOWN):
    tailscale = FakeTailscaleClient()
    service = FakeServiceController()
    peer_status = FakePeerStatusClient()
    role_store = FakeRoleStateStore(initial_stored_role)
    clock = FakeClock()
    engine = FailoverEngine(config, tailscale, service, peer_status, role_store, clock)
    return engine, tailscale, service, peer_status, role_store, clock


async def test_cold_start_primary_site_becomes_master_and_starts_service():
    config = make_config(is_primary_by_default=True)
    engine, _, service, _, role_store, _ = make_engine(config)

    await engine.initialize()

    assert engine.current_role == NodeRole.MASTER
    assert service.start_call_count == 1
    assert service.is_running_flag is True
    assert NodeRole.MASTER in role_store.saved_roles


async def test_cold_start_secondary_site_stays_standby_and_does_not_start_service():
    config = make_config(is_primary_by_default=False)
    engine, _, service, _, _, _ = make_engine(config)

    await engine.initialize()

    assert engine.current_role == NodeRole.STANDBY
    assert service.start_call_count == 0
    assert service.is_running_flag is False


async def test_restart_after_crash_restores_persisted_master_role_and_ensures_service_running():
    config = make_config(is_primary_by_default=False)
    engine, _, service, _, _, _ = make_engine(config, initial_stored_role=NodeRole.MASTER)

    await engine.initialize()

    assert engine.current_role == NodeRole.MASTER
    assert service.start_call_count == 1


async def test_peer_online_stays_standby():
    config = make_config(is_primary_by_default=False)
    engine, tailscale, service, _, _, clock = make_engine(config)
    await engine.initialize()

    tailscale.next_status = TailscaleDeviceStatus("peer-1", "Buedingen", clock.now - timedelta(seconds=30))

    result = await engine.run_once()

    assert result.kind == PollResultKind.PEER_ONLINE
    assert engine.current_role == NodeRole.STANDBY
    assert service.start_call_count == 0


async def test_api_unreachable_does_not_change_role_or_service():
    config = make_config(is_primary_by_default=False)
    engine, tailscale, service, _, _, _ = make_engine(config)
    await engine.initialize()

    tailscale.next_exception = ConnectionError("DNS-Fehler")

    result = await engine.run_once()

    assert result.kind == PollResultKind.API_UNREACHABLE
    assert engine.current_role == NodeRole.STANDBY
    assert service.start_call_count == 0


async def test_peer_not_found_in_tailnet_does_not_change_role():
    config = make_config(is_primary_by_default=False)
    engine, tailscale, service, _, _, _ = make_engine(config)
    await engine.initialize()

    tailscale.next_status = None

    result = await engine.run_once()

    assert result.kind == PollResultKind.PEER_NOT_FOUND
    assert engine.current_role == NodeRole.STANDBY
    assert service.start_call_count == 0


async def test_peer_offline_promotes_only_after_hysteresis_threshold():
    config = make_config(is_primary_by_default=False, consecutive_offline_checks_required=3, offline_threshold_seconds=60)
    engine, tailscale, service, peer_status, _, clock = make_engine(config)
    await engine.initialize()

    long_ago = clock.now - timedelta(minutes=10)
    tailscale.next_status = TailscaleDeviceStatus("peer-1", "Buedingen", long_ago)
    peer_status.next_role = PeerReportedRole.UNREACHABLE

    first = await engine.run_once()
    assert first.kind == PollResultKind.OFFLINE_SUSPECTED
    assert engine.current_role == NodeRole.STANDBY
    assert service.start_call_count == 0

    second = await engine.run_once()
    assert second.kind == PollResultKind.OFFLINE_SUSPECTED
    assert service.start_call_count == 0

    third = await engine.run_once()
    assert third.kind == PollResultKind.PROMOTED_TO_MASTER
    assert engine.current_role == NodeRole.MASTER
    assert service.start_call_count == 1
    assert service.is_running_flag is True


async def test_short_glitch_does_not_trigger_failover_counter_resets():
    config = make_config(is_primary_by_default=False, consecutive_offline_checks_required=3, offline_threshold_seconds=60)
    engine, tailscale, service, _, _, clock = make_engine(config)
    await engine.initialize()

    tailscale.next_status = TailscaleDeviceStatus("peer-1", "Buedingen", clock.now - timedelta(minutes=10))
    await engine.run_once()
    await engine.run_once()

    tailscale.next_status = TailscaleDeviceStatus("peer-1", "Buedingen", clock.now - timedelta(seconds=5))
    back = await engine.run_once()
    assert back.kind == PollResultKind.PEER_ONLINE

    tailscale.next_status = TailscaleDeviceStatus("peer-1", "Buedingen", clock.now - timedelta(minutes=10))
    after_reset = await engine.run_once()

    assert after_reset.kind == PollResultKind.OFFLINE_SUSPECTED
    assert service.start_call_count == 0


async def test_conflict_detected_aborts_promotion_and_does_not_start_service():
    config = make_config(is_primary_by_default=False, consecutive_offline_checks_required=1, offline_threshold_seconds=60)
    engine, tailscale, service, peer_status, _, clock = make_engine(config)
    await engine.initialize()

    tailscale.next_status = TailscaleDeviceStatus("peer-1", "Buedingen", clock.now - timedelta(minutes=10))
    peer_status.next_role = PeerReportedRole.MASTER

    result = await engine.run_once()

    assert result.kind == PollResultKind.CONFLICT
    assert engine.current_role == NodeRole.STANDBY
    assert service.start_call_count == 0


async def test_already_master_peer_stays_offline_does_not_restart_service_repeatedly():
    config = make_config(is_primary_by_default=True, offline_threshold_seconds=60)
    engine, tailscale, service, _, _, clock = make_engine(config)
    await engine.initialize()
    assert service.start_call_count == 1

    tailscale.next_status = TailscaleDeviceStatus("peer-1", "Nidda", clock.now - timedelta(minutes=30))

    first = await engine.run_once()
    second = await engine.run_once()

    assert first.kind == PollResultKind.ALREADY_MASTER
    assert second.kind == PollResultKind.ALREADY_MASTER
    assert engine.current_role == NodeRole.MASTER
    assert service.start_call_count == 1


async def test_master_does_not_auto_step_down_when_peer_comes_back_online_by_default():
    config = make_config(is_primary_by_default=False, auto_failback=False)
    engine, tailscale, service, _, _, clock = make_engine(config, initial_stored_role=NodeRole.MASTER)
    await engine.initialize()

    tailscale.next_status = TailscaleDeviceStatus("peer-1", "Buedingen", clock.now - timedelta(seconds=10))

    result = await engine.run_once()

    assert result.kind == PollResultKind.PEER_ONLINE
    assert engine.current_role == NodeRole.MASTER
    assert service.stop_call_count == 0


async def test_auto_failback_when_enabled_demotes_secondary_once_primary_is_back_online():
    config = make_config(is_primary_by_default=False, auto_failback=True)
    engine, tailscale, service, _, _, clock = make_engine(config, initial_stored_role=NodeRole.MASTER)
    await engine.initialize()

    tailscale.next_status = TailscaleDeviceStatus("peer-1", "Buedingen", clock.now - timedelta(seconds=10))

    result = await engine.run_once()

    assert result.kind == PollResultKind.AUTO_FAILBACK
    assert engine.current_role == NodeRole.STANDBY
    assert service.stop_call_count == 1


async def test_force_role_manual_override_to_master_starts_service_immediately():
    config = make_config(is_primary_by_default=False)
    engine, _, service, _, role_store, _ = make_engine(config)
    await engine.initialize()

    await engine.force_role(NodeRole.MASTER)

    assert engine.current_role == NodeRole.MASTER
    assert service.start_call_count == 1
    assert NodeRole.MASTER in role_store.saved_roles


async def test_force_role_manual_override_to_standby_stops_service():
    config = make_config(is_primary_by_default=True)
    engine, _, service, _, _, _ = make_engine(config)
    await engine.initialize()
    assert service.is_running_flag is True

    await engine.force_role(NodeRole.STANDBY)

    assert engine.current_role == NodeRole.STANDBY
    assert service.stop_call_count == 1
    assert service.is_running_flag is False


async def test_force_role_rejects_invalid_role():
    config = make_config(is_primary_by_default=False)
    engine, _, _, _, _, _ = make_engine(config)
    await engine.initialize()

    with pytest.raises(ValueError):
        await engine.force_role(NodeRole.UNKNOWN)
