# Phase 1.3C — Complete Invoice Module

This is a large build. I'll ship it in one phase but in a clear, ordered way so nothing breaks the existing Paid Pipeline → Create Invoice flow or the PDF renderer / signature pipeline already fixed.

## What I will NOT touch
Code of Conduct, payment calc, payment records, Sheet/CSV import, follow-ups, Team Directory, Operations CRM, hard wipe, signature/logo storage. Existing PDF renderer is extended (not rewritten) only for billing-vs-linked-client and visibility toggles.

## 1. Database (single migration)

**Extend `invoices`:**
- `linked_client_name`, `linked_client_email`, `linked_client_phone` (snapshot of original lead)
- `billing_name`, `billing_email`, `billing_phone`, `billing_gstin`
- `invoice_number_mode` (`auto` | `manual`), `manual_invoice_number`
- `show_bank_details` bool default true, `show_payment_instructions` bool default true, `show_signature` bool default true, `show_stamp` bool default true
- `subject` text, `salesperson_id` uuid, `invoice_context_type` (`linked_paid_lead` | `manual` | `later_linked`)
- `billing_city`, `billing_state`, `billing_state_code`, `billing_country`
- Backfill: copy `member_name/email/phone/billing_address` into billing_* and linked_client_* where null.

**New tables (with GRANTs + RLS):**
- `invoice_item_categories` (name, default_hsn_sac, default_gst_rate, default_taxable_status, is_active)
- `invoice_items` (item_name, category_id, description, hsn_sac, default_gst_rate, default_price, taxable_status, unit, is_active)
- `tax_code_master` (code, type GST_SAC/HSN, description, category, gst_rate_default, keywords text[], source, is_active) + GIN index on description/keywords + btree on code
- RLS: SELECT for active users, INSERT/UPDATE/DELETE for admin only (via `has_role`).

**Numbering RPC:** add `assign_manual_invoice_number(text)` that validates uniqueness, requires admin, returns the number or raises.

**Tighten invoice_line_items + invoice_events SELECT policies** (security scan findings): only invoice creator, assigned sales executive on linked paid lead, or admin can read. Same scoping the `invoices` table already has.

**Seed `tax_code_master`** with ~80 common SAC codes relevant to coaching/training/advertising/events/consulting (999293 commercial training, 998361 advertising services, 999293 coaching, 998596 events, 998311 management consulting, 998314 IT consulting, 998387 photography, 999294 other education, etc.) with keywords arrays for fuzzy matching.

**Seed `invoice_item_categories`** with the 11 categories listed in Part 8.

## 2. Library layer

- `src/lib/invoices/types.ts` — extend Invoice + new types (Item, ItemCategory, TaxCode)
- `src/lib/invoices/api.ts` — extend save/issue to persist new fields; map billing_* into seller/buyer snapshots; respect `invoice_number_mode`
- `src/lib/invoices/catalog.ts` (new) — list/create/update items & categories
- `src/lib/invoices/taxCodes.ts` (new) — search tax_code_master with 3+ char debounce
- `src/lib/invoices/readiness.ts` — extend validation: billing_name required, manual number unique/non-empty, audit blockers

## 3. UI

**New route `src/pages/Invoices.tsx`** registered in App.tsx + sidebar (under Revenue Center group):
- Top actions: + Create Invoice, Export CSV, Invoice Settings, Item Catalog, SAC/HSN Master
- Filterable table with all columns + row actions listed in Part 1
- Filters: search, date range, status, program, batch, owner, type, linked/unlinked, sent

**New pages:**
- `src/pages/admin/InvoiceItemCatalog.tsx` — CRUD items + categories
- `src/pages/admin/TaxCodeMaster.tsx` — searchable list, admin CSV import (paste textarea for now)

**Editor upgrades — `src/pages/InvoiceEditor.tsx`:**
- "Who is this invoice for?" first-screen when no `paid_pipeline_lead_id` in URL
- `PaidClientSelector` (new component) — searchable dropdown of paid_pipeline_leads
- "Billing Details" panel with "Use lead details" toggle + override fields
- Invoice number mode (auto/manual, admin-gated)
- Tax setup panel
- Line items: item dropdown via catalog + "Find SAC/HSN" button → opens `TaxCodeFinder` modal
- Display Options panel (show bank/signature/stamp/instructions toggles)
- Readiness blockers panel already exists — extend with new rules

**New components in `src/components/invoices/`:**
- `PaidClientSelector.tsx`
- `BillingDetailsPanel.tsx`
- `ItemPicker.tsx` (catalog dropdown + free-form)
- `TaxCodeFinder.tsx` (modal with debounced search, highlights matches)
- `DisplayOptionsPanel.tsx`

## 4. PDF (`src/lib/invoices/pdf.ts`)
- Render billing_name / billing_email etc. (fallback to member_*)
- Hide bank block when `show_bank_details=false`
- Hide signature/stamp/payment instructions when toggled off
- Keep existing signature_url fallback logic intact

## 5. Audit logging
Use existing `invoice_events` insert with new event types listed in Part 19.

## 6. Permissions
- Admin gate: item catalog, tax code master, manual number override, hide/show toggles default editable by all but manual number creation admin-only
- Sales: read-only catalog, can create invoices only for paid leads they own (existing RLS already enforces invoice scoping)

## 7. Security finding fix (bundled)
Same migration tightens `invoice_line_items_select` and `invoice_events_select` to: creator OR admin OR assigned sales exec on the linked paid lead.

## Order of execution
1. Migration (schema + RLS tighten + seeds) — single call
2. Types + api + catalog + taxCodes libs
3. Editor + new components
4. New pages + routing + sidebar entry
5. PDF tweaks
6. Verify build

```text
Sidebar
├── Revenue Center
│   ├── Invoices            ← NEW main entry
│   │   ├── List (default)
│   │   ├── Item Catalog
│   │   └── SAC/HSN Master
│   └── …
└── Admin Center
    └── Invoice Settings    (existing)
```

Estimated scope: 1 migration, ~6 new files, ~6 edited files. No changes to Paid Pipeline create-invoice entry points other than passing `invoice_context_type='linked_paid_lead'`.
