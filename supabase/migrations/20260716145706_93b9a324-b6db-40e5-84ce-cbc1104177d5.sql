
-- activity_logs: scope INSERT to admin, own agent_id, or the lead's assigned agent
DROP POLICY IF EXISTS "members insert activity" ON public.activity_logs;
CREATE POLICY "members insert activity" ON public.activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      is_active(auth.uid())
      AND (agent_id IS NULL OR agent_id = auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = activity_logs.lead_id
          AND (l.assigned_agent_id = auth.uid() OR l.assigned_agent_id IS NULL)
      )
    )
  );

-- follow_up_reminders: replace broad ALL with scoped write policies
DROP POLICY IF EXISTS "members manage reminders" ON public.follow_up_reminders;
CREATE POLICY "members insert reminders" ON public.follow_up_reminders
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      is_active(auth.uid())
      AND (agent_id IS NULL OR agent_id = auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = follow_up_reminders.lead_id
          AND (l.assigned_agent_id = auth.uid() OR l.assigned_agent_id IS NULL)
      )
    )
  );
CREATE POLICY "members update reminders" ON public.follow_up_reminders
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR agent_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = follow_up_reminders.lead_id AND l.assigned_agent_id = auth.uid()
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR agent_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = follow_up_reminders.lead_id AND l.assigned_agent_id = auth.uid()
    )
  );
CREATE POLICY "members delete reminders" ON public.follow_up_reminders
  FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR agent_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = follow_up_reminders.lead_id AND l.assigned_agent_id = auth.uid()
    )
  );

-- lead_hotness_scores: scope INSERT/UPDATE to admin or lead's assigned agent
DROP POLICY IF EXISTS "active users insert hotness" ON public.lead_hotness_scores;
DROP POLICY IF EXISTS "active users update hotness" ON public.lead_hotness_scores;
CREATE POLICY "scoped insert hotness" ON public.lead_hotness_scores
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_hotness_scores.lead_id AND l.assigned_agent_id = auth.uid()
    )
  );
CREATE POLICY "scoped update hotness" ON public.lead_hotness_scores
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_hotness_scores.lead_id AND l.assigned_agent_id = auth.uid()
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_hotness_scores.lead_id AND l.assigned_agent_id = auth.uid()
    )
  );

-- lead_session_attendance: scope INSERT/UPDATE to admin or lead's assigned agent
DROP POLICY IF EXISTS "active users insert attendance" ON public.lead_session_attendance;
DROP POLICY IF EXISTS "active users update attendance" ON public.lead_session_attendance;
CREATE POLICY "scoped insert attendance" ON public.lead_session_attendance
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_session_attendance.lead_id AND l.assigned_agent_id = auth.uid()
    )
  );
CREATE POLICY "scoped update attendance" ON public.lead_session_attendance
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_session_attendance.lead_id AND l.assigned_agent_id = auth.uid()
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_session_attendance.lead_id AND l.assigned_agent_id = auth.uid()
    )
  );

-- roas_ad_spends: prevent non-admins from attributing spend to arbitrary media_buyer_id
DROP POLICY IF EXISTS "roas_spend_insert" ON public.roas_ad_spends;
DROP POLICY IF EXISTS "roas_spend_update_own" ON public.roas_ad_spends;
CREATE POLICY "roas_spend_insert" ON public.roas_ad_spends
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      is_active(auth.uid())
      AND entered_by = auth.uid()
      AND media_buyer_id IS NULL
    )
  );
CREATE POLICY "roas_spend_update_own" ON public.roas_ad_spends
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (is_active(auth.uid()) AND entered_by = auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      is_active(auth.uid())
      AND entered_by = auth.uid()
      AND media_buyer_id IS NULL
    )
  );

-- media_buyer_aliases: SELECT retained for active users by design (used app-wide for name normalization)
