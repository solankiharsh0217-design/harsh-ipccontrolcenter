# Premium members → backend students database

## What changes

The Student Search page currently asks each user to paste a Google Sheet URL and parses CSV in the browser. You want the two member sheets ingested once, stored in our backend, and searched from there. No "Connect Google Sheet" UI.

## Source data confirmed

Pulled both sheets as CSV — they load fine.

- **Sheet 1** (gid 1507599502) — "Diamond" members. ~1,074 rows. Columns used: `Diamond Member` (name), `Email`, `Number`. Many other columns (amount, EMI, etc.) — ignored. Some rows have blank name; we'll keep the email/phone and leave name blank.
- **Sheet 2** (gid 281382417) — second members list. ~4,851 rows. Columns used: `Full Name`, `Email ID`, `Without Country Code` (preferred phone; falls back to `Contact`).

Gaps inside the sheets are ignored — empty rows are skipped, partial rows are kept.

## Backend

New table `public.students`:

```text
id           uuid pk
full_name    text
email        text
phone        text
source       text          -- 'diamond' | 'members'
search_text  text          -- lowercased "name email phone" for fast LIKE search
created_at   timestamptz default now()
unique (source, email, phone)   -- prevents duplicates on re-import
index on lower(full_name)
index on search_text (gin trigram) for fast contains-search
```

RLS:
- SELECT allowed to any active member (`is_active(auth.uid())`)
- INSERT/UPDATE/DELETE: admins only

## Import

A one-shot edge function `import-students` (admin-only):
1. Fetches both published CSV URLs server-side.
2. Parses rows, skips fully-empty ones, normalises phone (digits only, strips country code if length > 10).
3. Upserts into `students` on `(source, email, phone)`.
4. Returns counts: inserted / skipped / total per sheet.

I'll trigger it once after deploy from the Admin page (new "Sync student database" button, admin-only). Re-runnable any time you update the sheets.

## Frontend

Rewrite `src/pages/StudentSearch.tsx`:
- Remove the "Connect Google Sheet" card and all CSV-fetch code.
- Search input queries Supabase: `students` where `search_text ilike %q%`, limit 50.
- Result cards: name (or "—"), Phone, Email — same visual style as today.
- Show total count loaded ("6,000+ members in database") under the header.

Admin page additions:
- "Sync student database" button → invokes `import-students`, shows counts toast.
- Small stat: total students in DB.

## Files

- migration: create `students` table + RLS + indexes
- new: `supabase/functions/import-students/index.ts`
- edit: `src/pages/StudentSearch.tsx` (full rewrite, same look)
- edit: `src/pages/Admin.tsx` (add sync button + count)

## Nothing needed from you

I have everything — both sheet URLs work, your admin login already exists, and the import runs server-side. After approval I'll build it and run the first sync so the search works immediately.