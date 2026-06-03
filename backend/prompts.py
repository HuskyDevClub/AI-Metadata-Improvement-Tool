from pathlib import Path

from fastapi import APIRouter, HTTPException

router = APIRouter()

# Prompt templates live as plain .md files under prompts/ at the repo root
# (sibling of backend/). The frontend inlines them at build time via Vite's
# `?raw` imports; this endpoint serves the same files so the separate
# AI-Metadata-Evaluation-Tool can score the exact prompts this app ships
# instead of a drifting copy. deploy.sh ships prompts/ alongside backend/ so
# this resolves at runtime in Databricks too.
_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


@router.get("/api/prompts")
async def get_prompts() -> dict[str, dict[str, str]]:
    """Return the canonical prompt templates as {name: markdown}.

    Names are the file stems under prompts/ (e.g. "system", "dataset",
    "column"). The raw `{token}` placeholders and untrusted-data fences are
    left intact for the caller to substitute.
    """
    if not _PROMPTS_DIR.is_dir():
        raise HTTPException(status_code=404, detail="Prompts directory not found")
    prompts = {
        path.stem: path.read_text(encoding="utf-8")
        for path in sorted(_PROMPTS_DIR.glob("*.md"))
    }
    return {"prompts": prompts}
