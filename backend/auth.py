import base64
import hashlib
import hmac
import json
import logging
import secrets
import time
from typing import Any
from urllib.parse import urlencode

import httpx
from cryptography.fernet import InvalidToken
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse

from .config import (
    COOKIE_SAMESITE,
    COOKIE_SECURE,
    FRONTEND_URL,
    OAUTH_STATE_SECRET,
    SESSION_COOKIE_MAX_AGE,
    SESSION_COOKIE_NAME,
    SOCRATA_APP_TOKEN,
    SOCRATA_OAUTH_REDIRECT_URI,
    SOCRATA_SECRET_TOKEN,
    fernet,
)
from .models import (
    OpenAIConfigRequest,
    OpenAISessionResponse,
    SocrataApiKeyRequest,
    SocrataOAuthLoginResponse,
    SocrataOAuthUserInfo,
    SocrataSessionResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth")


def require_xhr_header(request: Request) -> None:
    """CSRF guard for cookie-authenticated mutations.

    Cross-site form POSTs cannot set custom request headers without a CORS
    preflight. Requiring `X-Requested-With: XMLHttpRequest` (or any non-empty
    value of that header) blocks classic CSRF without needing a server-side
    token store — which fits the no-datastore design constraint.
    """
    if not request.headers.get("X-Requested-With"):
        raise HTTPException(
            status_code=403,
            detail="Missing X-Requested-With header (CSRF protection).",
        )


def _set_session_payload(response: Response, payload: dict[str, Any]) -> None:
    """Encrypt an auth payload into the session cookie."""
    encrypted = fernet.encrypt(json.dumps(payload).encode()).decode()
    response.set_cookie(
        SESSION_COOKIE_NAME,
        encrypted,
        max_age=SESSION_COOKIE_MAX_AGE,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path="/",
    )


def read_session(request: Request) -> dict[str, Any]:
    """Decrypt the session cookie. Returns the payload dict (empty if missing/invalid)."""
    raw = request.cookies.get(SESSION_COOKIE_NAME)
    if not raw:
        return {}
    try:
        decrypted = fernet.decrypt(raw.encode(), ttl=SESSION_COOKIE_MAX_AGE).decode()
        data = json.loads(decrypted)
        return data if isinstance(data, dict) else {}
    except (InvalidToken, ValueError, json.JSONDecodeError):
        return {}


def _update_session(
    request: Request, response: Response, updates: dict[str, Any]
) -> dict[str, Any]:
    """Read current session, apply updates, and write back to the cookie."""
    session = read_session(request)
    session.update(updates)
    _set_session_payload(response, session)
    return session


def _build_oauth_authorize_url(is_retry: bool = False) -> str:
    """Build a data.wa.gov OAuth authorize URL with a signed state token.

    When *is_retry* is True an ``R`` flag is appended to the state so the
    callback knows not to retry again (prevents infinite redirect loops).
    """
    random_bytes = secrets.token_bytes(16)
    timestamp = str(int(time.time()))
    sig = hmac.new(
        OAUTH_STATE_SECRET.encode(),
        random_bytes + timestamp.encode(),
        hashlib.sha256,
    ).digest()
    random_b64 = base64.urlsafe_b64encode(random_bytes).rstrip(b"=").decode()
    sig_b64 = base64.urlsafe_b64encode(sig).rstrip(b"=").decode()
    state = f"{random_b64}.{sig_b64}.{timestamp}"
    if is_retry:
        state += ".R"
    params = urlencode(
        {
            "client_id": SOCRATA_APP_TOKEN,
            "response_type": "code",
            "redirect_uri": SOCRATA_OAUTH_REDIRECT_URI,
            "state": state,
            "scope": "read_user_info read_site_content write_site_content",
        }
    )
    return f"https://data.wa.gov/oauth/authorize?{params}"


@router.get("/socrata/login", response_model=SocrataOAuthLoginResponse)
async def socrata_oauth_login() -> SocrataOAuthLoginResponse:
    """Return the OAuth authorization URL for data.wa.gov sign-in."""
    if not SOCRATA_APP_TOKEN:
        raise HTTPException(
            status_code=400,
            detail="OAuth not configured. Set SOCRATA_APP_TOKEN in the environment.",
        )
    return SocrataOAuthLoginResponse(authUrl=_build_oauth_authorize_url())


@router.get("/socrata/callback")
async def socrata_oauth_callback(
    request: Request,
    code: str | None = None,
    error: str | None = None,
    state: str | None = None,
) -> RedirectResponse:
    """OAuth callback — exchanges authorization code for access token, redirects to frontend."""
    base = FRONTEND_URL.rstrip("/") if FRONTEND_URL else ""

    if error:
        return RedirectResponse(url=f"{base}/#oauth_error={error}")

    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")

    # Validate signed state token
    if not state:
        logger.warning("OAuth state missing: full_url=%s", str(request.url))
        return RedirectResponse(url=f"{base}/#oauth_error=state_missing")

    try:
        parts = state.split(".")
        if len(parts) not in (3, 4):
            raise ValueError("wrong number of parts")
        random_b64, sig_b64, timestamp_str = parts[0], parts[1], parts[2]
        is_retry = len(parts) == 4 and parts[3] == "R"
        timestamp = int(timestamp_str)
    except (ValueError, OverflowError):
        logger.warning("OAuth state parse failed: state=%s", state)
        return RedirectResponse(url=f"{base}/#oauth_error=state_invalid")

    # Check expiry (10 minutes). Reject future timestamps too — a valid state
    # token can never be issued in the future relative to the same server.
    now = int(time.time())
    if now < timestamp or now - timestamp > 600:
        logger.warning("OAuth state expired: timestamp=%s", timestamp)
        return RedirectResponse(url=f"{base}/#oauth_error=state_expired")

    # Verify HMAC signature
    random_bytes = base64.urlsafe_b64decode(random_b64 + "==")
    sig = base64.urlsafe_b64decode(sig_b64 + "==")
    expected_sig = hmac.new(
        OAUTH_STATE_SECRET.encode(),
        random_bytes + timestamp_str.encode(),
        hashlib.sha256,
    ).digest()
    if not hmac.compare_digest(sig, expected_sig):
        logger.warning("OAuth state signature mismatch: full_url=%s", str(request.url))
        return RedirectResponse(url=f"{base}/#oauth_error=state_invalid")

    if not SOCRATA_APP_TOKEN or not SOCRATA_SECRET_TOKEN:
        raise HTTPException(status_code=500, detail="OAuth not configured on server")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            token_resp = await client.post(
                "https://data.wa.gov/oauth/access_token",
                data={
                    "client_id": SOCRATA_APP_TOKEN,
                    "client_secret": SOCRATA_SECRET_TOKEN,
                    "grant_type": "authorization_code",
                    "redirect_uri": SOCRATA_OAUTH_REDIRECT_URI,
                    "code": code,
                },
            )

            if token_resp.status_code != 200:
                logger.error("OAuth token exchange failed: %s", token_resp.text)
                # data.wa.gov may reissue a stale authorization code from a
                # previous session.  If so, retry once — the failed exchange
                # invalidates the old code, so the next authorize round-trip
                # will produce a fresh one.
                if not is_retry and "Authorization code invalid" in token_resp.text:
                    logger.info("Stale authorization code — retrying OAuth flow")
                    return RedirectResponse(
                        url=_build_oauth_authorize_url(is_retry=True)
                    )
                return RedirectResponse(
                    url=f"{base}/#oauth_error=token_exchange_failed"
                )

            token_data = token_resp.json()
            access_token = token_data.get("access_token")

            if not access_token:
                return RedirectResponse(url=f"{base}/#oauth_error=no_access_token")

            # Success: set encrypted HttpOnly cookie, redirect to frontend home.
            # The frontend calls /api/auth/socrata/session on load to discover the session.
            redirect = RedirectResponse(url=base or "/")
            _update_session(request, redirect, {"kind": "oauth", "token": access_token})
            return redirect

    except Exception as e:
        logger.exception("OAuth callback error: %s", str(e))
        return RedirectResponse(url=f"{base}/#oauth_error=server_error")


@router.get("/socrata/session", response_model=SocrataSessionResponse)
async def socrata_session(request: Request) -> SocrataSessionResponse:
    """Return the state of the current auth session (OAuth or API key)."""
    session = read_session(request)
    kind = session.get("kind")

    if kind == "oauth":
        token = session.get("token") or ""
        if not token:
            return SocrataSessionResponse(kind=None)
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    "https://data.wa.gov/api/users/current.json",
                    headers={"Authorization": f"OAuth {token}"},
                )
                if resp.status_code != 200:
                    return SocrataSessionResponse(kind=None)
                user_data = resp.json()
                return SocrataSessionResponse(
                    kind="oauth",
                    user=SocrataOAuthUserInfo(
                        id=user_data.get("id", ""),
                        displayName=user_data.get("displayName", ""),
                        email=user_data.get("email"),
                    ),
                )
        except Exception as e:
            logger.exception("Session OAuth lookup failed: %s", str(e))
            return SocrataSessionResponse(kind=None)

    if kind == "api_key":
        return SocrataSessionResponse(kind="api_key", apiKeyId=session.get("id", ""))

    return SocrataSessionResponse(kind=None)


