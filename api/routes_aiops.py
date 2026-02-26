from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime
import re

from app.auth import get_current_user
from elastic.client import build_client

router = APIRouter()

class LogCategory(BaseModel):
    signature: str
    count: int
    sample_message: str

class AnomaliesResponse(BaseModel):
    categories: List[LogCategory]
    anomaly_detected: bool
    anomaly_reason: Optional[str] = None

class ForecastPoint(BaseModel):
    timestamp: str
    actual: Optional[float] = None
    predicted: Optional[float] = None
    upper: Optional[float] = None
    lower: Optional[float] = None

class ForecastResponse(BaseModel):
    metric: str
    unit: str
    data: List[ForecastPoint]
    is_anomalous: bool
    warning: Optional[str] = None

def generate_signature(message: str) -> str:
    """Strip variable parts of a log message to group similar lines."""
    # Replace URLs, paths, numbers, hex, UUIDs
    msg = re.sub(r'https?://[^\s]+', '[URL]', message)
    msg = re.sub(r'\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b', '[UUID]', msg)
    msg = re.sub(r'\b\d+\b', '[NUM]', msg)
    msg = re.sub(r'\b0x[0-9a-fA-F]+\b', '[HEX]', msg)
    # Generic short hex like trace IDs inside strings (heuristics)
    msg = re.sub(r'\b[a-f0-9]{8,16}\b', '[ID]', msg)
    return msg.strip()

@router.get("/categories", response_model=AnomaliesResponse)
async def get_log_categories(service: str, user: str = Depends(get_current_user)):
    """Fetch recent logs and categorize them by stripping variables."""
    es = build_client()
    try:
        # Fetch up to 1000 ERROR/WARN logs for the service
        resp = es.search(
            index="obs-logs-current",
            size=1000,
            body={
                "query": {
                    "bool": {
                        "must": [
                            {"match": {"service.name": service}}
                        ],
                        "filter": [
                            {
                                "bool": {
                                    "should": [
                                        {"match": {"log.level": "ERROR"}},
                                        {"match": {"log.level": "WARN"}},
                                        {"match": {"log.level": "error"}},
                                        {"match": {"log.level": "warn"}}
                                    ],
                                    "minimum_should_match": 1
                                }
                            }
                        ]
                    }
                },
                "_source": ["message", "log.level", "@timestamp"],
                "sort": [{"@timestamp": {"order": "desc"}}]
            }
        )
        hits = resp["hits"]["hits"]
        if not hits:
            return AnomaliesResponse(categories=[], anomaly_detected=False)

        signatures = {}
        for hit in hits:
            msg = hit["_source"].get("message", "")
            sig = generate_signature(msg)
            if sig not in signatures:
                signatures[sig] = {"count": 0, "sample": msg}
            signatures[sig]["count"] += 1

        # Sort by frequency
        sorted_sigs = sorted(signatures.items(), key=lambda x: x[1]["count"], reverse=True)
        categories = []
        
        anomaly_detected = False
        anomaly_reason = None

        for sig, data in sorted_sigs[:5]: # Top 5 categories
            categories.append(LogCategory(
                signature=sig,
                count=data["count"],
                sample_message=data["sample"]
            ))
            # Heuristic: if a single error category dominates recently
            if data["count"] > 50:
                anomaly_detected = True
                anomaly_reason = f"A log pattern '{sig}' has surged recently ({data['count']} occurrences)."

        return AnomaliesResponse(
            categories=categories,
            anomaly_detected=anomaly_detected,
            anomaly_reason=anomaly_reason
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/forecast", response_model=ForecastResponse)
async def get_predictive_forecast(service: str, metric: str = "jvm.memory.heap.used.bytes", user: str = Depends(get_current_user)):
    """Analyze historical metric trends and project into the future."""
    es = build_client()
    try:
        # Query metrics
        resp = es.search(
            index="obs-metrics-current",
            size=500,
            body={
                "query": {"term": {"service.name": service}},
                "sort": [{"@timestamp": {"order": "desc"}}],
                "_source": ["@timestamp", metric]
            }
        )
        
        hits = resp["hits"]["hits"]
        data_points = []
        for hit in reversed(hits): # Oldest to newest
            val = hit["_source"]
            parts = metric.split('.')
            target = val
            valid = True
            for part in parts:
                if isinstance(target, dict) and part in target:
                    target = target[part]
                else:
                    valid = False
                    break
            
            if valid and isinstance(target, (int, float)):
                data_points.append({
                    "ts": hit["_source"]["@timestamp"],
                    "val": target
                })

        # If we have data points, we can do a naive linear regression to project
        forecast_data = []
        is_anomalous = False
        warning = None

        # Take last N points to simplify
        data_points = data_points[-50:]
        
        if len(data_points) > 2:
            import datetime as dt
            
            x = list(range(len(data_points)))
            y = [p["val"] for p in data_points]
            
            # Linear regression: y = mx + b
            n = len(x)
            sum_x = sum(x)
            sum_y = sum(y)
            sum_xy = sum(x[i] * y[i] for i in range(n))
            sum_xx = sum(x[i] * x[i] for i in range(n))
            
            denominator = n * sum_xx - sum_x * sum_x
            if denominator != 0:
                m = (n * sum_xy - sum_x * sum_y) / denominator
                b = (sum_y * sum_xx - sum_x * sum_xy) / denominator
                
                # Historical points
                for i, p in enumerate(data_points):
                    forecast_data.append(ForecastPoint(
                        timestamp=p["ts"],
                        actual=p["val"]
                    ))

                # If slope is positive and metric is memory, it's a leak
                if m > 0.05 * (max(y) - min(y)) / len(x) and m > 0:
                    is_anomalous = True
                    warning = "Persistent upward trend detected. Projected to breach limits soon."

                # Project next 10 points
                last_time = dt.datetime.fromisoformat(data_points[-1]["ts"].replace('Z', '+00:00'))
                for i in range(1, 11):
                    proj_x = n - 1 + i
                    proj_y = m * proj_x + b
                    proj_time = last_time + dt.timedelta(minutes=5 * i) # Assume 5m buckets roughly
                    forecast_data.append(ForecastPoint(
                        timestamp=proj_time.isoformat(),
                        predicted=proj_y,
                        upper=proj_y * 1.1,
                        lower=proj_y * 0.9
                    ))
            else:
                 for i, p in enumerate(data_points):
                    forecast_data.append(ForecastPoint(timestamp=p["ts"], actual=p["val"]))
        else:
             for i, p in enumerate(data_points):
                 forecast_data.append(ForecastPoint(timestamp=p["ts"], actual=p["val"]))

        return ForecastResponse(
            metric=metric,
            unit="Bytes" if "bytes" in metric else "Pct",
            data=forecast_data,
            is_anomalous=is_anomalous,
            warning=warning
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
