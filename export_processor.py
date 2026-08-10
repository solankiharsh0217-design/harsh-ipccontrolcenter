import os
import csv
import re
import json

def parse_map_string(s):
    # Standard output of the tool for multiple rows is a list of maps: [map[k:v k2:v2] map[...]]
    # We remove the outer brackets and split by " map["
    if s.startswith("[") and s.endswith("]"):
        s = s[1:-1]
    
    # Split by " map[" but be careful with nested brackets
    # Actually, a simpler way is to find each "map[...]" segment
    pattern = r"map\[(.*?)(?=\smap\[|\]\s*|$)"
    matches = re.findall(pattern, s, re.DOTALL)
    
    rows = []
    for m in matches:
        if m.endswith(']'): m = m[:-1]
        row = {}
        # Find all keys (word followed by colon)
        # Note: keys in these tables don't have spaces, but values might.
        # This regex is still a heuristic.
        keys = re.findall(r"(\w+):", m)
        for i in range(len(keys)):
            k = keys[i]
            k_str = k + ":"
            start = m.find(k_str) + len(k_str)
            if i + 1 < len(keys):
                next_k = keys[i+1]
                end = m.find(" " + next_k + ":", start)
                if end == -1: # Maybe no space before next key?
                    end = m.find(next_k + ":", start)
            else:
                end = len(m)
            
            val = m[start:end].strip()
            if val == "<nil>":
                row[k] = None
            else:
                row[k] = val
        if row:
            rows.append(row)
    return rows

def write_files(table_name, data_str):
    rows = parse_map_string(data_str)
    if not rows:
        print(f"No rows parsed for {table_name}")
        return
    
    keys = list(rows[0].keys())
    
    # Write CSV
    os.makedirs("export/csv", exist_ok=True)
    csv_path = f"export/csv/{table_name}.csv"
    with open(csv_path, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=keys)
        writer.writeheader()
        writer.writerows(rows)
    
    # Write SQL
    os.makedirs("export/data", exist_ok=True)
    sql_path = f"export/data/{table_name}.sql"
    with open(sql_path, 'w') as f:
        f.write(f"COPY public.{table_name} ({', '.join(keys)}) FROM stdin;\n")
        for row in rows:
            line = []
            for k in keys:
                v = row[k]
                if v is None:
                    line.append('\\N')
                else:
                    line.append(str(v).replace('\t', '\\t').replace('\n', '\\n'))
            f.write('\t'.join(line) + '\n')
        f.write("\\.\n")
    print(f"Exported {table_name}: {len(rows)} rows")

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 2:
        write_files(sys.argv[1], sys.argv[2])
