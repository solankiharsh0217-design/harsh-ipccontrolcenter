import os
import requests

API_URL = os.environ.get("VITE_SUPABASE_URL")
ANON_KEY = os.environ.get("VITE_SUPABASE_ANON_KEY")

headers = {
    "apikey": ANON_KEY,
    "Authorization": f"Bearer {ANON_KEY}"
}

# In PostgREST, we can often see table names via /
response = requests.get(f"{API_URL}/rest/v1/", headers=headers)
if response.status_code == 200:
    # This usually returns the OpenAPI spec
    spec = response.json()
    paths = spec.get('paths', {}).keys()
    tables = [p.strip('/') for p in paths if p != '/']
    print("\n".join(tables))
else:
    print(f"Failed to list tables: {response.status_code}")
