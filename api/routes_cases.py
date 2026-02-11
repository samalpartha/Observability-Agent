"""Create Kibana Case from a run (Observability Copilot → Cases)."""
import os
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user

router = APIRouter(prefix="", tags=["cases"])


def _kibana_cases_url() -> tuple[str, str]:
    """Return (base_url, api_key). Raises if not configured."""
    kibana_url = (os.environ.get("KIBANA_URL") or "").strip().rstrip("/")
    api_key = (os.environ.get("ELASTIC_API_KEY") or "").strip()
    space = (os.environ.get("ELASTIC_SPACE_ID") or "default").strip() or "default"
    if not kibana_url:
        raise HTTPException(
            status_code=503,
            detail="KIBANA_URL not configured. Set it in .env to create cases.",
        )
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="ELASTIC_API_KEY not configured. Required for Kibana Cases API.",
        )
    path = f"/s/{space}/api/cases" if space != "default" else "/api/cases"
    return f"{kibana_url}{path}", api_key


@router.post("/cases")
async def create_case(
    body: dict[str, Any],
    username: str = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Create a Kibana Case from a run. Body: title, description, tags (optional),
    severity (optional), evidence_comment (optional markdown). Uses Kibana Cases API
    with connector type .none (no external system).
    """
    title = (body.get("title") or "Observability run")[:160]
    description = (body.get("description") or "")[:30000]
    tags = body.get("tags")
    if not isinstance(tags, list):
        tags = []
    tags = [str(t)[:256] for t in tags[:200]]
    severity = body.get("severity", "medium")
    if severity not in ("low", "medium", "high", "critical"):
        severity = "medium"
    evidence_comment = body.get("evidence_comment") or ""

    url, api_key = _kibana_cases_url()

    payload = {
        "title": title,
        "description": description,
        "tags": tags,
        "severity": severity,
        "connector": {
            "id": "none",
            "name": "none",
            "type": ".none",
            "fields": None,
        },
        "owner": "observability",
        "settings": {"syncAlerts": True},
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            url,
            json=payload,
            headers={
                "Authorization": f"ApiKey {api_key}",
                "Content-Type": "application/json",
                "kbn-xsrf": "true",
            },
        )

        if resp.status_code != 200:
            try:
                err = resp.json()
                msg = err.get("message") or err.get("error") or resp.text
            except Exception:
                msg = resp.text or f"HTTP {resp.status_code}"
            raise HTTPException(status_code=502, detail=f"Kibana Cases API error: {msg}")

        data = resp.json()
        case_id = data.get("id")
        case_url = None
        kibana_base = (os.environ.get("KIBANA_URL") or "").strip().rstrip("/")
        space = (os.environ.get("ELASTIC_SPACE_ID") or "default").strip() or "default"
        if kibana_base and case_id:
            case_url = f"{kibana_base}/s/{space}/app/observability/cases/{case_id}"

        result = {
            "ok": True,
            "case_id": case_id,
            "case_url": case_url,
            "title": data.get("title"),
        }

        if evidence_comment and case_id and kibana_base:
            add_comment_url = f"{kibana_base}/s/{space}/api/cases/{case_id}/comments" if space != "default" else f"{kibana_base}/api/cases/{case_id}/comments"
            add_resp = await client.post(
                add_comment_url,
                json={"comment": evidence_comment, "type": "user"},
                headers={
                    "Authorization": f"ApiKey {api_key}",
                    "Content-Type": "application/json",
                    "kbn-xsrf": "true",
                },
            )
            if add_resp.status_code == 200:
                result["comment_added"] = True

        return result
