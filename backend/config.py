import os
import re
import secrets
from pathlib import Path
from typing import Literal

from cryptography.fernet import Fernet
from dotenv import load_dotenv
from fastapi import Request

# Env load order: .env.databricks fills baseline values for the deployed app,
# then local .env files override for local dev (backend/.env, then cwd .env).
# Importing this module is what triggers env loading for the whole package.
_BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(_BACKEND_DIR.parent / ".env.databricks")
load_dotenv(_BACKEND_DIR / ".env", override=True)
load_dotenv(override=True)

# --- Socrata ---------------------------------------------------------------
SOCRATA_APP_TOKEN = os.getenv("SOCRATA_APP_TOKEN", "")
SOCRATA_SECRET_TOKEN = os.getenv("SOCRATA_SECRET_TOKEN", "")

# Hostname shape: alphanumeric/hyphen labels joined by dots, at least one dot.
# Deliberately strict — the value is interpolated straight into outbound URLs.
_DOMAIN_RE = re.compile(
    r"^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?"
    r"(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$"
)


def normalize_socrata_domain(raw: str) -> str:
    """Reduce a domain or pasted URL to a bare lowercase hostname.

    Strips the scheme, any path/query/fragment, and trailing slashes, so both
    "https://data.wa.gov/d/abc" and "data.wa.gov" normalize to "data.wa.gov".
    """
    value = (raw or "").strip()
    for prefix in ("https://", "http://"):
        if value.lower().startswith(prefix):
            value = value[len(prefix) :]
            break
    # Keep only the host — drop any /path, ?query, or #fragment.
    value = value.split("/")[0].split("?")[0].split("#")[0]
    return value.strip().rstrip("/").lower()


def is_valid_socrata_domain(domain: str) -> bool:
    """True when *domain* is a plausible bare hostname safe to put in a URL."""
    return bool(_DOMAIN_RE.match(domain or ""))


def socrata_base_url(domain: str) -> str:
    """Return the https base URL for a Socrata portal domain."""
    return f"https://{domain}"


# Socrata host this instance is bound to by default (e.g. data.wa.gov).
# Every Socrata-platform portal exposes the same /api/views, SODA, OAuth, and
# catalog endpoints — swap the domain to target a different portal. The OAuth
# app token must be registered on whichever domain is in use.
#
# This is only the *default*: users can override the portal at runtime from the
# Settings page. The override is stored in the SOCRATA_DOMAIN cookie and
# resolved per-request by resolve_socrata_domain().
SOCRATA_DOMAIN = (
    normalize_socrata_domain(os.getenv("SOCRATA_DOMAIN", "")) or "data.wa.gov"
)
SOCRATA_BASE_URL = socrata_base_url(SOCRATA_DOMAIN)

# Per-user domain override. Stored as a standalone (non-session) cookie so the
# portal choice survives sign-out and isn't entangled with auth credentials.
SOCRATA_DOMAIN_COOKIE_NAME = "socrata_domain"
DOMAIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 365  # 1 year


def resolve_socrata_domain(request: Request) -> str:
    """Return the effective Socrata domain for this request.

    Honors a valid per-user override from the SOCRATA_DOMAIN cookie; otherwise
    falls back to the server default.
    """
    raw = request.cookies.get(SOCRATA_DOMAIN_COOKIE_NAME)
    if raw:
        candidate = normalize_socrata_domain(raw)
        if is_valid_socrata_domain(candidate):
            return candidate
    return SOCRATA_DOMAIN


# Socrata's public catalog API lives on a separate domain (api.us.socrata.com
# for US, api.eu.socrata.com for EU). Override if targeting a non-US portal.
SOCRATA_CATALOG_DOMAIN = (
    os.getenv("SOCRATA_CATALOG_DOMAIN", "api.us.socrata.com").strip()
    or "api.us.socrata.com"
)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# Derive OAuth redirect URI. If it's missing or empty, we derive it from
# FRONTEND_URL automatically (treats an explicit empty value the same as unset).
SOCRATA_OAUTH_REDIRECT_URI = (
    os.getenv("SOCRATA_OAUTH_REDIRECT_URI", "").strip()
    or f"{FRONTEND_URL}/api/auth/socrata/callback"
)

# OAuth is only functional when the portal-app Secret Token is configured.
# The frontend uses this to hide the "Sign in" UI when sign-in can't succeed
# anyway — keeping it visible would just expose a broken button.
ENABLE_SOCRATA_OAUTH = bool(SOCRATA_SECRET_TOKEN)

# Whether the Settings page exposes the "Save keys" / "Save configuration"
# (and their "Clear") buttons. When false — the default — those controls are
# hidden so users can't persist Socrata or LLM credentials into the server-side
# session. Set ENABLE_CONFIG_SAVE=true and restart to expose them; this toggles
# without a frontend rebuild (the frontend reads it from /api/socrata/config).
ENABLE_CONFIG_SAVE = os.getenv("ENABLE_CONFIG_SAVE", "false").lower() == "true"

# --- LLM -------------------------------------------------------------------
LLM_ENDPOINT = os.getenv("LLM_ENDPOINT", "")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "")
LLM_MODEL_CONCISE = os.getenv("LLM_MODEL_CONCISE", "")
LLM_MODEL_DETAILED = os.getenv("LLM_MODEL_DETAILED", "")
LLM_MODEL_SUGGEST = os.getenv("LLM_MODEL_SUGGEST", "")

# --- Session / cookie crypto ----------------------------------------------
# Secret for signing OAuth state tokens (used to prevent CSRF). Prefers a stable
# value from the OAUTH_STATE_SECRET env var so multi-worker / multi-instance
# deploys (e.g. uvicorn --workers N) share the same secret. Falls back to a
# fresh random key per process — fine for single-worker Databricks Apps, but
# restart or worker mismatch will invalidate outstanding state tokens (users
# simply re-initiate the OAuth flow).
OAUTH_STATE_SECRET = os.getenv("OAUTH_STATE_SECRET") or secrets.token_hex(32)

# Fernet key for encrypting the OAuth session cookie. Prefer a stable key from
# the environment to keep users logged in across restarts; fall back to a
# fresh ephemeral key if none is provided.
_session_key = os.getenv("SESSION_ENCRYPTION_KEY") or Fernet.generate_key().decode()
fernet = Fernet(_session_key.encode())

SESSION_COOKIE_NAME = "socrata_session"
try:
    SESSION_COOKIE_MAX_AGE = int(
        os.getenv("SESSION_COOKIE_MAX_AGE_SECONDS", str(60 * 60 * 24))
    )
except ValueError as exc:
    raise RuntimeError(
        "SESSION_COOKIE_MAX_AGE_SECONDS must be a positive integer"
    ) from exc
if SESSION_COOKIE_MAX_AGE <= 0:
    raise RuntimeError("SESSION_COOKIE_MAX_AGE_SECONDS must be a positive integer")

# Cookies need SameSite=None;Secure for cross-site (e.g. Databricks app URL)
# and Lax/Secure for same-origin. Default Lax; Databricks deployment is HTTPS.
COOKIE_SECURE = os.getenv("SESSION_COOKIE_SECURE", "true").lower() != "false"
_samesite_raw = os.getenv("SESSION_COOKIE_SAMESITE", "lax").lower()
COOKIE_SAMESITE: Literal["lax", "strict", "none"] = (
    "strict"
    if _samesite_raw == "strict"
    else "none" if _samesite_raw == "none" else "lax"
)

# --- Server ----------------------------------------------------------------
# For Databricks Apps, the port is typically provided via environment variable.
PORT = int(os.getenv("PORT", "8000"))
