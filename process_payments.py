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
        # Keys are word characters followed by a colon
        # Values go until the next space+key+colon or end of string
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
        print(f"No data parsed for {table_name}")
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
    print(f"CSV_COUNT:{len(data)}")
    
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
    print(f"SQL_COUNT:{len(data)}")

if __name__ == "__main__":
    content = sys.stdin.read()
    write_files('paid_pipeline_payments', parse_map_string(content))
