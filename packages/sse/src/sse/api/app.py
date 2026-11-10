"""FastAPI application factory for the SSE REST API."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from sse import __version__
from sse.api.routes import api_router


def create_app() -> FastAPI:
    """Create and configure the FastAPI web service application."""
    app = FastAPI(
        title="Strategic Systems Engine (SSE) REST API",
        description="Formal strategic model analysis, mathematical equilibrium solving, and multi-domain game simulation.",
        version=__version__,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # Enable CORS for web dashboards and local research tools
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router, prefix="/api/v1")
    return app


app = create_app()

