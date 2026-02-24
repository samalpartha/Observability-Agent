#!/usr/bin/env python3
"""
Sample Data Generator for Observability Agent
Populates Elasticsearch with realistic observability data for testing
"""

import os
import json
import random
from datetime import datetime, timedelta
from elasticsearch import Elasticsearch
from dotenv import load_dotenv

load_dotenv()

# Elasticsearch configuration
ELASTIC_URL = os.getenv("ELASTIC_URL")
ELASTIC_API_KEY = os.getenv("ELASTIC_API_KEY")

# Initialize Elasticsearch client
es = Elasticsearch(
    [ELASTIC_URL],
    api_key=ELASTIC_API_KEY,
    verify_certs=True
)

# Sample services
SERVICES = [
    "auth-service",
    "payment-service",
    "checkout-service",
    "gateway-api",
    "user-service",
    "inventory-service",
    "notification-service"
]

# Sample error messages
ERROR_MESSAGES = [
    "Connection timeout to database",
    "Failed to process payment: Invalid card number",
    "Out of memory error",
    "Rate limit exceeded",
    "Authentication failed: Invalid token",
    "Service unavailable",
    "Failed to send notification: SMTP connection refused",
    "Database query timeout",
    "Insufficient inventory",
    "Invalid request payload"
]

# Sample log levels
LOG_LEVELS = ["ERROR", "WARN", "INFO", "DEBUG"]


def generate_log_entry(timestamp, service):
    """Generate a realistic log entry"""
    level = random.choice(LOG_LEVELS)
    severity_weights = {"ERROR": 0.1, "WARN": 0.2, "INFO": 0.5, "DEBUG": 0.2}
    level = random.choices(list(severity_weights.keys()), weights=list(severity_weights.values()))[0]
    
    message = random.choice(ERROR_MESSAGES) if level == "ERROR" else f"Processing request for {service}"
   
    return {
        "@timestamp": timestamp.isoformat(),
       "service.name": service,
        "service.environment": "production",
        "log.level": level,
        "message": message,
        "host.name": f"prod-{service}-{random.randint(1, 3)}",
        "trace.id": f"trace-{random.randint(100000, 999999)}",
        "span.id": f"span-{random.randint(10000, 99999)}",
        "response_time_ms": random.randint(50, 5000) if level == "ERROR" else random.randint(10, 500),
        "http.status_code": random.choice([500, 502, 503, 504]) if level == "ERROR" else random.choice([200, 201, 204]),
        "user.id": f"user-{random.randint(1000, 9999)}",
        "tags": [service, level.lower(), "production"]
    }


def generate_metrics(timestamp, service):
    """Generate service metrics"""
    return {
        "@timestamp": timestamp.isoformat(),
        "service.name": service,
        "metrics.cpu_percent": random.uniform(10, 95),
        "metrics.memory_percent": random.uniform(20, 90),
        "metrics.request_count": random.randint(100, 10000),
        "metrics.error_count": random.randint(0, 500),
        "metrics.avg_response_time_ms": random.uniform(50, 2000),
        "metrics.p95_response_time_ms": random.uniform(100, 5000),
        "host.name": f"prod-{service}-{random.randint(1, 3)}"
    }


def generate_investigation(timestamp):
    """Generate an investigation record"""
    service = random.choice(SERVICES)
    statuses = ["critical", "warning", "resolved"]
    status = random.choices(statuses, weights=[0.3, 0.4, 0.3])[0]
    
    return {
        "@timestamp": timestamp.isoformat(),
        "investigation.id": f"inv-{random.randint(100000, 999999)}",
        "investigation.title": f"High error rate in {service}",
        "investigation.description": f"Detected unusual spike in {service} errors",
        "investigation.severity": status,
        "investigation.service": service,
        "investigation.confidence": random.uniform(0.5, 1.0),
        "investigation.evidence_count": random.randint(5, 50),
        "investigation.created_at": timestamp.isoformat(),
        "investigation.status": "in_progress" if status != "resolved" else "resolved"
    }


