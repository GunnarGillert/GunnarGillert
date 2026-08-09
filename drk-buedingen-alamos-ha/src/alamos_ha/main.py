"""Einstiegspunkt: `alamos-ha setup` (einmalige Ersteinrichtung) und `alamos-ha run`
(startet den Wächter-Dienst inkl. Kiosk-Webserver)."""

from __future__ import annotations

import argparse
import asyncio
import getpass
import logging
import os
import sys
from pathlib import Path

import httpx
import uvicorn

from alamos_ha.adapters import config_store
from alamos_ha.adapters.peer_status import PeerRoleAnnouncer, TcpPeerStatusClient
from alamos_ha.adapters.role_store import JsonFileRoleStateStore
from alamos_ha.adapters.service_controller import WindowsServiceController
from alamos_ha.adapters.tailscale_client import HttpTailscaleClient
from alamos_ha.models import AppConfig
from alamos_ha.orchestrator import Orchestrator
from alamos_ha.web.app import create_app


def default_config_dir() -> Path:
    program_data = os.environ.get("PROGRAMDATA")
    if program_data:
        return Path(program_data) / "AlamosHA"
    return Path.home() / ".alamosha"


CONFIG_DIR = default_config_dir()
CONFIG_PATH = CONFIG_DIR / "config.json"
KEY_PATH = CONFIG_DIR / "key.bin"
ROLE_STATE_PATH = CONFIG_DIR / "role-state.json"


def cmd_setup() -> None:
    print("=== AlamosHA - Ersteinrichtung ===")
    print(f"Konfiguration wird gespeichert unter: {CONFIG_PATH}\n")

    site_name = input("Standortname (z. B. Büdingen): ").strip()
    tailnet = input("Tailnet-Name (aus der Tailscale-Adminkonsole, oder '-' für Standard) [-]: ").strip() or "-"
    api_key = getpass.getpass("Tailscale API-Key (read-only, Scope 'devices:core'): ").strip()
    service_name = input("Windows-Dienstname von Alamos (services.msc): ").strip()
    peer_device_id = input("Gegenstelle: Tailscale-Geräte-ID, Hostname oder Gerätename: ").strip()
    peer_host = input("Gegenstelle: Tailscale-Hostname/-IP für den direkten Konflikt-Check: ").strip()
    is_primary_raw = input("Ist DIESER Standort beim allerersten Start automatisch Master? [j/N]: ").strip().lower()
    is_primary = is_primary_raw == "j"

    missing = [
        name
        for name, value in [
            ("Standortname", site_name),
            ("Tailscale API-Key", api_key),
            ("Alamos-Dienstname", service_name),
            ("Gegenstelle (Geräte-ID/Hostname)", peer_device_id),
            ("Gegenstelle (Tailscale-Host)", peer_host),
        ]
        if not value
    ]
    if missing:
        print(f"\nAbgebrochen - folgende Angaben fehlen: {', '.join(missing)}")
        sys.exit(1)

    config = AppConfig(
        site_name=site_name,
        tailnet=tailnet,
        api_key=api_key,
        peer_device_id=peer_device_id,
        peer_tailscale_host=peer_host,
        alamos_service_name=service_name,
        is_primary_by_default=is_primary,
    )
    config_store.save(CONFIG_PATH, KEY_PATH, config)
    print(f"\nGespeichert. Wichtig: Genau EIN Standort darf 'Master beim ersten Start' = Ja haben, der andere Nein.")
    print("Start mit: alamos-ha run  (bzw. python -m alamos_ha.main run)")


async def cmd_run() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    if not CONFIG_PATH.exists():
        print(f"Keine Konfiguration gefunden unter {CONFIG_PATH}.")
        print("Bitte zuerst ausführen: alamos-ha setup")
        sys.exit(1)

    config = config_store.load(CONFIG_PATH, KEY_PATH)

    async with httpx.AsyncClient(timeout=15.0) as http_client:
        tailscale_client = HttpTailscaleClient(http_client, config.tailnet, config.api_key)
        service_controller = WindowsServiceController(config.alamos_service_name)
        peer_status_client = TcpPeerStatusClient(config.peer_tailscale_host, config.peer_status_port)
        role_store = JsonFileRoleStateStore(ROLE_STATE_PATH)
        announcer = PeerRoleAnnouncer("0.0.0.0", config.peer_status_port)

        orchestrator = Orchestrator(config, tailscale_client, service_controller, peer_status_client, role_store, announcer)
        await orchestrator.start()

        app = create_app(orchestrator)
        server = uvicorn.Server(uvicorn.Config(app, host=config.web_host, port=config.web_port, log_level="info"))

        try:
            await server.serve()
        finally:
            await orchestrator.stop()


def main() -> None:
    parser = argparse.ArgumentParser(prog="alamos-ha")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("setup", help="Einmalige Ersteinrichtung (Zugangsdaten interaktiv erfassen)")
    subparsers.add_parser("run", help="Startet den Wächter-Dienst inkl. Kiosk-Webserver")

    args = parser.parse_args()

    if args.command == "setup":
        cmd_setup()
    elif args.command == "run":
        asyncio.run(cmd_run())


if __name__ == "__main__":
    main()
