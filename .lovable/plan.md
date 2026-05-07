## Goal
Collapse all ROAS-related sidebar entries into a single "ROAS Calculator" item. Clicking it opens a hub page with cards linking to every ROAS sub-tool. Remove all the duplicate/scattered ROAS links from the sidebar.

## Current clutter (in `AppLayout.tsx`)
The Tools section currently shows: ROAS Calculator (twice), ROAS Dashboard, ROAS Leads, Enrollments, Manual Review, Ad Spend, Sync, Student Search (twice), Daily Lead Flow, Lead Qualifier, Calling CRM. The People/admin section also adds: ROAS Data Sources, ROAS Webinars, ROAS Media Buyers.

## New sidebar (clean)
Tools:
- ROAS Calculator (single entry → `/roas`)
- Student Search
- Daily Lead Flow
- Lead Qualifier
- Calling CRM

People:
- Team Directory
- Admin Panel (admin only) — remove the three ROAS setup links from here

## New ROAS hub page (`/roas`)
Replace the current `RoasDashboard` route at `/roas` with a new **`RoasHub`** landing page that shows a grid of cards. Each card navigates to its existing route (no logic changes to those pages):

- Dashboard → `/roas/dashboard` (move current `RoasDashboard` here)
- Leads → `/roas/leads`
- Enrollments → `/roas/enrollments`
- Manual Review → `/roas/manual-review`
- Ad Spend → `/roas/ad-spend`
- Sync → `/roas/sync`
- Simple ROAS Calculator (the standalone one) → `/roas/calculator`
- Admin-only cards (shown only when `isAdmin`):
  - Data Sources → `/roas/setup/data-sources`
  - Webinars → `/roas/setup/webinars`
  - Media Buyers → `/roas/setup/media-buyers`

Each card: icon + title + 1-line description. Uses existing semantic tokens (no hard-coded colors). On every ROAS sub-page, add a small "← Back to ROAS" link at the top so users can return to the hub.

## Files to change
1. `src/pages/roas/Hub.tsx` — new landing page with card grid.
2. `src/App.tsx`:
   - Add `/roas` → `RoasHub`
   - Move dashboard to `/roas/dashboard`
   - Keep all other `/roas/*` routes as-is.
3. `src/components/AppLayout.tsx`:
   - Remove all duplicate ROAS NavItems and the admin ROAS setup NavItems.
   - Keep only one ROAS entry pointing to `/roas`.
   - Update `PAGE_TITLES` accordingly (add `/roas` = "ROAS", `/roas/dashboard` = "ROAS Dashboard").
4. Sub-pages under `src/pages/roas/*` — add a small "Back to ROAS" link at the top of each (cosmetic only).

No database, edge function, or business-logic changes. Pure navigation/IA refactor.