def populate_sample_data():
    """Main function to populate Elasticsearch with sample data"""
    print("🚀 Starting sample data population...")
    
    # Create indices if they don't exist
    indices = {
        "logs-current": {
            "mappings": {
                "properties": {
                    "@timestamp": {"type": "date"},
                    "service.name": {"type": "keyword"},
                    "service.environment": {"type": "keyword"},
                    "log.level": {"type": "keyword"},
                    "message": {"type": "text"},
                    "host.name": {"type": "keyword"},
                    "trace.id": {"type": "keyword"},
                    "span.id": {"type": "keyword"},
                    "response_time_ms": {"type": "long"},
                    "http.status_code": {"type": "long"},
                    "user.id": {"type": "keyword"},
                    "tags": {"type": "keyword"}
                }
            }
        },
        "metrics-current": {
            "mappings": {
                "properties": {
                    "@timestamp": {"type": "date"},
                    "service.name": {"type": "keyword"},
                    "metrics.cpu_percent": {"type": "float"},
                    "metrics.memory_percent": {"type": "float"},
                    "metrics.request_count": {"type": "long"},
                    "metrics.error_count": {"type": "long"},
                    "metrics.avg_response_time_ms": {"type": "float"},
                    "metrics.p95_response_time_ms": {"type": "float"},
                    "host.name": {"type": "keyword"}
                }
            }
        },
        "investigations-current": {
            "mappings": {
                "properties": {
                    "@timestamp": {"type": "date"},
                    "investigation.id": {"type": "keyword"},
                    "investigation.title": {"type": "text"},
                    "investigation.description": {"type": "text"},
                    "investigation.severity": {"type": "keyword"},
                    "investigation.service": {"type": "keyword"},
                    "investigation.confidence": {"type": "float"},
                    "investigation.evidence_count": {"type": "long"},
                    "investigation.created_at": {"type": "date"},
                    "investigation.status": {"type": "keyword"}
                }
            }
        }
    }
    
    for index_name, index_body in indices.items():
        if not es.indices.exists(index=index_name):
            es.indices.create(index=index_name, body=index_body)
            print(f"✓ Created index: {index_name}")
        else:
            print(f"ℹ Index already exists: {index_name}")
    
    # Generate data for the last 7 days
    now = datetime.utcnow()
    logs_count = 0
    metrics_count = 0
    investigations_count = 0
    
    print("\n📊 Generating sample data...")
    
    # Generate logs (hourly for past 7 days)
    for day in range(7):
        for hour in range(24):
            timestamp = now - timedelta(days=day, hours=hour)
            for service in SERVICES:
                # Generate 5-50 logs per service per hour
                for _ in range(random.randint(5, 50)):
                    log = generate_log_entry(timestamp, service)
                    es.index(index="logs-current", document=log)
                    logs_count += 1
    
    print(f"✓ Generated {logs_count} log entries")
    
    # Generate metrics (hourly for past 7 days)
    for day in range(7):
        for hour in range(24):
            timestamp = now - timedelta(days=day, hours=hour)
            for service in SERVICES:
                metrics = generate_metrics(timestamp, service)
                es.index(index="metrics-current", document=metrics)
                metrics_count += 1
    
    print(f"✓ Generated {metrics_count} metric entries")
    
    # Generate investigations (daily for past 7 days)
    for day in range(7):
        timestamp = now - timedelta(days=day)
        for _ in range(random.randint(2, 5)):
            investigation = generate_investigation(timestamp)
            es.index(index="investigations-current", document=investigation)
            investigations_count += 1
    
    print(f"✓ Generated {investigations_count} investigation records")
    
    # Refresh indices to make data searchable
    es.indices.refresh(index="logs-current,metrics-current,investigations-current")
    
    print("\n✅ Sample data population complete!")
    print(f"   - Logs: {logs_count}")
    print(f"   - Metrics: {metrics_count}")
    print(f"   - Investigations: {investigations_count}")
    print("\n💡 You can now test the AI assistant and analytics features!")


if __name__ == "__main__":
    try:
        populate_sample_data()
    except Exception as e:
        print(f"\n❌ Error: {e}")
        print("\nPlease check your Elasticsearch connection settings in .env file")
