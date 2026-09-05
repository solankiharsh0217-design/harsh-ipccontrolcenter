-- Populate scoring snapshots on kpi_entries at generation time so that later
-- edits to kpi_definitions never rewrite historical scores.

CREATE OR REPLACE FUNCTION public.kpi_entries_fill_snapshots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE k record;
BEGIN
  SELECT weight, direction, points_allocation, target_default
    INTO k FROM public.kpi_definitions WHERE id = NEW.kpi_id;
  IF NEW.weight_snapshot IS NULL THEN NEW.weight_snapshot := COALESCE(k.weight, 1); END IF;
  IF NEW.direction_snapshot IS NULL THEN NEW.direction_snapshot := COALESCE(k.direction, 'higher_is_better'); END IF;
  IF NEW.points_allocation_snapshot IS NULL THEN NEW.points_allocation_snapshot := COALESCE(k.points_allocation, 0); END IF;
  IF NEW.target_value IS NULL THEN NEW.target_value := k.target_default; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kpi_entries_fill_snapshots ON public.kpi_entries;
CREATE TRIGGER trg_kpi_entries_fill_snapshots
BEFORE INSERT ON public.kpi_entries
FOR EACH ROW EXECUTE FUNCTION public.kpi_entries_fill_snapshots();

-- One-time backfill of rows created before the snapshot columns existed.
UPDATE public.kpi_entries e
SET weight_snapshot = COALESCE(e.weight_snapshot, k.weight, 1),
    direction_snapshot = COALESCE(e.direction_snapshot, k.direction, 'higher_is_better'),
    points_allocation_snapshot = COALESCE(e.points_allocation_snapshot, k.points_allocation, 0),
    target_value = COALESCE(e.target_value, k.target_default)
FROM public.kpi_definitions k
WHERE k.id = e.kpi_id
  AND (e.weight_snapshot IS NULL OR e.direction_snapshot IS NULL OR e.points_allocation_snapshot IS NULL);
