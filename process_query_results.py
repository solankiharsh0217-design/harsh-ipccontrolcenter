import sys
import os
import json

def process_results(results_path):
    with open(results_path, 'r') as f:
        content = f.read()
    
    # Each SELECT result is in a list of maps format
    # The tool output might have truncated the full content if it was one huge string
    # But read_query usually returns a JSON list of lists if multiple queries were run
    try:
        data = json.loads(content)
    except:
        print("Failed to parse results as JSON. Using fallback regex.")
        # Fallback to splitting by common map delimiters if it's the raw map string
        # This handles the case where the tool returns the Go map string directly
        data = [content] 

    tables = [
        "service_packages",
        "pipelines",
        "user_roles",
        "program_products",
        "follow_up_reminders",
        "code_of_conduct_templates",
        "crm_lead_conversions",
        "paid_pipeline_payments"
    ]
    
    # If it's a list of results (one per query)
    if isinstance(data, list) and len(data) > 1:
        for i, table_name in enumerate(tables):
            if i < len(data):
                table_data = str(data[i])
                os.system(f"python3 export_processor.py {table_name} '{table_data}'")
    else:
        # If it's one large combined result or the map string
        # We might need to split it if we can identify where one ends and another begins
        # But usually read_query for multiple SELECTs returns a list of lists.
        # Given the truncated output, let's try to process what we have.
        full_str = data[0] if isinstance(data, list) else data
        # We need to be careful here if they are all squashed together.
        # For now, I'll assume it's one table at a time or I'll run them separately.
        pass

if __name__ == '__main__':
    if len(sys.argv) > 1:
        process_results(sys.argv[1])
