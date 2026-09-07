from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.api.v1 import auth, batches, cases, exports, training
from app.core.config import settings
from app.models import entities  # noqa: F401  (registers the tables)

logging.basicConfig(level=logging.INFO)


def run_migrations() -> None:
    """Bring the database to the latest revision on startup.

    Replaces `Base.metadata.create_all`, which creates missing tables but never
    alters an existing one: any column added after a database was first created
    silently never appeared, and the API then failed on it at request time.

    A database created before Alembic was adopted must be run through
    `scripts/adopt_alembic.py --apply` once first; on every other database this
    is a no-op after the first start.
    """
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.upgrade(config, "head")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    run_migrations()
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    settings.results_dir.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(
    lifespan=lifespan,
    title="PD Insight API",
    description=(
        "Partial Discharge Diagnostic System. Classification, calibration and "
        "gap-time rules are ported 1:1 from the PRPD_2_Only / PRPD_3_Hybrid / "
        "PRPD_4_Gap Time Colab notebooks."
    ),
    version=settings.final_code_version,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(cases.router, prefix="/api/v1")
app.include_router(batches.router, prefix="/api/v1")
app.include_router(exports.router, prefix="/api/v1")
app.include_router(training.router, prefix="/api/v1")


@app.get("/api/v1/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": settings.final_code_version}


@app.get("/api/v1/files/{file_path:path}")
def serve_file(file_path: str) -> FileResponse:
    """Serve stored PRPD/TF/annotated images."""
    root = settings.storage_dir.resolve()
    target = (root / file_path).resolve()

    # Refuse anything that escapes the storage root.
    if not target.is_relative_to(root) or not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(target)
