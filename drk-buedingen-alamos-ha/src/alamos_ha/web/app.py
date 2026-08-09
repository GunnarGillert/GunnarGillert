from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

from alamos_ha.models import NodeRole
from alamos_ha.orchestrator import Orchestrator

TEMPLATES_DIR = Path(__file__).parent / "templates"


class ForceRoleRequest(BaseModel):
    role: str


class AutomaticRequest(BaseModel):
    enabled: bool


def create_app(orchestrator: Orchestrator) -> FastAPI:
    app = FastAPI(title="AlamosHA")
    templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

    @app.get("/", response_class=HTMLResponse)
    async def dashboard(request: Request) -> HTMLResponse:
        return templates.TemplateResponse(request, "dashboard.html", {"site_name": orchestrator.config.site_name})

    @app.get("/api/status")
    async def status() -> dict:
        return orchestrator.status_dict()

    @app.post("/api/force-role")
    async def force_role(body: ForceRoleRequest) -> dict:
        try:
            role = NodeRole(body.role)
        except ValueError:
            raise HTTPException(status_code=400, detail="role muss 'master' oder 'standby' sein.")
        if role not in (NodeRole.MASTER, NodeRole.STANDBY):
            raise HTTPException(status_code=400, detail="role muss 'master' oder 'standby' sein.")

        await orchestrator.force_role(role)
        return orchestrator.status_dict()

    @app.post("/api/automatic")
    async def set_automatic(body: AutomaticRequest) -> dict:
        orchestrator.set_automatic(body.enabled)
        return orchestrator.status_dict()

    return app
