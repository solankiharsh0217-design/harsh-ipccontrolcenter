DROP POLICY IF EXISTS invoice_events_insert ON public.invoice_events;
CREATE POLICY invoice_events_insert ON public.invoice_events
FOR INSERT TO authenticated
WITH CHECK (
  public.is_active(auth.uid())
  AND EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_events.invoice_id)
  AND (created_by IS NULL OR created_by = auth.uid())
);