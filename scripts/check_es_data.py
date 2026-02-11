import os
import sys
from elasticsearch import Elasticsearch
from dotenv import load_dotenv

# Try loading from possible .env locations
load_dotenv("app/.env")
load_dotenv(".env")
load_dotenv(os.path.join(os.path.dirname(__file__), "../.env"))

url = os.getenv("ELASTIC_URL")
api_key = os.getenv("ELASTIC_API_KEY")

print(f"URL: {url}")
print(f"API_KEY: {api_key[:5] if api_key else 'None'}...")

if not url:
    print("ELASTIC_URL not found")
    sys.exit(1)

client = Elasticsearch(
    url,
    api_key=api_key,
    request_timeout=10,
    verify_certs=False
)

try:
    print(f"Connecting to {url}...")
    info = client.info()
    print(f"Connected to ES version: {info['version']['number']}")
    
    indices = client.indices.get_alias(index="*")
    print(f"Found {len(indices)} indices:")
    for idx in list(indices.keys())[:10]:
        count = client.count(index=idx)['count']
        print(f"  - {idx}: {count} docs")
        
except Exception as e:
    print(f"Failed to connect: {e}")
