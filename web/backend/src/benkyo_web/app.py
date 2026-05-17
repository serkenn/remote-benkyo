"""Litestar application factory."""

from __future__ import annotations

import uvicorn
from litestar import Litestar
from litestar.config.cors import CORSConfig
from litestar.openapi import OpenAPIConfig

from benkyo_web.routes.concepts import ConceptController
from benkyo_web.routes.events import EventController
from benkyo_web.routes.projects import ProjectController
from benkyo_web.routes.schedule import ExamController, ScheduleController
from benkyo_web.routes.tunnel import TunnelController


def create_app() -> Litestar:
    return Litestar(
        route_handlers=[
            ProjectController,
            ConceptController,
            EventController,
            ScheduleController,
            ExamController,
            TunnelController,
        ],
        cors_config=CORSConfig(allow_origins=["*"]),
        openapi_config=OpenAPIConfig(title="benkyo API", version="0.1.0"),
    )


app = create_app()


def run() -> None:
    uvicorn.run(
        "benkyo_web.app:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
    )


if __name__ == "__main__":
    run()
