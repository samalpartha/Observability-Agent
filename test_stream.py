import requests
import sys

base_url = "https://observability-backend-365415503294.us-central1.run.app"

try:
    print("Logging in...")
    res = requests.post(f"{base_url}/auth/login", json={"username": "demo", "password": "password"})
    if res.status_code != 200:
        res = requests.post(f"{base_url}/auth/login", json={"username": "demo", "password": "demo123"})
    
    if res.status_code != 200:
        print(f"Login failed: {res.text}")
        sys.exit(1)
        
    token = res.json().get("access_token")
    print(f"Got token: {token[:10]}...")
    
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = {"question": "Why is the database slow?", "time_range": ["2024-01-01T00:00:00Z", "2024-01-01T01:00:00Z"]}
    
    print("Starting stream...")
    with requests.post(f"{base_url}/debug/stream", headers=headers, json=payload, stream=True, timeout=60) as r:
        if r.status_code != 200:
            print(f"Stream failed: {r.status_code} {r.text}")
            sys.exit(1)
        
        for line in r.iter_lines():
            if line:
                print(line.decode('utf-8'))
                
except Exception as e:
    print(f"Error: {e}")
