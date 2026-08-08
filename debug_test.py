import re
with open('src/components/paid-pipeline/PaidPipelineLeadDrawer.test.tsx', 'r') as f:
    content = f.read()
    # Check if the picker mock is always visible or depends on state
    print("Checking TabsContent mock...")
    match = re.search(r'TabsContent:.*style=\{\{ display: \'block\' \}\}', content)
    if match:
        print("FOUND: TabsContent uses display: 'block' unconditionally!")
