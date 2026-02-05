from typing import Any

from pydantic import BaseModel


# ============================================================================
# CSV Fetch Models
# ============================================================================


class FetchCsvRequest(BaseModel):
    """Request to fetch a CSV file from a remote URL (e.g., Socrata open data)."""

    url: str


class FetchCsvResponse(BaseModel):
    """Response containing the fetched CSV content."""

    csvText: str
    fileName: str


# ============================================================================
# Chat/Streaming Models
# ============================================================================


class ChatRequest(BaseModel):
    """Request for OpenAI-compatible chat completion with streaming support."""

    prompt: str
    systemPrompt: str | None = None
    model: str | None = None  # Falls back to AZURE_MODEL env var
    baseURL: str | None = None  # Falls back to AZURE_ENDPOINT env var
    apiKey: str | None = None  # Falls back to AZURE_KEY env var


# ============================================================================
# Judge/Comparison Models
# ============================================================================


class JudgeRequest(BaseModel):
    """Request to evaluate two model outputs using a judge model."""

    context: str  # Dataset context (fileName, rowCount, columns)
    candidateA: str  # Model A output
    candidateB: str  # Model B output
    model: str | None = None  # Falls back to AZURE_MODEL env var
    baseURL: str | None = None  # Falls back to AZURE_ENDPOINT env var
    apiKey: str | None = None  # Falls back to AZURE_KEY env var
    judgeSystemPrompt: str | None = None  # Custom judge system prompt


class JudgeMetrics(BaseModel):
    """Evaluation metrics for a single candidate (scored 1-10)."""

    clarity: int  # How easy to understand, uses plain language
    completeness: int  # Covers content, purpose, and use cases
    accuracy: int  # Correctly describes the data
    conciseness: int  # Brief while still informative
    plainLanguage: int  # Uses active voice, simple words
    reasoning: str  # Brief explanation for the scores

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "JudgeMetrics":
        """Create a JudgeMetrics instance from a dictionary."""
        return cls(**data)


class JudgeResponse(BaseModel):
    """Response containing evaluation results for both candidates."""

    modelA: JudgeMetrics
    modelB: JudgeMetrics
    winner: str  # 'A', 'B', or 'tie'
    winnerReasoning: str
    usage: dict[str, int]  # Token usage stats


# ============================================================================
# Health Check Models
# ============================================================================


class HealthResponse(BaseModel):
    """Health check endpoint response."""

    status: str
    timestamp: str
