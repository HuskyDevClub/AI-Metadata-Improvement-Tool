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


class ScoringCategory(BaseModel):
    """A single scoring category for judge evaluation."""

    key: str
    label: str
    description: str
    minScore: int = 1
    maxScore: int = 10


DEFAULT_SCORING_CATEGORIES = [
    ScoringCategory(
        key="clarity",
        label="Clarity",
        description="How easy is it to understand? Uses plain language, avoids jargon.",
    ),
    ScoringCategory(
        key="completeness",
        label="Completeness",
        description="Does it cover the content, purpose, and potential use cases?",
    ),
    ScoringCategory(
        key="accuracy",
        label="Accuracy",
        description="Does it correctly describe what the data contains?",
    ),
    ScoringCategory(
        key="conciseness",
        label="Conciseness",
        description="Is it brief while still being informative? No unnecessary padding.",
    ),
    ScoringCategory(
        key="plainLanguage",
        label="Plain Language",
        description="Uses active voice, simple words, short sentences.",
    ),
]


class JudgeRequest(BaseModel):
    """Request to evaluate N model outputs using a judge model."""

    context: str  # Dataset context (fileName, rowCount, columns)
    candidates: list[str]  # List of model outputs to evaluate
    model: str | None = None  # Falls back to AZURE_MODEL env var
    baseURL: str | None = None  # Falls back to AZURE_ENDPOINT env var
    apiKey: str | None = None  # Falls back to AZURE_KEY env var
    judgeSystemPrompt: str | None = None  # Custom judge system prompt
    judgeEvaluationPrompt: str  # Evaluation prompt template (required from frontend)
    scoringCategories: list[ScoringCategory] | None = None


class JudgeMetrics(BaseModel):
    """Evaluation metrics for a single candidate (scored 1-10)."""

    scores: dict[str, int]
    reasoning: str

    @classmethod
    def from_dict(
        cls, data: dict[str, Any], category_keys: list[str]
    ) -> "JudgeMetrics":
        """Create a JudgeMetrics instance from a dictionary."""
        scores = {key: data[key] for key in category_keys}
        return cls(scores=scores, reasoning=data["reasoning"])


class JudgeResponse(BaseModel):
    """Response containing evaluation results for N candidates."""

    models: list[JudgeMetrics]
    winnerIndex: int | None  # 0-based index of winner, None = tie
    winnerReasoning: str
    usage: dict[str, int]  # Token usage stats


# ============================================================================
# Health Check Models
# ============================================================================


class HealthResponse(BaseModel):
    """Health check endpoint response."""

    status: str
    timestamp: str
