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
    mode: Literal["default", "concise", "detailed", "suggest"] | None = None


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
    """Request to import a dataset from the Socrata portal by dataset ID.

    Auth (OAuth token or API key) is read from the encrypted session cookie.
    `apiKeyId`/`apiKeySecret` may instead carry a single-use API key inline —
    used for one import without persisting it to the session, so it works even
    when ENABLE_CONFIG_SAVE is false. When present it's tried before any
    session credential.

    `domain` is an optional per-request portal override: when a full dataset URL
    is pasted, the frontend sends the URL's host so the read targets that portal
    for this import only. It is NOT persisted — the user's configured portal
    (used for push-back) is unchanged. Falls back to the configured portal.
    """

    datasetId: str
    apiKeyId: str | None = None
    apiKeySecret: str | None = None
    domain: str | None = None


class SocrataColumnMetadata(BaseModel):
    """Metadata for a single column from Socrata."""

    fieldName: str
    name: str
    description: str
    dataTypeName: str


class ColumnStats(BaseModel):
    """Pre-computed column statistics matching the frontend ColumnInfo shape."""

    type: Literal[
        "numeric", "categorical", "text", "temporal", "geospatial", "opaque", "empty"
    ]
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
    # True when the authenticated identity may edit this dataset (i.e. owns it
    # or is a collaborator). Drives whether the UI offers a metadata push-back.
    canEdit: bool = False


class SocrataRightsResponse(BaseModel):
    """Whether the current identity may edit a given dataset.

    Lets the UI refresh the import-time `canEdit` after a credential change
    (sign-in/out, API-key swap) without re-importing the whole dataset.
    """

    canEdit: bool = False


# ============================================================================
# Socrata Export Models
# ============================================================================


class SocrataColumnUpdate(BaseModel):
    """Updated metadata for a single column to push back to Socrata.

    Identified by the current `fieldName`. Any of `description`, `name`, or
    `newFieldName` may be supplied to update the matching column.
    """

    fieldName: str
    description: str | None = None
    name: str | None = None
    newFieldName: str | None = None


class SocrataExportRequest(BaseModel):
    """Request to push updated metadata back to the Socrata portal.

    Auth (OAuth token or API key) is read from the encrypted session cookie.
    """

    datasetId: str
    datasetTitle: str | None = Field(default=None, min_length=1)
    datasetDescription: str | None = None
    rowLabel: str | None = None
    category: str | None = Field(default=None, min_length=1)
    tags: list[str] | None = None
    licenseId: str | None = None
    attribution: str | None = None
    contactEmail: str | None = None
    periodOfTime: str | None = None
    postingFrequency: str | None = None
    columns: list[SocrataColumnUpdate] = []


class SocrataExportResponse(BaseModel):
    """Response from pushing metadata to the Socrata portal."""

    success: bool
    message: str
    updatedColumns: int


# ============================================================================
# Socrata Categories Models
# ============================================================================


class SocrataConfigResponse(BaseModel):
    """Public Socrata config the frontend needs at boot (e.g. the portal domain).

    `domain` is the portal currently in effect (per-user override or default);
    `defaultDomain` is the server default, so the UI can offer a reset.
    `enableOAuth` controls whether the "Sign in" UI is shown.
    `enableConfigSave` controls whether the Settings "Save keys" /
    "Save configuration" (and "Clear") buttons are shown.
    """

    domain: str
    defaultDomain: str
    enableOAuth: bool
    enableConfigSave: bool


class SocrataDomainRequest(BaseModel):
    """Request body for setting the per-user Socrata portal override.

    An empty string clears the override and reverts to the server default.
    """

    domain: str = Field(default="", max_length=253)


class SocrataCategoriesResponse(BaseModel):
    """Response with the list of live categories advertised by the Socrata portal."""

    categories: list[str]


class SocrataTagsResponse(BaseModel):
    """Response with the live list of tags from the Socrata portal, sorted by usage."""

    tags: list[str]


class SocrataLicenseInfo(BaseModel):
    """A single license option advertised by the Socrata portal."""

    id: str
    name: str
    termsLink: str | None = None


class SocrataLicensesResponse(BaseModel):
    """Response with the live list of licenses advertised by the Socrata portal."""

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
    """Current Socrata auth: the OAuth identity and/or saved API key.

    OAuth and API key are independent — either, both, or neither may be
    present. The API key secret is never returned, only its id for display.
    """

    user: SocrataOAuthUserInfo | None = None
    apiKeyId: str | None = None


# ============================================================================
# OpenAI Configuration Models
# ============================================================================


class OpenAIConfigRequest(BaseModel):
    """Request body for saving OpenAI configuration to the session cookie."""

    baseURL: str = Field(..., max_length=1024)
    apiKey: str = Field(..., max_length=1024)
    model: str = Field(..., max_length=256)
    modelConcise: str | None = Field(default=None, max_length=256)
    modelDetailed: str | None = Field(default=None, max_length=256)
    modelSuggest: str | None = Field(default=None, max_length=256)


class OpenAISessionResponse(BaseModel):
    """State of the current OpenAI configuration in the session.

    The apiKey is never returned.
    """

    isConfigured: bool
    baseURL: str | None = None
    model: str | None = None
    modelConcise: str | None = None
    modelDetailed: str | None = None
    modelSuggest: str | None = None
