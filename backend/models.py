from typing import Any, Literal

from pydantic import BaseModel, Field

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
    """Request to import a dataset from data.wa.gov by dataset ID.

    Auth (OAuth token or API key) is read from the encrypted session cookie.
    """

    datasetId: str


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
    category: str
    tags: list[str]
    licenseId: str = ""
    attribution: str = ""
    contactEmail: str = ""
    periodOfTime: str = ""
    postingFrequency: str = ""
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
    """Request to push updated metadata back to data.wa.gov.

    Auth (OAuth token or API key) is read from the encrypted session cookie.
    """

    datasetId: str
    datasetTitle: str | None = None
    datasetDescription: str | None = None
    rowLabel: str | None = None
    category: str | None = None
    tags: list[str] | None = None
    licenseId: str | None = None
    attribution: str | None = None
    contactEmail: str | None = None
    periodOfTime: str | None = None
    postingFrequency: str | None = None
    columns: list[SocrataColumnUpdate] = []


class SocrataExportResponse(BaseModel):
    """Response from pushing metadata to data.wa.gov."""

    success: bool
    message: str
    updatedColumns: int


# ============================================================================
# Socrata Categories Models
# ============================================================================


class SocrataCategoriesResponse(BaseModel):
    """Response with the list of live categories advertised by data.wa.gov."""

    categories: list[str]


class SocrataTagsResponse(BaseModel):
    """Response with the live list of tags from data.wa.gov, sorted by usage."""

    tags: list[str]


class SocrataLicenseInfo(BaseModel):
    """A single license option advertised by data.wa.gov."""

    id: str
    name: str
    termsLink: str | None = None


class SocrataLicensesResponse(BaseModel):
    """Response with the live list of licenses advertised by data.wa.gov."""

    licenses: list[SocrataLicenseInfo]


# ============================================================================
# Socrata OAuth Models
# ============================================================================


class SocrataOAuthLoginResponse(BaseModel):
    """Response containing the OAuth authorization URL."""

    authUrl: str


class SocrataOAuthUserInfo(BaseModel):
    """Current user info from Socrata after OAuth authentication."""

    id: str
    displayName: str
    email: str | None = None


# ============================================================================
# Session Models (covers both OAuth and API Key auth)
# ============================================================================


class SocrataApiKeyRequest(BaseModel):
    """Request body for saving an API key to the session cookie."""

    apiKeyId: str = Field(..., max_length=256)
    apiKeySecret: str = Field(..., max_length=256)


class SocrataSessionResponse(BaseModel):
    """State of the current Socrata auth session.

    The `kind` field is null when no session is active. The API key secret is
    never returned — only the id, for display purposes.
    """

    kind: Literal["oauth", "api_key"] | None = None
    user: SocrataOAuthUserInfo | None = None
    apiKeyId: str | None = None
