import asyncio
from dotenv import load_dotenv
load_dotenv()
from elastic.client import build_client

es = build_client()
resp = es.search(
    index="obs-logs-current",
    size=5,
    body={
        "query": {
            "match": {
                "service.name": "auth-service"
            }
        }
    }
)
for hit in resp['hits']['hits']:
    src = hit['_source']
    print("service:", src.get('service'))
    print("level:", src.get('log'))
    print("message:", src.get('message'))
