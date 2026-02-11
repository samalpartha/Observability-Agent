"""
Agent tools as pure functions with strict inputs and outputs.
Each returns: summary, evidence list with links, raw query payload for audit.
All ES calls wrapped in retry + circuit breaker.
"""
from dataclasses import dataclass, field
from typing import Any, Optional

from elasticsearch import Elasticsearch

from agent.resilience import logger, retry_with_backoff, sanitize_user_input
from retrieval.evidence import EvidenceLink, evidence_links_for_hit
from retrieval.hybrid_query import HybridResult, hybrid_query
from retrieval.similar_incidents import SimilarIncident, similar_incidents


@dataclass
class ToolResult:
    summary: str
    evidence: list[dict[str, Any]]  # each has link + snippet
    raw_payload: Optional[dict[str, Any]] = None
    error: Optional[str] = None  # non-None if tool failed (but returned partial results)


def _get_client() -> Elasticsearch:
    from elastic.client import build_client
    return build_client()


def _safe_search(client: Elasticsearch, index: str, body: dict, breaker_name: str) -> dict:
    """Wrapper: ES search with retry + circuit breaker."""
    def _do_search():
        return client.search(index=index, body=body)

    return retry_with_backoff(
        _do_search,
        max_retries=3,
        base_delay=0.5,
        max_delay=5.0,
        breaker_name=breaker_name,
    )


def _safe_hybrid_query(client: Elasticsearch, question: str, breaker_name: str, **kwargs) -> list[HybridResult]:
    """Wrapper: hybrid query with retry + circuit breaker."""
    def _do_query():
        return hybrid_query(client, question, **kwargs)

    return retry_with_backoff(
        _do_query,
        max_retries=2,
        base_delay=0.5,
        max_delay=5.0,
        breaker_name=breaker_name,
    )


def tool_find_changes(time_range: tuple[str, str], service: Optional[str]) -> ToolResult:
    """Pull deploy events, config changes, feature flags."""
    client = _get_client()
    gte, lte = time_range
    must = [{"range": {"@timestamp": {"gte": gte, "lte": lte}}}]
    if service:
        must.append({"term": {"service.name": service}})
    body = {"query": {"bool": {"must": must}}, "size": 50, "sort": [{"@timestamp": "desc"}]}
    try:
        r = _safe_search(client, "obs-logs-current", body, "es_changes")
        hits = r.get("hits", {}).get("hits", [])
        deploy_like = [
            h for h in hits
            if h.get("_source", {}).get("message")
            and ("deploy" in (h["_source"]["message"] or "").lower()
                 or "release" in (h["_source"]["message"] or "").lower())
        ]
        summary = f"Found {len(deploy_like)} deploy/release events and {len(hits)} total events."
        evidence = [
            {
                "message": h["_source"].get("message"),
                "@timestamp": h["_source"].get("@timestamp"),
                "links": [],
            }
            for h in deploy_like[:10]
        ]
        return ToolResult(summary=summary, evidence=evidence, raw_payload=body)
    except Exception as e:
        logger.error(f"tool_find_changes failed: {e}")
        return ToolResult(
            summary=f"Changes search failed: {type(e).__name__}",
            evidence=[],
            raw_payload=body,
            error=str(e),
        )


def tool_search_logs(question: str, filters: dict[str, Any]) -> ToolResult:
    """Search logs via hybrid query; return summary, evidence with Kibana links."""
    client = _get_client()
    time_range = filters.get("time_range")
    service = filters.get("service")
    env = filters.get("env")
    top_k = filters.get("top_k", 20)
    try:
        results = _safe_hybrid_query(
            client, question, "es_logs",
            time_range=time_range, service=service, env=env,
            index_alias="obs-logs-current", top_k=top_k,
        )
        evidence = []
        for hit in results:
            links = evidence_links_for_hit(hit, time_range=time_range)
            evidence.append({
                "message": hit.message,
                "@timestamp": hit.timestamp,
                "service.name": hit.service_name,
                "trace.id": hit.trace_id,
                "links": [{"kind": l.kind, "label": l.label, "url": l.url} for l in links],
            })
        summary = f"Found {len(results)} log hits (hybrid search)."
        return ToolResult(summary=summary, evidence=evidence,
                         raw_payload={"question": question[:100], "count": len(results)})
    except Exception as e:
        logger.error(f"tool_search_logs failed: {e}")
        return ToolResult(
            summary=f"Log search failed: {type(e).__name__}",
            evidence=[],
            raw_payload={"question": question[:100]},
            error=str(e),
        )


