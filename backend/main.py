from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import RequestResponseEndpoint

# Importing config first triggers dotenv loading for the whole package, so any
# module imported afterwards (e.g. .eval) sees a populated environment.
from .config import ENABLE_EVAL, FRONTEND_URL, PORT
from .auth import router as auth_router
from .eval import router as eval_router
from .llm import router as llm_router
from .models import HealthResponse
from .socrata import router as socrata_router

app = FastAPI(
    title="AI Metadata Improvement Tool API",
    description="Backend API for metadata improvement using AI",
    version="1.0.0",
)

# CORS: cookie-based sessions require a concrete allowed origin (wildcard +
# credentials is rejected by browsers). In production the backend and frontend
# are same-origin (Databricks Apps), so no CORS preflight fires. In dev, the
# Vite proxy forwards /api/* same-origin, so this mainly guards against direct
# cross-origin calls. FRONTEND_URL is the canonical allowed origin.
_cors_origins = (
    [FRONTEND_URL]
    if FRONTEND_URL
    else ["http://localhost:5173", "http://localhost:8000"]
)
if ENABLE_EVAL:
    # The eval viewer is a standalone HTML in scripts/, usually opened either
    # via `python -m http.server 5500` or directly off disk (file://). Allow
    # those origins only when ENABLE_EVAL is on so prod CORS is untouched.
    for extra in (
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "null",
    ):
        if extra not in _cors_origins:
            _cors_origins.append(extra)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
)


@app.middleware("http")
async def add_security_headers(
    request: Request, call_next: RequestResponseEndpoint
) -> Response:
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    # SAMEORIGIN (not DENY): Databricks Apps serves frontend + backend at the
    # same origin and documents an optional iframe embedding path. CSP
    # frame-ancestors 'self' is the modern equivalent.
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Strict-Transport-Security"] = (
        "max-age=31536000; includeSubDomains"
    )
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; frame-ancestors 'self'"
    )
    return response


@app.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    return HealthResponse(
        status="ok",
        timestamp=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    )


# Register API routers. Eval router must be included before the SPA catch-all
# below so /api/eval/run is not shadowed.
app.include_router(auth_router)
app.include_router(socrata_router)
app.include_router(llm_router)
app.include_router(eval_router)


# Serve static files (React frontend) - must be last
# In Databricks Apps, static files are served from the 'static' directory
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static_assets")

    @app.get("/")
    async def serve_root() -> FileResponse:
        index_path = static_dir / "index.html"
        if index_path.exists():
            return FileResponse(index_path)
        raise HTTPException(status_code=404, detail="Frontend not built")

    # Serve index.html for all non-API routes (SPA support)
    _STATIC_ROOT = static_dir.resolve()

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str) -> FileResponse:
        # Don't interfere with API routes
        if full_path.startswith("api/") or full_path == "health":
            raise HTTPException(status_code=404, detail="Not found")

        # Resolve the requested path and confirm it stays inside static_dir.
        # Prevents path-traversal (e.g. "../../etc/passwd") from escaping the
        # static root.
        file_path = (static_dir / full_path).resolve()
        if file_path.is_relative_to(_STATIC_ROOT) and file_path.is_file():
            return FileResponse(file_path)

        # Fall back to index.html for SPA routing
        index_path = _STATIC_ROOT / "index.html"
        if index_path.is_file():
            return FileResponse(index_path)

        raise HTTPException(status_code=404, detail="Not found")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=PORT)
