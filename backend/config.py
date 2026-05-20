import os
import secrets
from pathlib import Path
from typing import Literal

from cryptography.fernet import Fernet
from dotenv import load_dotenv

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

# Socrata host this instance is bound to (e.g. data.wa.gov).
# Every Socrata-platform portal exposes the same /api/views, SODA, OAuth, and
# catalog endpoints — swap the domain to target a different portal. The OAuth
# app token must be registered on this same domain.
SOCRATA_DOMAIN = os.getenv("SOCRATA_DOMAIN", "data.wa.gov").strip() or "data.wa.gov"
# Allow users to paste full URLs (e.g. "https://data.cityofnewyork.us/") —
# strip the scheme and trailing slashes so only the bare domain remains.
for _prefix in ("https://", "http://"):
    if SOCRATA_DOMAIN.startswith(_prefix):
        SOCRATA_DOMAIN = SOCRATA_DOMAIN[len(_prefix) :]
        break
SOCRATA_DOMAIN = SOCRATA_DOMAIN.rstrip("/")
SOCRATA_BASE_URL = f"https://{SOCRATA_DOMAIN}"

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
