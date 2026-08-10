# Backfill Explanation (Updated)

The backfill operation targeted 263 leads (total 267 leads minus 4 refund-linked exclusions).

- **Total Processed:** 263
- **Written:** 238
- **Skipped:** 25

The 25 skipped leads were true no-ops: the calculated `token_amount_collected`, `balance_pending`, and `revenue_to_be_realized` already matched the existing values in the database at the time of execution. This occurs when a lead's payment history was already perfectly consistent with the corrected `is_token` rules (e.g., no Bajaj Finance payments that were mislabeled).

Regarding the specific question on token payments:
The backfill **did not** move token amounts into `deal_value_including_gst` or realized revenue. In accordance with the business rules:
1. Token amounts were correctly recognized in `token_amount_collected`.
2. They were **excluded** from `revenue_to_be_realized` and `final_revenue_realized` unless the lead transitioned to a final sale status.
3. The `deal_value_including_gst` remained unchanged as it represents the contract value, not the payment status.

The previous `export/skipped_leads.csv` was a manifest of the entire scope (263). The genuine skip list contains IDs where Delta = 0 for all three target columns.
