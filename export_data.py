import subprocess
import os

TABLES_FILE = "export/tables.txt"
CSV_DIR = "export/csv"
DATA_DIR = "export/data"

with open(TABLES_FILE, 'r') as f:
    tables = [line.strip() for line in f if line.strip()]

for table in tables:
    csv_path = os.path.join(CSV_DIR, f"{table}.csv")
    data_path = os.path.join(DATA_DIR, f"{table}.sql")
    
    print(f"Exporting {table}...")
    # CSV
    with open(csv_path, 'w') as out:
        subprocess.run(["psql", "-c", f"COPY (SELECT * FROM public.\"{table}\") TO STDOUT WITH CSV HEADER"], stdout=out)
    
    # SQL Data (COPY format)
    subprocess.run(["pg_dump", "--data-only", "--no-owner", "--disable-triggers", "-t", f"public.\"{table}\"", "-f", data_path])

# Create manifest
with open("export/data/manifest.txt", "w") as f:
    for table in tables:
        path = f"export/data/{table}.sql"
        if os.path.exists(path):
            size = os.path.getsize(path)
            f.write(f"{table}.sql {size}\n")
