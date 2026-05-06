# Fix CRM import + add full pipeline designer

## Problem recap

1. **"No pipeline found" on Import** — `SendToCrmModal.importNow()` reads `pipelines.find(p => p.type === leadType)` from state loaded in `goToStep3`. If that fetch returns 0 rows (RLS hiccup, race, or genuinely empty DB), the import aborts with a useless error and 368 qualified leads are lost. Pipelines actually exist in your DB right now, but the modal has no fallback and no way to create one inline.
2. **No pipeline management UI inside CRM** — There is a tiny "New Pipeline" pill in the bottom bar and a basic Stages tab, but you cannot: rename a pipeline, change its type, delete it, reorder stages, change stage colors, mark Won/Lost, or rename stages. The HTML reference shows a richer designer.

## What I'll build

### 1. Make the import bullet-proof (`src/components/SendToCrmModal.tsx`)

- On Step 3 load, if `pipelines` returns empty for the selected `leadType`, **auto-create** a default pipeline + standard stages (same seed used for "Sales Pipeline (Unpaid)" / "Paid — Onboarding") server-side, then continue.
- Show clear inline status: "No pipeline found — creating default…" with a spinner; never silently fail.
- On `importNow`, if pipeline still missing for any reason, fall back to creating one on the fly instead of toasting an error.
- Add a "Choose target pipeline" dropdown on Step 3 (defaults to the matching type) so you can route leads to any pipeline you've designed — including custom ones.

### 2. Pipeline Designer view inside CRM (`src/pages/Crm.tsx`)

Replace the minimal Stages tab with a proper **Designer** view:

- **Pipeline header row**: rename inline, change type (unpaid / paid / custom), delete pipeline (blocked if leads attached, with count shown).
- **Stages list** (drag-to-reorder using `@dnd-kit/sortable` already supportable, or simple ↑/↓ buttons to avoid new deps):
  - Inline rename
  - Color picker from the existing `STAGE_COLORS` palette (purple / gray / blue / gold / amber / green / red / pink) with swatch dots
  - Toggles: **Won stage**, **Lost stage**, **Protected** (protected stages can't be deleted)
  - Delete (blocked if leads in stage, with count + "move them first" hint)
  - Reorder via up/down arrows; positions persisted to `stages.position`
- **Add Stage** form with name + color + optional won/lost flag.
- **Create Pipeline** modal upgraded: name + type + checkbox "Seed with default stages" (New / In Progress / Closed Won / Closed Lost). Uncheck for a blank pipeline.
- Keep the bottom bar pipeline switcher; add a small ⚙ next to each pipeline pill that jumps to Designer view for that pipeline.

### 3. Re-seed safety

- Add a one-time idempotent insert (`ON CONFLICT DO NOTHING` via existence check) when CRM page loads and `pipelines` is empty: creates the two defaults so a fresh project is never blank. Done client-side from the CRM page so we don't need a migration.

## Files touched

```text
src/components/SendToCrmModal.tsx   — robust pipeline lookup + auto-create + target-pipeline picker
src/pages/Crm.tsx                   — new Designer view, upgraded New Pipeline modal, ⚙ per pipeline
src/lib/crmTypes.ts                 — add STAGE_COLOR_OPTIONS list helper (no schema change)
```

No DB migration needed — schema already supports everything (color text, is_won, is_lost, is_protected, position, type).

## Out of scope (ask if you want them)

- Drag-to-reorder pipelines themselves (we'll keep position fixed by creation order; can add later).
- Per-stage automation rules (e.g., auto-move on payment).
- Importing pipeline templates from JSON.
