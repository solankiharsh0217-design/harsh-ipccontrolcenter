import sys
import os

table = sys.argv[1]
content = sys.argv[2]
mode = sys.argv[3] # 'w' or 'a'

os.makedirs("temp_data", exist_ok=True)
with open(f"temp_data/{table}.raw", mode) as f:
    f.write(content)
