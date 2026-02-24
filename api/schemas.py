"""Request/response schemas for debug, ingest, and auth."""
from typing import Any, Optional

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class ConnectionTestRequest(BaseModel):
    """Body for POST /connection/test. Credentials are not stored."""
    elastic_url: str = Field(..., min_length=1)
    kibana_url: Optional[str] = None
    space: Optional[str] = None
    api_key: str = Field(..., min_length=1)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str


class DebugRequest(BaseModel):
    question: str = Field(..., min_length=1)
    service: Optional[str] = None
    env: Optional[str] = None
    time_range: Optional[tuple[str, str]] = None
    region: Optional[str] = None
    version: Optional[str] = None
    deploy_id: Optional[str] = None
    trace_id: Optional[str] = None
    tenant: Optional[str] = None
    endpoint: Optional[str] = None


class ExecutiveSummaryBullet(BaseModel):
    text: str
    confidence: float = 0.0


class DebugResponse(BaseModel):
    run_id: str = ""
    status: str = "complete"  # queued | running | complete | failed
    executive_summary: list[dict[str, Any]] = Field(default_factory=list)  # [{text, confidence}]
    findings: list[dict[str, Any]] = Field(default_factory=list)
    proposed_fixes: list[dict[str, Any]] = Field(default_factory=list)
    confidence: float = 0.0
    confidence_reasons: list[str] = Field(default_factory=list)
    evidence_links: list[dict[str, Any]] = Field(default_factory=list)
    root_cause_candidates: list[str] = Field(default_factory=list)
    similar_incidents: list[dict[str, Any]] = Field(default_factory=list)  # [{incident_id, title, root_cause, fix_steps, score?}]
    scope: dict[str, Any] = Field(default_factory=dict)  # question, service, env, time_range
    evidence_by_type: dict[str, list[dict[str, Any]]] = Field(default_factory=dict)  # logs, traces, metrics
    # Elastic deep links (run-level): Open in Kibana / Open APM
    kibana_discover_url: Optional[str] = None
    kibana_apm_url: Optional[str] = None
    # FIX #2: Confidence tier + next steps
    confidence_tier: str = "low"  # low | medium | high
    next_steps: list[str] = Field(default_factory=list)  # actionable suggestions
    signal_contributions: dict[str, float] = Field(default_factory=dict)  # signal → weight
    # FIX #3: Attempt tracking
    attempt_number: int = 1
    attempt_message: str = ""
    missing_signals: list[str] = Field(default_factory=list)
    # FIX #4: Pipeline artifacts
    pipeline_artifacts: dict[str, Any] = Field(default_factory=dict)
    # FIX #8: Root cause states
    root_cause_states: list[dict[str, str]] = Field(default_factory=list)  # [{text, state}]
    # FIX #6: Run delta
    run_delta: dict[str, Any] = Field(default_factory=dict)


class IngestIncidentRequest(BaseModel):
    incident_id: str = Field(..., min_length=1)
    title: Optional[str] = None
    symptom_summary: Optional[str] = None
    root_cause: Optional[str] = None
    fix_steps: Optional[str] = None
    postmortem_url: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    service_name: Optional[str] = None
    env: Optional[str] = None


class AIQueryRequest(BaseModel):
    query: str = Field(..., min_length=1)


class AIQueryResponse(BaseModel):
    response: str
    reflection: Optional[dict[str, Any]] = None
    trace: list[str] = Field(default_factory=list) # Execution Trace for transparency
