"""Direkter Konflikt-Check zwischen den Standorten über ein minimales Text-Protokoll auf TCP
("ROLE?" -> "MASTER"/"STANDBY"), statt HTTP - damit auf Windows kein administrativer
URL-ACL-Eintrag nötig ist (reine Socket-Bindung reicht ohne erhöhte Rechte)."""

from __future__ import annotations

import asyncio

from alamos_ha.models import NodeRole, PeerReportedRole


class PeerRoleAnnouncer:
    """Läuft im Hintergrund und beantwortet Anfragen der Gegenstelle nach der eigenen Rolle."""

    def __init__(self, host: str, port: int) -> None:
        self._host = host
        self._port = port
        self._server: asyncio.AbstractServer | None = None
        self.current_role = NodeRole.UNKNOWN

    async def start(self) -> None:
        self._server = await asyncio.start_server(self._handle_client, self._host, self._port)

    async def _handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            line = await asyncio.wait_for(reader.readline(), timeout=5)
            if line.strip().upper() == b"ROLE?":
                writer.write((self.current_role.name + "\n").encode("ascii"))
                await writer.drain()
        except (asyncio.TimeoutError, ConnectionError, OSError):
            pass
        finally:
            writer.close()
            try:
                await writer.wait_closed()
            except (ConnectionError, OSError):
                pass

    async def stop(self) -> None:
        if self._server is not None:
            self._server.close()
            await self._server.wait_closed()


class TcpPeerStatusClient:
    """Client-Gegenstück zu PeerRoleAnnouncer: fragt die Gegenstelle direkt über das Tailnet ab."""

    def __init__(self, host: str, port: int, timeout_seconds: float = 3.0) -> None:
        self._host = host
        self._port = port
        self._timeout_seconds = timeout_seconds

    async def get_peer_role(self) -> PeerReportedRole:
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(self._host, self._port), timeout=self._timeout_seconds
            )
        except (asyncio.TimeoutError, ConnectionError, OSError):
            return PeerReportedRole.UNREACHABLE

        try:
            writer.write(b"ROLE?\n")
            await writer.drain()
            line = await asyncio.wait_for(reader.readline(), timeout=self._timeout_seconds)
        except (asyncio.TimeoutError, ConnectionError, OSError):
            return PeerReportedRole.UNREACHABLE
        finally:
            writer.close()
            try:
                await writer.wait_closed()
            except (ConnectionError, OSError):
                pass

        text = line.strip().upper().decode("ascii", errors="replace")
        if text == "MASTER":
            return PeerReportedRole.MASTER
        if text == "STANDBY":
            return PeerReportedRole.STANDBY
        return PeerReportedRole.UNKNOWN
