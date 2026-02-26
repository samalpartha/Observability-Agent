import asyncio
from dotenv import load_dotenv
load_dotenv()
from elastic.client import build_client

es = build_client()
body = {"query": {"bool": {"must": [{"term": {"service.name": "auth-service"}}, {"match": {"log.level": "WARN"}}]}}}
resp = es.search(index="obs-logs-current", size=0, body=body)
print("MATCH on auth-service & WARN hits:", resp['hits']['total']['value'])

body = {"query": {"bool": {"must": [{"term": {"service.name": "auth-service"}}, {"match": {"log.level": "warn"}}]}}}
resp = es.search(index="obs-logs-current", size=0, body=body)
print("MATCH on auth-service & warn hits:", resp['hits']['total']['value'])
