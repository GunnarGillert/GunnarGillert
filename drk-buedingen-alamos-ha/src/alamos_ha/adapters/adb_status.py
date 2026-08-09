"""Prüft über `adb devices -l`, ob das per USB angeschlossene DE-Alarm-Handy erreichbar ist.

Liest bewusst nur den Verbindungsstatus aus (kein SMS-Zugriff) - siehe README für den Hintergrund,
warum das aktuelle Ziel nur die Statusanzeige "Verbindung zum DE-Alarm-Handy" ist.
"""

from __future__ import annotations

import asyncio

from alamos_ha.models import AdbStatus


async def check_adb_status(adb_path: str = "adb", expected_serial: str | None = None) -> AdbStatus:
    try:
        process = await asyncio.create_subprocess_exec(
            adb_path, "devices", "-l",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(process.communicate(), timeout=10)
    except FileNotFoundError:
        return AdbStatus(connected=False, serial=None, state="adb_not_found", message="adb-Tool wurde nicht gefunden (Pfad in der Konfiguration prüfen).")
    except asyncio.TimeoutError:
        return AdbStatus(connected=False, serial=None, state="timeout", message="adb devices hat nicht rechtzeitig geantwortet.")

    devices: list[tuple[str, str]] = []
    for line in stdout.decode(errors="replace").splitlines()[1:]:
        parts = line.strip().split()
        if len(parts) >= 2:
            devices.append((parts[0], parts[1]))

    if expected_serial:
        match = next((d for d in devices if d[0] == expected_serial), None)
        if match is None:
            return AdbStatus(
                connected=False, serial=expected_serial, state="not_found",
                message=f"Handy mit Seriennummer {expected_serial} nicht gefunden.",
            )
        serial, state = match
    elif len(devices) == 1:
        serial, state = devices[0]
    elif len(devices) == 0:
        return AdbStatus(connected=False, serial=None, state="no_device", message="Kein Handy über USB erkannt.")
    else:
        return AdbStatus(
            connected=False, serial=None, state="ambiguous",
            message=f"{len(devices)} Geräte erkannt - bitte adb_device_serial in der Konfiguration festlegen.",
        )

    if state == "device":
        return AdbStatus(connected=True, serial=serial, state=state, message="Handy verbunden und autorisiert.")
    if state == "unauthorized":
        return AdbStatus(
            connected=False, serial=serial, state=state,
            message="Handy erkannt, aber USB-Debugging nicht autorisiert - Bestätigung am Handy nötig.",
        )
    if state == "offline":
        return AdbStatus(connected=False, serial=serial, state=state, message="Handy erkannt, aber offline - USB-Kabel/Anschluss prüfen.")

    return AdbStatus(connected=False, serial=serial, state=state, message=f"Unerwarteter Status: {state}")
