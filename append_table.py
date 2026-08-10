import re
import csv
import os
import sys

def parse_map_string(s):
    results = []
    # Split by " map[" but keep the first one
    maps = re.split(r'\s(?=map\[)', s)
    for m in maps:
        m = m.strip()
        if m.startswith('map['):
            m = m[4:-1]
        elif m.startswith('['):
            m = m[1:]
            if m.endswith(']'): m = m[:-1]
            if m.startswith('map['): m = m[4:-1]
        
        pairs = {}
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

def append_to_files(table_name, data, is_first=False):
    if not data:
        return
    
    os.makedirs('export/csv', exist_ok=True)
    os.makedirs('export/data', exist_ok=True)
    
    columns = sorted(data[0].keys())
    csv_path = f'export/csv/{table_name}.csv'
    sql_path = f'export/data/{table_name}.sql'
    
    # CSV
    mode = 'w' if is_first else 'a'
    with open(csv_path, mode, newline='') as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        if is_first:
            writer.writeheader()
        writer.writerows(data)
    
    # SQL
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

if __name__ == "__main__":
    table_name = sys.argv[1]
    is_first = sys.argv[2].lower() == 'true'
    content = sys.stdin.read()
    append_to_files(table_name, parse_map_string(content), is_first)
