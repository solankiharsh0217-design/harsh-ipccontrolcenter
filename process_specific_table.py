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
        # Find all keys: pattern is space or start, then key name, then colon
        # Values can be anything until the next key: pattern
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

def write_files(table_name, data):
    if not data:
        print(f"No data for {table_name}")
        return
    
    os.makedirs('export/csv', exist_ok=True)
    os.makedirs('export/data', exist_ok=True)
    
    columns = sorted(data[0].keys())
    
    # CSV
    csv_path = f'export/csv/{table_name}.csv'
    with open(csv_path, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        writer.writerows(data)
    print(f"Wrote {len(data)} rows to {csv_path}")
    
    # SQL (COPY format)
    sql_path = f'export/data/{table_name}.sql'
    with open(sql_path, 'w') as f:
        f.write(f"COPY public.{table_name} ({', '.join(columns)}) FROM stdin;\n")
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
        f.write("\\.\n")
    print(f"Wrote {len(data)} rows to {sql_path}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: script.py <table_name> <content_file>")
        sys.exit(1)
    
    table_name = sys.argv[1]
    content_file = sys.argv[2]
    
    with open(content_file, 'r') as f:
        content = f.read()
    
    data = parse_map_string(content)
    write_files(table_name, data)
