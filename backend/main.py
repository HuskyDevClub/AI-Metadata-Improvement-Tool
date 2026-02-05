"""
FastAPI backend for AI Metadata Improvement Tool
Designed for Databricks Apps deployment
"""

import json
import os
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from models import (
    ChatRequest,
    FetchCsvRequest,
    FetchCsvResponse,
    HealthResponse,
    JudgeMetrics,
    JudgeRequest,
    JudgeResponse,
)
from openai import AsyncOpenAI
from openai.types.chat import ChatCompletionMessageParam

# Load environment variables from .env file
load_dotenv()

# Configuration
SOCRATA_APP_TOKEN = os.getenv("SOCRATA_APP_TOKEN", "")
AZURE_ENDPOINT = os.getenv("AZURE_ENDPOINT", "")
AZURE_KEY = os.getenv("AZURE_KEY", "")
AZURE_MODEL = os.getenv("AZURE_MODEL", "")
CORS_ORIGIN = os.getenv("CORS_ORIGIN", "*")

# Load JSON schemas
SCHEMAS_DIR = Path(__file__).parent / "schemas"
JUDGE_RESPONSE_SCHEMA = json.loads((SCHEMAS_DIR / "judge_response.json").read_text())

# For Databricks Apps, the port is typically provided via environment variable
PORT = int(os.getenv("PORT", "8000"))

# Validate required configuration at startup
if not SOCRATA_APP_TOKEN:
    raise RuntimeError(
        "SOCRATA_APP_TOKEN is required. Please set it in the environment variables."
    )

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


# Health check endpoint
@app.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    return HealthResponse(
        status="ok",
        timestamp=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    )


# CSV fetch endpoint
@app.post("/api/csv/fetch", response_model=FetchCsvResponse)
async def fetch_csv(request: FetchCsvRequest) -> FetchCsvResponse:
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
async def openai_chat_stream(
    request: ChatRequest, http_request: Request
) -> StreamingResponse:
    # Get configuration from the request or environment
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

    # Build messages array, only include system prompt if provided
    messages: list[ChatCompletionMessageParam] = []
    if request.systemPrompt and request.systemPrompt.strip():
        messages.append({"role": "system", "content": request.systemPrompt})
    messages.append({"role": "user", "content": request.prompt})

    async def generate() -> AsyncGenerator[str, None]:
        usage: dict[str, int] = {
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
                messages=messages,
                stream=True,
                stream_options={"include_usage": True},
            )

            async for chunk in stream:
                # Check if the client disconnected
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


@app.post("/api/openai/judge", response_model=JudgeResponse)
async def judge_outputs(request: JudgeRequest) -> JudgeResponse:
    """Evaluate two model outputs and return structured metrics."""
    # Get configuration from the request or environment
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

    user_prompt = f"""
    CONTEXT:
    {request.context}
    
    CANDIDATE A:
    {request.candidateA}
    
    CANDIDATE B:
    {request.candidateB}
    
    Evaluate both candidates and respond with the JSON structure as specified.
    """

    try:
        client = AsyncOpenAI(
            base_url=base_url,
            api_key=api_key,
        )

        # Build messages array, only include system prompt if provided
        messages: list[ChatCompletionMessageParam] = []
        if request.judgeSystemPrompt and request.judgeSystemPrompt.strip():
            messages.append({"role": "system", "content": request.judgeSystemPrompt})
        messages.append({"role": "user", "content": user_prompt})

        response = await client.chat.completions.create(
            model=model,
            messages=messages,
            response_format={
                "type": "json_schema",
                "json_schema": JUDGE_RESPONSE_SCHEMA,
            },
        )

        content = response.choices[0].message.content
        if not content:
            raise HTTPException(
                status_code=500, detail="Empty response from judge model"
            )

        result = json.loads(content)

        usage = {
            "promptTokens": response.usage.prompt_tokens if response.usage else 0,
            "completionTokens": (
                response.usage.completion_tokens if response.usage else 0
            ),
            "totalTokens": response.usage.total_tokens if response.usage else 0,
        }

        return JudgeResponse(
            modelA=JudgeMetrics.from_dict(result["modelA"]),
            modelB=JudgeMetrics.from_dict(result["modelB"]),
            winner=result["winner"],
            winnerReasoning=result["winnerReasoning"],
            usage=usage,
        )

    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to parse judge response: {str(e)}"
        )
    except KeyError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Invalid judge response structure: missing {str(e)}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Judge evaluation failed: {str(e)}"
        )


# Serve static files (React frontend) - must be last
# In Databricks Apps, static files are served from the 'static' directory
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static_assets")

    # Root route - serve index.html
    @app.get("/")
    async def serve_root() -> FileResponse:
        index_path = static_dir / "index.html"
        if index_path.exists():
            return FileResponse(index_path)
        raise HTTPException(status_code=404, detail="Frontend not built")

    # Serve index.html for all non-API routes (SPA support)
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str) -> FileResponse:
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
