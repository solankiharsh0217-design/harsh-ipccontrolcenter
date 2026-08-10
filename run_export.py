import os
import json
import csv
import subprocess

def run_query(query):
    # Using the tool via a mocked call or directly if I can
    # But since I'm the agent, I have to call the tool.
    # I'll output the queries I need to run.
    pass

def save_data(table_name, rows):
    if not rows:
        return
    
    keys = rows[0].keys()
    
    # CSV
    os.makedirs("export/csv", exist_ok=True)
    with open(f"export/csv/{table_name}.csv", 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=keys)
        writer.writeheader()
        writer.writerows(rows)
    
    # SQL
    os.makedirs("export/data", exist_ok=True)
    with open(f"export/data/{table_name}.sql", 'w') as f:
        f.write(f"COPY public.{table_name} ({', '.join(keys)}) FROM stdin;\n")
        for row in rows:
            values = []
            for k in keys:
                v = row[k]
                if v is None:
                    values.append('\\N')
                else:
                    values.append(str(v).replace('\t', '\\t').replace('\n', '\\n'))
            f.write('\t'.join(values) + '\n')
        f.write("\\.\n")

# Since I can't call the tool FROM a script, I will have to 
# do them in blocks.
