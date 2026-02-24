"""Analytics API for AI-powered natural language querying."""
from fastapi import APIRouter, Depends, HTTPException
from agent.planner import PlannerInput, run_planner
from api.schemas import AIQueryRequest, AIQueryResponse
from app.auth import get_current_user
from typing import Any

router = APIRouter(prefix="/analytics", tags=["Analytics"])

@router.post("/ai-query", response_model=AIQueryResponse)
async def ai_query_endpoint(
    request: AIQueryRequest,
    username: str = Depends(get_current_user)
) -> AIQueryResponse:
    """
    Experimental AI Data Explorer: Translates natural language into observability insights.
    Integrates the Critic loop and provides a 'Transparency Trace' for explainable AI.
    """
    # 1. Initialize Transparency Trace
    trace = [
        f"Request received: '{request.query}'",
        "Initializing Observability Planner...",
        "Scoping telemetry sources (Logs, Metrics, Traces)..."
    ]
    
    try:
        # 2. Run Planner (which includes the Critic loop internally)
        planner_input = PlannerInput(
            question=request.query,
            time_range_label="1h" # Default for analytics explorer
        )
        
        trace.append("Executing multi-agent signal gathering...")
        out = run_planner(planner_input)
        
        trace.append("Synthesizing findings and cross-correlating signals...")
        
        if out.reflection:
            trace.append(f"Critic Agent invoked: Status {out.reflection.get('status', 'Logical')}")
        
        # 3. Construct the response
        # We use the executive summary or first root cause as the 'response'
        response_text = ""
        if out.root_cause_candidates:
            response_text = out.root_cause_candidates[0]
        else:
            # Fallback to high level summary
            from api.routes_debug import _build_executive_summary
            summary = _build_executive_summary(out)
            response_text = "\n".join([b["text"] for b in summary])
            
        if not response_text:
            response_text = "Analysis complete. I couldn't find a definitive root cause, but I've updated the findings with relevant telemetry."

        trace.append("Generating final intelligence report.")

        return AIQueryResponse(
            response=response_text,
            reflection=out.reflection,
            trace=trace
        )
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"AI Analytics engine failed: {str(e)}")
