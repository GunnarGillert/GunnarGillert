from __future__ import annotations

import httpx
import pytest

from alamos_ha.models import NodeRole
from alamos_ha.orchestrator import Orchestrator
from alamos_ha.web.app import create_app
from tests.fakes import FakeAnnouncer, FakeClock, FakePeerStatusClient, FakeRoleStateStore, FakeServiceController, FakeTailscaleClient
from tests.test_engine import make_config


async def make_client():
    config = make_config(is_primary_by_default=True)
    orchestrator = Orchestrator(
        config,
        FakeTailscaleClient(),
        FakeServiceController(),
        FakePeerStatusClient(),
        FakeRoleStateStore(),
        FakeAnnouncer(),
    )
    await orchestrator.engine.initialize()

    app = create_app(orchestrator)
    transport = httpx.ASGITransport(app=app)
    client = httpx.AsyncClient(transport=transport, base_url="http://test")
    return client, orchestrator


async def test_dashboard_page_renders_site_name():
    client, _ = await make_client()
    async with client:
        response = await client.get("/")
    assert response.status_code == 200
    assert "Testwache" in response.text
    assert "Alarmierungs" in response.text


async def test_status_endpoint_reflects_master_role():
    client, orchestrator = await make_client()
    async with client:
        response = await client.get("/api/status")
    assert response.status_code == 200
    data = response.json()
    assert data["role"] == "master"
    assert data["is_master"] is True
    assert data["is_standby"] is False


async def test_force_role_endpoint_switches_to_standby():
    client, orchestrator = await make_client()
    async with client:
        response = await client.post("/api/force-role", json={"role": "standby"})
    assert response.status_code == 200
    assert response.json()["role"] == "standby"
    assert orchestrator.engine.current_role == NodeRole.STANDBY


async def test_force_role_endpoint_rejects_invalid_role():
    client, _ = await make_client()
    async with client:
        response = await client.post("/api/force-role", json={"role": "banana"})
    assert response.status_code == 400


async def test_automatic_toggle_endpoint():
    client, orchestrator = await make_client()
    async with client:
        response = await client.post("/api/automatic", json={"enabled": False})
    assert response.status_code == 200
    assert orchestrator.automatic_enabled is False
