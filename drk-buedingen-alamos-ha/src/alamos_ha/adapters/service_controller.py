"""Steuert den Alamos-Windows-Dienst über sc.exe (kein zusätzliches Paket wie pywin32 nötig).

Der Rechner, auf dem AlamosHA läuft, muss mit einem Konto ausgeführt werden, das Dienste
starten/stoppen darf (z. B. lokaler Administrator).
"""

from __future__ import annotations

import asyncio
import time


class WindowsServiceController:
    def __init__(self, service_name: str, timeout_seconds: float = 30.0) -> None:
        self._service_name = service_name
        self._timeout_seconds = timeout_seconds

    async def is_running(self) -> bool:
        return await self._query_state() == "RUNNING"

    async def start(self) -> None:
        if await self.is_running():
            return
        await self._run_sc("start")
        await self._wait_for_state("RUNNING")

    async def stop(self) -> None:
        if await self._query_state() == "STOPPED":
            return
        await self._run_sc("stop")
        await self._wait_for_state("STOPPED")

    async def _wait_for_state(self, desired_state: str) -> None:
        deadline = time.monotonic() + self._timeout_seconds
        while time.monotonic() < deadline:
            if await self._query_state() == desired_state:
                return
            await asyncio.sleep(0.5)

    async def _query_state(self) -> str:
        process = await asyncio.create_subprocess_exec(
            "sc", "query", self._service_name,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await process.communicate()
        output = stdout.decode(errors="replace")
        for line in output.splitlines():
            line = line.strip()
            if line.startswith("STATE"):
                if "RUNNING" in line:
                    return "RUNNING"
                if "STOPPED" in line:
                    return "STOPPED"
                if "START_PENDING" in line:
                    return "START_PENDING"
                if "STOP_PENDING" in line:
                    return "STOP_PENDING"
        return "UNKNOWN"

    async def _run_sc(self, action: str) -> None:
        process = await asyncio.create_subprocess_exec(
            "sc", action, self._service_name,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await process.communicate()
