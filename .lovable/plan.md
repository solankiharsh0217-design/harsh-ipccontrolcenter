## Payroll Automation + Profit Statement Build

This is a large, multi-module build. Below is the plan I'll follow. Please confirm or edit before I start — once you approve I'll ship it end-to-end.

### Important finding
You referenced an "existing Profit Statement prototype/module" — I searched the codebase and **there is no Profit Statement module yet** (no file matching profit/payroll exists). I'll build it from scratch under `/profit-statement` using the existing IPC design system (no global CSS / font / sidebar changes).

If you actually have a prototype somewhere (different name, separate project, screenshot only), tell me before I start so I match it.

---

### Scope breakdown

**1. Database (Supabase migrations)**
New tables:
- `team_payroll_profiles` — payroll details per team member (pay_type, salary, joining/exit, cycle, classification, etc.)
- `team_salary_history` — change log for salary edits
- `payroll_runs` — one row per (business_unit, period) generation
- `payroll_run_entries` — calculated salary rows per member per run
- `recurring_expense_templates` — Zoom, rent, tools, etc.
- `profit_statements` — saved monthly P&L
- `profit_statement_lines` — revenue/COGS/expense line items
- `incentives` — variable pay entries

RLS: admin-only read/write on payroll/salary tables. Profit statements: admin + finance role read; admin write. Adds `finance` to the existing `app_role` enum.

**2. Add/Edit Team Member form (Admin Panel + Team Directory)**
Extends existing `Admin.tsx` add form and `Team.tsx` "Manage member" modal with a collapsible **Payroll Details** section:
- Payroll Applicable (Yes/No)
- Pay Type (saved dropdown via existing QuickSaveInput, key `team_pay_type`)
- Conditional amount fields (monthly / one-time / daily / hourly / custom)
- Joining date (required), Exit date (optional)
- Salary Expense Category, P&L Cost Classification (saved dropdowns)
- Salary cycle, disbursement window (default 7–10), notes
Validation per Part 19, inline + toast.

**3. Team Directory display**
Adds payroll columns visible to admin only (pay type, joining date, amount, status). Hidden for non-admin.

**4. Profit Statement module** (new pages/components)
Route: `/profit-statement` (added to sidebar, gated by new module key `profit-statement`, admin/finance only)
Tabs: Overview · Revenue · COGS · Operating Expenses · Team Payroll · Incentives · Recurring · Summary

**5. Team Payroll tab**
- Payroll Settings card (period, cycle, disbursement, accrual/cash basis)
- Backend Team Directory card (live fetched, no static data)
- "Generate Payroll From Team Directory" → preview → edit → "Post to Profit Statement"
- Pro-rata math per Part 6, pay-type logic per Part 7
- Duplicate guard per (business_unit, period_start, period_end)
- Stores in `payroll_runs` + `payroll_run_entries`

**6. Push to Profit Statement**
Posted payroll entries become `profit_statement_lines` mapped by `cost_classification` (Operating Expense / COGS / Fixed / Variable / One-Time).

**7. Incentives tab**
Separate from payroll. Fetches members from backend. Saved-dropdown reasons/types.

**8. Recurring Expenses**
Templates + "Generate Monthly Recurring" with duplicate guard.

**9. Reports & History**
New "Profit Statement" report type in existing Reports page with View/Edit/Delete (soft)/Export CSV/PDF/Copy. Status: Draft/Posted/Locked.

**10. Master Data**
Adds new QuickSave field keys: `team_pay_type`, `salary_expense_category`, `pnl_cost_classification`, `incentive_reason`, `incentive_type`, `expense_category`, `revenue_category`, `business_unit`. Visible + button.

**11. Permissions**
- Adds `finance` to `app_role`
- New module key `profit-statement` in `src/lib/modules.ts`
- `ProtectedRoute` gates the route
- Salary fields hidden in Team Directory for non-admin/non-finance
- RLS enforces server-side

---

### What I will NOT touch
- Global CSS, fonts, Tailwind tokens
- Sidebar/topbar visual design (only adds new nav entry)
- ROAS Calculator, Daily Lead Reporting, CRM logic
- `src/integrations/supabase/client.ts` or `types.ts` (auto-generated)
- Existing data — all migrations are additive

---

### Delivery order
1. Migration for all new tables + RLS + `finance` role + module key
2. Extend Add Team Member form (Admin + Team modals)
3. Profit Statement scaffold + route + sidebar entry
4. Team Payroll tab (fetch + generate + preview + post)
5. Incentives + Recurring + Revenue/COGS/Expenses tabs
6. Reports & History integration
7. QA pass on calculations and duplicate guards

---

### Open questions (please answer in your reply, or I'll use the defaults shown)
1. **Business Unit / Brand**: do you already have a brands table, or should I add one and seed a single default ("IPC")? *Default: add `business_units` table, seed "IPC".*
2. **Finance role**: should I create a `finance` role now, or keep payroll admin-only for v1? *Default: admin-only for v1, leave hook for finance later.*
3. **Currency**: INR only? *Default: INR (₹), no multi-currency.*
4. **Profit Statement granularity**: per business unit per month, or one global per month? *Default: per business unit per month.*

Reply with "go" (and any answers) to start.