def tool_search_traces(question: str, filters: dict[str, Any]) -> ToolResult:
    """Search traces via hybrid query."""
    client = _get_client()
    time_range = filters.get("time_range")
    service = filters.get("service")
    env = filters.get("env")
    top_k = filters.get("top_k", 20)
    try:
        results = _safe_hybrid_query(
            client, question, "es_traces",
            time_range=time_range, service=service, env=env,
            index_alias="obs-traces-current", top_k=top_k,
        )
        evidence = []
        for hit in results:
            links = evidence_links_for_hit(hit, time_range=time_range)
            evidence.append({
                "message": hit.message,
                "@timestamp": hit.timestamp,
                "service.name": hit.service_name,
                "trace.id": hit.trace_id,
                "links": [{"kind": l.kind, "label": l.label, "url": l.url} for l in links],
            })
        summary = f"Found {len(results)} trace hits."
        return ToolResult(summary=summary, evidence=evidence,
                         raw_payload={"question": question[:100], "count": len(results)})
    except Exception as e:
        logger.error(f"tool_search_traces failed: {e}")
        return ToolResult(
            summary=f"Trace search failed: {type(e).__name__}",
            evidence=[],
            raw_payload={"question": question[:100]},
            error=str(e),
        )


def tool_search_metrics(question: str, filters: dict[str, Any]) -> ToolResult:
    """Search metrics index via hybrid query."""
    client = _get_client()
    time_range = filters.get("time_range")
    service = filters.get("service")
    env = filters.get("env")
    top_k = filters.get("top_k", 20)
    try:
        results = _safe_hybrid_query(
            client, question, "es_metrics",
            time_range=time_range, service=service, env=env,
            index_alias="obs-metrics-current", top_k=top_k,
        )
        evidence = []
        for hit in results:
            links = evidence_links_for_hit(hit, time_range=time_range)
            evidence.append({
                "message": hit.message,
                "@timestamp": hit.timestamp,
                "service.name": hit.service_name,
                "links": [{"kind": l.kind, "label": l.label, "url": l.url} for l in links],
            })
        summary = f"Found {len(results)} metric hits."
        return ToolResult(summary=summary, evidence=evidence,
                         raw_payload={"question": question[:100], "count": len(results)})
    except Exception as e:
        logger.error(f"tool_search_metrics failed: {e}")
        return ToolResult(
            summary=f"Metrics search failed: {type(e).__name__}",
            evidence=[],
            raw_payload={"question": question[:100]},
            error=str(e),
        )


def tool_find_similar_incidents(question: str, filters: dict[str, Any]) -> ToolResult:
    """Vector search obs-incidents-current; return top 5 with fix_steps."""
    client = _get_client()
    service = filters.get("service")
    env = filters.get("env")
    top_k = filters.get("top_k", 5)
    try:
        def _do_search():
            return similar_incidents(client, question, service=service, env=env, top_k=top_k)

        incidents: list[SimilarIncident] = retry_with_backoff(
            _do_search,
            max_retries=2,
            base_delay=0.5,
            breaker_name="es_incidents",
        )
        evidence = []
        for inc in incidents:
            evidence.append({
                "incident_id": inc.incident_id,
                "title": inc.title,
                "symptom_summary": inc.symptom_summary,
                "root_cause": inc.root_cause,
                "fix_steps": inc.fix_steps,
                "postmortem_url": inc.postmortem_url,
                "score": inc.score,
                "links": [{"kind": "postmortem", "label": "Postmortem", "url": inc.postmortem_url or "#"}] if inc.postmortem_url else [],
            })
        summary = f"Found {len(incidents)} similar incidents."
        return ToolResult(summary=summary, evidence=evidence,
                         raw_payload={"question": question[:100], "count": len(incidents)})
    except Exception as e:
        logger.error(f"tool_find_similar_incidents failed: {e}")
        return ToolResult(
            summary=f"Incident search failed: {type(e).__name__}",
            evidence=[],
            raw_payload={"question": question[:100]},
            error=str(e),
        )


