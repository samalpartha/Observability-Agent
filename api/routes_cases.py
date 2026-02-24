"""Create Kibana Case from a run (Observability Copilot → Cases)."""
import os
import base64
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user

router = APIRouter(prefix="", tags=["cases"])


def _kibana_cases_url() -> tuple[str, str]:
    """Return (cases_url, auth_header). Prefers API key, falls back to Basic Auth."""
    kibana_url = (os.environ.get("KIBANA_URL") or "").strip().rstrip("/")
    space = (os.environ.get("ELASTIC_SPACE_ID") or "default").strip() or "default"

    if not kibana_url:
        raise HTTPException(
            status_code=503,
            detail="KIBANA_URL not configured. Set it in .env to create cases.",
        )

    # Build auth header: prefer API key, fall back to Basic Auth (username:password)
    api_key = (os.environ.get("ELASTIC_API_KEY") or "").strip()
    if api_key:
        auth_header = f"ApiKey {api_key}"
    else:
        username = (os.environ.get("ELASTIC_USERNAME") or "elastic").strip()
        password = (os.environ.get("ELASTIC_PASSWORD") or "").strip()
        if not password:
            raise HTTPException(
                status_code=503,
                detail="Neither ELASTIC_API_KEY nor ELASTIC_PASSWORD configured.",
            )
        token = base64.b64encode(f"{username}:{password}".encode()).decode()
        auth_header = f"Basic {token}"

    path = f"/s/{space}/api/cases" if space != "default" else "/api/cases"
    return f"{kibana_url}{path}", auth_header


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

    url, auth_header = _kibana_cases_url()

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

    common_headers = {
        "Authorization": auth_header,
        "Content-Type": "application/json",
        "kbn-xsrf": "true",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, json=payload, headers=common_headers)

        if resp.status_code not in (200, 201):
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
            if space != "default":
                case_url = f"{kibana_base}/s/{space}/app/observability/cases/{case_id}"
            else:
                case_url = f"{kibana_base}/app/observability/cases/{case_id}"

        result = {
            "ok": True,
            "case_id": case_id,
            "case_url": case_url,
            "title": data.get("title"),
        }

        if evidence_comment and case_id and kibana_base:
            if space != "default":
                add_comment_url = f"{kibana_base}/s/{space}/api/cases/{case_id}/comments"
            else:
                add_comment_url = f"{kibana_base}/api/cases/{case_id}/comments"
            add_resp = await client.post(
                add_comment_url,
                json={"comment": evidence_comment, "type": "user"},
                headers=common_headers,
            )
            if add_resp.status_code in (200, 201):
                result["comment_added"] = True

        return result


@router.get("/cases")
async def list_cases(
    username: str = Depends(get_current_user),
) -> dict[str, Any]:
    """
    List Kibana Cases for the My Cases view.
    Returns the most recent 50 cases sorted by updated_at descending.
    """
    kibana_url = (os.environ.get("KIBANA_URL") or "").strip().rstrip("/")
    if not kibana_url:
        return {"cases": []}

    api_key = (os.environ.get("ELASTIC_API_KEY") or "").strip()
    if api_key:
        auth_header = f"ApiKey {api_key}"
    else:
        username_es = (os.environ.get("ELASTIC_USERNAME") or "elastic").strip()
        password = (os.environ.get("ELASTIC_PASSWORD") or "").strip()
        if not password:
            return {"cases": []}
        token = base64.b64encode(f"{username_es}:{password}".encode()).decode()
        auth_header = f"Basic {token}"

    space = (os.environ.get("ELASTIC_SPACE_ID") or "default").strip() or "default"
    path = f"/s/{space}/api/cases/_find" if space != "default" else "/api/cases/_find"
    headers = {
        "Authorization": auth_header,
        "Content-Type": "application/json",
        "kbn-xsrf": "true",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{kibana_url}{path}",
                params={"sortField": "updatedAt", "sortOrder": "desc", "perPage": 50},
                headers=headers,
            )
            if resp.status_code not in (200, 201):
                return {"cases": [], "error": f"Kibana returned {resp.status_code}"}

            data = resp.json()
            raw_cases = data.get("cases", [])
            cases = [
                {
                    "id": c.get("id"),
                    "title": c.get("title"),
                    "status": c.get("status", "open"),
                    "created_at": c.get("created_at") or c.get("createdAt", ""),
                    "updated_at": c.get("updated_at") or c.get("updatedAt", ""),
                }
                for c in raw_cases
            ]
            return {"cases": cases, "total": data.get("total", len(cases))}
    except Exception as e:
        return {"cases": [], "error": str(e)}
