import os
import csv
import json
import requests

API_URL = os.environ.get("VITE_SUPABASE_URL")
ANON_KEY = os.environ.get("VITE_SUPABASE_ANON_KEY")

def export_table(table_name):
    headers = {
        "apikey": ANON_KEY,
        "Authorization": f"Bearer {ANON_KEY}",
        "Content-Type": "application/json"
    }
    
    url = f"{API_URL}/rest/v1/{table_name}?select=*"
    response = requests.get(url, headers=headers)
    
    if response.status_code != 200:
        print(f"Error fetching {table_name}: {response.text}")
        return False

    data = response.json()
    if not data:
        print(f"No data for {table_name}")
        # Create empty files to acknowledge request
        open(f"export/csv/{table_name}.csv", 'a').close()
        open(f"export/data/{table_name}.sql", 'a').close()
        return True

    # Save as CSV
    keys = data[0].keys()
    csv_path = f"export/csv/{table_name}.csv"
    with open(csv_path, 'w', newline='') as f:
        dict_writer = csv.DictWriter(f, fieldnames=keys)
        dict_writer.writeheader()
        dict_writer.writerows(data)
    
    # Save as SQL (COPY format)
    sql_path = f"export/data/{table_name}.sql"
    with open(sql_path, 'w') as f:
        f.write(f"COPY public.{table_name} ({', '.join(keys)}) FROM stdin;\n")
        for row in data:
            values = []
            for k in keys:
                v = row[k]
                if v is None:
                    values.append('\\N')
                elif isinstance(v, (dict, list)):
                    values.append(json.dumps(v).replace('\n', '\\n'))
                else:
                    values.append(str(v).replace('\t', '\\t').replace('\n', '\\n'))
            f.write('\t'.join(values) + '\n')
        f.write("\\.\n")
    
    print(f"Exported {table_name}: {len(data)} rows")
    return True

tables = [
    "service_packages", "pipelines", "user_roles", "program_products", 
    "follow_up_reminders", "code_of_conduct_templates", "crm_lead_conversions",
    "paid_pipeline_payments"
]

for t in tables:
    export_table(t)
