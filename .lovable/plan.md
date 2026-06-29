## Verification result: already correct

The Finance Success Dashboard already pulls success-stage options from both `type='paid'` CRM pipelines, which is what you confirmed you want.

### What's in the database
Two paid CRM pipelines exist:
- **Paid — Onboarding** — Payment Confirmed, Welcome Call Done, Onboarding Call Done, Documents Requested/Received, Bajaj Finance Submitted, Finance Approved, **Code of Conduct Sign**, Access & WhatsApp Group Joined, Active Member, REFUND
- **IWC Paid Members** — Payment Confirmed, Welcome Call Done, Onboarding Call Done, Documents Requested/Received, Bajaj Finance Submitted, Finance Approved, **Code of Conduct Signed**, Access Given, Active Member

Both are `pipelines.type = 'paid'` and both are valid sources for `paid_pipeline_leads.crm_stage_id`.

### What the dashboard does today
`FinanceSuccessDashboard.tsx` query `fsd-paid-stages`:
1. Selects every pipeline where `type = 'paid'` → returns both pipelines above.
2. Loads all stages for those pipelines, ordered by `position`.
3. Feeds them into the "Add success stage" dropdown.
4. Auto-seeds defaults by matching stage names against keywords: `code of conduct`, `coc sign`, `signed`, `access given`, `active member`, `finance approved` — which picks up the right rows from both pipelines.
5. Success check uses `successSet.has(lead.crm_stage_id)`, i.e. it compares against the lead's CRM stage ID — not Paid Pipeline payment/revenue stages.

### Verdict for each checkpoint
1. Dropdown populated from Paid Onboarding CRM stages → **Yes** (plus IWC Paid Members, per your "Both paid pipelines" answer).
2. Auto-seeded defaults include Code of Conduct Sign / Signed, Access Given, Active Member, Finance Approved → **Yes**.
3. Not using Paid Pipeline payment/revenue stages → **Correct**. `paid_pipeline_batches`, `paid_pipeline_payments`, and `paid_pipeline_finance_details` are not used for the stage selector; only `pipelines` + `stages` with `type='paid'` are.
4. Build → already green from the previous turn (`bunx tsgo --noEmit`).

### Action
No file changes required. Final verdict: **Stage source check — Closed**.

If you later decide one of the two pipelines is legacy and should be hidden, say the word and I'll restrict to a single pipeline by name (e.g. only `Paid — Onboarding`).
