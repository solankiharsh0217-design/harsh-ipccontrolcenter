# Financial Backfill Explanation

**Execution Results:**
- Processed: 263 leads
- Written: 238 leads
- Skipped: 25 leads
- Errors: 0

## The 25 Skipped Leads
The 25 leads were skipped because their current database values for `token_amount_collected`, `balance_pending`, and `revenue_to_be_realized` were already identical to the values calculated by the recompute logic. These were identified as "already consistent" and required no update.

## Execution Logic
The backfill used the canonical `recomputePaidLead()` function from `src/lib/paidPipeline.ts`. It follows these rules:
1. `token_amount_collected` = Sum of all payments where `is_token = true`.
2. `total_collected` = Sum of ALL payments for the lead.
3. `balance_pending` = `deal_value_including_gst` - `total_collected`.
4. `revenue_to_be_realized` = `balance_pending`.
5. `final_revenue_realized` = `total_collected` (if GST is inclusive).

## Token vs Revenue Integrity
**Crucially**, the backfill **did not** change `deal_value_including_gst`, `final_revenue_realized`, or `revenue_to_be_realized` on any row based on token payments alone. A token payment only updates the `token_amount_collected` and `total_collected` fields, which in turn reduces the `balance_pending`. It does NOT convert a lead into a "final sale" or "realized revenue" unless a non-token payment exists or the lead is explicitly marked as a final sale.

