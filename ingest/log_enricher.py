"""
Normalize service name and env; attach deployment.id, build.sha, version, region; attach incident_key if known.
"""
from typing import Any, Optional


def normalize_service(name: Optional[str]) -> str:
    if not name or not str(name).strip():
        return "unknown"
    return str(name).strip().lower().replace(" ", "-")[:64]


def normalize_env(env: Optional[str]) -> str:
    if not env or not str(env).strip():
        return "default"
    return str(env).strip().lower()[:32]


def enrich_log(doc: dict[str, Any], *, deployment_id: Optional[str] = None, build_sha: Optional[str] = None,
               version: Optional[str] = None, region: Optional[str] = None, incident_key: Optional[str] = None) -> dict[str, Any]:
    """
    Mutate doc with normalized service/env and optional deployment, build, version, region, incident_key.
    Returns the same dict (mutated).
    """
    if "service" not in doc:
        doc["service"] = {}
    if isinstance(doc["service"], dict):
        doc["service"]["name"] = normalize_service(doc["service"].get("name") or doc.get("service_name"))
    doc["env"] = normalize_env(doc.get("env"))
    if deployment_id:
        doc.setdefault("deployment", {})["id"] = deployment_id
    if build_sha:
        doc.setdefault("build", {})["sha"] = build_sha
    if version:
        doc["version"] = version
    if region:
        doc["region"] = region
    if incident_key:
        doc["incident_key"] = incident_key
    return doc
