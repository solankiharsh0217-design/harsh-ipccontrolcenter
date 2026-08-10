import os
import csv
import re
import json

def parse_map_string(s):
    if s.startswith("[") and s.endswith("]"):
        s = s[1:-1]
    
    # Split by " map["
    segments = re.split(r'\s(?=map\[)', s)
    rows = []
    
    # Define keys we expect for service_packages (as an example)
    # But it's better to be dynamic. 
    # The issue was '04' being seen as a key because of "03:46:58"
    # A key in this context is ALWAYS followed by ":" and typically preceded by a space or "map["
    
    for seg in segments:
        if seg.startswith('map['): seg = seg[4:]
        if seg.endswith(']'): seg = seg[:-1]
        
        # A key must be a valid identifier (alphanumeric + underscore)
        # And must be followed by ":"
        # AND crucially, it's usually preceded by a space and NOT part of a timestamp.
        # Let's find all occurrences of " \w+:"
        row = {}
        # First key is special (no leading space)
        first_key_match = re.match(r'^(\w+):', seg)
        keys = []
        if first_key_match:
            keys.append(first_key_match.group(1))
        
        # Other keys: space + word + colon
        # We avoid colons in timestamps by ensuring the key is not just digits
        other_keys = re.findall(r'\s([a-zA-Z_]\w+):', seg)
        keys.extend(other_keys)
        
        for i in range(len(keys)):
            k = keys[i]
            # Find the exact start of the value
            # If it's the first key, it's at the beginning
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

def write_files(table_name, data_str):
    rows = parse_map_string(data_str)
    if not rows: return
    keys = list(rows[0].keys())
    os.makedirs("export/csv", exist_ok=True)
    with open(f"export/csv/{table_name}.csv", 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=keys)
        writer.writeheader()
        writer.writerows(rows)
    os.makedirs("export/data", exist_ok=True)
    with open(f"export/data/{table_name}.sql", 'w') as f:
        f.write(f"COPY public.{table_name} ({', '.join(keys)}) FROM stdin;\n")
        for row in rows:
            f.write('\t'.join([str(row[k]) if row[k] is not None else '\\N' for k in keys]) + '\n')
        f.write("\\.\n")
    print(f"Exported {table_name}: {len(rows)} rows")

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 2: write_files(sys.argv[1], sys.argv[2])
