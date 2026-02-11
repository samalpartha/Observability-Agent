"""ES|QL Query API - Execute Elasticsearch Query Language queries."""
from datetime import datetime, timezone
from typing import Any, Optional

from elasticsearch import Elasticsearch
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import get_current_user
from elastic.client import build_client

router = APIRouter(prefix="/esql", tags=["ES|QL Analytics"])


class ESQLQueryRequest(BaseModel):
    query: str = Field(..., description="ES|QL query string")
    limit: Optional[int] = Field(100, description="Maximum rows to return", ge=1, le=10000)


class ESQLQueryResponse(BaseModel):
    columns: list[dict[str, str]]
    rows: list[list[Any]]
    took_ms: int
    total_rows: int


@router.post("/query", response_model=ESQLQueryResponse)
def execute_esql_query(
    request: ESQLQueryRequest,
    username: str = Depends(get_current_user)
) -> ESQLQueryResponse:
    """
    Execute an ES|QL query and return structured results.
    
    ES|QL is a piped query language for filtering, transforming, and aggregating data.
    
    Example queries:
    - `FROM obs-logs-current | WHERE level == "error" | STATS count() BY service.name`
    - `FROM obs-metrics-current | WHERE @timestamp >= NOW() - 1 hour | STATS avg(value) BY metric.name`
    - `FROM obs-traces-current | WHERE duration > 1000 | SORT duration DESC | LIMIT 10`
    """
    client: Elasticsearch = build_client()
    
    try:
        # Execute ES|QL query
        start_time = datetime.now(timezone.utc)
        
        # Use _query endpoint for ES|QL
        response = client.esql.query(
            query=request.query,
            format="json"
        )
        
        end_time = datetime.now(timezone.utc)
        took_ms = int((end_time - start_time).total_seconds() * 1000)
        
        # Parse response
        columns = response.get("columns", [])
        rows = response.get("values", [])
        
        # Apply limit if specified
        if request.limit and len(rows) > request.limit:
            rows = rows[:request.limit]
        
        return ESQLQueryResponse(
            columns=columns,
            rows=rows,
            took_ms=took_ms,
            total_rows=len(rows)
        )
        
    except Exception as e:
        error_msg = str(e)
        
        # Parse Elasticsearch error for better user feedback
        if "parsing_exception" in error_msg:
            raise HTTPException(status_code=400, detail=f"Query syntax error: {error_msg}")
        elif "index_not_found" in error_msg:
            raise HTTPException(status_code=404, detail="Index not found. Check your FROM clause.")
        else:
            raise HTTPException(status_code=500, detail=f"Query execution failed: {error_msg}")


@router.get("/examples")
def get_query_examples(username: str = Depends(get_current_user)) -> dict[str, list[dict[str, str]]]:
    """Get example ES|QL queries organized by category."""
    return {
        "logs": [
            {
                "name": "Error logs by service",
                "query": 'FROM obs-logs-current | WHERE level == "error" | STATS count() BY service.name | SORT count() DESC'
            },
            {
                "name": "Recent errors with messages",
                "query": 'FROM obs-logs-current | WHERE level == "error" | SORT @timestamp DESC | LIMIT 20 | KEEP @timestamp, service.name, message'
            },
            {
                "name": "Log volume over time",
                "query": 'FROM obs-logs-current | STATS count() BY bucket(@timestamp, 5 minutes) | SORT bucket'
            }
        ],
        "metrics": [
            {
                "name": "Average response time by service",
                "query": 'FROM obs-metrics-current | WHERE metric.name == "response_time" | STATS avg(value) BY service.name'
            },
            {
                "name": "CPU usage trend",
                "query": 'FROM obs-metrics-current | WHERE metric.name == "cpu.percent" | STATS avg(value) BY bucket(@timestamp, 10 minutes)'
            }
        ],
        "traces": [
            {
                "name": "Slowest traces",
                "query": 'FROM obs-traces-current | SORT duration DESC | LIMIT 10 | KEEP @timestamp, trace.id, service.name, duration'
            },
            {
                "name": "Trace count by service",
                "query": 'FROM obs-traces-current | STATS count() BY service.name | SORT count() DESC'
            }
        ]
    }