@router.put(
    "/socrata/api-key",
    status_code=204,
    dependencies=[Depends(require_xhr_header)],
)
async def socrata_api_key_save(
    body: SocrataApiKeyRequest, request: Request, response: Response
) -> Response:
    """Store a Socrata API key (id + secret) in the encrypted session cookie.

    Replaces any existing OAuth or API key session.
    """
    key_id = body.apiKeyId.strip()
    key_secret = body.apiKeySecret.strip()
    if not key_id or not key_secret:
        raise HTTPException(
            status_code=400, detail="Both apiKeyId and apiKeySecret are required."
        )
    _update_session(
        request, response, {"kind": "api_key", "id": key_id, "secret": key_secret}
    )
    response.status_code = 204
    return response


@router.post(
    "/socrata/logout",
    status_code=204,
    dependencies=[Depends(require_xhr_header)],
)
async def socrata_logout(request: Request, response: Response) -> Response:
    """Clear the Socrata auth from the session cookie. For OAuth sessions, also revoke upstream."""
    session = read_session(request)
    if session.get("kind") == "oauth" and SOCRATA_APP_TOKEN and SOCRATA_SECRET_TOKEN:
        token = session.get("token")
        if token:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    await client.post(
                        "https://data.wa.gov/oauth/revoke_token",
                        data={
                            "access_token": token,
                            "client_id": SOCRATA_APP_TOKEN,
                            "client_secret": SOCRATA_SECRET_TOKEN,
                        },
                    )
            except Exception:
                # Revoke is best-effort — the cookie is still invalidated below.
                logger.exception("Upstream token revoke failed")

    # Only clear Socrata-related keys, keep OpenAI config
    session.pop("kind", None)
    session.pop("token", None)
    session.pop("id", None)
    session.pop("secret", None)
    _set_session_payload(response, session)

    response.status_code = 204
    return response


