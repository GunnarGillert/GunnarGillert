"""Client für die offizielle Tailscale-REST-API (https://api.tailscale.com).

Authentifizierung per API-Key (HTTP Basic Auth mit dem Key als Benutzername, wie von
Tailscale dokumentiert). Erzeugt euch dafür in der Tailscale-Adminkonsole einen Key mit
Scope "devices:core" (read-only) - mehr Rechte braucht dieses Programm nicht.
"""

from __future__ import annotations

from datetime import datetime

import httpx

from alamos_ha.models import TailscaleDeviceStatus


class HttpTailscaleClient:
    def __init__(self, http_client: httpx.AsyncClient, tailnet: str, api_key: str) -> None:
        self._http = http_client
        self._tailnet = tailnet
        self._http.auth = httpx.BasicAuth(api_key, "")
        if self._http.base_url == httpx.URL(""):
            self._http.base_url = httpx.URL("https://api.tailscale.com/")

    async def get_peer_status(self, peer_device_id: str) -> TailscaleDeviceStatus | None:
        response = await self._http.get(f"api/v2/tailnet/{self._tailnet}/devices")
        response.raise_for_status()

        payload = response.json()
        devices = payload.get("devices", [])
        device = next((d for d in devices if _matches(d, peer_device_id)), None)

        if device is None or not device.get("lastSeen"):
            return None

        last_seen = datetime.fromisoformat(device["lastSeen"].replace("Z", "+00:00"))
        device_id = device.get("id") or device.get("nodeId") or peer_device_id
        name = device.get("name") or device.get("hostname") or peer_device_id
        return TailscaleDeviceStatus(id=device_id, name=name, last_seen=last_seen)


def _matches(device: dict, peer_device_id: str) -> bool:
    target = peer_device_id.lower()
    candidates = (device.get("id"), device.get("nodeId"), device.get("hostname"), device.get("name"))
    return any(c is not None and c.lower() == target for c in candidates)
