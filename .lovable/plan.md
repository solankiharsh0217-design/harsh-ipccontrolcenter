## Code of Conduct — Signed Evidence System (P0)

This plan delivers retrievable proof of signed Code of Conduct in 11 parts. No stage-trigger automation, no payment/CRM/Ops changes.

---

### 1. Database migration (new columns + storage bucket)

`code_of_conduct_templates`:
- `html_content` (text) — already exists; ensure used as primary doc body
- `default_html_template` (text) — auto-generated Diamond Membership default
- `signed_copy_recipient_emails` (text[]) — archive emails
- `send_signed_copy_to_member` (boolean default true)

`code_of_conduct_requests`:
- `signed_receipt_url` (text)
- `signed_pdf_url` (text)
- `signed_html_url` (text)
- `signed_receipt_generated_at` (timestamptz)
- `admin_copy_email_sent_at` (timestamptz)
- `member_copy_email_sent_at` (timestamptz)
- `corrected_contact_email` (text) — post-sign corrections only
- `email_change_history` (jsonb) — array of {old, new, reason, at, by}
- `signed_member_email` (text) — immutable copy of email used at signing
- `signed_member_name` (text) — immutable copy

New storage bucket: `signed-code-of-conduct` (private). RLS:
- Admins SELECT/INSERT/UPDATE
- Public can read via signed URLs only (no public policy)

New event types added to allowed list via no constraint change (events table is open text).

---

### 2. Public Signing Page (`/code-of-conduct/sign/:token`)

Replace the embedded-PDF feel with a Google Docs-style layout:

```
┌──────────────────────────────────────┐
│  [IPC Logo]   Diamond Membership     │
│  Code of Conduct                     │
│  Member: Jane Doe • jane@x.com       │
├──────────────────────────────────────┤
│                                      │
│   [Rendered html_content]            │
│   ─ sections, headings, paragraphs ─ │
│                                      │
│   [Reference: View / Download PDF]   │
│                                      │
├──────────────────────────────────────┤
│  Acknowledgements (4 checkboxes)     │
│  Typed Name: [______]                │
│  Signature: [canvas pad]             │
│  [ Submit Acknowledgement ]          │
└──────────────────────────────────────┘
```

- HTML content sanitized via DOMPurify before render
- If only PDF: show preview card with View/Download buttons + optional inline iframe below the fold
- Sticky bottom signature section on mobile
- Uses semantic tokens (no hardcoded colors)

---

### 3. Admin Template Editor (HTML body + recipients)

In `CodeOfConductAdmin.tsx` → Templates tab:
- Textarea for `html_content` (Agreement HTML Body) with "Generate Default Agreement Text" button populating a structured Diamond Membership template
- Tags input for `signed_copy_recipient_emails`
- Toggle for `send_signed_copy_to_member`

---

### 4. Signed Receipt Generation (HTML-first, PDF via pdf-lib)

In `code-of-conduct-public/index.ts` after successful sign:
1. Build receipt HTML (server-side string template) with all evidence fields
2. Upload HTML to `signed-code-of-conduct/{request_id}/signed-receipt.html`
3. Generate PDF using `pdf-lib` (npm: `pdf-lib`) — text + embedded signature PNG
4. Upload PDF to `signed-code-of-conduct/{request_id}/signed-receipt.pdf`
5. Update request with `signed_pdf_url`, `signed_html_url`, `signed_receipt_url`, `signed_receipt_generated_at`
6. Log events: `signed_receipt_generation_started`, `signed_receipt_generated` (or `_failed`)

Receipt contains: title, template name+version, program, Party A, member name/email/phone, lead IDs, request ID, signed_at, typed name, signature image, IP, UA, acknowledgement checklist (✓ items), template PDF URL, WhatsApp clicked Y/N, immutable footer.

---

### 5. Email Delivery via Resend

After receipt generation, invoke a new edge function `send-coc-signed-copy`:
- Sends to all `signed_copy_recipient_emails` (admin/archive)
- Sends to `signed_member_email` if `send_signed_copy_to_member`
- Subject + body per spec; includes signed link (signed URL valid 7d) and PDF link
- Uses RESEND_API_KEY / EMAIL_FROM_*
- Updates `admin_copy_email_sent_at`, `member_copy_email_sent_at`
- Logs events `signed_copy_email_sent_to_admin/_member` or `_failed_*`

PDF attached if size < 5MB (Resend supports attachments).

---

### 6. Admin/Drawer UI for signed copy

**Paid Pipeline drawer `CodeOfConductPanel.tsx`** (when signed):
- Status row + Signed at + Signed by + email used
- Buttons: View Signed Copy, Download Signed Copy, Copy Link, Send Copy to Member, Send Copy to Admin
- Edit Member Email button (modal)

**`CodeOfConductAdmin.tsx` Requests tab**:
- Per-row dropdown: View Signed Record, View/Download Signed Copy, Send Copy Email, Copy Link, Open Paid Pipeline Lead, Change Email & Resend
- "View Signed Record" drawer shows full evidence (signature image, all metadata, event timeline)

---

### 7. Email Correction Flow

New modal `EditMemberEmailModal.tsx`:
- Inputs: new email, reason
- Validates email format
- Calls edge function `coc-update-email` (new):
  - If status ∈ {sent, viewed, expired}: updates `member_email`, cancels old token (status='cancelled' or new token issued), generates new signing link if "resend" chosen, logs `code_of_conduct_email_updated_and_resent` + `_old_token_cancelled_after_email_change`
  - If signed: refuses to mutate `signed_member_email`; sets `corrected_contact_email` only, appends to `email_change_history`, logs `code_of_conduct_member_email_updated`
  - Also updates `paid_pipeline_leads.email` / `leads.email` when admin opts in

---

### 8. Immutability

Send edge function: snapshot `signed_member_email`, `signed_member_name` at sign time (filled in DB during sign action). Post-sign update path never touches these or signature fields.

---

### 9. Public Success Page

After sign, show:
- ✓ "Your Code of Conduct has been acknowledged successfully."
- Signed at timestamp
- Button: Join Diamond Members WhatsApp Group (only if signed + URL configured)
- Button: Download Your Acknowledgement Copy (signed PDF URL)
- Note text per spec

---

### 10. Event log additions

All emitted from edge functions; rendered in existing events drawer.

---

### Technical Files Touched

**Migration**: 1 new migration (columns + storage bucket + RLS)
**Edge functions**:
- `code-of-conduct-public/index.ts` — receipt generation hook
- `send-coc-signed-copy/index.ts` — new
- `coc-update-email/index.ts` — new

**Frontend**:
- `src/pages/CodeOfConductSign.tsx` — doc-style redesign
- `src/pages/CodeOfConductAdmin.tsx` — HTML body field, recipients, request actions, signed record drawer
- `src/components/paid-pipeline/CodeOfConductPanel.tsx` — signed-copy actions, edit email
- `src/components/paid-pipeline/EditMemberEmailModal.tsx` — new
- `src/components/admin/SignedRecordDrawer.tsx` — new
- `src/lib/codeOfConductDefaults.ts` — default agreement HTML template

**Deps**: add `pdf-lib`, `dompurify`, `@types/dompurify`

---

### Out of scope (will not touch)

Stage-trigger automation, payments, import, follow-ups, Team Directory, Operations CRM, hard wipe, AI Insights.

Reply **"go"** to start with the migration, or specify any tweaks (e.g. skip PDF and ship HTML-only receipt first).