@router.get("/openai/session", response_model=OpenAISessionResponse)
async def openai_session(request: Request) -> OpenAISessionResponse:
    """Return whether OpenAI is configured in the session."""
    session = read_session(request)
    config = session.get("openai_config")
    if not config or not isinstance(config, dict):
        return OpenAISessionResponse(isConfigured=False)

    return OpenAISessionResponse(
        isConfigured=True,
        baseURL=config.get("baseURL"),
        model=config.get("model"),
        modelConcise=config.get("modelConcise") or None,
        modelDetailed=config.get("modelDetailed") or None,
        modelSuggest=config.get("modelSuggest") or None,
    )


@router.put(
    "/openai/config",
    status_code=204,
    dependencies=[Depends(require_xhr_header)],
)
async def openai_config_save(
    body: OpenAIConfigRequest, request: Request, response: Response
) -> Response:
    """Store OpenAI configuration in the encrypted session cookie."""
    # An empty apiKey on update means "preserve the existing one" — the front-end
    # never echoes the saved key back, so re-saving after editing the model alone
    # would otherwise blank it out and leave a custom model paired with the
    # server's fallback LLM_API_KEY.
    session = read_session(request)
    existing = session.get("openai_config") or {}
    new_api_key = body.apiKey.strip()
    if not new_api_key:
        new_api_key = (existing.get("apiKey") or "").strip()
        if not new_api_key:
            raise HTTPException(
                status_code=400,
                detail="API Key is required to save configuration.",
            )

    _update_session(
        request,
        response,
        {
            "openai_config": {
                "baseURL": body.baseURL.strip(),
                "apiKey": new_api_key,
                "model": body.model.strip(),
                "modelConcise": (body.modelConcise or "").strip(),
                "modelDetailed": (body.modelDetailed or "").strip(),
                "modelSuggest": (body.modelSuggest or "").strip(),
            }
        },
    )
    response.status_code = 204
    return response


@router.post(
    "/openai/logout",
    status_code=204,
    dependencies=[Depends(require_xhr_header)],
)
async def openai_logout(request: Request, response: Response) -> Response:
    """Clear OpenAI configuration from the session cookie."""
    session = read_session(request)
    session.pop("openai_config", None)
    _set_session_payload(response, session)
    response.status_code = 204
    return response
