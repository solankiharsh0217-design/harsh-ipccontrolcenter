# Phase 1.3 — Lead-Linked Smart Invoice System

Per your "Build in Two Steps" guidance, I'll ship **Phase 1.3A** in this loop and stop there. Phase 1.3B (email, full history page, item catalog, void workflow) will follow in a separate request.

## Phase 1.3A Scope (this build)

1. **Company Settings** — Admin Center page; identity, branding (logo/signature/stamp upload), bank details, email sender
2. **Invoice Settings** — Admin Center page; numbering, tax defaults, default notes/terms/email copy
3. **Invoice Readiness Check** — surfaced in invoice editor before issue
4. **Paid Pipeline entry points** — row action "Create Invoice" + drawer Invoice card with Create/Download/History
5. **Invoice Editor** — auto-fills from Company Settings + paid lead + CRM lead; GST/non-GST toggle; 4 invoice modes (Full Deal / Token / Balance / Custom); item table; tax summary; notes/terms
6. **Snapshots** — seller/buyer/tax snapshots stored on issue; old invoices regenerate identically
7. **On-demand PDF** — clean A4 layout, brand logo, GST breakup if GST invoice, signature/stamp, bank block; NOT persisted
8. **Numbering safety** — Postgres RPC with row lock; number assigned only on issue
9. **Basic invoice list** inside Paid Pipeline drawer (full Revenue Center → Invoices page is 1.3B)
10. **Audit events** — settings updates, draft created, issued, pdf generated
11. **RLS** — admin all; sales sees invoices for their assigned paid lead

## Out of scope (Phase 1.3B)
Send Email, full Invoices history page with filters, item catalog UI, duplicate/void/cancel workflow, finance role split.

## Untouched (per your instruction)
CoC signing/PDF, CoC rules, payment calculations, Sheets/CSV import, follow-ups, Team, Operations CRM, hard wipe, AI Insights.

## Technical design

### Tables (migration)
- `company_settings` — singleton row keyed by `workspace = 'default'`; identity, branding URLs, bank, sender. Admin write; authenticated read (needed for invoice editor).
- `invoice_settings` — singleton; numbering, tax defaults, text/email defaults. Admin write; authenticated read.
- `invoices` — full snapshot columns (seller_snapshot_json, buyer_snapshot_json, tax_snapshot_json) + totals + `status` (draft/issued/sent/paid/cancelled/void) + `invoice_type` + `invoice_mode` + `paid_pipeline_lead_id`/`crm_lead_id`.
- `invoice_line_items` — child of invoices.
- `invoice_events` — audit per invoice.
- `invoice_items` — catalog (kept simple in 1.3A; UI in 1.3B).

### Numbering RPC
`assign_next_invoice_number()` SECURITY DEFINER, uses `SELECT ... FOR UPDATE` on `invoice_settings`, increments `next_invoice_number`, returns formatted `{prefix}{padded_number}` (with optional FY). Drafts call nothing; only `issue_invoice` calls this RPC inside the same transaction that writes status=issued.

### RLS

```text
company_settings / invoice_settings:
  SELECT to authenticated
  INSERT/UPDATE only if has_role(auth.uid(),'admin')

invoices:
  SELECT: admin OR creator OR assigned_sales_executive of paid_pipeline_lead_id
  INSERT: authenticated (must set created_by = auth.uid())
  UPDATE: admin OR creator (only while status='draft')

invoice_line_items / invoice_events: follow parent invoice access via EXISTS check
```

### Storage
New public bucket `invoice-assets` for logo / signature / stamp uploads.

### PDF generation
Client-side using `jspdf` + `jspdf-autotable` (already-friendly with our stack; no server runtime needed, no persistence). Builds A4 layout from invoice snapshot. Triggered by Preview/Download buttons only.

### Files

```text
src/lib/invoices/
  types.ts           # Invoice, LineItem, Snapshots
  readiness.ts       # checkInvoiceReadiness(companySettings, invoiceSettings, type)
  draft.ts           # buildDraftFromPaidLead(lead, crmLead, company, settings, mode)
  totals.ts          # computeTotals(lineItems, taxType, discount, adjustment, paymentMade)
  amountInWords.ts   # INR number → words
  pdf.ts             # renderInvoicePdf(invoice) → jsPDF
  api.ts             # saveDraft / issueInvoice / loadInvoice / listInvoicesForLead

src/pages/admin/CompanySettings.tsx
src/pages/admin/InvoiceSettings.tsx
src/pages/InvoiceEditor.tsx        # /invoices/new?paidLeadId=... and /invoices/:id

src/components/paid-pipeline/InvoiceCard.tsx        # in paid lead drawer
src/components/paid-pipeline/CreateInvoiceMenuItem.tsx  # row action

supabase/migrations/<ts>_invoices.sql
```

Routes added to `App.tsx`, links added to `AppLayout` (Admin Center) and Paid Pipeline drawer/row.

### Acceptance checks I'll verify before handing back
- Settings save round-trips for admin only.
- Readiness check blocks GST invoice when GSTIN missing; allows fallback to Non-GST when enabled.
- Creating invoice from a paid lead prefills 80%+ of fields.
- Issuing assigns the next number atomically and snapshots seller/buyer/tax.
- Re-opening an old invoice and downloading PDF uses snapshot (not live company settings).
- Build passes.

Proceeding with this on approval.
