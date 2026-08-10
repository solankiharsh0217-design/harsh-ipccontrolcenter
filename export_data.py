import os
import json
import csv
import subprocess
from datetime import datetime

EXPORT_DIR = "export"
CSV_DIR = os.path.join(EXPORT_DIR, "csv")
DATA_DIR = os.path.join(EXPORT_DIR, "data")
FUNCTIONS_DIR = os.path.join(EXPORT_DIR, "functions")

def run_query(query):
    # Use Supabase tool if available, or psql via shell
    try:
        cmd = ["psql", os.environ.get("VITE_SUPABASE_URL", "").replace(".supabase.co", ".supabase.com"), "-c", query, "--csv"]
        # Actually we use standard psql in this env if configured, but let's use the provided supabase tool pattern
        # Since I am in 'build' mode and have the tool_search_discovery, I should use the tools.
        # However, for efficiency in a single script, I'll use the pre-configured psql if possible or a wrapper.
        pass
    except:
        pass
    # For this script, I'll use subprocess to call the supabase--read_query tool via dispatch if I were a real person,
    # but as an agent I'll just write the python and run it.
    
    # Actually, I'll just write a script that uses the environment variables to query.
    pass

# We'll use a python script that calls the tools via the agent's capability by generating a plan or just running it.
# Wait, I should just run shell commands directly for queries.

def get_tables():
    result = subprocess.run(["psql", "-t", "-c", "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename;"], capture_output=True, text=True)
    return [t.strip() for t in result.stdout.split('\n') if t.strip()]

def main():
    tables = get_tables()
    print(f"Found {len(tables)} tables.")
    
    # Batch export
    for table in tables:
        csv_path = os.path.join(CSV_DIR, f"{table}.csv")
        data_path = os.path.join(DATA_DIR, f"{table}.sql")
        
        # CSV
        subprocess.run(["psql", "-c", f"COPY (SELECT * FROM public.\"{table}\") TO STDOUT WITH CSV HEADER"], stdout=open(csv_path, 'w'))
        
        # SQL (Data only, COPY format)
        subprocess.run(["pg_dump", "--data-only", "--no-owner", "--disable-triggers", "-t", f"public.\"{table}\"", "-f", data_path])

if __name__ == "__main__":
    # This is a template, I will execute the actual commands in the next turn.
    pass
