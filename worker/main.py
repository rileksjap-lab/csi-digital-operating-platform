"""
CSI Digital Operating Platform — FastAPI Compute Worker

Handles CPU-intensive operations that are offloaded from the Next.js BFF:
  - Capacity utilisation calculations and Go/No-Go projections  (PRD §13)
  - Tender scoring algorithm                                     (PRD §12)
  - Async report generation (PPTX / PDF) via Celery tasks        (PRD §16)

Port: 8001 (internal only — never exposed externally, SAD §16.2).
The Next.js API calls this service via FASTAPI_WORKER_URL env var.
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse


# ── Lifespan (startup / shutdown) ────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # TODO: initialise asyncpg connection pool, Redis client, Celery app
    yield
    # TODO: close connection pool on shutdown


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="CSI DOP Compute Worker",
    version="0.1.0",
    docs_url="/docs" if os.getenv("ENVIRONMENT", "development") != "production" else None,
    lifespan=lifespan,
)


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok"}


# ── Capacity (/capacity/*) ────────────────────────────────────────────────────

@app.get("/capacity/utilisation")
async def capacity_utilisation():
    # TODO: query ASSIGNMENT + EFFORT_LOG via asyncpg, return per-staff utilisation
    return JSONResponse({"detail": "Not implemented"}, status_code=501)


@app.get("/capacity/projection")
async def capacity_projection():
    # TODO: compute forward-looking capacity based on open WOs and role splits
    return JSONResponse({"detail": "Not implemented"}, status_code=501)


@app.post("/capacity/gonogo")
async def gonogo_evaluation():
    # TODO: evaluate Go/No-Go for a tender based on current capacity snapshot
    return JSONResponse({"detail": "Not implemented"}, status_code=501)


# ── Tender Scoring (/tender/score) ───────────────────────────────────────────

@app.post("/tender/score")
async def tender_score():
    # TODO: apply MULTIPLIER_FACTOR weights to TENDER_SCORING dimensions,
    #       return normalised score and recommendation
    return JSONResponse({"detail": "Not implemented"}, status_code=501)


# ── Report Generation (/reports/*) ───────────────────────────────────────────

@app.post("/reports/generate")
async def report_generate():
    # TODO: enqueue Celery task; return job_id for polling
    return JSONResponse({"detail": "Not implemented"}, status_code=501)


@app.get("/reports/jobs/{job_id}")
async def report_job_status(job_id: str):
    # TODO: check Celery task state, return status + download URL when done
    return JSONResponse({"detail": "Not implemented"}, status_code=501)
