"""POST /ingest/incident: add a resolved incident to obs-incidents-current."""
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException

from api.schemas import IngestIncidentRequest
from elastic.client import build_client
from retrieval.embedder import embed_text

router = APIRouter(prefix="", tags=["ingest"])


@router.post("/ingest/incident")
def ingest_incident(body: IngestIncidentRequest) -> dict:
    """Index incident with embedding from symptom_summary + root_cause."""
    try:
        client = build_client()
        text = f"{body.symptom_summary or ''} {body.root_cause or ''}".strip() or body.title or body.incident_id
        vector, model_id, version = embed_text(text)
        doc = {
            "@timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "incident_id": body.incident_id,
            "title": body.title,
            "symptom_summary": body.symptom_summary,
            "root_cause": body.root_cause,
            "fix_steps": body.fix_steps,
            "postmortem_url": body.postmortem_url,
            "tags": body.tags,
            "service": {"name": body.service_name} if body.service_name else None,
            "env": body.env,
            "embedding": vector,
            "embedding_model": model_id,
            "embedding_version": version,
        }
        client.index(index="obs-incidents-current", document=doc)
        return {"ok": True, "incident_id": body.incident_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
