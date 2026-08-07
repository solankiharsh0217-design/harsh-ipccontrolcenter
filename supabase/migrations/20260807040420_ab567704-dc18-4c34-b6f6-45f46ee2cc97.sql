UPDATE public.system_refinement_items 
SET checklist_item = 'No import-sheet language appears where existing API data is used.' 
WHERE checklist_item LIKE '%Paste the raw vitest run output%';