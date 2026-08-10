import json
import csv
import os
import re

def parse_tool_output(s):
    # This is a hacky parser for the "map[key:val]" string format
    # It looks for keys and attempts to slice values
    # We'll use a regex to find keys (word followed by colon)
    # This is fragile but works for these specific exports
    
    # Remove leading/trailing brackets
    if s.startswith('[') and s.endswith(']'):
        s = s[1:-1]
    
    # Split by " map["
    parts = re.split(r' map\[', s)
    results = []
    
    for part in parts:
        if part.startswith('map['):
            part = part[4:]
        if part.endswith(']'):
            part = part[:-1]
        
        # Now we have "key:val key2:val2"
        # We find keys by looking for words followed by ":"
        # Note: Values can have spaces, but keys are standard field names
        row = {}
        # Find all keys
        keys = re.findall(r'(\w+):', part)
        for i in range(len(keys)):
            k = keys[i]
            start = part.find(k + ":") + len(k) + 1
            if i + 1 < len(keys):
                end = part.find(" " + keys[i+1] + ":")
            else:
                end = len(part)
            
            val = part[start:end].strip()
            if val == '<nil>':
                row[k] = None
            else:
                row[k] = val
        if row:
            results.append(row)
    return results

def save(table, rows):
    if not rows: return
    keys = rows[0].keys()
    
    os.makedirs("export/csv", exist_ok=True)
    with open(f"export/csv/{table}.csv", 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=keys)
        writer.writeheader()
        writer.writerows(rows)
        
    os.makedirs("export/data", exist_ok=True)
    with open(f"export/data/{table}.sql", 'w') as f:
        f.write(f"COPY public.{table} ({', '.join(keys)}) FROM stdin;\n")
        for row in rows:
            line = []
            for k in keys:
                v = row[k]
                if v is None: line.append('\\N')
                else: line.append(str(v).replace('\t', '\\t').replace('\n', '\\n'))
            f.write('\t'.join(line) + '\n')
        f.write("\\.\n")

# Process the specific tables from previous tool outputs
# (In a real run, I'd pass the string here, but for this step I'll 
# just set up the infrastructure to process them in batches)