def _rule_based_propose(findings: list[dict], incidents: list[dict]) -> tuple[str, list[dict]]:
    has_deploy = any("deploy" in str(f.get("message", "")).lower() for f in findings)
    suggestions = (
        ["Consider rollback of last deployment"]
        if has_deploy
        else ["Review recent changes", "Check dependency health", "Scale up if resource-bound"]
    )
    summary = "Proposed fixes: " + "; ".join(suggestions)
    evidence = [{"proposed_action": s, "risk_level": "medium", "citations": findings[:2]} for s in suggestions[:3]]
    return summary, evidence


def tool_propose_fix(findings: list[dict], incidents: list[dict]) -> ToolResult:
    """Propose remediation from findings + similar incidents (LLM or rule-based)."""
    from agent.llm import llm_complete

    findings_text = "\n".join((f.get("message") or str(f))[:200] for f in findings[:15])
    incidents_text = "\n".join(
        f"Incident: {i.get('title') or i.get('incident_id')}; root_cause: {i.get('root_cause')}; fix_steps: {i.get('fix_steps')}"
        for i in incidents[:5]
    )
    prompt = f"""Based on these observability findings and similar past incidents, suggest exactly 3 remediation actions.
For each action give one line and a risk level (low/medium/high). Format:
1. <action> (risk: <level>)
2. <action> (risk: <level>)
3. <action> (risk: <level>)

Findings:
{findings_text[:2000]}

Similar incidents:
{incidents_text[:1500]}
"""
    out = llm_complete(prompt, system="You are an SRE suggesting safe, actionable remediations. Be concise.")
    if out:
        lines = [l.strip() for l in out.split("\n") if l.strip()]
        evidence = []
        for line in lines[:3]:
            action = line
            risk = "medium"
            if "(risk:" in line.lower():
                parts = line.rsplit("(risk:", 1)
                action = parts[0].strip().rstrip(")").strip()
                if len(parts) > 1:
                    risk = parts[1].strip().rstrip(")").strip().lower() or "medium"
            evidence.append({"proposed_action": action, "risk_level": risk, "citations": findings[:2]})
        if evidence:
            summary = "Proposed fixes: " + "; ".join(e["proposed_action"] for e in evidence)
            return ToolResult(summary=summary, evidence=evidence,
                             raw_payload={"findings_count": len(findings), "incidents_count": len(incidents), "llm": True})

    # Fallback to rule-based
    logger.info("LLM unavailable for remediation — using rule-based fallback")
    summary, evidence = _rule_based_propose(findings, incidents)
    return ToolResult(summary=summary, evidence=evidence,
                     raw_payload={"findings_count": len(findings), "incidents_count": len(incidents)})


def tool_generate_runbook(proposed_fix: str, context: dict[str, Any]) -> ToolResult:
    """Generate runbook steps from proposed fix and context."""
    from agent.llm import llm_complete

    safe_fix = sanitize_user_input(proposed_fix, max_length=500)
    prompt = f"""Write a short runbook (4-6 steps) to execute this remediation. Number each step. Be concrete and safe.

Remediation: {safe_fix}

Context: {str(context)[:500]}
"""
    out = llm_complete(prompt, system="You are an SRE writing runbooks. Number steps clearly. One line per step.")
    if out:
        steps = [s.strip() for s in out.split("\n") if s.strip() and (s.strip()[0].isdigit() or s.startswith("-"))]
        if steps:
            evidence = [{"step": i, "description": s.lstrip("0123456789.-) ")[:200]} for i, s in enumerate(steps[:6], 1)]
            summary = f"Runbook ({len(evidence)} steps): " + "; ".join(e["description"][:40] for e in evidence)
            return ToolResult(summary=summary, evidence=evidence,
                             raw_payload={"proposed_fix": safe_fix[:100], "llm": True})

    summary = f"Runbook for: {proposed_fix[:100]}. Steps: 1) Verify scope 2) Apply fix 3) Validate 4) Monitor."
    evidence = [{"step": i, "description": s} for i, s in enumerate(["Verify scope", "Apply fix", "Validate", "Monitor"], 1)]
    return ToolResult(summary=summary, evidence=evidence,
                     raw_payload={"proposed_fix": proposed_fix[:100], "context_keys": list(context.keys())})
