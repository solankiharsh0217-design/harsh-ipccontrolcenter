import re
import csv
import os
import sys

def parse_map_string(s):
    results = []
    # Strip any common noise from tool output
    s = re.sub(r'// =============.*', '', s)
    s = re.sub(r'^\d+:\s*\[', '', s.strip())
    
    maps = re.split(r'\s(?=map\[)', s)
    for m in maps:
        m = m.strip()
        if not m: continue
        if m.startswith('map['): m = m[4:]
        if m.endswith(']'): m = m[:-1]
        
        pairs = {}
        # Keys follow a pattern: space or start, then key name, then colon
        key_matches = list(re.finditer(r'(?:^|\s)([a-z0-9_]+):', m))
        
        for i in range(len(key_matches)):
            k = key_matches[i].group(1)
            start = key_matches[i].end()
            end = key_matches[i+1].start() if i+1 < len(key_matches) else len(m)
            v = m[start:end].strip()
            if v == '<nil>': v = None
            pairs[k] = v
        if pairs:
            results.append(pairs)
    return results

def process_and_append(table_name, raw_content, is_first=False):
    data = parse_map_string(raw_content)
    if not data: return 0
    
    os.makedirs('export/csv', exist_ok=True)
    os.makedirs('export/data', exist_ok=True)
    
    # We need a consistent column set. I'll use a known list for this table.
    columns = ["amount", "created_at", "created_by", "finance_linked", "id", "is_deleted", "is_final_payment", "is_token", "next_payment_expected_date", "notes", "paid_pipeline_lead_id", "payment_category", "payment_date", "payment_description", "payment_mode", "payment_reference", "payment_type"]
    columns.sort()
    
    csv_path = f'export/csv/{table_name}.csv'
    sql_path = f'export/data/{table_name}.sql'
    
    mode = 'w' if is_first else 'a'
    with open(csv_path, mode, newline='') as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        if is_first:
            writer.writeheader()
        writer.writerows(data)
        
    if is_first:
        with open(sql_path, 'w') as f:
            f.write(f"COPY public.{table_name} ({', '.join(columns)}) FROM stdin;\n")
    
    with open(sql_path, 'a') as f:
        for row in data:
            vals = []
            for col in columns:
                v = row.get(col)
                if v is None:
                    vals.append('\\N')
                else:
                    v_str = str(v).replace('\\', '\\\\').replace('\t', '\\t').replace('\n', '\\n').replace('\r', '\\r')
                    vals.append(v_str)
            f.write('\t'.join(vals) + '\n')
    return len(data)

if __name__ == "__main__":
    table_name = sys.argv[1]
    is_first = sys.argv[2].lower() == 'true'
    content = sys.stdin.read()
    count = process_and_append(table_name, content, is_first)
    print(f"PROCESSED:{count}")
