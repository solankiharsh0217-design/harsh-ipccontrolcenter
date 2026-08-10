import os
import subprocess
import csv
from pathlib import Path

EXPORT_DIR = Path("export")
CSV_DIR = EXPORT_DIR / "csv"
DATA_DIR = EXPORT_DIR / "data"

CSV_DIR.mkdir(parents=True, exist_ok=True)
DATA_DIR.mkdir(parents=True, exist_ok=True)

def run_query(query):
    try:
        result = subprocess.run(
            ["psql", "-At", "-c", query],
            capture_output=True,
            text=True,
            check=True
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        print(f"Query failed: {e.stderr}")
        return None

def export_table(table_name):
    # CSV Export
    csv_file = CSV_DIR / f"{table_name}.csv"
    copy_csv_query = f"COPY (SELECT * FROM public.{table_name}) TO STDOUT WITH CSV HEADER"
    try:
        with open(csv_file, "w", encoding="utf-8") as f:
            subprocess.run(["psql", "-c", copy_csv_query], stdout=f, check=True)
    except Exception as e:
        print(f"CSV export failed for {table_name}: {e}")

    # SQL Data Export (COPY format)
    sql_file = DATA_DIR / f"{table_name}.sql"
    try:
        # We use pg_dump --data-only --table=public.table_name
        # To stay consistent with COPY format and NULL handling
        subprocess.run([
            "pg_dump", "--data-only", "--no-owner", "--disable-triggers",
            f"--table=public.{table_name}", "--file=" + str(sql_file)
        ], check=True)
    except Exception as e:
        print(f"SQL export failed for {table_name}: {e}")

def process_batch(batch_name, tables):
    print(f"--- Processing {batch_name} ---")
    produced_count = 0
    for table in tables:
        export_table(table)
        produced_count += 1
    print(f"{batch_name} done. Produced {produced_count} CSV and {produced_count} SQL files.")

# BATCH 1
batch1 = [
    "paid_pipeline_leads",
    "paid_pipeline_activity_logs",
    "paid_pipeline_payments",
    "paid_pipeline_settings",
    "paid_pipeline_followups"
]
process_batch("BATCH 1", batch1)

# Verification for BATCH 1
def get_row_count(csv_path):
    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            return sum(1 for line in f) - 1 # subtract header
    except:
        return 0

leads_count = get_row_count(CSV_DIR / "paid_pipeline_leads.csv")
payments_count = get_row_count(CSV_DIR / "paid_pipeline_payments.csv")
print(f"VERIFICATION: paid_pipeline_leads.csv has {leads_count} data rows.")
print(f"VERIFICATION: paid_pipeline_payments.csv has {payments_count} data rows.")

# BATCH 2
batch2 = [
    "students", "leads", "lead_notes", "stages",
    "lead_tag_assignments", "profiles", "follow_up_reminders",
    "user_roles", "pipelines", "crm_lead_conversions"
]
process_batch("BATCH 2", batch2)

# BATCH 3
batch3 = ["code_of_conduct_templates"]
process_batch("BATCH 3", batch3)

# BATCH 4
batch4 = [
    "notifications", "daily_lead_report_ad_accounts",
    "system_refinement_items", "daily_lead_source_mappings",
    "daily_lead_report_media_buyers", "roas_calculation_drafts",
    "daily_lead_reports", "quick_save_entries",
    "kpi_entries", "task_activity",
    "tax_code_master", "user_module_access",
    "roas_attribution_audit_logs", "webinar_batches",
    "notification_rules", "tasks",
    "resource_library_categories", "kpi_categories",
    "kpi_definitions", "kpi_template_items",
    "tags", "lead_qualifier_sessions",
    "invoice_item_categories", "company_role_catalog",
    "team_performance_reminders", "team_payroll_profiles",
    "webinars", "kpi_templates",
    "operations_lead_checklist_state", "operations_template_checklist_items",
    "seminar_roas_report_days", "crm_batch_archives",
    "operations_leads", "operations_template_fields",
    "daily_metric_templates", "task_submissions",
    "kpi_reward_rules", "operations_communication_templates",
    "seminar_roas_report_products", "seminar_roas_reports",
    "kpi_assignments", "media_buyer_attribution",
    "operations_lead_custom_values", "operations_process_templates",
    "roas_media_buyers", "service_packages",
    "webinar_templates", "company_settings",
    "invoice_settings", "lead_hotness_scores",
    "media_buyer_aliases", "offline_seminar_reports",
    "operations_result_reward_rules", "operations_reward_rules",
    "program_products", "roas_webinars",
    "task_assignee_visibility"
]
process_batch("BATCH 4", batch4)
