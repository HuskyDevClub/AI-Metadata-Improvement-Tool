from pydantic import BaseModel
from typing import Any


# ============================================================================
# Chat/Streaming Models
# ============================================================================


class ChatRequest(BaseModel):
    """Request for OpenAI-compatible chat completion with streaming support."""

    prompt: str
    systemPrompt: str | None = None
    model: str | None = None  # Falls back to LLM_MODEL env var
    baseURL: str | None = None  # Falls back to LLM_ENDPOINT env var
    apiKey: str | None = None  # Falls back to LLM_API_KEY env var


# ============================================================================
# Health Check Models
# ============================================================================


class HealthResponse(BaseModel):
    """Health check endpoint response."""

    status: str
    timestamp: str


# ============================================================================
# Socrata Import Models
# ============================================================================


class SocrataImportRequest(BaseModel):
    """Request to import a dataset from data.wa.gov by dataset ID."""

    datasetId: str
    oauthToken: str | None = None
    apiKeyId: str | None = None
    apiKeySecret: str | None = None


class SocrataColumnMetadata(BaseModel):
    """Metadata for a single column from Socrata."""

    fieldName: str
    name: str
    description: str
    dataTypeName: str


class ColumnStats(BaseModel):
    """Pre-computed column statistics matching the frontend ColumnInfo shape."""

    type: str  # "numeric" | "categorical" | "text" | "empty"
    stats: dict[str, Any]
    nullCount: int
    totalCount: int


class SocrataImportResponse(BaseModel):
    """Response containing sample rows, pre-computed stats, and Socrata metadata."""

    sampleRows: list[dict[str, Any]]
    totalRowCount: int
    fileName: str
    datasetName: str
    datasetDescription: str
    rowLabel: str
    columns: list[SocrataColumnMetadata]
    columnStats: dict[str, ColumnStats]


# ============================================================================
# Socrata Export Models
# ============================================================================


class SocrataColumnUpdate(BaseModel):
    """Updated description for a single column to push back to Socrata."""

    fieldName: str
    description: str


class SocrataExportRequest(BaseModel):
    """Request to push updated metadata back to data.wa.gov."""

    datasetId: str
    oauthToken: str | None = None
    apiKeyId: str | None = None
    apiKeySecret: str | None = None
    datasetTitle: str | None = None
    datasetDescription: str | None = None
    rowLabel: str | None = None
    columns: list[SocrataColumnUpdate] = []


class SocrataExportResponse(BaseModel):
    """Response from pushing metadata to data.wa.gov."""

    success: bool
    message: str
    updatedColumns: int


# ============================================================================
# Socrata OAuth Models
# ============================================================================


class SocrataOAuthLoginResponse(BaseModel):
    """Response containing the OAuth authorization URL."""

    authUrl: str


class SocrataOAuthUserInfoRequest(BaseModel):
    """Request to fetch user info using an OAuth token."""

    oauthToken: str


class SocrataOAuthUserInfo(BaseModel):
    """Current user info from Socrata after OAuth authentication."""

    id: str
    displayName: str
    email: str | None = None
