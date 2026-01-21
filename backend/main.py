"""
FastAPI backend for AI Metadata Improvement Tool
Designed for Databricks Apps deployment
"""

import os
import json
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse, FileResponse, JSONResponse
from pydantic import BaseModel
import httpx
from openai import AsyncOpenAI
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Configuration
SOCRATA_APP_TOKEN = os.getenv("SOCRATA_APP_TOKEN", "")
AZURE_ENDPOINT = os.getenv("AZURE_ENDPOINT", "")
AZURE_KEY = os.getenv("AZURE_KEY", "")
AZURE_MODEL = os.getenv("AZURE_MODEL", "")
CORS_ORIGIN = os.getenv("CORS_ORIGIN", "*")

# For Databricks Apps, the port is typically provided via environment variable
PORT = int(os.getenv("PORT", "8000"))

app = FastAPI(
    title="AI Metadata Improvement Tool API",
    description="Backend API for metadata improvement using AI",
    version="1.0.0",
)

# CORS middleware - more permissive for Databricks Apps
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Databricks Apps handles auth
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request/Response Models
class FetchCsvRequest(BaseModel):
    url: str


class FetchCsvResponse(BaseModel):
    csvText: str
    fileName: str


class ChatRequest(BaseModel):
    prompt: str
    systemPrompt: Optional[str] = None
    model: Optional[str] = None
    baseURL: Optional[str] = None
    apiKey: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    timestamp: str


# Health check endpoint
@app.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(status="ok", timestamp=datetime.utcnow().isoformat() + "Z")


# CSV fetch endpoint
@app.post("/api/csv/fetch", response_model=FetchCsvResponse)
async def fetch_csv(request: FetchCsvRequest):
    if not request.url:
        raise HTTPException(status_code=400, detail="URL is required")

    if not SOCRATA_APP_TOKEN:
        raise HTTPException(
            status_code=500,
            detail="SOCRATA_APP_TOKEN not configured. Please set it in the environment.",
        )

    headers = {
        "Accept": "text/csv",
        "X-App-Token": SOCRATA_APP_TOKEN,
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(request.url, headers=headers)

            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Failed to fetch CSV: {response.reason_phrase}",
                )

            csv_text = response.text
            file_name = request.url.split("/")[-1] or "remote-data.csv"

            return FetchCsvResponse(csvText=csv_text, fileName=file_name)

    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch CSV: {str(e)}")


# OpenAI streaming chat endpoint
@app.post("/api/openai/chat/stream")
async def openai_chat_stream(request: ChatRequest, http_request: Request):
    # Get configuration from request or environment
    base_url = request.baseURL or AZURE_ENDPOINT
    api_key = request.apiKey or AZURE_KEY
    model = request.model or AZURE_MODEL

    # Validate configuration
    missing_config = []
    if not base_url:
        missing_config.append("Base URL (AZURE_ENDPOINT)")
    if not api_key:
        missing_config.append("API Key (AZURE_KEY)")
    if not model:
        missing_config.append("Model (AZURE_MODEL)")

    if missing_config:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required configuration: {', '.join(missing_config)}. "
            "Please set these in the environment or enter them in the UI.",
        )

    system_prompt = request.systemPrompt or (
        "You are a data analyst expert who creates clear, concise, "
        "and informative descriptions of datasets and their columns."
    )

    async def generate():
        usage = {
            "promptTokens": 0,
            "completionTokens": 0,
            "totalTokens": 0,
        }

        try:
            client = AsyncOpenAI(
                base_url=base_url,
                api_key=api_key,
            )

            stream = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": request.prompt},
                ],
                stream=True,
                stream_options={"include_usage": True},
            )

            async for chunk in stream:
                # Check if client disconnected
                if await http_request.is_disconnected():
                    break

                if chunk.choices and chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    yield f"data: {json.dumps({'type': 'content', 'content': content})}\n\n"

                if chunk.usage:
                    usage["promptTokens"] = chunk.usage.prompt_tokens or 0
                    usage["completionTokens"] = chunk.usage.completion_tokens or 0
                    usage["totalTokens"] = chunk.usage.total_tokens or 0

            # Send final usage data
            yield f"data: {json.dumps({'type': 'usage', 'usage': usage})}\n\n"
            yield "data: [DONE]\n\n"

        except Exception as e:
            error_message = str(e)
            yield f"data: {json.dumps({'type': 'error', 'error': error_message})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# Serve static files (React frontend) - must be last
# In Databricks Apps, static files are served from the 'static' directory
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static_assets")

    # Serve index.html for all non-API routes (SPA support)
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Don't interfere with API routes
        if full_path.startswith("api/") or full_path == "health":
            raise HTTPException(status_code=404, detail="Not found")

        # Try to serve the exact file first
        file_path = static_dir / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)

        # Fall back to index.html for SPA routing
        index_path = static_dir / "index.html"
        if index_path.exists():
            return FileResponse(index_path)

        raise HTTPException(status_code=404, detail="Not found")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=PORT)
