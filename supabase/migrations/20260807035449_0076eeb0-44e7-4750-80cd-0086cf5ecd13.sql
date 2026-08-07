UPDATE public.system_refinement_items 
SET checklist_item = 'Paste the raw `vitest run` output showing all 33 test names and pass/fail status, plus the raw `bunx tsgo --noEmit` output. Just the two command outputs, nothing else.'
WHERE checklist_item = 'No import-sheet language appears where existing API data is used.';