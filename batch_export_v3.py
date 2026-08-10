import os
import subprocess
from pathlib import Path

EXPORT_DIR = Path("export")
CSV_DIR = EXPORT_DIR / "csv"
DATA_DIR = EXPORT_DIR / "data"

def export_table(table_name):
    csv_file = CSV_DIR / f"{table_name}.csv"
    sql_file = DATA_DIR / f"{table_name}.sql"
    
    # Only export if missing
    if not csv_file.exists():
        copy_csv_query = f"COPY (SELECT * FROM public.{table_name}) TO STDOUT WITH CSV HEADER"
        try:
            with open(csv_file, "w", encoding="utf-8") as f:
                subprocess.run(["psql", "-c", copy_csv_query], stdout=f, check=True)
            print(f"Exported CSV: {table_name}")
        except Exception as e:
            print(f"CSV export failed for {table_name}: {e}")

    if not sql_file.exists():
        try:
            subprocess.run([
                "pg_dump", "--data-only", "--no-owner", "--disable-triggers",
                f"--table=public.{table_name}", "--file=" + str(sql_file)
            ], check=True)
            print(f"Exported SQL: {table_name}")
        except Exception as e:
            print(f"SQL export failed for {table_name}: {e}")

# Process only 10 tables at a time to avoid overall timeout
tables = [
    "notifications", "daily_lead_report_ad_accounts", "system_refinement_items", 
    "daily_lead_source_mappings", "daily_lead_report_media_buyers", "roas_calculation_drafts", 
    "daily_lead_reports", "quick_save_entries", "kpi_entries", "task_activity", 
    "tax_code_master", "user_module_access", "roas_attribution_audit_logs", 
    "webinar_batches", "notification_rules", "tasks", "resource_library_categories", 
    "kpi_categories", "kpi_definitions", "kpi_template_items", "tags", 
    "lead_qualifier_sessions", "invoice_item_categories", "company_role_catalog", 
    "team_performance_reminders", "team_payroll_profiles", "webinars", "kpi_templates", 
    "operations_lead_checklist_state", "operations_template_checklist_items", 
    "seminar_roas_report_days", "crm_batch_archives", "operations_leads", 
    "operations_template_fields", "daily_metric_templates", "task_submissions", 
    "kpi_reward_rules", "operations_communication_templates", 
    "seminar_roas_report_products", "seminar_roas_reports", "kpi_assignments", 
    "media_buyer_attribution", "operations_lead_custom_values", 
    "operations_process_templates", "roas_media_buyers", "service_packages", 
    "webinar_templates", "company_settings", "invoice_settings", 
    "lead_hotness_scores", "media_buyer_aliases", "offline_seminar_reports", 
    "operations_result_reward_rules", "operations_reward_rules", "program_products", 
    "roas_webinars", "task_assignee_visibility",
    "access_templates", "activity_logs", "attendance_logs", "attendance_sessions",
    "attribution_media_buyers", "attribution_sales_detail", "attribution_sessions",
    "audit_logs", "business_units", "code_of_conduct_automation_events",
    "code_of_conduct_automation_rules", "code_of_conduct_email_variants",
    "code_of_conduct_events", "code_of_conduct_guide_progress", "code_of_conduct_requests",
    "code_of_conduct_rules"
]

# Simple batching: process first 10 missing
count = 0
for t in tables:
    csv_exists = (CSV_DIR / f"{t}.csv").exists()
    sql_exists = (DATA_DIR / f"{t}.sql").exists()
    if not csv_exists or not sql_exists:
        export_table(t)
        count += 1
    if count >= 10:
        break
print(f"Batch processed. Exported up to 10 more tables.")
