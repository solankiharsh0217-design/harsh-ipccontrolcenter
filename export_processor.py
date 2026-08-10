import os
import csv
import re
import json
import sys

def parse_map_string(s):
    if not s: return []
    if s.startswith("[") and s.endswith("]"):
        s = s[1:-1]
    
    segments = re.split(r'\s(?=map\[)', s)
    rows = []
    
    for seg in segments:
        if seg.startswith('map['): seg = seg[4:]
        if seg.endswith(']'): seg = seg[:-1]
        
        row = {}
        first_key_match = re.match(r'^(\w+):', seg)
        keys = []
        if first_key_match:
            keys.append(first_key_match.group(1))
        
        other_keys = re.findall(r'\s([a-zA-Z_]\w+):', seg)
        keys.extend(other_keys)
        
        for i in range(len(keys)):
            k = keys[i]
            k_pattern = k + ":" if i == 0 else " " + k + ":"
            start = seg.find(k_pattern) + len(k_pattern)
            
            if i + 1 < len(keys):
                next_k = keys[i+1]
                end = seg.find(" " + next_k + ":", start)
            else:
                end = len(seg)
            
            val = seg[start:end].strip()
            row[k] = None if val == '<nil>' else val
        if row: rows.append(row)
    return rows

def escape_sql_copy(val):
    if val is None: return '\\N'
    val = str(val)
    # Basic escaping for TSV-based COPY
    val = val.replace('\\', '\\\\').replace('\t', '\\t').replace('\n', '\\n').replace('\r', '\\r')
    return val

def write_files(table_name, data_str, mode='w'):
    rows = parse_map_string(data_str)
    if not rows: return
    
    keys = list(rows[0].keys())
    os.makedirs("export/csv", exist_ok=True)
    csv_path = f"export/csv/{table_name}.csv"
    with open(csv_path, mode, newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=keys)
        if mode == 'w':
            writer.writeheader()
        writer.writerows(rows)
    
    os.makedirs("export/data", exist_ok=True)
    sql_path = f"export/data/{table_name}.sql"
    
    content = ""
    if mode == 'a' and os.path.exists(sql_path):
        with open(sql_path, 'r', encoding='utf-8') as f:
            content = f.read()
        if content.endswith("\\.\n"):
            content = content[:-3]
    
    with open(sql_path, 'w', encoding='utf-8') as f:
        if mode == 'w' or not content:
            f.write(f"COPY public.{table_name} ({', '.join(keys)}) FROM stdin;\n")
        else:
            f.write(content)
            
        for row in rows:
            line = '\t'.join([escape_sql_copy(row[k]) for k in keys])
            f.write(line + '\n')
        f.write("\\.\n")
    print(f"Exported {table_name}: {len(rows)} rows to {csv_path} and {sql_path}")

if __name__ == '__main__':
    if len(sys.argv) > 3:
        write_files(sys.argv[1], sys.argv[2], sys.argv[3])
    elif len(sys.argv) > 2:
        write_files(sys.argv[1], sys.argv[2])
