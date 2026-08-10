import re
import csv
import os
import sys

def parse_map_string(s):
    results = []
    # Identify maps: [map[k:v ...]] or map[k:v ...]
    # Clean tool markers
    s = re.sub(r'// =============.*', '', s)
    s = re.sub(r'^\d+:\s*\[', '', s.strip())
    
    maps = re.split(r'\s(?=map\[)', s)
    for m in maps:
        m = m.strip()
        if not m: continue
        if m.startswith('map['): m = m[4:]
        if m.endswith(']'): m = m[:-1]
        if m.endswith(']]'): m = m[:-2]
        
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

def process_and_append(table_name, raw_content):
    data = parse_map_string(raw_content)
    if not data: return 0
    
    os.makedirs('export/csv', exist_ok=True)
    os.makedirs('export/data', exist_ok=True)
    os.makedirs('tmp', exist_ok=True)
    
    # Store parsed JSONs temporarily to merge later
    import json
    tmp_file = f'tmp/{table_name}_accumulated.jsonl'
    with open(tmp_file, 'a') as f:
        for d in data:
            f.write(json.dumps(d) + '\n')
    return len(data)

if __name__ == "__main__":
    table_name = sys.argv[1]
    content = sys.stdin.read()
    count = process_and_append(table_name, content)
    print(f"PROCESSED:{count}")
