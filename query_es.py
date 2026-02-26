import os
from elasticsearch import Elasticsearch
from dotenv import load_dotenv

load_dotenv()
url = os.environ.get("ELASTIC_URL")
api_key = os.environ.get("ELASTIC_API_KEY")

es = Elasticsearch(url, api_key=api_key)
resp = es.search(
    index="obs-logs-current",
    body={
        "size": 0,
        "aggs": {
            "services": {
                "terms": {"field": "service.name"}
            }
        }
    }
)
print("SERVICES IN ES:")
for bucket in resp['aggregations']['services']['buckets']:
    print(f"- {bucket['key']} (count: {bucket['doc_count']})")
