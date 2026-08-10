--
-- PostgreSQL database dump
--

\restrict NSFUNMvwdFO6ddLw0a46V2ZoaIJdZsmlGIIjxLJcM67ffhwPtJg5U9m5gJVCjQ9

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: activity_channel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.activity_channel AS ENUM (
    'call',
    'whatsapp',
    'email',
    'sms',
    'note',
    'system'
);


--
-- Name: announcement_tag; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.announcement_tag AS ENUM (
    'info',
    'update',
    'urgent'
);


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'member'
);


--
-- Name: lead_grade; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.lead_grade AS ENUM (
    'hot',
    'warm',
    'cold',
    'non-attendee',
    'super-hot',
    'very-cold',
    'true-absentee'
);


--
-- Name: lead_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.lead_type AS ENUM (
    'paid',
    'unpaid'
);


--
-- Name: pipeline_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.pipeline_type AS ENUM (
    'unpaid',
    'paid',
    'custom',
    'operations'
);


--
-- Name: user_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_status AS ENUM (
    'pending',
    'active'
);


--
-- Name: access_templates_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.access_templates_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;


--
-- Name: admin_hard_wipe_all_lead_data(boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_hard_wipe_all_lead_data(_dry_run boolean DEFAULT true) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  before_counts jsonb;
  after_counts jsonb;
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized: admin only';
  END IF;

  SELECT jsonb_build_object(
    'crm_leads',                (SELECT count(*) FROM public.leads),
    'crm_leads_active',         (SELECT count(*) FROM public.leads WHERE archived_at IS NULL AND deleted_at IS NULL),
    'crm_leads_archived',       (SELECT count(*) FROM public.leads WHERE archived_at IS NOT NULL),
    'crm_leads_soft_deleted',   (SELECT count(*) FROM public.leads WHERE deleted_at IS NOT NULL),
    'paid_batches',             (SELECT count(*) FROM public.paid_pipeline_batches),
    'paid_buyers',              (SELECT count(*) FROM public.paid_pipeline_leads),
    'paid_payments',            (SELECT count(*) FROM public.paid_pipeline_payments),
    'paid_followups',           (SELECT count(*) FROM public.paid_pipeline_followups),
    'paid_finance',             (SELECT count(*) FROM public.paid_pipeline_finance_details),
    'paid_activity',            (SELECT count(*) FROM public.paid_pipeline_activity_logs),
    'paid_to_crm_links',        (SELECT count(*) FROM public.paid_pipeline_to_crm_links),
    'operations_leads',         (SELECT count(*) FROM public.operations_leads),
    'operations_service_events',(SELECT count(*) FROM public.operations_service_events),
    'operations_conversions',   (SELECT count(*) FROM public.operations_conversion_reports),
    'operations_reward_progress',(SELECT count(*) FROM public.operations_reward_progress),
    'crm_followups',            (SELECT count(*) FROM public.follow_up_reminders),
    'lead_tag_assignments',     (SELECT count(*) FROM public.lead_tag_assignments),
    'lead_activity',            (SELECT count(*) FROM public.activity_logs),
    'batch_archives',           (SELECT count(*) FROM public.crm_batch_archives),
    'lead_entries',             (SELECT count(*) FROM public.lead_entries),
    'lead_qualifier_sessions',  (SELECT count(*) FROM public.lead_qualifier_sessions),
    'notifications',            (SELECT count(*) FROM public.notifications
      WHERE entity_type IN ('lead','crm_lead','paid_pipeline_lead','operations_lead','batch','paid_batch','follow_up','payment','conversion','reward','handoff','assignment'))
  ) INTO before_counts;

  IF _dry_run THEN
    RETURN jsonb_build_object('dry_run', true, 'before_counts', before_counts);
  END IF;

  -- Delete notifications linked to lead/work entities first (they reference entity_ids)
  DELETE FROM public.notifications
    WHERE entity_type IN ('lead','crm_lead','paid_pipeline_lead','operations_lead','batch','paid_batch','follow_up','payment','conversion','reward','handoff','assignment');

  -- Operations CRM children -> parent
  DELETE FROM public.operations_conversion_reports WHERE id IS NOT NULL;
  DELETE FROM public.operations_service_events    WHERE id IS NOT NULL;
  DELETE FROM public.operations_reward_progress   WHERE id IS NOT NULL;
  DELETE FROM public.operations_leads             WHERE id IS NOT NULL;

  -- Paid Pipeline children -> parent
  DELETE FROM public.paid_pipeline_payments         WHERE id IS NOT NULL;
  DELETE FROM public.paid_pipeline_followups        WHERE id IS NOT NULL;
  DELETE FROM public.paid_pipeline_finance_details  WHERE id IS NOT NULL;
  DELETE FROM public.paid_pipeline_activity_logs    WHERE id IS NOT NULL;
  DELETE FROM public.paid_pipeline_to_crm_links     WHERE id IS NOT NULL;
  DELETE FROM public.paid_pipeline_leads            WHERE id IS NOT NULL;
  DELETE FROM public.paid_pipeline_batches          WHERE id IS NOT NULL;

  -- Calling CRM children
  DELETE FROM public.follow_up_reminders     WHERE id IS NOT NULL;
  DELETE FROM public.lead_tag_assignments    WHERE id IS NOT NULL;
  DELETE FROM public.activity_logs           WHERE id IS NOT NULL;
  DELETE FROM public.crm_batch_archives      WHERE id IS NOT NULL;
  DELETE FROM public.lead_entries            WHERE id IS NOT NULL;
  DELETE FROM public.lead_qualifier_sessions WHERE id IS NOT NULL;

  -- Leads (parent)
  DELETE FROM public.leads WHERE id IS NOT NULL;

  SELECT jsonb_build_object(
    'crm_leads',                (SELECT count(*) FROM public.leads),
    'paid_batches',             (SELECT count(*) FROM public.paid_pipeline_batches),
    'paid_buyers',              (SELECT count(*) FROM public.paid_pipeline_leads),
    'paid_payments',            (SELECT count(*) FROM public.paid_pipeline_payments),
    'paid_followups',           (SELECT count(*) FROM public.paid_pipeline_followups),
    'paid_finance',             (SELECT count(*) FROM public.paid_pipeline_finance_details),
    'paid_activity',            (SELECT count(*) FROM public.paid_pipeline_activity_logs),
    'paid_to_crm_links',        (SELECT count(*) FROM public.paid_pipeline_to_crm_links),
    'operations_leads',         (SELECT count(*) FROM public.operations_leads),
    'operations_service_events',(SELECT count(*) FROM public.operations_service_events),
    'operations_conversions',   (SELECT count(*) FROM public.operations_conversion_reports),
    'operations_reward_progress',(SELECT count(*) FROM public.operations_reward_progress),
    'crm_followups',            (SELECT count(*) FROM public.follow_up_reminders),
    'lead_tag_assignments',     (SELECT count(*) FROM public.lead_tag_assignments),
    'lead_activity',            (SELECT count(*) FROM public.activity_logs),
    'batch_archives',           (SELECT count(*) FROM public.crm_batch_archives),
    'lead_entries',             (SELECT count(*) FROM public.lead_entries),
    'lead_qualifier_sessions',  (SELECT count(*) FROM public.lead_qualifier_sessions),
    'notifications',            (SELECT count(*) FROM public.notifications
      WHERE entity_type IN ('lead','crm_lead','paid_pipeline_lead','operations_lead','batch','paid_batch','follow_up','payment','conversion','reward','handoff','assignment'))
  ) INTO after_counts;

  result := jsonb_build_object(
    'dry_run', false,
    'wiped_at', now(),
    'wiped_by', auth.uid(),
    'before_counts', before_counts,
    'after_counts', after_counts
  );

  RETURN result;
END $$;


--
-- Name: admin_wipe_demo_lead_data(boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_wipe_demo_lead_data(_dry_run boolean DEFAULT true) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  c_crm_active int := 0;
  c_crm_archived int := 0;
  c_crm_total int := 0;
  c_batches int := 0;
  c_paid_buyers int := 0;
  c_paid_archived int := 0;
  c_payments int := 0;
  c_pp_followups int := 0;
  c_pp_finance int := 0;
  c_pp_activity int := 0;
  c_pp_links int := 0;
  c_ops_leads int := 0;
  c_ops_events int := 0;
  c_ops_conv int := 0;
  c_ops_reward int := 0;
  c_followups int := 0;
  c_tag_assign int := 0;
  c_activity int := 0;
  c_notif int := 0;
  c_batch_archives int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized: admin only';
  END IF;

  -- Count phase
  SELECT count(*) INTO c_crm_active FROM public.leads WHERE archived_at IS NULL;
  SELECT count(*) INTO c_crm_archived FROM public.leads WHERE archived_at IS NOT NULL;
  c_crm_total := c_crm_active + c_crm_archived;
  SELECT count(*) INTO c_batches FROM public.paid_pipeline_batches;
  SELECT count(*) INTO c_paid_buyers FROM public.paid_pipeline_leads WHERE archived_at IS NULL;
  SELECT count(*) INTO c_paid_archived FROM public.paid_pipeline_leads WHERE archived_at IS NOT NULL;
  SELECT count(*) INTO c_payments FROM public.paid_pipeline_payments;
  SELECT count(*) INTO c_pp_followups FROM public.paid_pipeline_followups;
  SELECT count(*) INTO c_pp_finance FROM public.paid_pipeline_finance_details;
  SELECT count(*) INTO c_pp_activity FROM public.paid_pipeline_activity_logs;
  SELECT count(*) INTO c_pp_links FROM public.paid_pipeline_to_crm_links;
  SELECT count(*) INTO c_ops_leads FROM public.operations_leads;
  SELECT count(*) INTO c_ops_events FROM public.operations_service_events;
  SELECT count(*) INTO c_ops_conv FROM public.operations_conversion_reports;
  SELECT count(*) INTO c_ops_reward FROM public.operations_reward_progress;
  SELECT count(*) INTO c_followups FROM public.follow_up_reminders;
  SELECT count(*) INTO c_tag_assign FROM public.lead_tag_assignments;
  SELECT count(*) INTO c_activity FROM public.activity_logs;
  SELECT count(*) INTO c_batch_archives FROM public.crm_batch_archives;
  SELECT count(*) INTO c_notif FROM public.notifications
    WHERE entity_type IN ('lead','crm_lead','paid_pipeline_lead','operations_lead','batch','paid_batch','follow_up','payment','conversion','reward','handoff');

  IF _dry_run THEN
    RETURN jsonb_build_object(
      'dry_run', true,
      'crm_leads_active', c_crm_active,
      'crm_leads_archived', c_crm_archived,
      'crm_leads_total', c_crm_total,
      'paid_batches', c_batches,
      'paid_buyers_active', c_paid_buyers,
      'paid_buyers_archived', c_paid_archived,
      'payments', c_payments,
      'paid_followups', c_pp_followups,
      'paid_finance', c_pp_finance,
      'paid_activity', c_pp_activity,
      'paid_to_crm_links', c_pp_links,
      'operations_leads', c_ops_leads,
      'operations_service_events', c_ops_events,
      'operations_conversions', c_ops_conv,
      'operations_reward_progress', c_ops_reward,
      'crm_followups', c_followups,
      'lead_tag_assignments', c_tag_assign,
      'lead_activity', c_activity,
      'batch_archives', c_batch_archives,
      'notifications', c_notif
    );
  END IF;

  -- Delete phase (FK-safe order). Many tables CASCADE from parents, but we delete explicitly for transparent counts.

  -- Operations CRM children → parent
  DELETE FROM public.operations_conversion_reports;
  DELETE FROM public.operations_service_events;
  DELETE FROM public.operations_leads;
  DELETE FROM public.operations_reward_progress;

  -- Paid Pipeline children → parent
  DELETE FROM public.paid_pipeline_payments;
  DELETE FROM public.paid_pipeline_followups;
  DELETE FROM public.paid_pipeline_finance_details;
  DELETE FROM public.paid_pipeline_activity_logs;
  DELETE FROM public.paid_pipeline_to_crm_links;
  DELETE FROM public.paid_pipeline_leads;
  DELETE FROM public.paid_pipeline_batches;

  -- Calling CRM children
  DELETE FROM public.follow_up_reminders;
  DELETE FROM public.lead_tag_assignments;
  DELETE FROM public.activity_logs;
  DELETE FROM public.crm_batch_archives;

  -- Leads (parent)
  DELETE FROM public.leads;

  -- Notifications linked to wiped entity types
  DELETE FROM public.notifications
    WHERE entity_type IN ('lead','crm_lead','paid_pipeline_lead','operations_lead','batch','paid_batch','follow_up','payment','conversion','reward','handoff');

  RETURN jsonb_build_object(
    'dry_run', false,
    'crm_leads_deleted', c_crm_total,
    'paid_batches_deleted', c_batches,
    'paid_buyers_deleted', c_paid_buyers + c_paid_archived,
    'payments_deleted', c_payments,
    'paid_followups_deleted', c_pp_followups,
    'paid_finance_deleted', c_pp_finance,
    'paid_activity_deleted', c_pp_activity,
    'paid_to_crm_links_deleted', c_pp_links,
    'operations_leads_deleted', c_ops_leads,
    'operations_service_events_deleted', c_ops_events,
    'operations_conversions_deleted', c_ops_conv,
    'operations_reward_progress_deleted', c_ops_reward,
    'followups_deleted', c_followups,
    'lead_tag_assignments_deleted', c_tag_assign,
    'lead_activity_deleted', c_activity,
    'batch_archives_deleted', c_batch_archives,
    'notifications_deleted', c_notif
  );
END $$;


--
-- Name: assign_manual_invoice_number(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_manual_invoice_number(_invoice_id uuid, _number text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  trimmed text := btrim(coalesce(_number, ''));
  exists_count int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not authorized: admin only';
  END IF;
  IF trimmed = '' THEN
    RAISE EXCEPTION 'invoice number cannot be empty';
  END IF;
  SELECT count(*) INTO exists_count FROM public.invoices
    WHERE invoice_number = trimmed AND id <> _invoice_id;
  IF exists_count > 0 THEN
    RAISE EXCEPTION 'invoice number % already exists', trimmed;
  END IF;
  UPDATE public.invoices
     SET invoice_number = trimmed,
         invoice_number_mode = 'manual',
         manual_invoice_number = trimmed
   WHERE id = _invoice_id;
  RETURN trimmed;
END $$;


--
-- Name: assign_next_invoice_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_next_invoice_number() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  s record;
  num integer;
  fy text;
  formatted text;
BEGIN
  IF NOT public.is_active(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO s FROM public.invoice_settings WHERE workspace = 'default' FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.invoice_settings (workspace) VALUES ('default') RETURNING * INTO s;
  END IF;

  IF EXTRACT(MONTH FROM CURRENT_DATE) >= 4 THEN
    fy := to_char(CURRENT_DATE, 'YY') || '-' || to_char(CURRENT_DATE + interval '1 year', 'YY');
  ELSE
    fy := to_char(CURRENT_DATE - interval '1 year', 'YY') || '-' || to_char(CURRENT_DATE, 'YY');
  END IF;

  IF s.reset_yearly AND (s.last_reset_fy IS DISTINCT FROM fy) THEN
    UPDATE public.invoice_settings SET next_invoice_number = 1, last_reset_fy = fy WHERE id = s.id RETURNING * INTO s;
  END IF;

  num := s.next_invoice_number;
  UPDATE public.invoice_settings SET next_invoice_number = num + 1 WHERE id = s.id;

  formatted := COALESCE(s.invoice_prefix, 'INV-')
    || CASE WHEN s.fy_format IS NOT NULL AND s.fy_format <> '' THEN fy || '/' ELSE '' END
    || lpad(num::text, GREATEST(COALESCE(s.number_padding,4),1), '0');
  RETURN formatted;
END $$;


--
-- Name: can_access_member_verification(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_access_member_verification(_crm_lead_id uuid, _paid_pipeline_lead_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (_crm_lead_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = _crm_lead_id
        AND l.assigned_agent_id = auth.uid()
    ))
    OR (_paid_pipeline_lead_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.paid_pipeline_leads p
      WHERE p.id = _paid_pipeline_lead_id
        AND (p.assigned_sales_executive = auth.uid() OR p.created_by = auth.uid())
    ))
$$;


--
-- Name: can_access_unassigned_leads(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_access_unassigned_leads(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id
      AND p.status = 'active'
      AND (
        COALESCE(p.can_receive_calling_crm_leads, false)
        OR COALESCE(p.can_receive_paid_pipeline_leads, false)
        OR COALESCE(p.can_receive_follow_up_tasks, false)
        OR COALESCE(p.can_receive_payment_recovery_leads, false)
      )
  )
  OR EXISTS (
    SELECT 1 FROM public.user_module_access uma
    WHERE uma.user_id = _user_id
      AND uma.module_key IN ('crm','calling_crm','paid_pipeline','paid-pipeline','payment_recovery')
  );
$$;


--
-- Name: can_delete_offer_item(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_delete_offer_item(_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.paid_lead_offer_items WHERE offer_item_id = _id
    UNION ALL
    SELECT 1 FROM public.offer_preset_items WHERE offer_item_id = _id
  );
$$;


--
-- Name: can_manage_invoice_settings(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_manage_invoice_settings(user_uuid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = user_uuid
      AND ur.role = 'admin'::public.app_role
      AND p.status = 'active'
  )
$$;


--
-- Name: can_view_resource_library_item(text, text[], text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_view_resource_library_item(_visibility text, _allowed_role_keys text[], _allowed_module_keys text[]) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  is_admin_flag boolean;
  is_active_flag boolean;
  user_role text;
  user_modules text[];
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  is_admin_flag := public.has_role(auth.uid(), 'admin'::public.app_role);
  IF is_admin_flag THEN RETURN true; END IF;
  is_active_flag := public.is_active(auth.uid());
  IF NOT is_active_flag THEN RETURN false; END IF;

  IF _visibility = 'admin_only' THEN RETURN false; END IF;
  IF _visibility = 'all_team' THEN RETURN true; END IF;

  SELECT lower(coalesce(role,'')) INTO user_role FROM public.profiles WHERE id = auth.uid();
  SELECT coalesce(array_agg(module_key), '{}') INTO user_modules FROM public.user_module_access WHERE user_id = auth.uid();

  IF _visibility = 'sales' THEN
    RETURN user_role ILIKE '%sales%'
      OR 'crm' = ANY(user_modules)
      OR 'calling_crm' = ANY(user_modules);
  ELSIF _visibility = 'operations' THEN
    RETURN user_role ILIKE '%operations%' OR 'operations_crm' = ANY(user_modules);
  ELSIF _visibility = 'finance' THEN
    RETURN user_role ILIKE '%finance%' OR 'payment_recovery' = ANY(user_modules);
  ELSIF _visibility = 'media_buyer' THEN
    RETURN user_role ILIKE '%media%buyer%' OR 'media_buyer_operations' = ANY(user_modules);
  ELSIF _visibility = 'custom' THEN
    RETURN (
      (_allowed_role_keys IS NOT NULL AND array_length(_allowed_role_keys,1) > 0
        AND EXISTS (SELECT 1 FROM unnest(_allowed_role_keys) rk WHERE user_role ILIKE '%'||lower(rk)||'%'))
      OR
      (_allowed_module_keys IS NOT NULL AND array_length(_allowed_module_keys,1) > 0
        AND user_modules && _allowed_module_keys)
    );
  END IF;
  RETURN false;
END $$;


--
-- Name: coc_advance_lead_stage(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.coc_advance_lead_stage(_crm_lead_id uuid, _target_stage_id uuid, _reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_lead record;
  v_target record;
  v_current record;
  v_old_name text;
BEGIN
  IF _crm_lead_id IS NULL OR _target_stage_id IS NULL THEN
    RETURN jsonb_build_object('moved', false, 'reason', 'missing_ids');
  END IF;

  SELECT id, pipeline_id, stage_id INTO v_lead FROM public.leads WHERE id = _crm_lead_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('moved', false, 'reason', 'lead_not_found'); END IF;

  SELECT id, pipeline_id, position, name INTO v_target FROM public.stages WHERE id = _target_stage_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('moved', false, 'reason', 'target_stage_not_found'); END IF;

  -- Only move within the same pipeline
  IF v_target.pipeline_id IS DISTINCT FROM v_lead.pipeline_id THEN
    RETURN jsonb_build_object('moved', false, 'reason', 'pipeline_mismatch');
  END IF;

  IF v_lead.stage_id = _target_stage_id THEN
    RETURN jsonb_build_object('moved', false, 'reason', 'already_at_target');
  END IF;

  -- No-backward-move: skip if current stage position is >= target position
  IF v_lead.stage_id IS NOT NULL THEN
    SELECT id, position, name INTO v_current FROM public.stages WHERE id = v_lead.stage_id;
    IF FOUND AND v_current.position >= v_target.position THEN
      RETURN jsonb_build_object('moved', false, 'reason', 'not_backward', 'current_stage', v_current.name);
    END IF;
    v_old_name := v_current.name;
  END IF;

  UPDATE public.leads SET stage_id = _target_stage_id WHERE id = _crm_lead_id;

  BEGIN
    INSERT INTO public.activity_logs (lead_id, action_type, details)
    VALUES (_crm_lead_id, 'coc_auto_stage_move',
      jsonb_build_object('from', v_old_name, 'to', v_target.name, 'reason', COALESCE(_reason, 'code_of_conduct_automation')));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('moved', true, 'from', v_old_name, 'to', v_target.name);
END;
$$;


--
-- Name: coc_after_signed_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.coc_after_signed_sync() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  rule record;
  v_tag_id uuid;
  v_stage_after uuid;
  v_crm_lead_id uuid;
  v_paid_lead_id uuid;
  v_owner_id uuid;
  v_member_name text;
BEGIN
  IF NEW.status <> 'signed' THEN RETURN NEW; END IF;
  IF OLD.status = 'signed' THEN RETURN NEW; END IF;

  v_crm_lead_id := NEW.crm_lead_id;
  v_paid_lead_id := NEW.paid_pipeline_lead_id;
  v_member_name := COALESCE(NEW.member_name, 'Member');

  -- Mirror status to CRM lead
  IF v_crm_lead_id IS NOT NULL THEN
    UPDATE public.leads
      SET code_of_conduct_status = 'signed',
          code_of_conduct_request_id = NEW.id,
          code_of_conduct_signed_at = COALESCE(NEW.signed_at, now())
      WHERE id = v_crm_lead_id;
    SELECT assigned_agent_id INTO v_owner_id FROM public.leads WHERE id = v_crm_lead_id;
  END IF;

  -- Mirror status to Paid Pipeline lead
  IF v_paid_lead_id IS NOT NULL THEN
    UPDATE public.paid_pipeline_leads
      SET code_of_conduct_status = 'signed',
          code_of_conduct_request_id = NEW.id,
          code_of_conduct_signed_at = COALESCE(NEW.signed_at, now())
      WHERE id = v_paid_lead_id;
    IF v_crm_lead_id IS NULL THEN
      SELECT crm_lead_id INTO v_crm_lead_id FROM public.paid_pipeline_leads WHERE id = v_paid_lead_id;
    END IF;
  END IF;

  INSERT INTO public.code_of_conduct_events (request_id, event_type, metadata)
    VALUES (NEW.id, 'code_of_conduct_signed_status_synced',
      jsonb_build_object('crm_lead_id', v_crm_lead_id, 'paid_pipeline_lead_id', v_paid_lead_id));

  -- Find matching rule (most recent active rule using this template)
  SELECT * INTO rule FROM public.code_of_conduct_rules
    WHERE template_id = NEW.template_id AND is_active = true
    ORDER BY created_at DESC LIMIT 1;

  IF FOUND THEN
    v_tag_id := rule.tag_id_after_signed;
    v_stage_after := rule.stage_id_after_signed;

    -- Apply tag (idempotent via unique index)
    IF v_tag_id IS NOT NULL THEN
      IF v_crm_lead_id IS NOT NULL THEN
        INSERT INTO public.lead_tag_assignments (tag_id, crm_lead_id, assigned_by)
          VALUES (v_tag_id, v_crm_lead_id, NULL)
          ON CONFLICT DO NOTHING;
      END IF;
      IF v_paid_lead_id IS NOT NULL THEN
        INSERT INTO public.lead_tag_assignments (tag_id, paid_pipeline_lead_id, assigned_by)
          VALUES (v_tag_id, v_paid_lead_id, NULL)
          ON CONFLICT DO NOTHING;
      END IF;
      INSERT INTO public.code_of_conduct_events (request_id, event_type, metadata)
        VALUES (NEW.id, 'code_of_conduct_signed_tag_applied', jsonb_build_object('tag_id', v_tag_id));
    END IF;

    -- Optional CRM stage move
    IF v_stage_after IS NOT NULL AND v_crm_lead_id IS NOT NULL THEN
      UPDATE public.leads SET stage_id = v_stage_after WHERE id = v_crm_lead_id;
      INSERT INTO public.code_of_conduct_events (request_id, event_type, metadata)
        VALUES (NEW.id, 'code_of_conduct_signed_stage_updated',
          jsonb_build_object('crm_lead_id', v_crm_lead_id, 'stage_id', v_stage_after));
    END IF;

    -- Notify admin + owner if configured
    IF rule.notify_admin THEN
      INSERT INTO public.notifications (
        recipient_user_id, module_key, notification_type, title, message,
        priority, action_url, action_label, entity_type, entity_id, entity_label,
        triggered_by_user_id, metadata
      )
      SELECT ur.user_id, 'code_of_conduct', 'coc_signed',
        v_member_name || ' signed Code of Conduct',
        'Signed PDF is ready for review.',
        'normal',
        '/admin/code-of-conduct?request_id=' || NEW.id::text,
        'View signed PDF',
        'code_of_conduct_request', NEW.id, v_member_name,
        NULL,
        jsonb_build_object('request_id', NEW.id, 'rule_id', rule.id)
      FROM public.user_roles ur
      WHERE ur.role = 'admin'::app_role
      ON CONFLICT DO NOTHING;
    END IF;

    IF rule.notify_owner AND v_owner_id IS NOT NULL THEN
      INSERT INTO public.notifications (
        recipient_user_id, module_key, notification_type, title, message,
        priority, action_url, action_label, entity_type, entity_id, entity_label,
        triggered_by_user_id, metadata
      ) VALUES (
        v_owner_id, 'code_of_conduct', 'coc_signed',
        v_member_name || ' signed Code of Conduct',
        'Your assigned lead has signed the Code of Conduct.',
        'normal',
        '/crm',
        'Open lead',
        'crm_lead', v_crm_lead_id, v_member_name,
        NULL,
        jsonb_build_object('request_id', NEW.id, 'rule_id', rule.id)
      );
    END IF;

    INSERT INTO public.code_of_conduct_events (request_id, event_type, metadata)
      VALUES (NEW.id, 'code_of_conduct_signed_notification_sent',
        jsonb_build_object('notify_admin', rule.notify_admin, 'notify_owner', rule.notify_owner));
  END IF;

  RETURN NEW;
END $$;


--
-- Name: coc_maybe_move_access_done(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.coc_maybe_move_access_done(_request_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  r record;
  s record;
  gv_active boolean;
  gv_complete boolean := false;
  v_result jsonb;
BEGIN
  SELECT * INTO r FROM public.code_of_conduct_requests WHERE id = _request_id;
  IF NOT FOUND OR r.status <> 'signed' OR r.crm_lead_id IS NULL THEN
    RETURN jsonb_build_object('moved', false, 'reason', 'not_eligible');
  END IF;

  SELECT coc_access_done_stage_id, coc_auto_move_access_done, guide_video_is_active, guide_video_id
    INTO s FROM public.company_settings WHERE workspace = 'default' LIMIT 1;
  IF NOT FOUND OR NOT COALESCE(s.coc_auto_move_access_done, false) OR s.coc_access_done_stage_id IS NULL THEN
    RETURN jsonb_build_object('moved', false, 'reason', 'disabled');
  END IF;

  gv_active := COALESCE(s.guide_video_is_active, false) AND s.guide_video_id IS NOT NULL;
  IF gv_active THEN
    SELECT (completed_at IS NOT NULL) INTO gv_complete
      FROM public.code_of_conduct_guide_progress WHERE request_id = _request_id LIMIT 1;
    IF NOT COALESCE(gv_complete, false) THEN
      RETURN jsonb_build_object('moved', false, 'reason', 'guide_not_complete');
    END IF;
  END IF;

  v_result := public.coc_advance_lead_stage(r.crm_lead_id, s.coc_access_done_stage_id, 'code_of_conduct_access_done_auto');
  RETURN v_result;
END;
$$;


--
-- Name: coc_mirror_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.coc_mirror_status() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status = OLD.status AND NEW.id = OLD.id THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('sent','viewed','expired','failed','cancelled') THEN RETURN NEW; END IF;

  IF NEW.crm_lead_id IS NOT NULL THEN
    UPDATE public.leads
      SET code_of_conduct_status = NEW.status,
          code_of_conduct_request_id = NEW.id,
          code_of_conduct_sent_at = COALESCE(code_of_conduct_sent_at, NEW.sent_at)
      WHERE id = NEW.crm_lead_id;
  END IF;
  IF NEW.paid_pipeline_lead_id IS NOT NULL THEN
    UPDATE public.paid_pipeline_leads
      SET code_of_conduct_status = NEW.status,
          code_of_conduct_request_id = NEW.id,
          code_of_conduct_sent_at = COALESCE(code_of_conduct_sent_at, NEW.sent_at)
      WHERE id = NEW.paid_pipeline_lead_id;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: ensure_paid_buyer_has_paid_crm_card(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_paid_buyer_has_paid_crm_card() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_paid_pipeline_id uuid;
  v_paid_stage_id uuid;
  v_linked_pipeline_type text := NULL;
  v_existing_paid_crm_id uuid := NULL;
  v_source_lead_id uuid := NULL;
  v_batch_label text := NULL;
  v_batch_date date := NULL;
BEGIN
  IF COALESCE(NEW.is_deleted, false) OR NEW.deleted_at IS NOT NULL OR NEW.archived_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_paid_pipeline_id
  FROM public.pipelines
  WHERE type = 'paid'
  ORDER BY position
  LIMIT 1;

  IF v_paid_pipeline_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_paid_stage_id
  FROM public.stages
  WHERE pipeline_id = v_paid_pipeline_id
  ORDER BY CASE WHEN name = 'Payment Confirmed' THEN 0 ELSE 1 END, position
  LIMIT 1;

  v_batch_label := NULLIF(btrim(COALESCE(NEW.paid_batch_name, NEW.source_webinar, NEW.onboarding_batch_name, '')), '');
  v_batch_date := NEW.source_report_date;

  IF NEW.crm_lead_id IS NOT NULL THEN
    SELECT p.type INTO v_linked_pipeline_type
    FROM public.leads l
    LEFT JOIN public.pipelines p ON p.id = l.pipeline_id
    WHERE l.id = NEW.crm_lead_id;
  END IF;

  IF NEW.crm_lead_id IS NOT NULL AND v_linked_pipeline_type = 'paid' THEN
    UPDATE public.leads
    SET pipeline_id = v_paid_pipeline_id,
        stage_id = COALESCE(stage_id, v_paid_stage_id),
        lead_type = 'paid',
        paid_pipeline_lead_id = NEW.id,
        hide_from_sales_workload = false,
        archived_at = NULL,
        deleted_at = NULL,
        webinar_source = COALESCE(v_batch_label, webinar_source),
        webinar_name = COALESCE(v_batch_label, webinar_name),
        webinar_date = COALESCE(v_batch_date, webinar_date)
    WHERE id = NEW.crm_lead_id;
    RETURN NEW;
  END IF;

  IF NEW.crm_lead_id IS NOT NULL AND v_linked_pipeline_type IS DISTINCT FROM 'paid' THEN
    v_source_lead_id := NEW.crm_lead_id;
    NEW.source_unpaid_lead_id := COALESCE(NEW.source_unpaid_lead_id, v_source_lead_id);
  ELSE
    v_source_lead_id := NEW.source_unpaid_lead_id;
  END IF;

  SELECT l.id INTO v_existing_paid_crm_id
  FROM public.leads l
  WHERE l.paid_pipeline_lead_id = NEW.id
    AND l.pipeline_id = v_paid_pipeline_id
    AND l.deleted_at IS NULL
  ORDER BY l.created_at DESC
  LIMIT 1;

  IF v_existing_paid_crm_id IS NULL THEN
    INSERT INTO public.leads (
      full_name,
      email,
      phone,
      pipeline_id,
      stage_id,
      lead_type,
      paid_pipeline_lead_id,
      conversion_status,
      hide_from_sales_workload,
      assigned_agent_id,
      program_name,
      webinar_source,
      webinar_name,
      webinar_date,
      deal_value
    ) VALUES (
      COALESCE(NULLIF(NEW.name, ''), 'Unnamed Buyer'),
      NULLIF(NEW.email, ''),
      NULLIF(NEW.phone, ''),
      v_paid_pipeline_id,
      v_paid_stage_id,
      'paid',
      NEW.id,
      'converted',
      false,
      NEW.assigned_sales_executive,
      COALESCE(NEW.product_name_snapshot, ''),
      v_batch_label,
      v_batch_label,
      v_batch_date,
      COALESCE(NEW.deal_value_including_gst, 0)
    ) RETURNING id INTO v_existing_paid_crm_id;
  ELSE
    UPDATE public.leads
    SET pipeline_id = v_paid_pipeline_id,
        stage_id = COALESCE(stage_id, v_paid_stage_id),
        lead_type = 'paid',
        paid_pipeline_lead_id = NEW.id,
        hide_from_sales_workload = false,
        archived_at = NULL,
        deleted_at = NULL,
        webinar_source = COALESCE(v_batch_label, webinar_source),
        webinar_name = COALESCE(v_batch_label, webinar_name),
        webinar_date = COALESCE(v_batch_date, webinar_date)
    WHERE id = v_existing_paid_crm_id;
  END IF;

  NEW.crm_lead_id := v_existing_paid_crm_id;

  IF v_source_lead_id IS NOT NULL THEN
    UPDATE public.leads
    SET conversion_status = 'converted',
        paid_pipeline_lead_id = NEW.id,
        converted_to_crm_lead_id = v_existing_paid_crm_id,
        converted_at = COALESCE(converted_at, now())
    WHERE id = v_source_lead_id;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: generate_my_kpi_entries_for_date(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_my_kpi_entries_for_date(_target_date date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  a record;
  it record;
  kpi record;
  v_period_start date;
  v_period_end date;
  v_due_at timestamptz;
  v_target numeric;
  v_created int := 0;
  v_skipped int := 0;
  v_unsupported int := 0;
  v_dow int;
  v_dom int;
  v_maxdom int;
  v_due_day date;
  v_time time;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.is_active(v_uid) THEN RAISE EXCEPTION 'not authorized'; END IF;

  FOR a IN
    SELECT * FROM public.kpi_assignments
    WHERE user_id = v_uid
      AND is_active = true
      AND (start_date IS NULL OR start_date <= _target_date)
      AND (end_date IS NULL OR end_date >= _target_date)
  LOOP
    -- Build KPI list based on assignment_type
    FOR it IN
      SELECT k.*, NULL::numeric AS target_override
      FROM public.kpi_definitions k
      WHERE a.assignment_type = 'individual' AND a.kpi_id IS NOT NULL AND k.id = a.kpi_id AND k.is_active = true
      UNION ALL
      SELECT k.*, ti.target_override
      FROM public.kpi_template_items ti
      JOIN public.kpi_definitions k ON k.id = ti.kpi_id
      WHERE a.assignment_type = 'template' AND a.template_id IS NOT NULL AND ti.template_id = a.template_id AND k.is_active = true
    LOOP
      kpi := it;
      v_time := kpi.due_time;

      IF kpi.cadence = 'daily' OR (kpi.cadence = 'recurring' AND (kpi.recurrence_rule IS NULL OR kpi.recurrence_rule = '' OR lower(kpi.recurrence_rule) = 'daily')) THEN
        v_period_start := _target_date;
        v_period_end := _target_date;
        v_due_day := _target_date;
      ELSIF kpi.cadence = 'weekly' THEN
        v_period_start := date_trunc('week', _target_date)::date; -- Monday
        v_period_end := v_period_start + 6;
        v_dow := COALESCE(kpi.due_day_of_week, 7);
        v_due_day := v_period_start + (LEAST(GREATEST(v_dow,1),7) - 1);
      ELSIF kpi.cadence = 'monthly' THEN
        v_period_start := date_trunc('month', _target_date)::date;
        v_period_end := (v_period_start + interval '1 month - 1 day')::date;
        v_maxdom := EXTRACT(DAY FROM v_period_end)::int;
        v_dom := COALESCE(kpi.due_day_of_month, v_maxdom);
        v_due_day := v_period_start + (LEAST(v_dom, v_maxdom) - 1);
      ELSE
        v_unsupported := v_unsupported + 1;
        CONTINUE;
      END IF;

      IF v_time IS NOT NULL THEN
        v_due_at := (v_due_day::timestamp + v_time)::timestamptz;
      ELSE
        v_due_at := NULL;
      END IF;

      v_target := COALESCE(a.custom_target, it.target_override, kpi.target_default);

      BEGIN
        INSERT INTO public.kpi_entries (assignment_id, user_id, kpi_id, period_type, period_start, period_end, due_at, target_value, status)
        VALUES (a.id, v_uid, kpi.id, kpi.cadence, v_period_start, v_period_end, v_due_at, v_target, 'pending');
        v_created := v_created + 1;
      EXCEPTION WHEN unique_violation THEN
        v_skipped := v_skipped + 1;
      END;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('created', v_created, 'skipped_duplicates', v_skipped, 'unsupported', v_unsupported, 'target_date', _target_date);
END;
$$;


--
-- Name: generate_tp_reminders_for_date(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_tp_reminders_for_date(_target_date date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  s_enabled boolean;
  r record;
  total_created int := 0;
  total_dupes int := 0;
  users_checked int := 0;
  res jsonb;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'admin only'; END IF;

  SELECT COALESCE(team_performance_daily_reminder_enabled, false) INTO s_enabled
    FROM public.company_settings WHERE workspace = 'default' LIMIT 1;
  IF NOT s_enabled THEN
    RETURN jsonb_build_object('users_checked',0,'created',0,'skipped_duplicates',0,'skipped_disabled',true);
  END IF;

  FOR r IN
    SELECT DISTINCT user_id FROM public.kpi_entries
     WHERE (status = 'pending' AND _target_date BETWEEN period_start AND period_end)
        OR (status = 'rejected')
  LOOP
    users_checked := users_checked + 1;
    res := public.generate_tp_reminders_for_user(r.user_id, _target_date);
    total_created := total_created + COALESCE((res->>'created')::int, 0);
    total_dupes := total_dupes + COALESCE((res->>'skipped_duplicates')::int, 0);
  END LOOP;

  RETURN jsonb_build_object('users_checked', users_checked, 'created', total_created, 'skipped_duplicates', total_dupes, 'skipped_disabled', false);
END;
$$;


--
-- Name: generate_tp_reminders_for_user(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_tp_reminders_for_user(_user_id uuid, _target_date date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  s_enabled boolean;
  s_due_soon int;
  s_overdue_on boolean;
  v_pending int;
  v_created int := 0;
  v_dupes int := 0;
  v_caller uuid := auth.uid();
  v_is_admin boolean := false;
  r record;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT has_role(v_caller, 'admin'::app_role) INTO v_is_admin;
  IF v_caller <> _user_id AND NOT v_is_admin THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT COALESCE(team_performance_daily_reminder_enabled, false),
         COALESCE(team_performance_reminder_due_soon_minutes, 60),
         COALESCE(team_performance_reminder_overdue_enabled, true)
    INTO s_enabled, s_due_soon, s_overdue_on
    FROM public.company_settings WHERE workspace = 'default' LIMIT 1;

  IF NOT s_enabled THEN
    RETURN jsonb_build_object('created',0,'skipped_duplicates',0,'skipped_disabled',true);
  END IF;

  SELECT count(*) INTO v_pending FROM public.kpi_entries e
    WHERE e.user_id = _user_id AND e.status = 'pending'
      AND _target_date BETWEEN e.period_start AND e.period_end;

  IF v_pending > 0 THEN
    BEGIN
      INSERT INTO public.team_performance_reminders(user_id, reminder_type, title, message, reminder_for_date)
      VALUES (_user_id, 'morning_summary', 'Today''s KPIs',
              'You have ' || v_pending || ' KPI' || CASE WHEN v_pending=1 THEN '' ELSE 's' END || ' due today.',
              _target_date);
      v_created := v_created + 1;
    EXCEPTION WHEN unique_violation THEN v_dupes := v_dupes + 1; END;
  END IF;

  FOR r IN
    SELECT e.id, k.name FROM public.kpi_entries e
    JOIN public.kpi_definitions k ON k.id = e.kpi_id
    WHERE e.user_id = _user_id AND e.status = 'pending'
      AND e.due_at IS NOT NULL AND e.due_at > now()
      AND e.due_at <= now() + make_interval(mins => s_due_soon)
      AND _target_date BETWEEN e.period_start AND e.period_end
  LOOP
    BEGIN
      INSERT INTO public.team_performance_reminders(user_id, kpi_entry_id, reminder_type, title, message, reminder_for_date)
      VALUES (_user_id, r.id, 'due_soon', 'KPI due soon', 'KPI due soon: ' || r.name, _target_date);
      v_created := v_created + 1;
    EXCEPTION WHEN unique_violation THEN v_dupes := v_dupes + 1; END;
  END LOOP;

  IF s_overdue_on THEN
    FOR r IN
      SELECT e.id, k.name FROM public.kpi_entries e
      JOIN public.kpi_definitions k ON k.id = e.kpi_id
      WHERE e.user_id = _user_id AND e.status = 'pending'
        AND e.due_at IS NOT NULL AND e.due_at < now()
    LOOP
      BEGIN
        INSERT INTO public.team_performance_reminders(user_id, kpi_entry_id, reminder_type, title, message, reminder_for_date)
        VALUES (_user_id, r.id, 'overdue', 'KPI overdue', 'KPI overdue: ' || r.name, _target_date);
        v_created := v_created + 1;
      EXCEPTION WHEN unique_violation THEN v_dupes := v_dupes + 1; END;
    END LOOP;
  END IF;

  FOR r IN
    SELECT e.id, k.name FROM public.kpi_entries e
    JOIN public.kpi_definitions k ON k.id = e.kpi_id
    WHERE e.user_id = _user_id AND e.status = 'rejected'
      AND EXISTS (
        SELECT 1 FROM public.kpi_submissions s
        WHERE s.entry_id = e.id AND s.reviewed_at IS NOT NULL
          AND s.reviewed_at::date = _target_date
      )
  LOOP
    BEGIN
      INSERT INTO public.team_performance_reminders(user_id, kpi_entry_id, reminder_type, title, message, reminder_for_date)
      VALUES (_user_id, r.id, 'rejected_feedback', 'KPI rejected', 'KPI rejected: ' || r.name || '. Please check feedback.', _target_date);
      v_created := v_created + 1;
    EXCEPTION WHEN unique_violation THEN v_dupes := v_dupes + 1; END;
  END LOOP;

  RETURN jsonb_build_object('created', v_created, 'skipped_duplicates', v_dupes, 'skipped_disabled', false);
END;
$$;


--
-- Name: get_coc_stage_settings(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_coc_stage_settings() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object(
      'coc_link_opened_stage_id', coc_link_opened_stage_id,
      'coc_access_done_stage_id', coc_access_done_stage_id,
      'coc_auto_move_link_opened', coc_auto_move_link_opened,
      'coc_auto_move_access_done', coc_auto_move_access_done
    ) FROM public.company_settings WHERE workspace = 'default' LIMIT 1),
    '{}'::jsonb
  )
$$;


--
-- Name: get_finance_dead_stage_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_finance_dead_stage_ids() RETURNS uuid[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT finance_dead_stage_ids FROM public.company_settings WHERE workspace = 'default' LIMIT 1),
    ARRAY[]::uuid[]
  )
$$;


--
-- Name: get_finance_success_stage_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_finance_success_stage_ids() RETURNS uuid[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT finance_success_stage_ids FROM public.company_settings WHERE workspace = 'default' LIMIT 1),
    ARRAY[]::uuid[]
  )
$$;


--
-- Name: get_invoice_assets_storage_diagnostics(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_invoice_assets_storage_diagnostics() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'storage'
    AS $$
DECLARE
  bucket_record record;
  current_user_id uuid := auth.uid();
BEGIN
  SELECT id, public, file_size_limit, allowed_mime_types
  INTO bucket_record
  FROM storage.buckets
  WHERE id = 'invoice-assets';

  RETURN jsonb_build_object(
    'bucket_exists', bucket_record.id IS NOT NULL,
    'bucket_public', COALESCE(bucket_record.public, false),
    'file_size_limit', bucket_record.file_size_limit,
    'allowed_mime_types', bucket_record.allowed_mime_types,
    'current_user_id', current_user_id,
    'can_manage_invoice_settings', public.can_manage_invoice_settings(current_user_id)
  );
END;
$$;


--
-- Name: get_operations_linked_record_summary(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_operations_linked_record_summary(_ops_lead_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  ops record;
  is_admin boolean;
  has_crm_mod boolean;
  has_paid_mod boolean;
  ops_assignment_match boolean := false;
  allowed boolean := false;
  allowed_by text := NULL;
  legacy_match_count int := 0;
  caller_email text;
  caller_name text;
  crm_status text := 'not_linked';
  crm_reason text := 'missing_id';
  crm_data jsonb := NULL;
  paid_status text := 'not_linked';
  paid_reason text := 'missing_id';
  paid_data jsonb := NULL;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT id, assigned_media_buyer_id, assigned_media_buyer_name, created_by,
         crm_lead_id, paid_pipeline_lead_id
    INTO ops
  FROM public.operations_leads
  WHERE id = _ops_lead_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  is_admin := public.has_role(auth.uid(), 'admin'::app_role);

  IF is_admin THEN
    allowed := true; allowed_by := 'admin'; ops_assignment_match := true;
  ELSIF ops.assigned_media_buyer_id = auth.uid() THEN
    allowed := true; allowed_by := 'operations_assignment'; ops_assignment_match := true;
  ELSIF ops.created_by = auth.uid() THEN
    allowed := true; allowed_by := 'creator'; ops_assignment_match := true;
  ELSIF ops.assigned_media_buyer_id IS NULL
        AND ops.assigned_media_buyer_name IS NOT NULL
        AND btrim(ops.assigned_media_buyer_name) <> '' THEN
    -- Legacy fallback: match ops text owner uniquely to caller's profile email/name
    SELECT email, full_name INTO caller_email, caller_name
      FROM public.profiles WHERE id = auth.uid();
    SELECT count(*) INTO legacy_match_count
      FROM public.profiles
     WHERE status = 'active'
       AND (
         lower(coalesce(full_name,'')) = lower(btrim(ops.assigned_media_buyer_name))
         OR lower(coalesce(email,''))     = lower(btrim(ops.assigned_media_buyer_name))
       );
    IF legacy_match_count = 1
       AND (
         lower(coalesce(caller_name,'')) = lower(btrim(ops.assigned_media_buyer_name))
         OR lower(coalesce(caller_email,'')) = lower(btrim(ops.assigned_media_buyer_name))
       ) THEN
      allowed := true; allowed_by := 'legacy_owner_match'; ops_assignment_match := true;
    END IF;
  END IF;

  SELECT is_admin OR EXISTS (
    SELECT 1 FROM public.user_module_access
     WHERE user_id = auth.uid() AND module_key IN ('calling_crm','crm')
  ) INTO has_crm_mod;

  SELECT is_admin OR EXISTS (
    SELECT 1 FROM public.user_module_access
     WHERE user_id = auth.uid() AND module_key IN ('paid_pipeline','paid-pipeline')
  ) INTO has_paid_mod;

  -- CRM side
  IF ops.crm_lead_id IS NULL THEN
    crm_status := 'not_linked'; crm_reason := 'missing_id';
  ELSIF NOT allowed THEN
    crm_status := 'access_restricted'; crm_reason := 'not_assigned_to_operations_lead';
  ELSIF NOT has_crm_mod THEN
    crm_status := 'access_restricted'; crm_reason := 'module_missing';
  ELSE
    SELECT jsonb_build_object(
      'id', l.id,
      'full_name', l.full_name,
      'name', l.full_name,
      'email', l.email,
      'phone', l.phone,
      'pipeline_name', p.name,
      'stage_name', s.name
    ) INTO crm_data
    FROM public.leads l
    LEFT JOIN public.pipelines p ON p.id = l.pipeline_id
    LEFT JOIN public.stages s ON s.id = l.stage_id
    WHERE l.id = ops.crm_lead_id;
    IF crm_data IS NULL THEN
      crm_status := 'not_found'; crm_reason := 'not_found';
    ELSE
      crm_status := 'linked'; crm_reason := NULL;
    END IF;
  END IF;

  -- Paid side
  IF ops.paid_pipeline_lead_id IS NULL THEN
    paid_status := 'not_linked'; paid_reason := 'missing_id';
  ELSIF NOT allowed THEN
    paid_status := 'access_restricted'; paid_reason := 'not_assigned_to_operations_lead';
  ELSIF NOT has_paid_mod THEN
    paid_status := 'access_restricted'; paid_reason := 'module_missing';
  ELSE
    SELECT jsonb_build_object(
      'id', ppl.id,
      'name', ppl.name,
      'email', ppl.email,
      'phone', ppl.phone,
      'pipeline_stage', ppl.pipeline_stage,
      'finance_status', ppl.finance_status,
      'deal_value_including_gst', ppl.deal_value_including_gst,
      'deal_value', ppl.deal_value_including_gst,
      'token_amount_collected', ppl.token_amount_collected,
      'total_collected', ppl.total_collected,
      'collected_amount', ppl.total_collected,
      'balance', ppl.balance_pending,
      'balance_amount', ppl.balance_pending,
      'fully_paid', (COALESCE(ppl.balance_pending, 0) <= 0 AND COALESCE(ppl.total_collected, 0) > 0),
      'payment_status', CASE
        WHEN COALESCE(ppl.balance_pending, 0) <= 0 AND COALESCE(ppl.total_collected, 0) > 0 THEN 'fully_paid'
        WHEN COALESCE(ppl.total_collected, 0) > 0 AND COALESCE(ppl.balance_pending, 0) > 0 THEN 'partial'
        WHEN COALESCE(ppl.token_amount_collected, 0) > 0 THEN 'token_only'
        ELSE 'pending'
      END
    ) INTO paid_data
    FROM public.paid_pipeline_leads ppl
    WHERE ppl.id = ops.paid_pipeline_lead_id;
    IF paid_data IS NULL THEN
      paid_status := 'not_found'; paid_reason := 'not_found';
    ELSE
      paid_status := 'linked'; paid_reason := NULL;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'allowed_by', allowed_by,
    'operations_assignment_match', ops_assignment_match,
    'has_calling_crm_module', has_crm_mod,
    'has_paid_pipeline_module', has_paid_mod,
    'crm_lead_id', ops.crm_lead_id,
    'paid_pipeline_lead_id', ops.paid_pipeline_lead_id,
    'assigned_media_buyer_id', ops.assigned_media_buyer_id,
    'assigned_media_buyer_name', ops.assigned_media_buyer_name,
    'crm',  jsonb_build_object('status', crm_status,  'reason_code', crm_reason,  'data', crm_data),
    'paid', jsonb_build_object('status', paid_status, 'reason_code', paid_reason, 'data', paid_data),
    'crm_legacy', crm_data,
    'paid_legacy', paid_data
  );
END;
$$;


--
-- Name: get_profile_deactivation_details(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_profile_deactivation_details(_user_ids uuid[]) RETURNS TABLE(id uuid, deactivation_reason text, deactivated_by uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT p.id, p.deactivation_reason, p.deactivated_by
  FROM public.profiles p
  WHERE p.id = ANY(_user_ids)
    AND public.has_role(auth.uid(), 'admin'::app_role)
$$;


--
-- Name: get_team_performance_settings(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_team_performance_settings() RETURNS TABLE(auto_checkin_on_login boolean, daily_reminder_enabled boolean, reminder_morning_time time without time zone, reminder_due_soon_minutes integer, reminder_overdue_enabled boolean, active_tracking_enabled boolean, active_minutes_daily_target integer, idle_timeout_minutes integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    COALESCE(team_performance_auto_checkin_on_login, false),
    COALESCE(team_performance_daily_reminder_enabled, false),
    COALESCE(team_performance_reminder_morning_time, '10:00'::time),
    COALESCE(team_performance_reminder_due_soon_minutes, 60),
    COALESCE(team_performance_reminder_overdue_enabled, true),
    COALESCE(team_performance_active_tracking_enabled, false),
    COALESCE(team_performance_active_minutes_daily_target, 360),
    COALESCE(team_performance_idle_timeout_minutes, 5)
  FROM public.company_settings WHERE workspace = 'default' LIMIT 1;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, department, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'Member'),
    NEW.raw_user_meta_data->>'department',
    'pending'
  );
  RETURN NEW;
END $$;


--
-- Name: has_module_access(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_module_access(_user_id uuid, _module_key text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT public.is_active(_user_id) AND (
    public.has_role(_user_id, 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_module_access
      WHERE user_id = _user_id AND module_key = _module_key
    )
  )
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND p.status = 'active'
  )
$$;


--
-- Name: is_active(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_active(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND status = 'active') $$;


--
-- Name: lead_session_attendance_set_key(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lead_session_attendance_set_key() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.session_key := coalesce(NEW.webinar_id,'') || '|' ||
                     coalesce(NEW.session_date::text,'') || '|' ||
                     coalesce(NEW.session_day::text,'0');
  NEW.updated_at := now();
  RETURN NEW;
END $$;


--
-- Name: mav_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mav_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;


--
-- Name: prevent_profile_privilege_escalation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_profile_privilege_escalation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Server-side / service-role contexts have no auth.uid(); allow them.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Admins bypass this check
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.active_for_assignment IS DISTINCT FROM OLD.active_for_assignment
     OR NEW.include_in_round_robin IS DISTINCT FROM OLD.include_in_round_robin
     OR NEW.can_receive_calling_crm_leads IS DISTINCT FROM OLD.can_receive_calling_crm_leads
     OR NEW.can_receive_paid_pipeline_leads IS DISTINCT FROM OLD.can_receive_paid_pipeline_leads
     OR NEW.can_receive_follow_up_tasks IS DISTINCT FROM OLD.can_receive_follow_up_tasks
     OR NEW.can_receive_payment_recovery_leads IS DISTINCT FROM OLD.can_receive_payment_recovery_leads
     OR NEW.can_receive_media_buyer_cases IS DISTINCT FROM OLD.can_receive_media_buyer_cases
     OR NEW.can_receive_operations_leads IS DISTINCT FROM OLD.can_receive_operations_leads
     OR NEW.deactivated_at IS DISTINCT FROM OLD.deactivated_at
     OR NEW.deactivated_by IS DISTINCT FROM OLD.deactivated_by
     OR NEW.deactivation_reason IS DISTINCT FROM OLD.deactivation_reason
  THEN
    RAISE EXCEPTION 'Not authorized to modify privileged profile fields';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: prevent_profile_self_privilege_escalation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_profile_self_privilege_escalation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Server-side / service-role contexts have no auth.uid(); allow them.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  IF auth.uid() = OLD.id THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.active_for_assignment IS DISTINCT FROM OLD.active_for_assignment
       OR NEW.can_receive_calling_crm_leads IS DISTINCT FROM OLD.can_receive_calling_crm_leads
       OR NEW.can_receive_paid_pipeline_leads IS DISTINCT FROM OLD.can_receive_paid_pipeline_leads
       OR NEW.can_receive_follow_up_tasks IS DISTINCT FROM OLD.can_receive_follow_up_tasks
       OR NEW.can_receive_payment_recovery_leads IS DISTINCT FROM OLD.can_receive_payment_recovery_leads
       OR NEW.can_receive_media_buyer_cases IS DISTINCT FROM OLD.can_receive_media_buyer_cases
       OR NEW.can_receive_operations_leads IS DISTINCT FROM OLD.can_receive_operations_leads
       OR NEW.include_in_round_robin IS DISTINCT FROM OLD.include_in_round_robin
       OR NEW.deactivated_at IS DISTINCT FROM OLD.deactivated_at
       OR NEW.deactivated_by IS DISTINCT FROM OLD.deactivated_by
       OR NEW.deactivation_reason IS DISTINCT FROM OLD.deactivation_reason
       OR NEW.department IS DISTINCT FROM OLD.department
       OR NEW.id IS DISTINCT FROM OLD.id
       OR NEW.email IS DISTINCT FROM OLD.email
    THEN
      RAISE EXCEPTION 'Only admins can modify role, status, assignment eligibility, or contact-routing fields on a profile';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: protect_paid_onboarding_crm_lead(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_paid_onboarding_crm_lead() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_old_pipeline_type text := NULL;
  v_new_pipeline_type text := NULL;
  v_intent_archive boolean := false;
  v_intent_soft_delete boolean := false;
BEGIN
  IF NEW.pipeline_id IS NOT NULL THEN
    SELECT type INTO v_new_pipeline_type FROM public.pipelines WHERE id = NEW.pipeline_id;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.pipeline_id IS NOT NULL THEN
    SELECT type INTO v_old_pipeline_type FROM public.pipelines WHERE id = OLD.pipeline_id;
  END IF;

  -- Detect an intentional archive/soft-delete request from the caller.
  -- When the UPDATE explicitly sets archived_at / deleted_at to a non-null value,
  -- we treat it as a deliberate Paid-Onboarding cleanup and allow it through.
  IF TG_OP = 'UPDATE' THEN
    v_intent_archive := (NEW.archived_at IS NOT NULL AND NEW.archived_at IS DISTINCT FROM OLD.archived_at);
    v_intent_soft_delete := (NEW.deleted_at IS NOT NULL AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at);
  END IF;

  -- Once a CRM row is a paid onboarding card, normal CRM imports/updates must not
  -- demote it back to Sales or hide it from the Paid — Onboarding dashboard —
  -- UNLESS the caller is explicitly archiving/soft-deleting it (wrong-batch cleanup).
  IF TG_OP = 'UPDATE'
     AND OLD.paid_pipeline_lead_id IS NOT NULL
     AND (OLD.lead_type = 'paid' OR v_old_pipeline_type = 'paid') THEN
    NEW.pipeline_id := OLD.pipeline_id;
    NEW.stage_id := COALESCE(NEW.stage_id, OLD.stage_id);
    NEW.lead_type := 'paid';
    NEW.paid_pipeline_lead_id := OLD.paid_pipeline_lead_id;

    IF v_intent_archive OR v_intent_soft_delete THEN
      -- Allow the caller's archived_at / deleted_at / hide_from_sales_workload values
      -- to persist. This is the only path Finance Success / Paid Onboarding cleanup uses.
      NULL;
    ELSE
      NEW.hide_from_sales_workload := false;
      NEW.deleted_at := NULL;
      NEW.archived_at := NULL;
    END IF;
  END IF;

  -- Any row currently being saved into Paid — Onboarding must remain visible there —
  -- unless the same UPDATE is the explicit archive/soft-delete cleanup path.
  IF NEW.lead_type = 'paid' OR v_new_pipeline_type = 'paid' THEN
    NEW.lead_type := 'paid';
    IF v_intent_archive OR v_intent_soft_delete THEN
      NULL;
    ELSE
      NEW.hide_from_sales_workload := false;
      NEW.deleted_at := NULL;
      NEW.archived_at := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: purge_old_deleted_reports(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purge_old_deleted_reports() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  cutoff timestamptz := now() - interval '14 days';
  attr_ids uuid[];
  daily_ids uuid[];
  mb_ids uuid[];
  attr_count int := 0;
  daily_count int := 0;
BEGIN
  IF NOT public.is_active(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- Attribution sessions
  SELECT array_agg(id) INTO attr_ids
  FROM public.attribution_sessions
  WHERE is_deleted = true AND deleted_at IS NOT NULL AND deleted_at < cutoff;

  IF attr_ids IS NOT NULL AND array_length(attr_ids, 1) > 0 THEN
    DELETE FROM public.attribution_media_buyers WHERE session_id = ANY(attr_ids);
    DELETE FROM public.attribution_sales_detail WHERE session_id = ANY(attr_ids);
    DELETE FROM public.media_buyer_attribution WHERE session_id = ANY(attr_ids);
    DELETE FROM public.roas_attribution_audit_logs WHERE attribution_session_id = ANY(attr_ids);
    DELETE FROM public.attribution_sessions WHERE id = ANY(attr_ids);
    attr_count := array_length(attr_ids, 1);
  END IF;

  -- Daily lead reports
  SELECT array_agg(id) INTO daily_ids
  FROM public.daily_lead_reports
  WHERE is_deleted = true AND deleted_at IS NOT NULL AND deleted_at < cutoff;

  IF daily_ids IS NOT NULL AND array_length(daily_ids, 1) > 0 THEN
    SELECT array_agg(id) INTO mb_ids
    FROM public.daily_lead_report_media_buyers WHERE report_id = ANY(daily_ids);
    IF mb_ids IS NOT NULL AND array_length(mb_ids, 1) > 0 THEN
      DELETE FROM public.daily_lead_report_ad_accounts WHERE report_media_buyer_id = ANY(mb_ids);
    END IF;
    DELETE FROM public.daily_lead_report_media_buyers WHERE report_id = ANY(daily_ids);
    DELETE FROM public.daily_lead_reports WHERE id = ANY(daily_ids);
    daily_count := array_length(daily_ids, 1);
  END IF;

  RETURN jsonb_build_object(
    'attribution_purged', attr_count,
    'daily_purged', daily_count,
    'cutoff', cutoff
  );
END $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: lead_hotness_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_hotness_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    total_sessions_attended integer DEFAULT 0 NOT NULL,
    total_webinars_attended integer DEFAULT 0 NOT NULL,
    total_attended_minutes integer DEFAULT 0 NOT NULL,
    avg_attendance_percentage numeric(5,2) DEFAULT 0 NOT NULL,
    highest_attendance_percentage numeric(5,2) DEFAULT 0 NOT NULL,
    last_attended_at timestamp with time zone,
    current_hotness text DEFAULT 'inactive'::text NOT NULL,
    score_numeric integer DEFAULT 0 NOT NULL,
    score_reason jsonb DEFAULT '{}'::jsonb NOT NULL,
    manual_override boolean DEFAULT false NOT NULL,
    manual_grade text,
    override_reason text,
    overridden_by uuid,
    overridden_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    total_possible_minutes integer DEFAULT 0 NOT NULL,
    cumulative_attendance_percentage numeric(5,2) DEFAULT 0 NOT NULL,
    CONSTRAINT lead_hotness_scores_current_hotness_check CHECK ((current_hotness = ANY (ARRAY['super_hot'::text, 'hot'::text, 'warm'::text, 'cold'::text, 'inactive'::text]))),
    CONSTRAINT lead_hotness_scores_manual_grade_check CHECK (((manual_grade IS NULL) OR (manual_grade = ANY (ARRAY['super_hot'::text, 'hot'::text, 'warm'::text, 'cold'::text, 'inactive'::text]))))
);


--
-- Name: recalculate_lead_hotness(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recalculate_lead_hotness(_lead_id uuid) RETURNS public.lead_hotness_scores
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_total_sessions int := 0; v_total_webinars int := 0;
  v_total_minutes int := 0; v_total_possible int := 0;
  v_avg_pct numeric(5,2) := 0; v_max_pct numeric(5,2) := 0;
  v_cum_pct numeric(5,2) := 0;
  v_last_at timestamptz := NULL;
  v_score int := 0; v_grade text := 'inactive';
  v_existing public.lead_hotness_scores%ROWTYPE; v_old_grade text := 'inactive';
  v_reason jsonb := '{}'::jsonb;
  v_row public.lead_hotness_scores%ROWTYPE;
BEGIN
  SELECT count(*),
         count(DISTINCT coalesce(webinar_id, webinar_name, id::text)),
         coalesce(sum(attended_minutes_capped),0),
         coalesce(sum(session_duration_minutes),0),
         coalesce(round(avg(nullif(attendance_percentage,0))::numeric,2),0),
         coalesce(max(attendance_percentage),0),
         max(coalesce(last_left_at, first_joined_at, created_at))
  INTO v_total_sessions, v_total_webinars, v_total_minutes, v_total_possible,
       v_avg_pct, v_max_pct, v_last_at
  FROM public.lead_session_attendance WHERE lead_id = _lead_id;

  IF v_total_possible > 0 THEN
    v_cum_pct := round((v_total_minutes::numeric / v_total_possible::numeric) * 100, 2);
  ELSE
    v_cum_pct := 0;
  END IF;

  v_score := round(v_cum_pct)::int;

  -- Spec grade rules based on cumulative %:
  v_grade := CASE
    WHEN v_cum_pct >= 70 THEN 'super_hot'
    WHEN v_cum_pct >= 50 THEN 'hot'
    WHEN v_cum_pct >= 25 THEN 'warm'
    WHEN v_cum_pct >= 1  THEN 'cold'
    ELSE 'inactive'  -- true absentee (0%)
  END;

  v_reason := jsonb_build_object(
    'cumulative_pct', v_cum_pct,
    'total_attended', v_total_minutes,
    'total_possible', v_total_possible,
    'sessions', v_total_sessions,
    'computed_at', now()
  );

  SELECT * INTO v_existing FROM public.lead_hotness_scores WHERE lead_id = _lead_id;
  IF FOUND THEN v_old_grade := v_existing.current_hotness; END IF;

  INSERT INTO public.lead_hotness_scores (
    lead_id,total_sessions_attended,total_webinars_attended,total_attended_minutes,
    total_possible_minutes, cumulative_attendance_percentage,
    avg_attendance_percentage,highest_attendance_percentage,last_attended_at,
    current_hotness,score_numeric,score_reason,updated_at
  ) VALUES (
    _lead_id,v_total_sessions,v_total_webinars,v_total_minutes,
    v_total_possible, v_cum_pct,
    v_avg_pct,v_max_pct,v_last_at,v_grade,v_score,v_reason,now()
  )
  ON CONFLICT (lead_id) DO UPDATE SET
    total_sessions_attended = EXCLUDED.total_sessions_attended,
    total_webinars_attended = EXCLUDED.total_webinars_attended,
    total_attended_minutes  = EXCLUDED.total_attended_minutes,
    total_possible_minutes  = EXCLUDED.total_possible_minutes,
    cumulative_attendance_percentage = EXCLUDED.cumulative_attendance_percentage,
    avg_attendance_percentage = EXCLUDED.avg_attendance_percentage,
    highest_attendance_percentage = EXCLUDED.highest_attendance_percentage,
    last_attended_at = EXCLUDED.last_attended_at,
    current_hotness = CASE WHEN public.lead_hotness_scores.manual_override
                           THEN public.lead_hotness_scores.current_hotness
                           ELSE EXCLUDED.current_hotness END,
    score_numeric = EXCLUDED.score_numeric,
    score_reason = EXCLUDED.score_reason,
    updated_at = now()
  RETURNING * INTO v_row;

  BEGIN
    INSERT INTO public.activity_logs (lead_id, action_type, details)
    VALUES (_lead_id, 'lead_hotness_recalculated',
      jsonb_build_object('old',v_old_grade,'new',v_grade,'cumulative_pct',v_cum_pct,'reason',v_reason));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v_row;
END $$;


--
-- Name: record_active_minute(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_active_minute() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _uid uuid := auth.uid();
  _enabled boolean;
  _work_date date := (now() AT TIME ZONE 'utc')::date;
  _sess_id uuid;
  _last timestamptz;
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;
  SELECT COALESCE(team_performance_active_tracking_enabled, false)
    INTO _enabled
    FROM public.company_settings WHERE workspace = 'default' LIMIT 1;
  IF NOT COALESCE(_enabled, false) THEN RETURN; END IF;

  SELECT id, last_activity_at INTO _sess_id, _last
    FROM public.attendance_sessions
    WHERE user_id = _uid AND work_date = _work_date
    LIMIT 1;
  IF _sess_id IS NULL THEN RETURN; END IF;

  IF _last IS NULL OR now() - _last >= interval '55 seconds' THEN
    UPDATE public.attendance_sessions
      SET active_minutes = COALESCE(active_minutes, 0) + 1,
          last_activity_at = now(),
          activity_source = 'heartbeat'
      WHERE id = _sess_id;
  END IF;
END;
$$;


--
-- Name: search_students(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_students(_q text, _limit integer DEFAULT 50) RETURNS TABLE(full_name text, email text, phone text, source text, tier text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  term text := lower(coalesce(_q,''));
BEGIN
  IF NOT public.is_active(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF length(trim(term)) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH matches AS (
    SELECT s.full_name, s.email, s.phone, s.source
    FROM public.students s
    WHERE s.search_text ILIKE '%' || term || '%'
  ),
  grouped AS (
    SELECT
      COALESCE(NULLIF(m.email,''), '') AS email_k,
      COALESCE(NULLIF(m.phone,''), '') AS phone_k,
      MAX(m.full_name) AS full_name,
      MAX(m.email) AS email,
      MAX(m.phone) AS phone,
      bool_or(m.source = 'diamond') AS is_diamond,
      string_agg(DISTINCT m.source, ',') AS sources
    FROM matches m
    GROUP BY COALESCE(NULLIF(m.email,''), ''), COALESCE(NULLIF(m.phone,''), '')
  ),
  enriched AS (
    SELECT
      g.full_name,
      g.email,
      g.phone,
      g.sources AS source,
      CASE
        WHEN g.is_diamond THEN 'diamond'
        WHEN EXISTS (
          SELECT 1 FROM public.students d
          WHERE d.source = 'diamond'
            AND (
              (g.email_k <> '' AND lower(d.email) = lower(g.email_k))
              OR (g.phone_k <> '' AND d.phone = g.phone_k)
            )
        ) THEN 'diamond'
        ELSE 'silver'
      END AS tier
    FROM grouped g
  )
  SELECT e.full_name, e.email, e.phone, e.source, e.tier
  FROM enriched e
  ORDER BY (e.tier = 'diamond') DESC, e.full_name NULLS LAST
  LIMIT GREATEST(1, LEAST(_limit, 200));
END $$;


--
-- Name: set_updated_at_ppb(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at_ppb() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;


--
-- Name: students_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.students_count() RETURNS bigint
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE c bigint;
BEGIN
  IF NOT public.is_active(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT count(*) INTO c FROM public.students;
  RETURN c;
END $$;


--
-- Name: sync_crm_owner_to_paid_pipeline(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_crm_owner_to_paid_pipeline() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id THEN
    UPDATE public.paid_pipeline_leads p
       SET assigned_sales_executive = NEW.assigned_agent_id
     WHERE p.crm_lead_id = NEW.id
       AND (
         p.assigned_sales_executive IS NULL
         OR p.assigned_sales_executive IS NOT DISTINCT FROM OLD.assigned_agent_id
       );
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: tasks_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tasks_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


--
-- Name: test_paid_archive_trigger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.test_paid_archive_trigger() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_lead_id uuid;
  v_paid_pipe_id uuid;
  v_new_archived timestamptz;
  v_lead_type text;
  v_paid_link uuid;
  v_result jsonb;
BEGIN
  -- Allow when called from a server-side shell (no auth.uid()), otherwise admin only.
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not authorized: admin only';
  END IF;

  SELECT id INTO v_paid_pipe_id
  FROM public.pipelines
  WHERE type = 'paid' AND name ILIKE '%onboarding%'
  ORDER BY position
  LIMIT 1;

  IF v_paid_pipe_id IS NULL THEN
    RETURN jsonb_build_object('passed', false, 'reason', 'no Paid — Onboarding pipeline found');
  END IF;

  SELECT id INTO v_lead_id
  FROM public.leads
  WHERE pipeline_id = v_paid_pipe_id
    AND paid_pipeline_lead_id IS NOT NULL
    AND archived_at IS NULL
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_lead_id IS NULL THEN
    RETURN jsonb_build_object('passed', false, 'reason', 'no active paid-linked CRM lead available to test');
  END IF;

  BEGIN
    UPDATE public.leads SET archived_at = now() WHERE id = v_lead_id;

    SELECT archived_at, lead_type, paid_pipeline_lead_id
      INTO v_new_archived, v_lead_type, v_paid_link
    FROM public.leads WHERE id = v_lead_id;

    v_result := jsonb_build_object(
      'passed', (v_new_archived IS NOT NULL AND v_lead_type = 'paid' AND v_paid_link IS NOT NULL),
      'lead_id', v_lead_id,
      'archived_at_after_update', v_new_archived,
      'lead_type_after_update', v_lead_type,
      'paid_link_preserved', v_paid_link IS NOT NULL,
      'reason', CASE
        WHEN v_new_archived IS NULL THEN 'trigger reverted archived_at to NULL'
        WHEN v_lead_type <> 'paid' THEN 'lead_type changed away from paid'
        WHEN v_paid_link IS NULL THEN 'paid_pipeline_lead_id was cleared'
        ELSE 'ok'
      END
    );

    RAISE EXCEPTION 'ROLLBACK_TEST' USING ERRCODE = 'P0001';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    NULL;
  END;

  RETURN v_result;
END;
$$;


--
-- Name: tg_business_units_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_business_units_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;


--
-- Name: touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;


--
-- Name: tp_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tp_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;


--
-- Name: tpr_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tpr_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;


--
-- Name: lead_session_attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_session_attendance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    batch_id uuid,
    webinar_id text,
    webinar_name text,
    session_name text,
    session_date date,
    session_day integer,
    session_duration_minutes integer DEFAULT 60 NOT NULL,
    attended_minutes_raw integer DEFAULT 0 NOT NULL,
    attended_minutes_capped integer DEFAULT 0 NOT NULL,
    attendance_percentage numeric(5,2) DEFAULT 0 NOT NULL,
    join_count integer DEFAULT 1 NOT NULL,
    first_joined_at timestamp with time zone,
    last_left_at timestamp with time zone,
    attendance_grade text DEFAULT 'absent'::text NOT NULL,
    source text DEFAULT 'csv'::text NOT NULL,
    raw_identity_key text,
    normalized_email text,
    normalized_phone text,
    metadata_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    session_key text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lead_session_attendance_attendance_grade_check CHECK ((attendance_grade = ANY (ARRAY['hot'::text, 'warm'::text, 'cold'::text, 'absent'::text]))),
    CONSTRAINT lead_session_attendance_source_check CHECK ((source = ANY (ARRAY['zoom'::text, 'csv'::text, 'google_sheet'::text, 'manual'::text])))
);


--
-- Name: upsert_lead_session_attendance(uuid, uuid, text, text, text, date, integer, integer, integer, integer, timestamp with time zone, timestamp with time zone, text, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_lead_session_attendance(_lead_id uuid, _batch_id uuid, _webinar_id text, _webinar_name text, _session_name text, _session_date date, _session_day integer, _session_duration_minutes integer, _attended_minutes_raw integer, _join_count integer, _first_joined_at timestamp with time zone, _last_left_at timestamp with time zone, _source text, _normalized_email text, _normalized_phone text, _raw_identity_key text, _metadata jsonb DEFAULT '{}'::jsonb) RETURNS public.lead_session_attendance
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_existing public.lead_session_attendance%ROWTYPE;
  v_row public.lead_session_attendance%ROWTYPE;
  v_key text;
  v_duration int := GREATEST(1, coalesce(_session_duration_minutes, 60));
  v_capped int; v_pct numeric(5,2); v_grade text;
BEGIN
  v_key := coalesce(_webinar_id,'') || '|' ||
           coalesce(_session_date::text,'') || '|' ||
           coalesce(_session_day::text,'0');

  SELECT * INTO v_existing FROM public.lead_session_attendance
   WHERE lead_id = _lead_id AND session_key = v_key;

  IF FOUND THEN
    v_existing.attended_minutes_raw := v_existing.attended_minutes_raw + coalesce(_attended_minutes_raw,0);
    v_existing.join_count := v_existing.join_count + GREATEST(1, coalesce(_join_count,1));
    IF _first_joined_at IS NOT NULL AND (v_existing.first_joined_at IS NULL OR _first_joined_at < v_existing.first_joined_at) THEN
      v_existing.first_joined_at := _first_joined_at;
    END IF;
    IF _last_left_at IS NOT NULL AND (v_existing.last_left_at IS NULL OR _last_left_at > v_existing.last_left_at) THEN
      v_existing.last_left_at := _last_left_at;
    END IF;
    v_capped := LEAST(v_existing.attended_minutes_raw, v_duration);
    v_pct := round((v_capped::numeric / v_duration::numeric) * 100, 2);
    v_grade := CASE WHEN v_pct >= 60 THEN 'hot' WHEN v_pct >= 30 THEN 'warm' WHEN v_pct >= 1 THEN 'cold' ELSE 'absent' END;

    UPDATE public.lead_session_attendance SET
      attended_minutes_raw = v_existing.attended_minutes_raw,
      attended_minutes_capped = v_capped,
      attendance_percentage = v_pct,
      join_count = v_existing.join_count,
      first_joined_at = v_existing.first_joined_at,
      last_left_at = v_existing.last_left_at,
      attendance_grade = v_grade,
      session_duration_minutes = v_duration,
      webinar_name = coalesce(_webinar_name, webinar_name),
      session_name = coalesce(_session_name, session_name),
      normalized_email = coalesce(_normalized_email, normalized_email),
      normalized_phone = coalesce(_normalized_phone, normalized_phone),
      raw_identity_key = coalesce(_raw_identity_key, raw_identity_key),
      source = coalesce(_source, source),
      metadata_json = metadata_json || coalesce(_metadata,'{}'::jsonb)
    WHERE id = v_existing.id RETURNING * INTO v_row;

    BEGIN
      INSERT INTO public.activity_logs (lead_id, action_type, details)
      VALUES (_lead_id, 'duplicate_session_rows_merged',
        jsonb_build_object('attendance_id',v_row.id,'join_count',v_row.join_count,'attended_minutes',v_capped,'percentage',v_pct));
      INSERT INTO public.activity_logs (lead_id, action_type, details)
      VALUES (_lead_id, 'lead_attendance_timeline_updated',
        jsonb_build_object('attendance_id',v_row.id,'webinar',coalesce(_webinar_name,_webinar_id),'grade',v_grade));
    EXCEPTION WHEN OTHERS THEN NULL; END;
  ELSE
    v_capped := LEAST(coalesce(_attended_minutes_raw,0), v_duration);
    v_pct := round((v_capped::numeric / v_duration::numeric) * 100, 2);
    v_grade := CASE WHEN v_pct >= 60 THEN 'hot' WHEN v_pct >= 30 THEN 'warm' WHEN v_pct >= 1 THEN 'cold' ELSE 'absent' END;

    INSERT INTO public.lead_session_attendance (
      lead_id,batch_id,webinar_id,webinar_name,session_name,session_date,session_day,
      session_duration_minutes,attended_minutes_raw,attended_minutes_capped,attendance_percentage,
      join_count,first_joined_at,last_left_at,attendance_grade,source,
      raw_identity_key,normalized_email,normalized_phone,metadata_json
    ) VALUES (
      _lead_id,_batch_id,_webinar_id,_webinar_name,_session_name,_session_date,_session_day,
      v_duration,coalesce(_attended_minutes_raw,0),v_capped,v_pct,
      GREATEST(1, coalesce(_join_count,1)),_first_joined_at,_last_left_at,v_grade,coalesce(_source,'csv'),
      _raw_identity_key,_normalized_email,_normalized_phone,coalesce(_metadata,'{}'::jsonb)
    ) RETURNING * INTO v_row;

    BEGIN
      INSERT INTO public.activity_logs (lead_id, action_type, details)
      VALUES (_lead_id, 'lead_attendance_timeline_created',
        jsonb_build_object('attendance_id',v_row.id,'webinar',coalesce(_webinar_name,_webinar_id),
                           'attended_minutes',v_capped,'percentage',v_pct,'grade',v_grade));
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  PERFORM public.recalculate_lead_hotness(_lead_id);
  RETURN v_row;
END $$;


--
-- Name: access_readiness_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.access_readiness_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    paid_pipeline_lead_id uuid NOT NULL,
    action text NOT NULL,
    previous_status text,
    new_status text,
    channel text,
    note text,
    blocker_reason text,
    performed_by uuid,
    performed_by_name text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: access_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.access_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    module_keys text[] DEFAULT '{}'::text[] NOT NULL,
    grants_admin boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: activity_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    agent_id uuid,
    agent_name text,
    channel public.activity_channel DEFAULT 'note'::public.activity_channel NOT NULL,
    note text NOT NULL,
    logged_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.announcements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    tag_type public.announcement_tag DEFAULT 'info'::public.announcement_tag NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    setting_group text NOT NULL,
    setting_key text NOT NULL,
    setting_value jsonb,
    business_unit text,
    is_active boolean DEFAULT true NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);


--
-- Name: attendance_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    full_name text NOT NULL,
    role text NOT NULL,
    login_time timestamp with time zone DEFAULT now() NOT NULL,
    login_date date DEFAULT CURRENT_DATE NOT NULL
);


--
-- Name: attendance_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    work_date date NOT NULL,
    check_in_at timestamp with time zone,
    check_out_at timestamp with time zone,
    total_minutes integer,
    source text DEFAULT 'manual'::text NOT NULL,
    status text DEFAULT 'present'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    active_minutes integer DEFAULT 0 NOT NULL,
    idle_minutes integer DEFAULT 0 NOT NULL,
    last_activity_at timestamp with time zone,
    activity_source text,
    CONSTRAINT attendance_sessions_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'login'::text, 'admin'::text, 'system'::text]))),
    CONSTRAINT attendance_sessions_status_check CHECK ((status = ANY (ARRAY['present'::text, 'absent'::text, 'late'::text, 'half_day'::text, 'leave'::text])))
);


--
-- Name: attribution_attendee_lists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attribution_attendee_lists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    slot_type text NOT NULL,
    slot_label text NOT NULL,
    slot_date date,
    slot_order integer DEFAULT 0 NOT NULL,
    source_kind text NOT NULL,
    file_path text,
    file_name text,
    file_size_bytes bigint,
    sheet_url text,
    sheet_id text,
    tab_name text,
    tab_gid text,
    headers jsonb,
    row_count integer DEFAULT 0 NOT NULL,
    parsed_rows jsonb,
    column_mapping jsonb,
    notes text,
    uploaded_by uuid,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT attribution_attendee_lists_slot_type_check CHECK ((slot_type = ANY (ARRAY['day'::text, 'sales_pitch'::text]))),
    CONSTRAINT attribution_attendee_lists_source_kind_check CHECK ((source_kind = ANY (ARRAY['csv_upload'::text, 'google_sheet'::text])))
);


--
-- Name: attribution_media_buyers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attribution_media_buyers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    media_buyer_name text NOT NULL,
    ad_spend numeric DEFAULT 0 NOT NULL,
    total_leads integer DEFAULT 0 NOT NULL,
    matched_sales integer DEFAULT 0 NOT NULL,
    revenue numeric DEFAULT 0 NOT NULL,
    roas_value numeric DEFAULT 0 NOT NULL,
    cpl numeric DEFAULT 0 NOT NULL,
    conversion_rate numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    source_tab_name text,
    source_tab_gid text,
    source_type text DEFAULT 'manual_upload'::text NOT NULL,
    source_sheet_id text,
    entered_ad_spend numeric,
    net_ad_spend numeric,
    gst_amount numeric,
    gross_ad_spend numeric,
    ad_spend_tax_mode text,
    gst_rate numeric,
    revenue_gross numeric,
    revenue_net numeric,
    revenue_gst numeric,
    token_collected numeric
);


--
-- Name: attribution_sales_detail; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attribution_sales_detail (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    buyer_name text,
    email text,
    phone text,
    attributed_to text,
    match_method text,
    revenue numeric DEFAULT 0 NOT NULL,
    webinar_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    source_sales_tab_name text,
    source_sales_tab_gid text,
    source_type text DEFAULT 'manual_upload'::text NOT NULL,
    source_sales_sheet_id text,
    sale_id text,
    matched_lead_id text,
    matched_lead_name text,
    matched_lead_email text,
    matched_lead_phone text,
    source_media_buyer text,
    source_row_index integer,
    confidence_score numeric,
    competing_matches jsonb,
    match_reason text,
    needs_review boolean DEFAULT false,
    revenue_gross numeric,
    revenue_net numeric,
    revenue_gst numeric,
    token_collected numeric
);


--
-- Name: attribution_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attribution_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    webinar_name text NOT NULL,
    webinar_date date,
    webinar_type text,
    total_leads integer DEFAULT 0 NOT NULL,
    total_sales integer DEFAULT 0 NOT NULL,
    total_ad_spend numeric DEFAULT 0 NOT NULL,
    total_revenue numeric DEFAULT 0 NOT NULL,
    overall_roas numeric DEFAULT 0 NOT NULL,
    unmatched_count integer DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    calculation_method text DEFAULT 'manual'::text NOT NULL,
    master_sheet_id uuid,
    fetch_log_id uuid,
    master_sheet_url text,
    master_sheet_title text,
    webinar_date_mode text,
    webinar_single_date date,
    webinar_start_date date,
    webinar_end_date date,
    webinar_dates jsonb,
    webinar_timing jsonb,
    webinar_format text,
    webinar_operator text,
    session_slot text,
    webinar_platform text,
    zoom_account_used text,
    webinar_notes text,
    tab_role_mapping jsonb,
    column_mapping jsonb,
    result_status text DEFAULT 'fresh'::text,
    calculation_id text,
    input_snapshot_hash text,
    output_hash text,
    media_buyer_order jsonb,
    column_mappings_used jsonb,
    duplicate_conflicts_count integer DEFAULT 0,
    attribution_engine_version text DEFAULT 'deterministic_v1'::text,
    saved_from_draft_id uuid,
    calculation_display_method text,
    is_deleted boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    updated_at timestamp with time zone,
    ad_spend_tax_mode text,
    gst_rate numeric,
    roas_spend_basis text,
    total_net_ad_spend numeric,
    total_gst_amount numeric,
    total_gross_ad_spend numeric,
    revenue_mode text,
    product_name text,
    product_price numeric,
    product_gst_mode text,
    product_gst_percent numeric,
    roas_revenue_basis text,
    revenue_per_sale_gross numeric,
    revenue_per_sale_net numeric,
    total_gross_revenue numeric,
    total_net_revenue numeric,
    total_revenue_gst numeric,
    total_token_collected numeric
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    module_key text,
    module_label text,
    action_type text NOT NULL,
    action_label text,
    entity_type text,
    entity_id uuid,
    entity_label text,
    actor_user_id uuid,
    actor_name text,
    actor_email text,
    target_user_id uuid,
    target_name text,
    old_values jsonb,
    new_values jsonb,
    metadata jsonb,
    severity text DEFAULT 'info'::text NOT NULL,
    source text DEFAULT 'app'::text NOT NULL,
    summary text,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: business_units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_units (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    program_key text,
    description text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: code_of_conduct_automation_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.code_of_conduct_automation_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid,
    rule_id uuid,
    event_type text NOT NULL,
    crm_lead_id uuid,
    paid_pipeline_lead_id uuid,
    old_pipeline_id uuid,
    old_stage_id uuid,
    new_pipeline_id uuid,
    new_stage_id uuid,
    status text NOT NULL,
    skip_reason text,
    error_message text,
    metadata jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT code_of_conduct_automation_events_status_check CHECK ((status = ANY (ARRAY['applied'::text, 'skipped'::text, 'failed'::text])))
);


--
-- Name: code_of_conduct_automation_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.code_of_conduct_automation_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    event_type text DEFAULT 'email_sent'::text NOT NULL,
    template_id uuid,
    source_type text DEFAULT 'both'::text NOT NULL,
    current_pipeline_id uuid,
    current_stage_id uuid,
    destination_pipeline_id uuid NOT NULL,
    destination_stage_id uuid NOT NULL,
    also_update_paid_pipeline_stage boolean DEFAULT false NOT NULL,
    destination_paid_pipeline_stage text,
    allow_repeat boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT code_of_conduct_automation_rules_source_type_check CHECK ((source_type = ANY (ARRAY['crm'::text, 'paid_pipeline'::text, 'both'::text])))
);


--
-- Name: code_of_conduct_email_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.code_of_conduct_email_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    condition_key text NOT NULL,
    condition_name text NOT NULL,
    subject text DEFAULT ''::text NOT NULL,
    html_body text DEFAULT ''::text NOT NULL,
    text_body text,
    is_active boolean DEFAULT true NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: code_of_conduct_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.code_of_conduct_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid,
    event_type text NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);


--
-- Name: code_of_conduct_guide_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.code_of_conduct_guide_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    video_id text,
    percent_watched numeric(5,2) DEFAULT 0 NOT NULL,
    completed_at timestamp with time zone,
    last_event_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: code_of_conduct_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.code_of_conduct_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid,
    template_version text,
    crm_lead_id uuid,
    paid_pipeline_lead_id uuid,
    member_name text NOT NULL,
    member_email text NOT NULL,
    member_phone text,
    program_name text,
    deal_value numeric,
    status text DEFAULT 'draft'::text NOT NULL,
    token_hash text,
    token_expires_at timestamp with time zone,
    sent_at timestamp with time zone,
    viewed_at timestamp with time zone,
    signed_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    cancelled_reason text,
    signed_pdf_url text,
    signature_name text,
    signature_data_url text,
    acknowledgement_ip text,
    acknowledgement_user_agent text,
    acknowledgement_email text,
    acknowledgement_checkbox boolean DEFAULT false NOT NULL,
    whatsapp_redirect_opened_at timestamp with time zone,
    email_error text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_email_error text,
    last_email_error_code text,
    last_email_attempt_at timestamp with time zone,
    provider_message_id text,
    signed_receipt_url text,
    signed_html_url text,
    signed_receipt_generated_at timestamp with time zone,
    admin_copy_email_sent_at timestamp with time zone,
    member_copy_email_sent_at timestamp with time zone,
    corrected_contact_email text,
    email_change_history jsonb DEFAULT '[]'::jsonb NOT NULL,
    signed_member_email text,
    signed_member_name text,
    acknowledgement_checklist jsonb,
    signed_pdf_generated_at timestamp with time zone,
    signed_pdf_generation_error text,
    first_opened_at timestamp with time zone,
    last_opened_at timestamp with time zone,
    open_count integer DEFAULT 0 NOT NULL,
    bonus_email_sent_at timestamp with time zone,
    last_bonus_email_resent_at timestamp with time zone,
    bonus_email_template_version integer,
    bonus_terms_accepted_at timestamp with time zone,
    bonus_terms_version_accepted integer,
    bonus_terms_text_snapshot text,
    bonus_email_last_error text,
    bonus_email_last_error_at timestamp with time zone,
    bonus_terms_accepted_ip text,
    bonus_terms_accepted_user_agent text,
    email_status text,
    email_sent_at timestamp with time zone,
    email_sent_to text,
    email_last_error_at timestamp with time zone,
    email_attempt_count integer DEFAULT 0 NOT NULL,
    previous_token_hash text,
    previous_token_expires_at timestamp with time zone,
    re_signature_for_request_id uuid,
    re_signature_reason text,
    re_signature_requested_at timestamp with time zone,
    re_signature_requested_by uuid,
    process_started_at timestamp with time zone,
    process_completed_at timestamp with time zone,
    completion_duration_hours numeric,
    completion_duration_days integer,
    completion_selection text,
    completion_condition_key text,
    email_variant_id uuid,
    email_variant_version integer,
    email_subject_snapshot text,
    email_body_snapshot text,
    timing_override_reason text
);


--
-- Name: code_of_conduct_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.code_of_conduct_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    source text NOT NULL,
    pipeline_id uuid NOT NULL,
    stage_id uuid NOT NULL,
    template_id uuid NOT NULL,
    mode text DEFAULT 'suggest_only'::text NOT NULL,
    link_expiry_days integer DEFAULT 7 NOT NULL,
    tag_id_after_signed uuid,
    stage_id_after_signed uuid,
    notify_admin boolean DEFAULT true NOT NULL,
    notify_owner boolean DEFAULT true NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT code_of_conduct_rules_mode_check CHECK ((mode = ANY (ARRAY['suggest_only'::text, 'auto_send'::text]))),
    CONSTRAINT code_of_conduct_rules_source_check CHECK ((source = ANY (ARRAY['crm'::text, 'paid_pipeline'::text])))
);


--
-- Name: code_of_conduct_suggestion_ignores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.code_of_conduct_suggestion_ignores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rule_id uuid NOT NULL,
    stage_id uuid,
    crm_lead_id uuid,
    paid_pipeline_lead_id uuid,
    ignored_by uuid,
    ignored_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT code_of_conduct_suggestion_ignores_check CHECK (((crm_lead_id IS NOT NULL) OR (paid_pipeline_lead_id IS NOT NULL)))
);


--
-- Name: code_of_conduct_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.code_of_conduct_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    program_name text,
    document_title text DEFAULT 'Code of Conduct'::text NOT NULL,
    party_a_name text DEFAULT 'India Photographers'' Club'::text NOT NULL,
    template_pdf_url text,
    html_content text,
    version text DEFAULT '1.0'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    whatsapp_redirect_url text,
    success_page_message text,
    from_email text,
    from_name text,
    email_subject text,
    email_body text,
    expiry_days integer DEFAULT 7 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    reply_to_email text,
    test_recipient_email text,
    signed_copy_recipient_emails text[] DEFAULT '{}'::text[],
    send_signed_copy_to_member boolean DEFAULT true NOT NULL,
    pdf_signature_page_number integer,
    pdf_signature_name_x numeric DEFAULT 150,
    pdf_signature_name_y numeric DEFAULT 180,
    pdf_signature_image_x numeric DEFAULT 150,
    pdf_signature_image_y numeric DEFAULT 110,
    pdf_signature_image_width numeric DEFAULT 220,
    pdf_signature_image_height numeric DEFAULT 70,
    pdf_signature_date_x numeric DEFAULT 150,
    pdf_signature_date_y numeric DEFAULT 70,
    pdf_signature_font_size numeric DEFAULT 11
);


--
-- Name: company_role_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_role_catalog (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role_key text NOT NULL,
    role_label text NOT NULL,
    department text,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: company_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace text DEFAULT 'default'::text NOT NULL,
    legal_name text,
    brand_name text,
    business_type text,
    company_id text,
    gstin text,
    pan text,
    address text,
    city text,
    state text,
    state_code text,
    country text DEFAULT 'India'::text,
    phone text,
    email text,
    website text,
    logo_url text,
    accent_color text DEFAULT '#111827'::text,
    signature_url text,
    stamp_url text,
    bank_account_name text,
    bank_account_number text,
    bank_ifsc text,
    bank_account_type text,
    bank_name text,
    bank_branch text,
    upi_id text,
    sender_name text,
    sender_email text,
    reply_to_email text,
    support_email text,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    logo_path text,
    signature_path text,
    stamp_path text,
    guide_video_provider text DEFAULT 'wistia'::text NOT NULL,
    guide_video_id text,
    guide_video_title text,
    guide_video_required_percent integer DEFAULT 95 NOT NULL,
    guide_video_is_active boolean DEFAULT true NOT NULL,
    finance_success_stage_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    finance_dead_stage_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    coc_link_opened_stage_id uuid,
    coc_access_done_stage_id uuid,
    coc_auto_move_link_opened boolean DEFAULT true NOT NULL,
    coc_auto_move_access_done boolean DEFAULT false NOT NULL,
    bonus_email_auto_send boolean DEFAULT true NOT NULL,
    bonus_email_subject text DEFAULT 'Your Special Bonuses Are Now Activated'::text,
    bonus_email_body text DEFAULT 'Hi {{member_name}},

Welcome aboard! Your IPC Diamond Membership bonuses are now active.

Activation date: {{activation_date}}
Subscription: {{subscription_duration}}

Your bonus resources are listed below. If you need any help, write to {{support_email}}.

Regards,
Team IPC'::text,
    bonus_email_support_email text DEFAULT 'support@ipcindiaacademy.in'::text,
    bonus_email_subscription_duration text DEFAULT '2 years from the date of activation'::text,
    bonus_resources jsonb DEFAULT '[]'::jsonb NOT NULL,
    bonus_terms_text text DEFAULT ''::text,
    bonus_terms_version integer DEFAULT 1 NOT NULL,
    bonus_terms_updated_at timestamp with time zone,
    operations_readiness_target_stage_id uuid,
    operations_readiness_auto_move boolean DEFAULT false NOT NULL,
    operations_sla_watch_days integer DEFAULT 3 NOT NULL,
    operations_sla_overdue_days integer DEFAULT 6 NOT NULL,
    team_performance_auto_checkin_on_login boolean DEFAULT false NOT NULL,
    team_performance_daily_reminder_enabled boolean DEFAULT false NOT NULL,
    team_performance_reminder_morning_time time without time zone DEFAULT '10:00:00'::time without time zone NOT NULL,
    team_performance_reminder_due_soon_minutes integer DEFAULT 60 NOT NULL,
    team_performance_reminder_overdue_enabled boolean DEFAULT true NOT NULL,
    team_performance_active_tracking_enabled boolean DEFAULT false NOT NULL,
    team_performance_active_minutes_daily_target integer DEFAULT 360 NOT NULL,
    team_performance_idle_timeout_minutes integer DEFAULT 5 NOT NULL
);


--
-- Name: crm_batch_archives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_batch_archives (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pipeline_id uuid,
    batch_name text NOT NULL,
    batch_date date,
    archived_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_by uuid,
    archive_reason text,
    affected_lead_count integer DEFAULT 0 NOT NULL,
    restored_at timestamp with time zone,
    restored_by uuid
);


--
-- Name: crm_conversion_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_conversion_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text DEFAULT 'Default rule'::text NOT NULL,
    source_pipeline_id uuid,
    trigger_stage_names text[] DEFAULT ARRAY['Conversion Successful'::text, 'Payment Confirmed'::text, 'Closed Won'::text] NOT NULL,
    trigger_stage_ids uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
    destination_pipeline_id uuid,
    destination_stage_id uuid,
    create_paid_buyer boolean DEFAULT true NOT NULL,
    hide_from_sales_workload boolean DEFAULT true NOT NULL,
    deassign_original boolean DEFAULT false NOT NULL,
    owner_policy text DEFAULT 'same'::text NOT NULL,
    default_owner_id uuid,
    tag_after_conversion text,
    followup_default text DEFAULT 'keep'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_conversion_rules_followup_default_check CHECK ((followup_default = ANY (ARRAY['keep'::text, 'copy'::text, 'move'::text, 'done'::text]))),
    CONSTRAINT crm_conversion_rules_owner_policy_check CHECK ((owner_policy = ANY (ARRAY['same'::text, 'selected'::text, 'unassigned'::text])))
);


--
-- Name: crm_lead_conversions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_lead_conversions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_lead_id uuid NOT NULL,
    destination_crm_lead_id uuid,
    paid_pipeline_lead_id uuid,
    conversion_type text NOT NULL,
    source_pipeline_id uuid,
    source_stage_id uuid,
    destination_pipeline_id uuid,
    destination_stage_id uuid,
    program_name text,
    deal_value numeric,
    token_amount numeric,
    total_collected numeric,
    balance_pending numeric,
    assigned_owner_id uuid,
    status text DEFAULT 'success'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata_json jsonb
);


--
-- Name: daily_custom_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_custom_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    metric_name text NOT NULL,
    metric_key text NOT NULL,
    metric_type text NOT NULL,
    aggregation_method text DEFAULT 'display_only'::text NOT NULL,
    show_in_whatsapp boolean DEFAULT true NOT NULL,
    show_in_exports boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: daily_lead_report_ad_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_lead_report_ad_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_media_buyer_id uuid NOT NULL,
    ad_account_name text NOT NULL,
    ad_spend numeric DEFAULT 0 NOT NULL,
    metrics jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: daily_lead_report_media_buyers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_lead_report_media_buyers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_id uuid NOT NULL,
    media_buyer_name text NOT NULL,
    media_buyer_key text,
    lead_source_url text,
    spreadsheet_id text,
    spreadsheet_title text,
    tab_name text,
    sheet_id text,
    date_column text,
    total_leads integer DEFAULT 0 NOT NULL,
    lead_count_source text DEFAULT 'google_sheet'::text NOT NULL,
    total_ad_spend numeric DEFAULT 0 NOT NULL,
    cpl numeric DEFAULT 0 NOT NULL,
    status text DEFAULT 'ready'::text NOT NULL,
    fetch_metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_manual_lead_override boolean DEFAULT false NOT NULL
);


--
-- Name: daily_lead_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_lead_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_name text,
    report_date date NOT NULL,
    notes text,
    metric_template_id uuid,
    total_ad_spend numeric DEFAULT 0 NOT NULL,
    total_leads integer DEFAULT 0 NOT NULL,
    overall_cpl numeric DEFAULT 0 NOT NULL,
    whatsapp_message text,
    input_hash text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    report_status text DEFAULT 'saved'::text NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid
);


--
-- Name: daily_lead_source_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_lead_source_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    media_buyer_name text NOT NULL,
    lead_source_name text,
    sheet_url text NOT NULL,
    spreadsheet_id text,
    spreadsheet_title text,
    tab_name text,
    sheet_id text,
    date_column text,
    is_default boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: daily_metric_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_metric_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_name text NOT NULL,
    description text,
    metrics jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: data_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_name text NOT NULL,
    source_type text,
    sheet_url text,
    description text,
    status text DEFAULT 'manual'::text,
    last_fetched timestamp with time zone,
    row_count integer DEFAULT 0,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: follow_up_reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.follow_up_reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    agent_id uuid,
    reminder_date date NOT NULL,
    reminder_time time without time zone,
    channel public.activity_channel DEFAULT 'call'::public.activity_channel NOT NULL,
    note text,
    is_completed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: incentives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.incentives (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_member_id uuid,
    team_member_name_snapshot text,
    business_unit text DEFAULT 'IPC'::text,
    incentive_type text,
    reason text,
    amount numeric DEFAULT 0 NOT NULL,
    incentive_date date,
    cadence text DEFAULT 'one-time'::text,
    notes text,
    cost_classification text DEFAULT 'Operating Expense'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: invoice_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    event_type text NOT NULL,
    metadata_json jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: invoice_item_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_item_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    default_hsn_sac text,
    default_gst_rate numeric DEFAULT 18,
    default_taxable_status text DEFAULT 'taxable'::text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: invoice_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_name text NOT NULL,
    description text,
    hsn_sac text,
    default_rate numeric DEFAULT 0 NOT NULL,
    default_gst_rate numeric DEFAULT 18 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    category_id uuid,
    default_price numeric DEFAULT 0,
    taxable_status text DEFAULT 'taxable'::text,
    unit text DEFAULT 'unit'::text
);


--
-- Name: invoice_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_line_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    item_name text NOT NULL,
    description text,
    hsn_sac text,
    quantity numeric DEFAULT 1 NOT NULL,
    rate numeric DEFAULT 0 NOT NULL,
    tax_rate numeric DEFAULT 0 NOT NULL,
    cgst_amount numeric DEFAULT 0 NOT NULL,
    sgst_amount numeric DEFAULT 0 NOT NULL,
    igst_amount numeric DEFAULT 0 NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: invoice_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace text DEFAULT 'default'::text NOT NULL,
    invoice_prefix text DEFAULT 'INV-'::text NOT NULL,
    next_invoice_number integer DEFAULT 1 NOT NULL,
    number_padding integer DEFAULT 4 NOT NULL,
    fy_format text,
    reset_yearly boolean DEFAULT false NOT NULL,
    last_reset_fy text,
    gst_enabled_default boolean DEFAULT true NOT NULL,
    allow_invoice_level_gst_choice boolean DEFAULT true NOT NULL,
    default_invoice_type text DEFAULT 'gst'::text NOT NULL,
    default_gst_rate numeric DEFAULT 18 NOT NULL,
    default_tax_mode text DEFAULT 'exclusive'::text NOT NULL,
    default_tax_split text DEFAULT 'cgst_sgst'::text NOT NULL,
    default_place_of_supply text,
    hsn_sac_required boolean DEFAULT true NOT NULL,
    default_hsn_sac text,
    default_notes text,
    default_terms text,
    default_email_subject text DEFAULT 'Invoice {{invoice_number}} from {{company_name}}'::text,
    default_email_body text DEFAULT 'Hi {{member_name}},\n\nPlease find attached invoice {{invoice_number}} for {{program_name}}.\n\nTotal: {{total_amount}}\nBalance due: {{balance_due}}\n\nRegards,\n{{brand_name}}'::text,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    require_authorized_signature boolean DEFAULT false NOT NULL,
    CONSTRAINT invoice_settings_default_invoice_type_check CHECK ((default_invoice_type = ANY (ARRAY['gst'::text, 'non_gst'::text]))),
    CONSTRAINT invoice_settings_default_tax_mode_check CHECK ((default_tax_mode = ANY (ARRAY['exclusive'::text, 'inclusive'::text]))),
    CONSTRAINT invoice_settings_default_tax_split_check CHECK ((default_tax_split = ANY (ARRAY['cgst_sgst'::text, 'igst'::text, 'none'::text])))
);


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_number text,
    invoice_date date,
    due_date date,
    terms text,
    status text DEFAULT 'draft'::text NOT NULL,
    invoice_type text DEFAULT 'gst'::text NOT NULL,
    invoice_mode text DEFAULT 'full_deal'::text NOT NULL,
    paid_pipeline_lead_id uuid,
    crm_lead_id uuid,
    member_name text,
    member_email text,
    member_phone text,
    billing_address text,
    place_of_supply text,
    seller_snapshot_json jsonb,
    buyer_snapshot_json jsonb,
    tax_snapshot_json jsonb,
    subtotal numeric DEFAULT 0 NOT NULL,
    discount_amount numeric DEFAULT 0 NOT NULL,
    taxable_amount numeric DEFAULT 0 NOT NULL,
    cgst_amount numeric DEFAULT 0 NOT NULL,
    sgst_amount numeric DEFAULT 0 NOT NULL,
    igst_amount numeric DEFAULT 0 NOT NULL,
    adjustment_amount numeric DEFAULT 0 NOT NULL,
    total_amount numeric DEFAULT 0 NOT NULL,
    payment_made numeric DEFAULT 0 NOT NULL,
    balance_due numeric DEFAULT 0 NOT NULL,
    amount_in_words text,
    notes text,
    terms_and_conditions text,
    created_by uuid,
    issued_at timestamp with time zone,
    sent_at timestamp with time zone,
    sent_to text,
    last_generated_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    cancelled_by uuid,
    cancel_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    linked_client_name text,
    linked_client_email text,
    linked_client_phone text,
    billing_name text,
    billing_email text,
    billing_phone text,
    billing_gstin text,
    billing_city text,
    billing_state text,
    billing_state_code text,
    billing_country text,
    invoice_number_mode text DEFAULT 'auto'::text NOT NULL,
    manual_invoice_number text,
    show_bank_details boolean DEFAULT true NOT NULL,
    show_payment_instructions boolean DEFAULT true NOT NULL,
    show_signature boolean DEFAULT true NOT NULL,
    show_stamp boolean DEFAULT true NOT NULL,
    subject text,
    salesperson_id uuid,
    invoice_context_type text DEFAULT 'linked_paid_lead'::text NOT NULL,
    CONSTRAINT invoices_context_type_check CHECK ((invoice_context_type = ANY (ARRAY['linked_paid_lead'::text, 'manual'::text, 'later_linked'::text]))),
    CONSTRAINT invoices_invoice_mode_check CHECK ((invoice_mode = ANY (ARRAY['full_deal'::text, 'token'::text, 'balance'::text, 'custom'::text]))),
    CONSTRAINT invoices_invoice_number_mode_check CHECK ((invoice_number_mode = ANY (ARRAY['auto'::text, 'manual'::text]))),
    CONSTRAINT invoices_invoice_type_check CHECK ((invoice_type = ANY (ARRAY['gst'::text, 'non_gst'::text]))),
    CONSTRAINT invoices_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'issued'::text, 'sent'::text, 'paid'::text, 'cancelled'::text, 'void'::text])))
);


--
-- Name: kpi_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kpi_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    template_id uuid,
    kpi_id uuid,
    assignment_type text DEFAULT 'template'::text NOT NULL,
    assigned_by uuid,
    start_date date DEFAULT CURRENT_DATE NOT NULL,
    end_date date,
    is_active boolean DEFAULT true NOT NULL,
    custom_target numeric,
    custom_weight numeric,
    custom_reward_points numeric,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT kpi_assignments_assignment_type_check CHECK ((assignment_type = ANY (ARRAY['template'::text, 'individual'::text]))),
    CONSTRAINT kpi_assignments_check CHECK ((((assignment_type = 'template'::text) AND (template_id IS NOT NULL) AND (kpi_id IS NULL)) OR ((assignment_type = 'individual'::text) AND (kpi_id IS NOT NULL) AND (template_id IS NULL))))
);


--
-- Name: kpi_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kpi_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_key text NOT NULL,
    category_label text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: kpi_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kpi_definitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    category text,
    department text,
    owner_role text,
    measurement_type text NOT NULL,
    target_default numeric,
    target_unit text,
    cadence text NOT NULL,
    due_time time without time zone,
    due_day_of_week integer,
    due_day_of_month integer,
    recurrence_rule text,
    weight numeric DEFAULT 1 NOT NULL,
    proof_required boolean DEFAULT false NOT NULL,
    approval_required boolean DEFAULT false NOT NULL,
    reward_points numeric DEFAULT 0 NOT NULL,
    auto_source_key text,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT kpi_definitions_cadence_check CHECK ((cadence = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text, 'recurring'::text, 'custom'::text]))),
    CONSTRAINT kpi_definitions_measurement_type_check CHECK ((measurement_type = ANY (ARRAY['number'::text, 'yes_no'::text, 'percentage'::text, 'currency'::text, 'time'::text, 'checklist'::text, 'quality_score'::text, 'manual_proof'::text, 'auto_source'::text])))
);


--
-- Name: kpi_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kpi_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assignment_id uuid NOT NULL,
    user_id uuid NOT NULL,
    kpi_id uuid NOT NULL,
    period_type text NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    due_at timestamp with time zone,
    target_value numeric,
    status text DEFAULT 'pending'::text NOT NULL,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT kpi_entries_period_type_check CHECK ((period_type = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text, 'recurring'::text, 'custom'::text]))),
    CONSTRAINT kpi_entries_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'submitted'::text, 'approved'::text, 'rejected'::text, 'missed'::text, 'waived'::text])))
);


--
-- Name: kpi_reward_earnings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kpi_reward_earnings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    reward_rule_id uuid,
    period_type text NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    score numeric NOT NULL,
    reward_points numeric DEFAULT 0 NOT NULL,
    cash_amount numeric DEFAULT 0 NOT NULL,
    badge_name text,
    recognition_label text,
    status text DEFAULT 'pending_approval'::text NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    rejected_by uuid,
    rejected_at timestamp with time zone,
    rejection_reason text,
    paid_by uuid,
    paid_at timestamp with time zone,
    payout_notes text,
    generated_by uuid,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT kpi_reward_earnings_period_chk CHECK ((period_type = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text]))),
    CONSTRAINT kpi_reward_earnings_status_chk CHECK ((status = ANY (ARRAY['pending_approval'::text, 'approved'::text, 'rejected'::text, 'paid'::text, 'cancelled'::text])))
);


--
-- Name: kpi_reward_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kpi_reward_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    period_type text DEFAULT 'monthly'::text NOT NULL,
    min_score numeric DEFAULT 90 NOT NULL,
    reward_points numeric DEFAULT 0 NOT NULL,
    cash_amount numeric DEFAULT 0 NOT NULL,
    badge_name text,
    recognition_label text,
    applies_to_user_id uuid,
    applies_to_role text,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT kpi_reward_rules_period_chk CHECK ((period_type = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text])))
);


--
-- Name: kpi_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kpi_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entry_id uuid NOT NULL,
    user_id uuid NOT NULL,
    submitted_value numeric,
    proof_url text,
    notes text,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'submitted'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    review_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT kpi_submissions_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: kpi_template_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kpi_template_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    kpi_id uuid NOT NULL,
    target_override numeric,
    weight_override numeric,
    reward_points_override numeric,
    is_required boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: kpi_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kpi_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    role_label text,
    department text,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lead_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    entry_date date NOT NULL,
    ad_spend numeric NOT NULL,
    leads integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lead_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    paid_pipeline_lead_id uuid,
    note_text text NOT NULL,
    note_type text DEFAULT 'general'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);


--
-- Name: lead_qualifier_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_qualifier_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    webinar_name text NOT NULL,
    webinar_date date,
    total_duration integer,
    registrants integer,
    viewers integer,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    mode integer,
    registration_file_name text,
    zoom_file_name text,
    true_absentee_count integer
);


--
-- Name: lead_tag_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_tag_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tag_id uuid NOT NULL,
    crm_lead_id uuid,
    paid_pipeline_lead_id uuid,
    assigned_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lead_tag_assignments_check CHECK (((crm_lead_id IS NOT NULL) OR (paid_pipeline_lead_id IS NOT NULL)))
);


--
-- Name: leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name text,
    email text,
    phone text,
    country text,
    score integer DEFAULT 0 NOT NULL,
    grade public.lead_grade DEFAULT 'cold'::public.lead_grade NOT NULL,
    webinar_source text,
    webinar_date date,
    webinar_name text,
    pipeline_id uuid,
    stage_id uuid,
    assigned_agent_id uuid,
    deal_value numeric DEFAULT 118000 NOT NULL,
    program_name text DEFAULT 'IPC Diamond Program'::text NOT NULL,
    lead_type public.lead_type DEFAULT 'unpaid'::public.lead_type NOT NULL,
    total_minutes integer DEFAULT 0 NOT NULL,
    attendance_pct numeric DEFAULT 0 NOT NULL,
    sessions_count integer DEFAULT 0 NOT NULL,
    first_join_time timestamp with time zone,
    is_super_hot boolean DEFAULT false NOT NULL,
    webinar_count integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sort_order double precision DEFAULT 0 NOT NULL,
    lead_source_type text,
    paid_pipeline_lead_id uuid,
    archived_at timestamp with time zone,
    archived_by uuid,
    archive_reason text,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    delete_reason text,
    code_of_conduct_status text,
    code_of_conduct_request_id uuid,
    code_of_conduct_sent_at timestamp with time zone,
    code_of_conduct_signed_at timestamp with time zone,
    conversion_status text DEFAULT 'not_converted'::text NOT NULL,
    converted_at timestamp with time zone,
    converted_by uuid,
    hide_from_sales_workload boolean DEFAULT false NOT NULL,
    converted_to_crm_lead_id uuid,
    service_package_id uuid,
    service_package_snapshot jsonb,
    program_id uuid,
    offer_id uuid,
    source_segment_name text
);


--
-- Name: media_buyer_aliases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_buyer_aliases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    alias_name text NOT NULL,
    canonical_name text NOT NULL,
    reason text,
    is_active boolean DEFAULT true NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: media_buyer_attribution; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_buyer_attribution (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    webinar_name text,
    webinar_date date,
    webinar_type text,
    media_buyer_name text NOT NULL,
    ad_spend numeric DEFAULT 0,
    total_leads integer DEFAULT 0,
    matched_sales integer DEFAULT 0,
    revenue numeric DEFAULT 0,
    roas_value numeric DEFAULT 0,
    cpl numeric DEFAULT 0,
    conversion_rate numeric DEFAULT 0,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: media_buyer_case_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_buyer_case_emails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid NOT NULL,
    email_type text NOT NULL,
    recipient_email text,
    subject text NOT NULL,
    body text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    sent_at timestamp with time zone,
    provider_message_id text,
    error_message text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL
);


--
-- Name: media_buyer_case_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_buyer_case_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid NOT NULL,
    event_type text NOT NULL,
    event_label text,
    event_date timestamp with time zone DEFAULT now() NOT NULL,
    old_status text,
    new_status text,
    notes text,
    metadata jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL
);


--
-- Name: media_buyer_cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_buyer_cases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_name text NOT NULL,
    student_email text,
    student_phone text,
    program_name text,
    source_module text,
    source_lead_id uuid,
    source_paid_pipeline_lead_id uuid,
    source_crm_lead_id uuid,
    assigned_media_buyer_id uuid,
    assigned_media_buyer_name text,
    assigned_media_buyer_email text,
    assigned_at timestamp with time zone,
    assigned_by uuid,
    assignment_method text DEFAULT 'manual'::text NOT NULL,
    case_stage text DEFAULT 'assigned'::text NOT NULL,
    call_status text DEFAULT 'not_called'::text NOT NULL,
    first_call_due_at timestamp with time zone,
    first_called_at timestamp with time zone,
    last_called_at timestamp with time zone,
    total_call_attempts integer DEFAULT 0 NOT NULL,
    last_call_outcome text,
    email_followup_sent_at timestamp with time zone,
    ad_access_status text DEFAULT 'not_requested'::text NOT NULL,
    ad_account_access_received_at timestamp with time zone,
    ad_account_name text,
    business_manager_access boolean DEFAULT false NOT NULL,
    page_access boolean DEFAULT false NOT NULL,
    ad_account_access boolean DEFAULT false NOT NULL,
    pixel_domain_access boolean DEFAULT false NOT NULL,
    access_notes text,
    creative_status text,
    campaign_setup_status text,
    ads_status text DEFAULT 'not_started'::text NOT NULL,
    ads_launch_date date,
    ads_start_date date,
    ads_stop_date date,
    current_pause_started_at timestamp with time zone,
    service_duration_type text DEFAULT 'custom'::text NOT NULL,
    service_duration_months integer,
    service_duration_days integer,
    active_days_used integer DEFAULT 0 NOT NULL,
    active_days_remaining integer,
    projected_service_end_date date,
    stop_reason text,
    pause_reason text,
    resume_reason text,
    priority text DEFAULT 'normal'::text NOT NULL,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);


--
-- Name: media_buyer_service_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_buyer_service_periods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid NOT NULL,
    period_type text NOT NULL,
    started_at timestamp with time zone NOT NULL,
    ended_at timestamp with time zone,
    total_days integer,
    reason text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL
);


--
-- Name: member_access_verifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_access_verifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    crm_lead_id uuid,
    paid_pipeline_lead_id uuid,
    user_id uuid,
    whatsapp_group_status text DEFAULT 'unknown'::text NOT NULL,
    whatsapp_verified_at timestamp with time zone,
    whatsapp_verified_by uuid,
    app_login_status text DEFAULT 'unknown'::text NOT NULL,
    app_last_login_at timestamp with time zone,
    app_login_verified_at timestamp with time zone,
    app_login_verified_by uuid,
    call_status text DEFAULT 'not_called'::text NOT NULL,
    call_attempt_count integer DEFAULT 0 NOT NULL,
    last_called_at timestamp with time zone,
    last_called_by uuid,
    next_follow_up_at timestamp with time zone,
    contact_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mav_has_link CHECK (((crm_lead_id IS NOT NULL) OR (paid_pipeline_lead_id IS NOT NULL) OR (user_id IS NOT NULL))),
    CONSTRAINT member_access_verifications_app_login_status_check CHECK ((app_login_status = ANY (ARRAY['unknown'::text, 'never_logged_in'::text, 'logged_in'::text, 'access_issue'::text]))),
    CONSTRAINT member_access_verifications_call_status_check CHECK ((call_status = ANY (ARRAY['not_called'::text, 'no_answer'::text, 'connected'::text, 'follow_up_needed'::text, 'resolved'::text]))),
    CONSTRAINT member_access_verifications_whatsapp_group_status_check CHECK ((whatsapp_group_status = ANY (ARRAY['unknown'::text, 'invite_sent'::text, 'not_joined'::text, 'joined_verified'::text, 'link_issue'::text])))
);


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    team_member_id uuid,
    module_key text,
    notification_type text,
    in_app_enabled boolean DEFAULT true NOT NULL,
    email_enabled boolean DEFAULT false NOT NULL,
    whatsapp_enabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notification_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rule_key text NOT NULL,
    rule_name text NOT NULL,
    module_key text,
    trigger_type text,
    conditions jsonb,
    recipient_type text,
    recipient_config jsonb,
    priority text DEFAULT 'normal'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipient_user_id uuid,
    recipient_team_member_id uuid,
    recipient_role text,
    module_key text,
    notification_type text,
    title text NOT NULL,
    message text,
    entity_type text,
    entity_id uuid,
    entity_label text,
    priority text DEFAULT 'normal'::text NOT NULL,
    status text DEFAULT 'unread'::text NOT NULL,
    action_url text,
    action_label text,
    metadata jsonb,
    triggered_by_user_id uuid,
    triggered_by_name text,
    source text DEFAULT 'app'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    read_at timestamp with time zone,
    dismissed_at timestamp with time zone,
    is_deleted boolean DEFAULT false NOT NULL
);


--
-- Name: offer_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offer_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    category text,
    default_duration_value numeric,
    default_duration_unit text,
    default_quantity numeric,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);


--
-- Name: offer_preset_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offer_preset_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    preset_id uuid NOT NULL,
    offer_item_id uuid,
    title text,
    duration_value numeric,
    duration_unit text,
    quantity numeric,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: offer_presets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offer_presets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);


--
-- Name: offline_seminar_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offline_seminar_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_name text NOT NULL,
    event_type text,
    event_date date,
    event_month text,
    city text,
    venue_name text,
    program_name text,
    business_unit text,
    ticket_price numeric DEFAULT 0 NOT NULL,
    tickets_sold integer DEFAULT 0 NOT NULL,
    ticket_revenue numeric DEFAULT 0 NOT NULL,
    complimentary_passes integer DEFAULT 0 NOT NULL,
    total_attendees integer DEFAULT 0 NOT NULL,
    no_show_count integer DEFAULT 0 NOT NULL,
    total_ad_spend numeric DEFAULT 0 NOT NULL,
    total_event_cost numeric DEFAULT 0 NOT NULL,
    total_cost numeric DEFAULT 0 NOT NULL,
    program_price numeric DEFAULT 0 NOT NULL,
    program_sales_count integer DEFAULT 0 NOT NULL,
    program_booked_revenue numeric DEFAULT 0 NOT NULL,
    program_revenue_collected numeric DEFAULT 0 NOT NULL,
    program_revenue_pending numeric DEFAULT 0 NOT NULL,
    refunds_adjustments numeric DEFAULT 0 NOT NULL,
    total_gross_revenue numeric DEFAULT 0 NOT NULL,
    total_realized_revenue numeric DEFAULT 0 NOT NULL,
    total_pending_revenue numeric DEFAULT 0 NOT NULL,
    net_profit numeric DEFAULT 0 NOT NULL,
    net_profit_margin numeric,
    event_roas numeric,
    realized_roas numeric,
    profit_roi numeric,
    cost_per_attendee numeric,
    cost_per_sale numeric,
    break_even_sales_required numeric,
    media_buyer_breakdown jsonb,
    cost_breakdown jsonb,
    ticket_source_metadata jsonb,
    sales_source_metadata jsonb,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid
);


--
-- Name: operations_communication_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operations_communication_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    subject text,
    body text NOT NULL,
    template_type text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_seed boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT operations_comm_templates_type_chk CHECK ((template_type = ANY (ARRAY['email'::text, 'form_link'::text, 'call_link'::text, 'instruction'::text])))
);


--
-- Name: operations_conversion_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operations_conversion_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    operations_lead_id uuid NOT NULL,
    media_buyer_id uuid,
    client_name text,
    conversion_count integer DEFAULT 1 NOT NULL,
    conversion_value numeric,
    proof_url text,
    campaign_name text,
    notes text,
    conversion_date date DEFAULT CURRENT_DATE NOT NULL,
    verification_status text DEFAULT 'pending'::text NOT NULL,
    verified_by uuid,
    verified_at timestamp with time zone,
    verification_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT operations_conversion_reports_verification_status_check CHECK ((verification_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: operations_handoff_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operations_handoff_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    source_pipeline_id uuid NOT NULL,
    eligible_stage_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    mode text DEFAULT 'suggest'::text NOT NULL,
    default_service_package text,
    default_service_days integer,
    default_assignment_method text DEFAULT 'unassigned'::text NOT NULL,
    default_single_buyer_id uuid,
    eligible_buyer_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    duplicate_behavior text DEFAULT 'skip'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT operations_handoff_rules_default_assignment_method_check CHECK ((default_assignment_method = ANY (ARRAY['unassigned'::text, 'single'::text, 'round_robin'::text]))),
    CONSTRAINT operations_handoff_rules_duplicate_behavior_check CHECK ((duplicate_behavior = ANY (ARRAY['skip'::text, 'update'::text]))),
    CONSTRAINT operations_handoff_rules_mode_check CHECK ((mode = ANY (ARRAY['manual'::text, 'suggest'::text, 'auto'::text])))
);


--
-- Name: operations_intake_imports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operations_intake_imports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source text NOT NULL,
    file_name text,
    sheet_url text,
    imported_count integer DEFAULT 0 NOT NULL,
    skipped_count integer DEFAULT 0 NOT NULL,
    updated_count integer DEFAULT 0 NOT NULL,
    total_rows integer DEFAULT 0 NOT NULL,
    raw_summary jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT operations_intake_imports_source_chk CHECK ((source = ANY (ARRAY['csv'::text, 'sheet_link'::text, 'manual'::text, 'crm_handoff'::text, 'paid_handoff'::text])))
);


--
-- Name: operations_lead_checklist_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operations_lead_checklist_state (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    operations_lead_id uuid NOT NULL,
    checklist_item_id uuid NOT NULL,
    is_checked boolean DEFAULT false NOT NULL,
    checked_by uuid,
    checked_at timestamp with time zone,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: operations_lead_custom_values; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operations_lead_custom_values (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    operations_lead_id uuid NOT NULL,
    field_id uuid NOT NULL,
    value_text text,
    value_number numeric,
    value_date date,
    value_bool boolean,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: operations_leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operations_leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    crm_lead_id uuid,
    paid_pipeline_lead_id uuid,
    name text NOT NULL,
    email text,
    phone text,
    product_name text,
    batch_name text,
    onboarding_batch text,
    source_stage text,
    service_package_id uuid,
    service_package_name text,
    service_months integer,
    service_days_committed integer,
    service_status text DEFAULT 'not_started'::text NOT NULL,
    pipeline_id uuid,
    stage_id uuid,
    current_stage text,
    assigned_media_buyer_id uuid,
    assigned_media_buyer_name text,
    priority text,
    tags jsonb DEFAULT '[]'::jsonb NOT NULL,
    ad_launch_date date,
    current_active_start_date date,
    total_active_days integer DEFAULT 0 NOT NULL,
    total_paused_days integer DEFAULT 0 NOT NULL,
    last_paused_at date,
    last_resumed_at date,
    service_end_target_date date,
    notes text,
    deal_value numeric,
    sort_order double precision DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    process_template_id uuid,
    intake_status text DEFAULT 'intake'::text NOT NULL,
    intake_source text,
    brand_name text,
    program_name text,
    readiness_override_reason text,
    readiness_override_by uuid,
    readiness_override_at timestamp with time zone,
    service_package_snapshot jsonb,
    program_id uuid,
    offer_id uuid
);


--
-- Name: operations_offer_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operations_offer_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    operations_lead_id uuid NOT NULL,
    crm_lead_id uuid,
    paid_pipeline_lead_id uuid,
    paid_lead_offer_item_id uuid,
    offer_item_id uuid,
    title text NOT NULL,
    description text,
    delivery_status text DEFAULT 'pending'::text NOT NULL,
    assigned_to uuid,
    due_date date,
    delivered_at timestamp with time zone,
    delivered_by uuid,
    proof_url text,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT operations_offer_deliveries_status_chk CHECK ((delivery_status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'delivered'::text, 'blocked'::text, 'cancelled'::text])))
);


--
-- Name: operations_process_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operations_process_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    default_owner_rule text DEFAULT 'unassigned'::text NOT NULL,
    default_owner_id uuid,
    default_service_duration_days integer DEFAULT 30,
    is_active boolean DEFAULT true NOT NULL,
    is_seed boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT operations_process_templates_owner_rule_chk CHECK ((default_owner_rule = ANY (ARRAY['unassigned'::text, 'single'::text, 'round_robin'::text])))
);


--
-- Name: operations_result_reward_payouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operations_result_reward_payouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_member_id uuid NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    approved_count integer DEFAULT 0 NOT NULL,
    reward_amount numeric DEFAULT 0 NOT NULL,
    payout_status text DEFAULT 'pending'::text NOT NULL,
    paid_at timestamp with time zone,
    paid_by uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: operations_result_reward_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operations_result_reward_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    result_type text,
    reward_amount numeric DEFAULT 500 NOT NULL,
    min_approved_count integer DEFAULT 1 NOT NULL,
    period text DEFAULT 'monthly'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: operations_result_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operations_result_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    operations_lead_id uuid,
    crm_lead_id uuid,
    paid_pipeline_lead_id uuid,
    member_name text,
    submitted_by uuid NOT NULL,
    result_type text NOT NULL,
    title text NOT NULL,
    description text,
    proof_url text,
    proof_file_path text,
    result_date date,
    status text DEFAULT 'pending'::text NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    rejected_by uuid,
    rejected_at timestamp with time zone,
    rejection_reason text,
    reward_amount numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: operations_reward_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operations_reward_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    media_buyer_id uuid NOT NULL,
    rule_id uuid,
    month text NOT NULL,
    approved_conversion_count integer DEFAULT 0 NOT NULL,
    target_count integer NOT NULL,
    reward_amount numeric NOT NULL,
    reward_status text DEFAULT 'in_progress'::text NOT NULL,
    achieved_at timestamp with time zone,
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT operations_reward_progress_reward_status_check CHECK ((reward_status = ANY (ARRAY['in_progress'::text, 'achieved'::text, 'paid'::text, 'expired'::text])))
);


--
-- Name: operations_reward_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operations_reward_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rule_name text NOT NULL,
    role_scope text DEFAULT 'media_buyer'::text NOT NULL,
    period text DEFAULT 'monthly'::text NOT NULL,
    target_metric text DEFAULT 'approved_conversions'::text NOT NULL,
    target_count integer DEFAULT 10 NOT NULL,
    reward_amount numeric DEFAULT 3000 NOT NULL,
    currency text DEFAULT 'INR'::text NOT NULL,
    verification_required boolean DEFAULT true NOT NULL,
    active boolean DEFAULT true NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT operations_reward_rules_period_check CHECK ((period = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text, 'custom'::text])))
);


--
-- Name: operations_service_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operations_service_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    operations_lead_id uuid NOT NULL,
    event_type text NOT NULL,
    event_date date DEFAULT CURRENT_DATE NOT NULL,
    reason text,
    note text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    channel text,
    template_id uuid,
    template_title text,
    message_snapshot text,
    subject_snapshot text,
    send_status text,
    CONSTRAINT operations_service_events_event_type_check CHECK ((event_type = ANY (ARRAY['start'::text, 'pause'::text, 'resume'::text, 'stop'::text, 'complete'::text, 'restart'::text, 'communication_logged'::text, 'communication_copied'::text, 'communication_sent'::text, 'communication_failed'::text])))
);


--
-- Name: operations_template_checklist_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operations_template_checklist_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    label text NOT NULL,
    is_required boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: operations_template_fields; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operations_template_fields (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    field_key text NOT NULL,
    label text NOT NULL,
    field_type text NOT NULL,
    options jsonb,
    is_required boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT operations_template_fields_type_chk CHECK ((field_type = ANY (ARRAY['text'::text, 'number'::text, 'date'::text, 'dropdown'::text, 'checkbox'::text, 'link'::text, 'textarea'::text])))
);


--
-- Name: paid_lead_offer_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paid_lead_offer_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    paid_pipeline_lead_id uuid,
    crm_lead_id uuid,
    operations_lead_id uuid,
    offer_item_id uuid,
    source_preset_id uuid,
    title text NOT NULL,
    duration_value numeric,
    duration_unit text,
    quantity numeric,
    notes text,
    source_context text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);


--
-- Name: paid_pipeline_activity_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paid_pipeline_activity_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    paid_pipeline_lead_id uuid NOT NULL,
    activity_type text NOT NULL,
    old_value jsonb,
    new_value jsonb,
    note text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: paid_pipeline_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paid_pipeline_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_name text NOT NULL,
    business_unit text,
    source_webinar_batch_id uuid,
    source_webinar_name text,
    source_webinar_date date,
    product_id uuid,
    product_name_snapshot text,
    description text,
    batch_status text DEFAULT 'Active'::text NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    service_package_id uuid,
    service_package_snapshot jsonb
);


--
-- Name: paid_pipeline_finance_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paid_pipeline_finance_details (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    paid_pipeline_lead_id uuid NOT NULL,
    finance_partner text,
    finance_status text,
    loan_amount numeric DEFAULT 0 NOT NULL,
    down_payment numeric DEFAULT 0 NOT NULL,
    application_date date,
    approval_date date,
    disbursement_date date,
    rejection_reason text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: paid_pipeline_followups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paid_pipeline_followups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    paid_pipeline_lead_id uuid,
    follow_up_date date NOT NULL,
    follow_up_time text,
    follow_up_reason text,
    priority text,
    status text DEFAULT 'Pending'::text NOT NULL,
    assigned_to text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    completed_at timestamp with time zone,
    follow_up_type text,
    source_module text DEFAULT 'paid_pipeline'::text,
    related_payment_id uuid,
    related_crm_lead_id uuid,
    completed_by uuid,
    is_deleted boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY public.paid_pipeline_followups REPLICA IDENTITY FULL;


--
-- Name: paid_pipeline_leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paid_pipeline_leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_unit text DEFAULT 'IPC'::text NOT NULL,
    webinar_batch_id uuid,
    product_id uuid,
    product_name_snapshot text,
    attribution_session_id uuid,
    attribution_sale_id text,
    attributed_media_buyer text,
    match_method text,
    source_webinar text,
    source_report_date date,
    created_from_attribution boolean DEFAULT false NOT NULL,
    name text,
    email text,
    phone text,
    deal_value_including_gst numeric DEFAULT 0 NOT NULL,
    default_token_amount numeric DEFAULT 0 NOT NULL,
    token_amount_collected numeric DEFAULT 0 NOT NULL,
    total_collected numeric DEFAULT 0 NOT NULL,
    balance_pending numeric DEFAULT 0 NOT NULL,
    final_revenue_realized numeric DEFAULT 0 NOT NULL,
    payment_model text,
    payment_status text,
    pipeline_stage text,
    finance_required boolean DEFAULT false NOT NULL,
    finance_partner text,
    finance_status text,
    assigned_sales_executive uuid,
    follow_up_date date,
    notes text,
    is_final_sale boolean DEFAULT false NOT NULL,
    is_enrolled boolean DEFAULT false NOT NULL,
    is_dropped boolean DEFAULT false NOT NULL,
    is_refunded boolean DEFAULT false NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    deleted_by uuid,
    deleted_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    balance_category text,
    balance_description text,
    next_balance_follow_up_date date,
    next_follow_up_date date,
    next_follow_up_time text,
    follow_up_reason text,
    follow_up_priority text,
    follow_up_status text,
    lead_temperature text,
    paid_batch_name text,
    onboarding_batch_name text,
    crm_pipeline_id uuid,
    crm_stage_id uuid,
    crm_lead_id uuid,
    sent_to_crm boolean DEFAULT false,
    sent_to_crm_at timestamp with time zone,
    revenue_to_be_realized numeric DEFAULT 0,
    finance_notes text,
    finance_follow_up_date date,
    finance_owner text,
    revenue_recognition_rule text,
    paid_batch_id uuid,
    source_webinar_batch_id uuid,
    finance_amount_approved numeric,
    finance_amount_disbursed numeric,
    finance_disbursement_date date,
    finance_count_as_collected boolean DEFAULT false NOT NULL,
    archived_at timestamp with time zone,
    archived_by uuid,
    archive_reason text,
    code_of_conduct_status text,
    code_of_conduct_request_id uuid,
    code_of_conduct_sent_at timestamp with time zone,
    code_of_conduct_signed_at timestamp with time zone,
    access_status text DEFAULT 'not_ready'::text NOT NULL,
    access_given_at timestamp with time zone,
    access_given_by uuid,
    access_channel text,
    access_note text,
    access_blocker_reason text,
    access_blocked_at timestamp with time zone,
    access_blocked_by uuid,
    source_unpaid_lead_id uuid,
    service_package_id uuid,
    service_package_snapshot jsonb,
    program_id uuid,
    offer_id uuid,
    source_segment_name text
);


--
-- Name: paid_pipeline_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paid_pipeline_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    paid_pipeline_lead_id uuid NOT NULL,
    payment_type text NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    payment_mode text,
    payment_date date DEFAULT CURRENT_DATE NOT NULL,
    payment_reference text,
    is_token boolean DEFAULT false NOT NULL,
    is_final_payment boolean DEFAULT false NOT NULL,
    notes text,
    is_deleted boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    payment_category text,
    next_payment_expected_date date,
    payment_description text,
    finance_linked boolean DEFAULT false
);


--
-- Name: paid_pipeline_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paid_pipeline_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_unit text,
    setting_type text NOT NULL,
    label text NOT NULL,
    value text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: paid_pipeline_to_crm_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paid_pipeline_to_crm_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    paid_pipeline_lead_id uuid NOT NULL,
    crm_lead_id uuid,
    crm_pipeline_id uuid,
    crm_stage_id uuid,
    onboarding_batch_name text,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_by uuid,
    notes text
);


--
-- Name: payroll_run_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_run_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payroll_run_id uuid NOT NULL,
    team_member_id uuid,
    team_member_name_snapshot text,
    role_snapshot text,
    pay_type text,
    joining_date date,
    exit_date date,
    base_monthly_salary numeric DEFAULT 0,
    one_time_pay numeric DEFAULT 0,
    daily_wage numeric DEFAULT 0,
    hourly_rate numeric DEFAULT 0,
    hours_worked numeric DEFAULT 0,
    period_start date,
    period_end date,
    total_period_days integer DEFAULT 0,
    payable_days integer DEFAULT 0,
    calculated_amount numeric DEFAULT 0 NOT NULL,
    manual_adjustment_amount numeric DEFAULT 0 NOT NULL,
    final_payable_amount numeric DEFAULT 0 NOT NULL,
    reason text,
    cost_classification text,
    expense_category text,
    status text DEFAULT 'pending'::text NOT NULL,
    excluded boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: payroll_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_unit text DEFAULT 'IPC'::text NOT NULL,
    statement_month date NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    disbursement_date date,
    salary_cycle text,
    statement_basis text DEFAULT 'Accrual Basis'::text NOT NULL,
    total_payroll_amount numeric DEFAULT 0 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pipelines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pipelines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type public.pipeline_type DEFAULT 'custom'::public.pipeline_type NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
    role text NOT NULL,
    department text,
    status public.user_status DEFAULT 'pending'::public.user_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    can_receive_calling_crm_leads boolean DEFAULT false NOT NULL,
    can_receive_paid_pipeline_leads boolean DEFAULT false NOT NULL,
    can_receive_follow_up_tasks boolean DEFAULT false NOT NULL,
    can_receive_payment_recovery_leads boolean DEFAULT false NOT NULL,
    include_in_round_robin boolean DEFAULT false NOT NULL,
    active_for_assignment boolean DEFAULT true NOT NULL,
    can_receive_media_buyer_cases boolean DEFAULT false NOT NULL,
    can_receive_operations_leads boolean DEFAULT false NOT NULL,
    deactivated_at timestamp with time zone,
    deactivated_by uuid,
    deactivation_reason text
);


--
-- Name: profit_statement_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profit_statement_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profit_statement_id uuid NOT NULL,
    bucket text NOT NULL,
    category text,
    label text NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    source_type text,
    source_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profit_statements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profit_statements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_unit text DEFAULT 'IPC'::text NOT NULL,
    statement_month date NOT NULL,
    statement_basis text DEFAULT 'Accrual Basis'::text NOT NULL,
    total_revenue numeric DEFAULT 0 NOT NULL,
    total_cogs numeric DEFAULT 0 NOT NULL,
    gross_profit numeric DEFAULT 0 NOT NULL,
    total_operating_expense numeric DEFAULT 0 NOT NULL,
    total_payroll numeric DEFAULT 0 NOT NULL,
    total_incentives numeric DEFAULT 0 NOT NULL,
    total_fixed_expense numeric DEFAULT 0 NOT NULL,
    total_variable_expense numeric DEFAULT 0 NOT NULL,
    total_one_time_expense numeric DEFAULT 0 NOT NULL,
    net_profit numeric DEFAULT 0 NOT NULL,
    net_margin numeric DEFAULT 0 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    notes text,
    is_deleted boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: program_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.program_products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_unit text DEFAULT 'IPC'::text NOT NULL,
    product_name text NOT NULL,
    product_price_including_gst numeric DEFAULT 0 NOT NULL,
    currency text DEFAULT 'INR'::text NOT NULL,
    gst_applicable boolean DEFAULT true NOT NULL,
    gst_rate numeric DEFAULT 18 NOT NULL,
    default_token_amount numeric DEFAULT 0 NOT NULL,
    revenue_recognition_rule text DEFAULT 'realized_revenue_only'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    program_id uuid,
    default_pipeline_id uuid,
    default_service_package_id uuid,
    default_operations_template_id uuid,
    default_grade text,
    support_duration_months integer
);


--
-- Name: quick_save_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quick_save_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    field_key text NOT NULL,
    value text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: recurring_expense_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recurring_expense_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    expense_name text NOT NULL,
    category text,
    amount numeric DEFAULT 0 NOT NULL,
    frequency text DEFAULT 'monthly'::text NOT NULL,
    start_date date,
    end_date date,
    business_unit text DEFAULT 'IPC'::text,
    cost_classification text DEFAULT 'Fixed Expense'::text,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: resource_library_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resource_library_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    icon text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: resource_library_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resource_library_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    category text,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    resource_type text NOT NULL,
    resource_url text,
    storage_path text,
    file_name text,
    file_size bigint,
    mime_type text,
    thumbnail_url text,
    visibility text DEFAULT 'all_team'::text NOT NULL,
    allowed_role_keys text[] DEFAULT '{}'::text[] NOT NULL,
    allowed_module_keys text[] DEFAULT '{}'::text[] NOT NULL,
    is_published boolean DEFAULT true NOT NULL,
    archived_at timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: roas_ad_spends; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roas_ad_spends (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    media_buyer_id uuid NOT NULL,
    webinar_id uuid,
    webinar_date date,
    spend_date date NOT NULL,
    spend_amount numeric DEFAULT 0 NOT NULL,
    entered_by uuid,
    remarks text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: roas_attribution_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roas_attribution_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    attribution_session_id uuid,
    calculation_id text NOT NULL,
    input_snapshot_hash text,
    output_hash text,
    media_buyer_order jsonb,
    column_mappings_used jsonb,
    audit_rows jsonb DEFAULT '[]'::jsonb NOT NULL,
    duplicate_conflicts jsonb DEFAULT '[]'::jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: roas_attribution_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roas_attribution_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    enrollment_id uuid,
    old_media_buyer_id uuid,
    new_media_buyer_id uuid,
    old_status text,
    new_status text,
    change_reason text,
    changed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: roas_calculation_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roas_calculation_drafts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    calculation_method text NOT NULL,
    draft_name text,
    active_step text,
    webinar_details jsonb,
    master_sheet_url text,
    master_sheet_title text,
    spreadsheet_id text,
    detected_tabs jsonb,
    tab_roles jsonb,
    column_mappings jsonb,
    ad_spend_data jsonb,
    result_snapshot jsonb,
    result_status text DEFAULT 'fresh'::text,
    saved_attribution_session_id uuid,
    is_completed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    revenue_config jsonb
);


--
-- Name: roas_data_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roas_data_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_name text NOT NULL,
    source_type text NOT NULL,
    media_buyer_id uuid,
    published_sheet_url text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    column_mapping_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_synced_at timestamp with time zone,
    last_sync_status text,
    last_sync_error text,
    last_rows_fetched integer DEFAULT 0,
    last_rows_imported integer DEFAULT 0,
    last_duplicates_skipped integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT roas_data_sources_source_type_check CHECK ((source_type = ANY (ARRAY['lead_sheet'::text, 'enrollment_sheet'::text])))
);


--
-- Name: roas_enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roas_enrollments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    data_source_id uuid,
    buyer_name text,
    raw_phone text,
    clean_phone text,
    raw_email text,
    clean_email text,
    amount_paid numeric DEFAULT 0,
    program_price numeric,
    gst_amount numeric,
    total_invoice_value numeric,
    net_revenue numeric,
    payment_date timestamp with time zone,
    payment_gateway text,
    transaction_id text,
    webinar_date date,
    payment_status text,
    salesperson text,
    remarks text,
    attributed_media_buyer_id uuid,
    attributed_webinar_id uuid,
    cycle_window_start timestamp with time zone,
    cycle_window_end timestamp with time zone,
    cycle_attribution_flag text,
    attribution_status text DEFAULT 'Unattributed'::text,
    attribution_confidence text,
    attribution_method text,
    matched_lead_id uuid,
    manual_override boolean DEFAULT false,
    manual_override_by uuid,
    manual_override_at timestamp with time zone,
    manual_override_reason text,
    source_row_hash text NOT NULL,
    data_flags jsonb DEFAULT '[]'::jsonb,
    imported_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: roas_fetch_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roas_fetch_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    attribution_session_id uuid,
    master_sheet_id uuid,
    fetch_status text NOT NULL,
    fetched_tabs_count integer DEFAULT 0 NOT NULL,
    failed_tabs_count integer DEFAULT 0 NOT NULL,
    error_summary text,
    fetched_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT roas_fetch_logs_fetch_status_check CHECK ((fetch_status = ANY (ARRAY['success'::text, 'partial_success'::text, 'failed'::text])))
);


--
-- Name: roas_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roas_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_name text NOT NULL,
    webinar_date date,
    total_ad_spend numeric DEFAULT 0 NOT NULL,
    total_revenue numeric DEFAULT 0,
    total_sales integer DEFAULT 0,
    roas_value numeric DEFAULT 0,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: roas_leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roas_leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    media_buyer_id uuid,
    data_source_id uuid,
    lead_name text,
    raw_phone text,
    clean_phone text,
    raw_email text,
    clean_email text,
    created_at_from_sheet timestamp with time zone,
    webinar_date date,
    landing_page text,
    campaign_name text,
    adset_name text,
    ad_name text,
    utm_source text,
    utm_campaign text,
    utm_content text,
    city text,
    state text,
    lead_status text,
    notes text,
    source_row_hash text NOT NULL,
    duplicate_status text DEFAULT 'unique'::text,
    data_flags jsonb DEFAULT '[]'::jsonb,
    imported_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: roas_master_sheet_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roas_master_sheet_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    spreadsheet_id text NOT NULL,
    master_sheet_url text NOT NULL,
    spreadsheet_title text,
    mapping_name text,
    sales_sheet_id text,
    sales_tab_name text,
    media_buyer_mappings jsonb DEFAULT '[]'::jsonb NOT NULL,
    ignored_tabs jsonb DEFAULT '[]'::jsonb,
    column_mappings jsonb,
    last_confirmed_by uuid,
    last_confirmed_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: roas_master_sheet_tabs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roas_master_sheet_tabs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    master_sheet_id uuid NOT NULL,
    tab_role text NOT NULL,
    media_buyer_name text,
    tab_name text,
    tab_gid text,
    tab_url text,
    csv_url text,
    column_mapping jsonb,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT roas_master_sheet_tabs_tab_role_check CHECK ((tab_role = ANY (ARRAY['media_buyer_leads'::text, 'sales'::text, 'ad_spends'::text])))
);


--
-- Name: roas_master_sheets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roas_master_sheets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_name text NOT NULL,
    master_sheet_url text NOT NULL,
    spreadsheet_id text,
    fetch_method text DEFAULT 'gid_mapping'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: roas_media_buyers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roas_media_buyers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: roas_sync_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roas_sync_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    data_source_id uuid,
    sync_started_at timestamp with time zone DEFAULT now() NOT NULL,
    sync_completed_at timestamp with time zone,
    sync_status text DEFAULT 'running'::text NOT NULL,
    rows_fetched integer DEFAULT 0,
    rows_imported integer DEFAULT 0,
    rows_updated integer DEFAULT 0,
    duplicate_rows_skipped integer DEFAULT 0,
    error_message text,
    triggered_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: roas_webinars; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roas_webinars (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    webinar_name text NOT NULL,
    webinar_start_date date,
    webinar_end_date date,
    landing_page_url text,
    offer_name text,
    program_price numeric DEFAULT 100000 NOT NULL,
    gst_rate numeric DEFAULT 18 NOT NULL,
    status text DEFAULT 'Upcoming'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: seminar_roas_report_days; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seminar_roas_report_days (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_id uuid NOT NULL,
    day_number integer NOT NULL,
    date date,
    registrations integer DEFAULT 0 NOT NULL,
    show_up integer DEFAULT 0 NOT NULL,
    watch_or_offer_present integer DEFAULT 0 NOT NULL,
    show_up_rate numeric,
    drop_rate numeric,
    is_sales_day boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    start_time text,
    end_time text,
    duration_minutes integer,
    watch_point_time text
);


--
-- Name: seminar_roas_report_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seminar_roas_report_products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_id uuid NOT NULL,
    payment_type text NOT NULL,
    units_sold integer DEFAULT 0 NOT NULL,
    deal_price_including_gst numeric DEFAULT 0 NOT NULL,
    token_down_payment numeric,
    revenue_counted numeric DEFAULT 0 NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    product_id uuid,
    product_name_snapshot text,
    programme_snapshot text,
    unit_price numeric,
    gst_mode text,
    gst_percent numeric,
    gross_per_sale numeric,
    net_per_sale numeric,
    gst_per_sale numeric,
    is_price_tier boolean DEFAULT false NOT NULL
);


--
-- Name: seminar_roas_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seminar_roas_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    report_name text,
    webinar_name text NOT NULL,
    webinar_mode text,
    total_webinar_days integer DEFAULT 1 NOT NULL,
    watch_point_percent numeric DEFAULT 70 NOT NULL,
    webinar_start_time text,
    webinar_end_time text,
    webinar_duration_minutes integer,
    watch_point_time text,
    sales_day integer,
    timing_note text,
    ad_cost_excluding_gst numeric DEFAULT 0 NOT NULL,
    ad_gst numeric DEFAULT 0 NOT NULL,
    total_ad_spend_including_gst numeric DEFAULT 0 NOT NULL,
    total_revenue_including_gst numeric DEFAULT 0 NOT NULL,
    net_gst_payable_to_govt numeric DEFAULT 0 NOT NULL,
    profit_after_gst numeric DEFAULT 0 NOT NULL,
    cpl numeric,
    cpa numeric,
    roas numeric,
    total_conversions integer DEFAULT 0 NOT NULL,
    input_snapshot_json jsonb,
    output_snapshot_json jsonb,
    whatsapp_summary_text text,
    revenue_basis text DEFAULT 'full_deal_value'::text NOT NULL,
    conversion_rate_basis text,
    conversion_rate numeric,
    roas_revenue_basis text
);


--
-- Name: service_packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_packages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    code text,
    description text,
    default_process_template_id uuid,
    default_service_duration_days integer,
    included_services jsonb,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: stage_sync_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stage_sync_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rule_name text NOT NULL,
    trigger_module text NOT NULL,
    trigger_field text NOT NULL,
    trigger_value text NOT NULL,
    suggested_module text NOT NULL,
    suggested_field text NOT NULL,
    suggested_value text NOT NULL,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pipeline_id uuid NOT NULL,
    name text NOT NULL,
    color text DEFAULT 'gray'::text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    is_protected boolean DEFAULT false NOT NULL,
    is_won boolean DEFAULT false NOT NULL,
    is_lost boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: students; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.students (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name text,
    email text,
    phone text,
    source text NOT NULL,
    search_text text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: system_refinement_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_refinement_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    section text NOT NULL,
    module_key text,
    module_label text,
    checklist_item text NOT NULL,
    description text,
    priority text DEFAULT 'medium'::text NOT NULL,
    status text DEFAULT 'not_checked'::text NOT NULL,
    issue_type text,
    severity text,
    owner_user_id uuid,
    owner_name text,
    route text,
    evidence_notes text,
    fix_notes text,
    screenshot_url text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    fixed_at timestamp with time zone,
    is_deleted boolean DEFAULT false NOT NULL
);


--
-- Name: tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    color text,
    module_scope text DEFAULT 'all'::text NOT NULL,
    created_by uuid,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: task_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_activity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    user_id uuid,
    user_name text,
    action text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: task_assignee_visibility; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_assignee_visibility (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    hidden_by uuid NOT NULL,
    is_hidden boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: task_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    submitted_by uuid NOT NULL,
    submitted_by_name text,
    submission_url text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    note text,
    assigned_to uuid,
    assigned_name text,
    assigned_initials text,
    created_by uuid,
    created_by_name text,
    priority text DEFAULT 'medium'::text NOT NULL,
    status text DEFAULT 'todo'::text NOT NULL,
    tag text DEFAULT 'Operations'::text NOT NULL,
    due_date date,
    sort_order integer DEFAULT 0 NOT NULL,
    is_archived boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tasks_priority_check CHECK ((priority = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text]))),
    CONSTRAINT tasks_status_check CHECK ((status = ANY (ARRAY['todo'::text, 'inprogress'::text, 'review'::text, 'blocked'::text, 'done'::text])))
);

ALTER TABLE ONLY public.tasks REPLICA IDENTITY FULL;


--
-- Name: tax_code_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tax_code_master (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    type text NOT NULL,
    description text NOT NULL,
    category text,
    gst_rate_default numeric,
    keywords text[],
    source text DEFAULT 'seed'::text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tax_code_master_type_check CHECK ((type = ANY (ARRAY['SAC'::text, 'HSN'::text])))
);


--
-- Name: team_payroll_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_payroll_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_member_id uuid NOT NULL,
    full_name_snapshot text,
    role_snapshot text,
    department_snapshot text,
    business_unit text,
    payroll_applicable boolean DEFAULT true NOT NULL,
    pay_type text DEFAULT 'Monthly Salary'::text NOT NULL,
    monthly_salary numeric DEFAULT 0 NOT NULL,
    one_time_pay numeric DEFAULT 0 NOT NULL,
    daily_wage numeric DEFAULT 0 NOT NULL,
    hourly_rate numeric DEFAULT 0 NOT NULL,
    joining_date date,
    exit_date date,
    salary_expense_category text DEFAULT 'Salaries'::text,
    pnl_cost_classification text DEFAULT 'Operating Expense'::text,
    salary_cycle text DEFAULT 'Calendar Month: 1st to Last Day'::text,
    custom_cycle_start_day integer,
    custom_cycle_end_day integer,
    disbursement_start_day integer DEFAULT 7,
    disbursement_end_day integer DEFAULT 10,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid
);


--
-- Name: team_performance_reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_performance_reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    kpi_entry_id uuid,
    reminder_type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    status text DEFAULT 'unread'::text NOT NULL,
    reminder_for_date date NOT NULL,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    read_at timestamp with time zone,
    dismissed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT team_performance_reminders_reminder_type_check CHECK ((reminder_type = ANY (ARRAY['morning_summary'::text, 'due_soon'::text, 'overdue'::text, 'rejected_feedback'::text]))),
    CONSTRAINT team_performance_reminders_status_check CHECK ((status = ANY (ARRAY['unread'::text, 'read'::text, 'dismissed'::text])))
);


--
-- Name: team_salary_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_salary_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_member_id uuid NOT NULL,
    old_pay_type text,
    new_pay_type text,
    old_amount numeric,
    new_amount numeric,
    effective_from date,
    effective_to date,
    change_reason text,
    changed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_module_access; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_module_access (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    module_key text NOT NULL,
    granted_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL
);


--
-- Name: webinar_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webinar_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    webinar_name text NOT NULL,
    webinar_date date,
    webinar_type text,
    batch_name text NOT NULL,
    business_unit text DEFAULT 'IPC'::text NOT NULL,
    offer_name text,
    notes text,
    is_deleted boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source_attribution_report_id uuid,
    source_attribution_session_id uuid,
    source_report_type text,
    source_created_from text,
    service_package_id uuid,
    service_package_snapshot jsonb,
    process_template_id uuid,
    product_name text,
    deal_value numeric,
    pipeline_id uuid,
    imported_lead_count integer,
    program_id uuid
);


--
-- Name: webinar_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webinar_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    program_id uuid
);


--
-- Name: webinars; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webinars (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    normalized_name text,
    last_used_at timestamp with time zone,
    usage_count integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    archived_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: access_readiness_logs access_readiness_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_readiness_logs
    ADD CONSTRAINT access_readiness_logs_pkey PRIMARY KEY (id);


--
-- Name: access_templates access_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_templates
    ADD CONSTRAINT access_templates_pkey PRIMARY KEY (id);


--
-- Name: activity_logs activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_pkey PRIMARY KEY (id);


--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (id);


--
-- Name: attendance_logs attendance_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_logs
    ADD CONSTRAINT attendance_logs_pkey PRIMARY KEY (id);


--
-- Name: attendance_sessions attendance_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_sessions
    ADD CONSTRAINT attendance_sessions_pkey PRIMARY KEY (id);


--
-- Name: attendance_sessions attendance_sessions_user_id_work_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_sessions
    ADD CONSTRAINT attendance_sessions_user_id_work_date_key UNIQUE (user_id, work_date);


--
-- Name: attribution_attendee_lists attribution_attendee_lists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attribution_attendee_lists
    ADD CONSTRAINT attribution_attendee_lists_pkey PRIMARY KEY (id);


--
-- Name: attribution_media_buyers attribution_media_buyers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attribution_media_buyers
    ADD CONSTRAINT attribution_media_buyers_pkey PRIMARY KEY (id);


--
-- Name: attribution_sales_detail attribution_sales_detail_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attribution_sales_detail
    ADD CONSTRAINT attribution_sales_detail_pkey PRIMARY KEY (id);


--
-- Name: attribution_sessions attribution_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attribution_sessions
    ADD CONSTRAINT attribution_sessions_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: business_units business_units_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_units
    ADD CONSTRAINT business_units_name_key UNIQUE (name);


--
-- Name: business_units business_units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_units
    ADD CONSTRAINT business_units_pkey PRIMARY KEY (id);


--
-- Name: code_of_conduct_automation_events code_of_conduct_automation_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_of_conduct_automation_events
    ADD CONSTRAINT code_of_conduct_automation_events_pkey PRIMARY KEY (id);


--
-- Name: code_of_conduct_automation_rules code_of_conduct_automation_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_of_conduct_automation_rules
    ADD CONSTRAINT code_of_conduct_automation_rules_pkey PRIMARY KEY (id);


--
-- Name: code_of_conduct_email_variants code_of_conduct_email_variants_condition_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_of_conduct_email_variants
    ADD CONSTRAINT code_of_conduct_email_variants_condition_key_key UNIQUE (condition_key);


--
-- Name: code_of_conduct_email_variants code_of_conduct_email_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_of_conduct_email_variants
    ADD CONSTRAINT code_of_conduct_email_variants_pkey PRIMARY KEY (id);


--
-- Name: code_of_conduct_events code_of_conduct_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_of_conduct_events
    ADD CONSTRAINT code_of_conduct_events_pkey PRIMARY KEY (id);


--
-- Name: code_of_conduct_guide_progress code_of_conduct_guide_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_of_conduct_guide_progress
    ADD CONSTRAINT code_of_conduct_guide_progress_pkey PRIMARY KEY (id);


--
-- Name: code_of_conduct_guide_progress code_of_conduct_guide_progress_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_of_conduct_guide_progress
    ADD CONSTRAINT code_of_conduct_guide_progress_request_id_key UNIQUE (request_id);


--
-- Name: code_of_conduct_requests code_of_conduct_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_of_conduct_requests
    ADD CONSTRAINT code_of_conduct_requests_pkey PRIMARY KEY (id);


--
-- Name: code_of_conduct_requests code_of_conduct_requests_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_of_conduct_requests
    ADD CONSTRAINT code_of_conduct_requests_token_hash_key UNIQUE (token_hash);


--
-- Name: code_of_conduct_rules code_of_conduct_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_of_conduct_rules
    ADD CONSTRAINT code_of_conduct_rules_pkey PRIMARY KEY (id);


--
-- Name: code_of_conduct_suggestion_ignores code_of_conduct_suggestion_ignores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_of_conduct_suggestion_ignores
    ADD CONSTRAINT code_of_conduct_suggestion_ignores_pkey PRIMARY KEY (id);


--
-- Name: code_of_conduct_templates code_of_conduct_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_of_conduct_templates
    ADD CONSTRAINT code_of_conduct_templates_pkey PRIMARY KEY (id);


--
-- Name: company_role_catalog company_role_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_role_catalog
    ADD CONSTRAINT company_role_catalog_pkey PRIMARY KEY (id);


--
-- Name: company_role_catalog company_role_catalog_role_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_role_catalog
    ADD CONSTRAINT company_role_catalog_role_key_key UNIQUE (role_key);


--
-- Name: company_settings company_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_settings
    ADD CONSTRAINT company_settings_pkey PRIMARY KEY (id);


--
-- Name: company_settings company_settings_workspace_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_settings
    ADD CONSTRAINT company_settings_workspace_key UNIQUE (workspace);


--
-- Name: crm_batch_archives crm_batch_archives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_batch_archives
    ADD CONSTRAINT crm_batch_archives_pkey PRIMARY KEY (id);


--
-- Name: crm_conversion_rules crm_conversion_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_conversion_rules
    ADD CONSTRAINT crm_conversion_rules_pkey PRIMARY KEY (id);


--
-- Name: crm_lead_conversions crm_lead_conversions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_lead_conversions
    ADD CONSTRAINT crm_lead_conversions_pkey PRIMARY KEY (id);


--
-- Name: daily_custom_metrics daily_custom_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_custom_metrics
    ADD CONSTRAINT daily_custom_metrics_pkey PRIMARY KEY (id);


--
-- Name: daily_lead_report_ad_accounts daily_lead_report_ad_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_lead_report_ad_accounts
    ADD CONSTRAINT daily_lead_report_ad_accounts_pkey PRIMARY KEY (id);


--
-- Name: daily_lead_report_media_buyers daily_lead_report_media_buyers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_lead_report_media_buyers
    ADD CONSTRAINT daily_lead_report_media_buyers_pkey PRIMARY KEY (id);


--
-- Name: daily_lead_reports daily_lead_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_lead_reports
    ADD CONSTRAINT daily_lead_reports_pkey PRIMARY KEY (id);


--
-- Name: daily_lead_source_mappings daily_lead_source_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_lead_source_mappings
    ADD CONSTRAINT daily_lead_source_mappings_pkey PRIMARY KEY (id);


--
-- Name: daily_metric_templates daily_metric_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_metric_templates
    ADD CONSTRAINT daily_metric_templates_pkey PRIMARY KEY (id);


--
-- Name: data_sources data_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_sources
    ADD CONSTRAINT data_sources_pkey PRIMARY KEY (id);


--
-- Name: follow_up_reminders follow_up_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_up_reminders
    ADD CONSTRAINT follow_up_reminders_pkey PRIMARY KEY (id);


--
-- Name: incentives incentives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incentives
    ADD CONSTRAINT incentives_pkey PRIMARY KEY (id);


--
-- Name: invoice_events invoice_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_events
    ADD CONSTRAINT invoice_events_pkey PRIMARY KEY (id);


--
-- Name: invoice_item_categories invoice_item_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_item_categories
    ADD CONSTRAINT invoice_item_categories_name_key UNIQUE (name);


--
-- Name: invoice_item_categories invoice_item_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_item_categories
    ADD CONSTRAINT invoice_item_categories_pkey PRIMARY KEY (id);


--
-- Name: invoice_items invoice_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_pkey PRIMARY KEY (id);


--
-- Name: invoice_line_items invoice_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT invoice_line_items_pkey PRIMARY KEY (id);


--
-- Name: invoice_settings invoice_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_settings
    ADD CONSTRAINT invoice_settings_pkey PRIMARY KEY (id);


--
-- Name: invoice_settings invoice_settings_workspace_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_settings
    ADD CONSTRAINT invoice_settings_workspace_key UNIQUE (workspace);


--
-- Name: invoices invoices_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_invoice_number_key UNIQUE (invoice_number);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: kpi_assignments kpi_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_assignments
    ADD CONSTRAINT kpi_assignments_pkey PRIMARY KEY (id);


--
-- Name: kpi_categories kpi_categories_category_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_categories
    ADD CONSTRAINT kpi_categories_category_key_key UNIQUE (category_key);


--
-- Name: kpi_categories kpi_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_categories
    ADD CONSTRAINT kpi_categories_pkey PRIMARY KEY (id);


--
-- Name: kpi_definitions kpi_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_definitions
    ADD CONSTRAINT kpi_definitions_pkey PRIMARY KEY (id);


--
-- Name: kpi_entries kpi_entries_assignment_id_kpi_id_user_id_period_start_perio_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_entries
    ADD CONSTRAINT kpi_entries_assignment_id_kpi_id_user_id_period_start_perio_key UNIQUE (assignment_id, kpi_id, user_id, period_start, period_end);


--
-- Name: kpi_entries kpi_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_entries
    ADD CONSTRAINT kpi_entries_pkey PRIMARY KEY (id);


--
-- Name: kpi_reward_earnings kpi_reward_earnings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_reward_earnings
    ADD CONSTRAINT kpi_reward_earnings_pkey PRIMARY KEY (id);


--
-- Name: kpi_reward_rules kpi_reward_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_reward_rules
    ADD CONSTRAINT kpi_reward_rules_pkey PRIMARY KEY (id);


--
-- Name: kpi_submissions kpi_submissions_entry_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_submissions
    ADD CONSTRAINT kpi_submissions_entry_unique UNIQUE (entry_id);


--
-- Name: kpi_submissions kpi_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_submissions
    ADD CONSTRAINT kpi_submissions_pkey PRIMARY KEY (id);


--
-- Name: kpi_template_items kpi_template_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_template_items
    ADD CONSTRAINT kpi_template_items_pkey PRIMARY KEY (id);


--
-- Name: kpi_template_items kpi_template_items_template_id_kpi_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_template_items
    ADD CONSTRAINT kpi_template_items_template_id_kpi_id_key UNIQUE (template_id, kpi_id);


--
-- Name: kpi_templates kpi_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_templates
    ADD CONSTRAINT kpi_templates_pkey PRIMARY KEY (id);


--
-- Name: lead_entries lead_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_entries
    ADD CONSTRAINT lead_entries_pkey PRIMARY KEY (id);


--
-- Name: lead_hotness_scores lead_hotness_scores_lead_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_hotness_scores
    ADD CONSTRAINT lead_hotness_scores_lead_id_key UNIQUE (lead_id);


--
-- Name: lead_hotness_scores lead_hotness_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_hotness_scores
    ADD CONSTRAINT lead_hotness_scores_pkey PRIMARY KEY (id);


--
-- Name: lead_notes lead_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_notes
    ADD CONSTRAINT lead_notes_pkey PRIMARY KEY (id);


--
-- Name: lead_qualifier_sessions lead_qualifier_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_qualifier_sessions
    ADD CONSTRAINT lead_qualifier_sessions_pkey PRIMARY KEY (id);


--
-- Name: lead_session_attendance lead_session_attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_session_attendance
    ADD CONSTRAINT lead_session_attendance_pkey PRIMARY KEY (id);


--
-- Name: lead_tag_assignments lead_tag_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tag_assignments
    ADD CONSTRAINT lead_tag_assignments_pkey PRIMARY KEY (id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: media_buyer_aliases media_buyer_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_buyer_aliases
    ADD CONSTRAINT media_buyer_aliases_pkey PRIMARY KEY (id);


--
-- Name: media_buyer_attribution media_buyer_attribution_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_buyer_attribution
    ADD CONSTRAINT media_buyer_attribution_pkey PRIMARY KEY (id);


--
-- Name: media_buyer_case_emails media_buyer_case_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_buyer_case_emails
    ADD CONSTRAINT media_buyer_case_emails_pkey PRIMARY KEY (id);


--
-- Name: media_buyer_case_events media_buyer_case_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_buyer_case_events
    ADD CONSTRAINT media_buyer_case_events_pkey PRIMARY KEY (id);


--
-- Name: media_buyer_cases media_buyer_cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_buyer_cases
    ADD CONSTRAINT media_buyer_cases_pkey PRIMARY KEY (id);


--
-- Name: media_buyer_service_periods media_buyer_service_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_buyer_service_periods
    ADD CONSTRAINT media_buyer_service_periods_pkey PRIMARY KEY (id);


--
-- Name: member_access_verifications member_access_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_access_verifications
    ADD CONSTRAINT member_access_verifications_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (id);


--
-- Name: notification_rules notification_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_rules
    ADD CONSTRAINT notification_rules_pkey PRIMARY KEY (id);


--
-- Name: notification_rules notification_rules_rule_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_rules
    ADD CONSTRAINT notification_rules_rule_key_key UNIQUE (rule_key);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: offer_items offer_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_items
    ADD CONSTRAINT offer_items_pkey PRIMARY KEY (id);


--
-- Name: offer_preset_items offer_preset_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_preset_items
    ADD CONSTRAINT offer_preset_items_pkey PRIMARY KEY (id);


--
-- Name: offer_presets offer_presets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_presets
    ADD CONSTRAINT offer_presets_pkey PRIMARY KEY (id);


--
-- Name: offline_seminar_reports offline_seminar_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offline_seminar_reports
    ADD CONSTRAINT offline_seminar_reports_pkey PRIMARY KEY (id);


--
-- Name: operations_communication_templates operations_communication_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_communication_templates
    ADD CONSTRAINT operations_communication_templates_pkey PRIMARY KEY (id);


--
-- Name: operations_conversion_reports operations_conversion_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_conversion_reports
    ADD CONSTRAINT operations_conversion_reports_pkey PRIMARY KEY (id);


--
-- Name: operations_handoff_rules operations_handoff_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_handoff_rules
    ADD CONSTRAINT operations_handoff_rules_pkey PRIMARY KEY (id);


--
-- Name: operations_intake_imports operations_intake_imports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_intake_imports
    ADD CONSTRAINT operations_intake_imports_pkey PRIMARY KEY (id);


--
-- Name: operations_lead_checklist_state operations_lead_checklist_sta_operations_lead_id_checklist__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_lead_checklist_state
    ADD CONSTRAINT operations_lead_checklist_sta_operations_lead_id_checklist__key UNIQUE (operations_lead_id, checklist_item_id);


--
-- Name: operations_lead_checklist_state operations_lead_checklist_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_lead_checklist_state
    ADD CONSTRAINT operations_lead_checklist_state_pkey PRIMARY KEY (id);


--
-- Name: operations_lead_custom_values operations_lead_custom_values_operations_lead_id_field_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_lead_custom_values
    ADD CONSTRAINT operations_lead_custom_values_operations_lead_id_field_id_key UNIQUE (operations_lead_id, field_id);


--
-- Name: operations_lead_custom_values operations_lead_custom_values_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_lead_custom_values
    ADD CONSTRAINT operations_lead_custom_values_pkey PRIMARY KEY (id);


--
-- Name: operations_leads operations_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_leads
    ADD CONSTRAINT operations_leads_pkey PRIMARY KEY (id);


--
-- Name: operations_offer_deliveries operations_offer_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_offer_deliveries
    ADD CONSTRAINT operations_offer_deliveries_pkey PRIMARY KEY (id);


--
-- Name: operations_process_templates operations_process_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_process_templates
    ADD CONSTRAINT operations_process_templates_pkey PRIMARY KEY (id);


--
-- Name: operations_result_reward_payouts operations_result_reward_payo_team_member_id_period_start_p_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_result_reward_payouts
    ADD CONSTRAINT operations_result_reward_payo_team_member_id_period_start_p_key UNIQUE (team_member_id, period_start, period_end);


--
-- Name: operations_result_reward_payouts operations_result_reward_payouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_result_reward_payouts
    ADD CONSTRAINT operations_result_reward_payouts_pkey PRIMARY KEY (id);


--
-- Name: operations_result_reward_rules operations_result_reward_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_result_reward_rules
    ADD CONSTRAINT operations_result_reward_rules_pkey PRIMARY KEY (id);


--
-- Name: operations_result_submissions operations_result_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_result_submissions
    ADD CONSTRAINT operations_result_submissions_pkey PRIMARY KEY (id);


--
-- Name: operations_reward_progress operations_reward_progress_media_buyer_id_rule_id_month_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_reward_progress
    ADD CONSTRAINT operations_reward_progress_media_buyer_id_rule_id_month_key UNIQUE (media_buyer_id, rule_id, month);


--
-- Name: operations_reward_progress operations_reward_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_reward_progress
    ADD CONSTRAINT operations_reward_progress_pkey PRIMARY KEY (id);


--
-- Name: operations_reward_rules operations_reward_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_reward_rules
    ADD CONSTRAINT operations_reward_rules_pkey PRIMARY KEY (id);


--
-- Name: operations_service_events operations_service_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_service_events
    ADD CONSTRAINT operations_service_events_pkey PRIMARY KEY (id);


--
-- Name: operations_template_checklist_items operations_template_checklist_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_template_checklist_items
    ADD CONSTRAINT operations_template_checklist_items_pkey PRIMARY KEY (id);


--
-- Name: operations_template_fields operations_template_fields_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_template_fields
    ADD CONSTRAINT operations_template_fields_pkey PRIMARY KEY (id);


--
-- Name: operations_template_fields operations_template_fields_template_id_field_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_template_fields
    ADD CONSTRAINT operations_template_fields_template_id_field_key_key UNIQUE (template_id, field_key);


--
-- Name: paid_lead_offer_items paid_lead_offer_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paid_lead_offer_items
    ADD CONSTRAINT paid_lead_offer_items_pkey PRIMARY KEY (id);


--
-- Name: paid_pipeline_activity_logs paid_pipeline_activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paid_pipeline_activity_logs
    ADD CONSTRAINT paid_pipeline_activity_logs_pkey PRIMARY KEY (id);


--
-- Name: paid_pipeline_batches paid_pipeline_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paid_pipeline_batches
    ADD CONSTRAINT paid_pipeline_batches_pkey PRIMARY KEY (id);


--
-- Name: paid_pipeline_finance_details paid_pipeline_finance_details_paid_pipeline_lead_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paid_pipeline_finance_details
    ADD CONSTRAINT paid_pipeline_finance_details_paid_pipeline_lead_id_key UNIQUE (paid_pipeline_lead_id);


--
-- Name: paid_pipeline_finance_details paid_pipeline_finance_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paid_pipeline_finance_details
    ADD CONSTRAINT paid_pipeline_finance_details_pkey PRIMARY KEY (id);


--
-- Name: paid_pipeline_followups paid_pipeline_followups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paid_pipeline_followups
    ADD CONSTRAINT paid_pipeline_followups_pkey PRIMARY KEY (id);


--
-- Name: paid_pipeline_leads paid_pipeline_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paid_pipeline_leads
    ADD CONSTRAINT paid_pipeline_leads_pkey PRIMARY KEY (id);


--
-- Name: paid_pipeline_payments paid_pipeline_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paid_pipeline_payments
    ADD CONSTRAINT paid_pipeline_payments_pkey PRIMARY KEY (id);


--
-- Name: paid_pipeline_settings paid_pipeline_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paid_pipeline_settings
    ADD CONSTRAINT paid_pipeline_settings_pkey PRIMARY KEY (id);


--
-- Name: paid_pipeline_to_crm_links paid_pipeline_to_crm_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paid_pipeline_to_crm_links
    ADD CONSTRAINT paid_pipeline_to_crm_links_pkey PRIMARY KEY (id);


--
-- Name: payroll_run_entries payroll_run_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_run_entries
    ADD CONSTRAINT payroll_run_entries_pkey PRIMARY KEY (id);


--
-- Name: payroll_runs payroll_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_runs
    ADD CONSTRAINT payroll_runs_pkey PRIMARY KEY (id);


--
-- Name: pipelines pipelines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipelines
    ADD CONSTRAINT pipelines_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profit_statement_lines profit_statement_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profit_statement_lines
    ADD CONSTRAINT profit_statement_lines_pkey PRIMARY KEY (id);


--
-- Name: profit_statements profit_statements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profit_statements
    ADD CONSTRAINT profit_statements_pkey PRIMARY KEY (id);


--
-- Name: program_products program_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_products
    ADD CONSTRAINT program_products_pkey PRIMARY KEY (id);


--
-- Name: quick_save_entries quick_save_entries_field_key_value_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quick_save_entries
    ADD CONSTRAINT quick_save_entries_field_key_value_key UNIQUE (field_key, value);


--
-- Name: quick_save_entries quick_save_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quick_save_entries
    ADD CONSTRAINT quick_save_entries_pkey PRIMARY KEY (id);


--
-- Name: recurring_expense_templates recurring_expense_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_expense_templates
    ADD CONSTRAINT recurring_expense_templates_pkey PRIMARY KEY (id);


--
-- Name: resource_library_categories resource_library_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_library_categories
    ADD CONSTRAINT resource_library_categories_pkey PRIMARY KEY (id);


--
-- Name: resource_library_items resource_library_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_library_items
    ADD CONSTRAINT resource_library_items_pkey PRIMARY KEY (id);


--
-- Name: roas_ad_spends roas_ad_spends_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roas_ad_spends
    ADD CONSTRAINT roas_ad_spends_pkey PRIMARY KEY (id);


--
-- Name: roas_attribution_audit_logs roas_attribution_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roas_attribution_audit_logs
    ADD CONSTRAINT roas_attribution_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: roas_attribution_logs roas_attribution_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roas_attribution_logs
    ADD CONSTRAINT roas_attribution_logs_pkey PRIMARY KEY (id);


--
-- Name: roas_calculation_drafts roas_calculation_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roas_calculation_drafts
    ADD CONSTRAINT roas_calculation_drafts_pkey PRIMARY KEY (id);


--
-- Name: roas_data_sources roas_data_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roas_data_sources
    ADD CONSTRAINT roas_data_sources_pkey PRIMARY KEY (id);


--
-- Name: roas_enrollments roas_enrollments_data_source_id_source_row_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roas_enrollments
    ADD CONSTRAINT roas_enrollments_data_source_id_source_row_hash_key UNIQUE (data_source_id, source_row_hash);


--
-- Name: roas_enrollments roas_enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roas_enrollments
    ADD CONSTRAINT roas_enrollments_pkey PRIMARY KEY (id);


--
-- Name: roas_fetch_logs roas_fetch_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roas_fetch_logs
    ADD CONSTRAINT roas_fetch_logs_pkey PRIMARY KEY (id);


--
-- Name: roas_history roas_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roas_history
    ADD CONSTRAINT roas_history_pkey PRIMARY KEY (id);


--
-- Name: roas_leads roas_leads_data_source_id_source_row_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roas_leads
    ADD CONSTRAINT roas_leads_data_source_id_source_row_hash_key UNIQUE (data_source_id, source_row_hash);


--
-- Name: roas_leads roas_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roas_leads
    ADD CONSTRAINT roas_leads_pkey PRIMARY KEY (id);


--
-- Name: roas_master_sheet_mappings roas_master_sheet_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roas_master_sheet_mappings
    ADD CONSTRAINT roas_master_sheet_mappings_pkey PRIMARY KEY (id);


--
-- Name: roas_master_sheet_tabs roas_master_sheet_tabs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roas_master_sheet_tabs
    ADD CONSTRAINT roas_master_sheet_tabs_pkey PRIMARY KEY (id);


--
-- Name: roas_master_sheets roas_master_sheets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roas_master_sheets
    ADD CONSTRAINT roas_master_sheets_pkey PRIMARY KEY (id);


--
-- Name: roas_media_buyers roas_media_buyers_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roas_media_buyers
    ADD CONSTRAINT roas_media_buyers_name_key UNIQUE (name);


--
-- Name: roas_media_buyers roas_media_buyers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roas_media_buyers
    ADD CONSTRAINT roas_media_buyers_pkey PRIMARY KEY (id);


--
-- Name: roas_sync_logs roas_sync_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roas_sync_logs
    ADD CONSTRAINT roas_sync_logs_pkey PRIMARY KEY (id);


--
-- Name: roas_webinars roas_webinars_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roas_webinars
    ADD CONSTRAINT roas_webinars_pkey PRIMARY KEY (id);


--
-- Name: seminar_roas_report_days seminar_roas_report_days_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seminar_roas_report_days
    ADD CONSTRAINT seminar_roas_report_days_pkey PRIMARY KEY (id);


--
-- Name: seminar_roas_report_products seminar_roas_report_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seminar_roas_report_products
    ADD CONSTRAINT seminar_roas_report_products_pkey PRIMARY KEY (id);


--
-- Name: seminar_roas_reports seminar_roas_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seminar_roas_reports
    ADD CONSTRAINT seminar_roas_reports_pkey PRIMARY KEY (id);


--
-- Name: service_packages service_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_packages
    ADD CONSTRAINT service_packages_pkey PRIMARY KEY (id);


--
-- Name: stage_sync_rules stage_sync_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stage_sync_rules
    ADD CONSTRAINT stage_sync_rules_pkey PRIMARY KEY (id);


--
-- Name: stages stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stages
    ADD CONSTRAINT stages_pkey PRIMARY KEY (id);


--
-- Name: students students_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_pkey PRIMARY KEY (id);


--
-- Name: system_refinement_items system_refinement_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_refinement_items
    ADD CONSTRAINT system_refinement_items_pkey PRIMARY KEY (id);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: task_activity task_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_activity
    ADD CONSTRAINT task_activity_pkey PRIMARY KEY (id);


--
-- Name: task_assignee_visibility task_assignee_visibility_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_assignee_visibility
    ADD CONSTRAINT task_assignee_visibility_pkey PRIMARY KEY (id);


--
-- Name: task_assignee_visibility task_assignee_visibility_user_id_hidden_by_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_assignee_visibility
    ADD CONSTRAINT task_assignee_visibility_user_id_hidden_by_key UNIQUE (user_id, hidden_by);


--
-- Name: task_submissions task_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_submissions
    ADD CONSTRAINT task_submissions_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: tax_code_master tax_code_master_code_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_code_master
    ADD CONSTRAINT tax_code_master_code_type_key UNIQUE (code, type);


--
-- Name: tax_code_master tax_code_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_code_master
    ADD CONSTRAINT tax_code_master_pkey PRIMARY KEY (id);


--
-- Name: team_payroll_profiles team_payroll_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_payroll_profiles
    ADD CONSTRAINT team_payroll_profiles_pkey PRIMARY KEY (id);


--
-- Name: team_payroll_profiles team_payroll_profiles_team_member_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_payroll_profiles
    ADD CONSTRAINT team_payroll_profiles_team_member_id_key UNIQUE (team_member_id);


--
-- Name: team_performance_reminders team_performance_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_performance_reminders
    ADD CONSTRAINT team_performance_reminders_pkey PRIMARY KEY (id);


--
-- Name: team_salary_history team_salary_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_salary_history
    ADD CONSTRAINT team_salary_history_pkey PRIMARY KEY (id);


--
-- Name: user_module_access user_module_access_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_module_access
    ADD CONSTRAINT user_module_access_pkey PRIMARY KEY (id);


--
-- Name: user_module_access user_module_access_user_id_module_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_module_access
    ADD CONSTRAINT user_module_access_user_id_module_key_key UNIQUE (user_id, module_key);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: webinar_batches webinar_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webinar_batches
    ADD CONSTRAINT webinar_batches_pkey PRIMARY KEY (id);


--
-- Name: webinar_templates webinar_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webinar_templates
    ADD CONSTRAINT webinar_templates_pkey PRIMARY KEY (id);


--
-- Name: webinars webinars_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webinars
    ADD CONSTRAINT webinars_name_key UNIQUE (name);


--
-- Name: webinars webinars_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webinars
    ADD CONSTRAINT webinars_pkey PRIMARY KEY (id);


--
-- Name: attendance_sessions_user_workdate_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX attendance_sessions_user_workdate_key ON public.attendance_sessions USING btree (user_id, work_date);


--
-- Name: attribution_sessions_is_deleted_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attribution_sessions_is_deleted_idx ON public.attribution_sessions USING btree (is_deleted);


--
-- Name: coc_requests_resign_for_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coc_requests_resign_for_idx ON public.code_of_conduct_requests USING btree (re_signature_for_request_id) WHERE (re_signature_for_request_id IS NOT NULL);


--
-- Name: code_of_conduct_requests_previous_token_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX code_of_conduct_requests_previous_token_hash_idx ON public.code_of_conduct_requests USING btree (previous_token_hash) WHERE (previous_token_hash IS NOT NULL);


--
-- Name: idx_access_readiness_logs_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_access_readiness_logs_lead ON public.access_readiness_logs USING btree (paid_pipeline_lead_id, created_at DESC);


--
-- Name: idx_activity_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_lead ON public.activity_logs USING btree (lead_id, logged_at DESC);


--
-- Name: idx_app_settings_group_key_bu; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_app_settings_group_key_bu ON public.app_settings USING btree (setting_group, setting_key, COALESCE(business_unit, ''::text)) WHERE (is_deleted = false);


--
-- Name: idx_attendance_sessions_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_sessions_user_date ON public.attendance_sessions USING btree (user_id, work_date);


--
-- Name: idx_attendee_lists_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendee_lists_session ON public.attribution_attendee_lists USING btree (session_id);


--
-- Name: idx_attr_mb_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attr_mb_session ON public.attribution_media_buyers USING btree (session_id);


--
-- Name: idx_attr_sales_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attr_sales_session ON public.attribution_sales_detail USING btree (session_id);


--
-- Name: idx_attr_sessions_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attr_sessions_date ON public.attribution_sessions USING btree (webinar_date DESC);


--
-- Name: idx_attribution_sessions_calculation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attribution_sessions_calculation_id ON public.attribution_sessions USING btree (calculation_id) WHERE (calculation_id IS NOT NULL);


--
-- Name: idx_attribution_sessions_input_output_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attribution_sessions_input_output_hash ON public.attribution_sessions USING btree (input_snapshot_hash, output_hash, created_by);


--
-- Name: idx_audit_logs_action_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_action_type ON public.audit_logs USING btree (action_type);


--
-- Name: idx_audit_logs_actor_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_actor_user_id ON public.audit_logs USING btree (actor_user_id);


--
-- Name: idx_audit_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs USING btree (created_at DESC);


--
-- Name: idx_audit_logs_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_entity ON public.audit_logs USING btree (entity_type, entity_id);


--
-- Name: idx_audit_logs_module_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_module_key ON public.audit_logs USING btree (module_key);


--
-- Name: idx_audit_logs_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_severity ON public.audit_logs USING btree (severity);


--
-- Name: idx_cba_pipeline_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cba_pipeline_batch ON public.crm_batch_archives USING btree (pipeline_id, batch_name);


--
-- Name: idx_coc_auto_events_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coc_auto_events_request ON public.code_of_conduct_automation_events USING btree (request_id);


--
-- Name: idx_coc_auto_events_rule; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coc_auto_events_rule ON public.code_of_conduct_automation_events USING btree (rule_id);


--
-- Name: idx_coc_events_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coc_events_request ON public.code_of_conduct_events USING btree (request_id);


--
-- Name: idx_coc_events_type_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coc_events_type_created ON public.code_of_conduct_events USING btree (event_type, created_at DESC);


--
-- Name: idx_coc_requests_crm_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coc_requests_crm_lead ON public.code_of_conduct_requests USING btree (crm_lead_id);


--
-- Name: idx_coc_requests_paid_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coc_requests_paid_lead ON public.code_of_conduct_requests USING btree (paid_pipeline_lead_id);


--
-- Name: idx_coc_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coc_requests_status ON public.code_of_conduct_requests USING btree (status);


--
-- Name: idx_coc_rules_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coc_rules_stage ON public.code_of_conduct_rules USING btree (stage_id, is_active);


--
-- Name: idx_crm_conv_paid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_conv_paid ON public.crm_lead_conversions USING btree (paid_pipeline_lead_id);


--
-- Name: idx_crm_conv_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_conv_source ON public.crm_lead_conversions USING btree (source_lead_id);


--
-- Name: idx_dcm_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_dcm_key ON public.daily_custom_metrics USING btree (metric_key) WHERE (is_active = true);


--
-- Name: idx_dlr_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dlr_created_by ON public.daily_lead_reports USING btree (created_by);


--
-- Name: idx_dlr_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dlr_date ON public.daily_lead_reports USING btree (report_date);


--
-- Name: idx_dlr_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dlr_hash ON public.daily_lead_reports USING btree (input_hash);


--
-- Name: idx_dlr_report_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dlr_report_date ON public.daily_lead_reports USING btree (report_date);


--
-- Name: idx_dlraa_mb; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dlraa_mb ON public.daily_lead_report_ad_accounts USING btree (report_media_buyer_id);


--
-- Name: idx_dlraa_mb_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dlraa_mb_id ON public.daily_lead_report_ad_accounts USING btree (report_media_buyer_id);


--
-- Name: idx_dlrmb_report; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dlrmb_report ON public.daily_lead_report_media_buyers USING btree (report_id);


--
-- Name: idx_dlrmb_report_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dlrmb_report_id ON public.daily_lead_report_media_buyers USING btree (report_id);


--
-- Name: idx_dlsm_mb_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dlsm_mb_name ON public.daily_lead_source_mappings USING btree (media_buyer_name);


--
-- Name: idx_invoice_events_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_events_invoice ON public.invoice_events USING btree (invoice_id);


--
-- Name: idx_invoice_items_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_items_category ON public.invoice_items USING btree (category_id);


--
-- Name: idx_invoice_items_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_items_name ON public.invoice_items USING gin (item_name public.gin_trgm_ops);


--
-- Name: idx_invoice_line_items_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_line_items_invoice ON public.invoice_line_items USING btree (invoice_id);


--
-- Name: idx_invoices_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_created_by ON public.invoices USING btree (created_by);


--
-- Name: idx_invoices_crm_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_crm_lead ON public.invoices USING btree (crm_lead_id);


--
-- Name: idx_invoices_paid_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_paid_lead ON public.invoices USING btree (paid_pipeline_lead_id);


--
-- Name: idx_invoices_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_status ON public.invoices USING btree (status);


--
-- Name: idx_kpi_assignments_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kpi_assignments_active ON public.kpi_assignments USING btree (is_active);


--
-- Name: idx_kpi_assignments_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kpi_assignments_user ON public.kpi_assignments USING btree (user_id);


--
-- Name: idx_kpi_defs_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kpi_defs_active ON public.kpi_definitions USING btree (is_active);


--
-- Name: idx_kpi_defs_cadence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kpi_defs_cadence ON public.kpi_definitions USING btree (cadence);


--
-- Name: idx_kpi_entries_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kpi_entries_status ON public.kpi_entries USING btree (status);


--
-- Name: idx_kpi_entries_user_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kpi_entries_user_period ON public.kpi_entries USING btree (user_id, period_start, period_end);


--
-- Name: idx_kpi_submissions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kpi_submissions_status ON public.kpi_submissions USING btree (status);


--
-- Name: idx_kpi_submissions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kpi_submissions_user ON public.kpi_submissions USING btree (user_id);


--
-- Name: idx_kpi_template_items_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kpi_template_items_template ON public.kpi_template_items USING btree (template_id);


--
-- Name: idx_lead_notes_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_notes_lead_id ON public.lead_notes USING btree (lead_id, created_at DESC);


--
-- Name: idx_lead_notes_paid_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_notes_paid_id ON public.lead_notes USING btree (paid_pipeline_lead_id) WHERE (paid_pipeline_lead_id IS NOT NULL);


--
-- Name: idx_leads_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_agent ON public.leads USING btree (assigned_agent_id);


--
-- Name: idx_leads_archived_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_archived_at ON public.leads USING btree (archived_at) WHERE (archived_at IS NOT NULL);


--
-- Name: idx_leads_converted_to_crm_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_converted_to_crm_lead_id ON public.leads USING btree (converted_to_crm_lead_id);


--
-- Name: idx_leads_email_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_email_lower ON public.leads USING btree (lower(email));


--
-- Name: idx_leads_full_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_full_name_trgm ON public.leads USING gin (full_name public.gin_trgm_ops);


--
-- Name: idx_leads_paid_pipeline_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_paid_pipeline_lead_id ON public.leads USING btree (paid_pipeline_lead_id);


--
-- Name: idx_leads_phone_last10; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_phone_last10 ON public.leads USING btree ("right"(regexp_replace(COALESCE(phone, ''::text), '\D'::text, ''::text, 'g'::text), 10));


--
-- Name: idx_leads_pipeline_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_pipeline_stage ON public.leads USING btree (pipeline_id, stage_id);


--
-- Name: idx_leads_program_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_program_id ON public.leads USING btree (program_id);


--
-- Name: idx_leads_stage_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_stage_sort ON public.leads USING btree (stage_id, sort_order);


--
-- Name: idx_lta_crm_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lta_crm_lead ON public.lead_tag_assignments USING btree (crm_lead_id);


--
-- Name: idx_lta_paid_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lta_paid_lead ON public.lead_tag_assignments USING btree (paid_pipeline_lead_id);


--
-- Name: idx_mbc_ads_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mbc_ads_status ON public.media_buyer_cases USING btree (ads_status);


--
-- Name: idx_mbc_assigned_buyer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mbc_assigned_buyer ON public.media_buyer_cases USING btree (assigned_media_buyer_id);


--
-- Name: idx_mbc_first_call_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mbc_first_call_due ON public.media_buyer_cases USING btree (first_call_due_at);


--
-- Name: idx_mbc_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mbc_stage ON public.media_buyer_cases USING btree (case_stage);


--
-- Name: idx_mbce_case; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mbce_case ON public.media_buyer_case_events USING btree (case_id);


--
-- Name: idx_mbcm_case; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mbcm_case ON public.media_buyer_case_emails USING btree (case_id);


--
-- Name: idx_mbsp_case; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mbsp_case ON public.media_buyer_service_periods USING btree (case_id);


--
-- Name: idx_notif_prefs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_prefs_user ON public.notification_preferences USING btree (user_id, module_key, notification_type);


--
-- Name: idx_notifications_dedupe; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_dedupe ON public.notifications USING btree (recipient_user_id, notification_type, entity_type, entity_id, status);


--
-- Name: idx_notifications_module; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_module ON public.notifications USING btree (module_key, created_at DESC);


--
-- Name: idx_notifications_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_recipient ON public.notifications USING btree (recipient_user_id, status, created_at DESC);


--
-- Name: idx_offline_seminar_reports_event_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_offline_seminar_reports_event_date ON public.offline_seminar_reports USING btree (event_date);


--
-- Name: idx_offline_seminar_reports_is_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_offline_seminar_reports_is_deleted ON public.offline_seminar_reports USING btree (is_deleted);


--
-- Name: idx_operations_leads_email_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_operations_leads_email_lower ON public.operations_leads USING btree (lower(email));


--
-- Name: idx_operations_leads_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_operations_leads_name_trgm ON public.operations_leads USING gin (name public.gin_trgm_ops);


--
-- Name: idx_operations_leads_phone_last10; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_operations_leads_phone_last10 ON public.operations_leads USING btree ("right"(regexp_replace(COALESCE(phone, ''::text), '\D'::text, ''::text, 'g'::text), 10));


--
-- Name: idx_ops_conv_buyer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ops_conv_buyer ON public.operations_conversion_reports USING btree (media_buyer_id);


--
-- Name: idx_ops_conv_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ops_conv_lead ON public.operations_conversion_reports USING btree (operations_lead_id);


--
-- Name: idx_ops_conv_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ops_conv_status ON public.operations_conversion_reports USING btree (verification_status);


--
-- Name: idx_ops_events_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ops_events_lead ON public.operations_service_events USING btree (operations_lead_id);


--
-- Name: idx_ops_events_lead_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ops_events_lead_type ON public.operations_service_events USING btree (operations_lead_id, event_type);


--
-- Name: idx_ops_handoff_rules_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ops_handoff_rules_active ON public.operations_handoff_rules USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_ops_handoff_rules_pipeline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ops_handoff_rules_pipeline ON public.operations_handoff_rules USING btree (source_pipeline_id);


--
-- Name: idx_ops_leads_buyer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ops_leads_buyer ON public.operations_leads USING btree (assigned_media_buyer_id);


--
-- Name: idx_ops_leads_crm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ops_leads_crm ON public.operations_leads USING btree (crm_lead_id);


--
-- Name: idx_ops_leads_paid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ops_leads_paid ON public.operations_leads USING btree (paid_pipeline_lead_id);


--
-- Name: idx_ops_leads_pipeline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ops_leads_pipeline ON public.operations_leads USING btree (pipeline_id);


--
-- Name: idx_ops_leads_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ops_leads_stage ON public.operations_leads USING btree (stage_id);


--
-- Name: idx_paid_pipeline_leads_access_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_paid_pipeline_leads_access_status ON public.paid_pipeline_leads USING btree (access_status);


--
-- Name: idx_paid_pipeline_leads_crm_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_paid_pipeline_leads_crm_lead_id ON public.paid_pipeline_leads USING btree (crm_lead_id);


--
-- Name: idx_paid_pipeline_leads_email_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_paid_pipeline_leads_email_lower ON public.paid_pipeline_leads USING btree (lower(email));


--
-- Name: idx_paid_pipeline_leads_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_paid_pipeline_leads_name_trgm ON public.paid_pipeline_leads USING gin (name public.gin_trgm_ops);


--
-- Name: idx_paid_pipeline_leads_phone_last10; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_paid_pipeline_leads_phone_last10 ON public.paid_pipeline_leads USING btree ("right"(regexp_replace(COALESCE(phone, ''::text), '\D'::text, ''::text, 'g'::text), 10));


--
-- Name: idx_paid_pipeline_leads_source_unpaid_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_paid_pipeline_leads_source_unpaid_lead_id ON public.paid_pipeline_leads USING btree (source_unpaid_lead_id);


--
-- Name: idx_pp_bu_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pp_bu_active ON public.program_products USING btree (business_unit) WHERE ((is_active = true) AND (is_deleted = false));


--
-- Name: idx_pp_program_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pp_program_id ON public.program_products USING btree (program_id);


--
-- Name: idx_ppal_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ppal_lead ON public.paid_pipeline_activity_logs USING btree (paid_pipeline_lead_id, created_at DESC);


--
-- Name: idx_ppb_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ppb_status ON public.paid_pipeline_batches USING btree (batch_status) WHERE (is_deleted = false);


--
-- Name: idx_ppf_follow_up_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ppf_follow_up_date ON public.paid_pipeline_followups USING btree (follow_up_date);


--
-- Name: idx_ppf_is_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ppf_is_deleted ON public.paid_pipeline_followups USING btree (is_deleted);


--
-- Name: idx_ppf_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ppf_status ON public.paid_pipeline_followups USING btree (status);


--
-- Name: idx_ppfu_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ppfu_date ON public.paid_pipeline_followups USING btree (follow_up_date);


--
-- Name: idx_ppfu_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ppfu_lead ON public.paid_pipeline_followups USING btree (paid_pipeline_lead_id);


--
-- Name: idx_ppl_archived_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ppl_archived_at ON public.paid_pipeline_leads USING btree (archived_at) WHERE (archived_at IS NOT NULL);


--
-- Name: idx_ppl_assigned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ppl_assigned ON public.paid_pipeline_leads USING btree (assigned_sales_executive);


--
-- Name: idx_ppl_attr_sale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ppl_attr_sale ON public.paid_pipeline_leads USING btree (attribution_sale_id);


--
-- Name: idx_ppl_attr_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ppl_attr_session ON public.paid_pipeline_leads USING btree (attribution_session_id);


--
-- Name: idx_ppl_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ppl_batch ON public.paid_pipeline_leads USING btree (webinar_batch_id) WHERE (is_deleted = false);


--
-- Name: idx_ppl_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ppl_email ON public.paid_pipeline_leads USING btree (lower(email));


--
-- Name: idx_ppl_paid_batch_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ppl_paid_batch_id ON public.paid_pipeline_leads USING btree (paid_batch_id);


--
-- Name: idx_ppl_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ppl_phone ON public.paid_pipeline_leads USING btree (phone);


--
-- Name: idx_ppl_program_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ppl_program_id ON public.paid_pipeline_leads USING btree (program_id);


--
-- Name: idx_ppl_source_webinar_batch_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ppl_source_webinar_batch_id ON public.paid_pipeline_leads USING btree (source_webinar_batch_id);


--
-- Name: idx_ppl_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ppl_stage ON public.paid_pipeline_leads USING btree (pipeline_stage) WHERE (is_deleted = false);


--
-- Name: idx_ppp_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ppp_lead ON public.paid_pipeline_payments USING btree (paid_pipeline_lead_id) WHERE (is_deleted = false);


--
-- Name: idx_pps_type_bu; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pps_type_bu ON public.paid_pipeline_settings USING btree (setting_type, business_unit) WHERE ((is_active = true) AND (is_deleted = false));


--
-- Name: idx_pptcl_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pptcl_lead ON public.paid_pipeline_to_crm_links USING btree (paid_pipeline_lead_id);


--
-- Name: idx_profiles_deactivated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_deactivated_at ON public.profiles USING btree (deactivated_at);


--
-- Name: idx_qse_field_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qse_field_active ON public.quick_save_entries USING btree (field_key, is_active);


--
-- Name: idx_qse_field_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qse_field_key ON public.quick_save_entries USING btree (field_key);


--
-- Name: idx_rcd_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rcd_user ON public.roas_calculation_drafts USING btree (user_id);


--
-- Name: idx_reminders_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminders_date ON public.follow_up_reminders USING btree (reminder_date);


--
-- Name: idx_reminders_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminders_lead ON public.follow_up_reminders USING btree (lead_id);


--
-- Name: idx_rmsm_spreadsheet_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rmsm_spreadsheet_id ON public.roas_master_sheet_mappings USING btree (spreadsheet_id);


--
-- Name: idx_rmst_master; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rmst_master ON public.roas_master_sheet_tabs USING btree (master_sheet_id);


--
-- Name: idx_roas_attr_enr; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roas_attr_enr ON public.roas_attribution_logs USING btree (enrollment_id);


--
-- Name: idx_roas_enr_buyer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roas_enr_buyer ON public.roas_enrollments USING btree (attributed_media_buyer_id);


--
-- Name: idx_roas_enr_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roas_enr_email ON public.roas_enrollments USING btree (clean_email);


--
-- Name: idx_roas_enr_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roas_enr_phone ON public.roas_enrollments USING btree (clean_phone);


--
-- Name: idx_roas_enr_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roas_enr_status ON public.roas_enrollments USING btree (attribution_status);


--
-- Name: idx_roas_enr_webinar; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roas_enr_webinar ON public.roas_enrollments USING btree (attributed_webinar_id);


--
-- Name: idx_roas_leads_clean_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roas_leads_clean_email ON public.roas_leads USING btree (clean_email);


--
-- Name: idx_roas_leads_clean_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roas_leads_clean_phone ON public.roas_leads USING btree (clean_phone);


--
-- Name: idx_roas_leads_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roas_leads_created ON public.roas_leads USING btree (created_at_from_sheet);


--
-- Name: idx_roas_leads_media_buyer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roas_leads_media_buyer ON public.roas_leads USING btree (media_buyer_id);


--
-- Name: idx_roas_spend_buyer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roas_spend_buyer ON public.roas_ad_spends USING btree (media_buyer_id);


--
-- Name: idx_roas_spend_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roas_spend_date ON public.roas_ad_spends USING btree (spend_date);


--
-- Name: idx_roas_sync_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roas_sync_source ON public.roas_sync_logs USING btree (data_source_id);


--
-- Name: idx_roas_sync_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roas_sync_started ON public.roas_sync_logs USING btree (sync_started_at DESC);


--
-- Name: idx_srefi_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_srefi_priority ON public.system_refinement_items USING btree (priority);


--
-- Name: idx_srefi_section; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_srefi_section ON public.system_refinement_items USING btree (section);


--
-- Name: idx_srefi_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_srefi_status ON public.system_refinement_items USING btree (status);


--
-- Name: idx_srrd_report; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_srrd_report ON public.seminar_roas_report_days USING btree (report_id);


--
-- Name: idx_srrp_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_srrp_product_id ON public.seminar_roas_report_products USING btree (product_id);


--
-- Name: idx_srrp_report; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_srrp_report ON public.seminar_roas_report_products USING btree (report_id);


--
-- Name: idx_stages_pipeline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stages_pipeline ON public.stages USING btree (pipeline_id, "position");


--
-- Name: idx_task_activity_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_activity_task ON public.task_activity USING btree (task_id, created_at DESC);


--
-- Name: idx_tasks_assigned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_assigned ON public.tasks USING btree (assigned_to) WHERE (is_archived = false);


--
-- Name: idx_tasks_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_due ON public.tasks USING btree (due_date) WHERE (is_archived = false);


--
-- Name: idx_tasks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_status ON public.tasks USING btree (status) WHERE (is_archived = false);


--
-- Name: idx_tax_code_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tax_code_code ON public.tax_code_master USING btree (code);


--
-- Name: idx_tax_code_desc_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tax_code_desc_trgm ON public.tax_code_master USING gin (description public.gin_trgm_ops);


--
-- Name: idx_tax_code_keywords; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tax_code_keywords ON public.tax_code_master USING gin (keywords);


--
-- Name: idx_wb_business_unit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wb_business_unit ON public.webinar_batches USING btree (business_unit) WHERE (is_deleted = false);


--
-- Name: idx_wb_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wb_date ON public.webinar_batches USING btree (webinar_date);


--
-- Name: idx_wb_program_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wb_program_id ON public.webinar_batches USING btree (program_id);


--
-- Name: idx_wt_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wt_name ON public.webinar_templates USING btree (lower(name));


--
-- Name: kpi_reward_earnings_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX kpi_reward_earnings_status_idx ON public.kpi_reward_earnings USING btree (status);


--
-- Name: kpi_reward_earnings_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX kpi_reward_earnings_uq ON public.kpi_reward_earnings USING btree (user_id, reward_rule_id, period_type, period_start, period_end);


--
-- Name: kpi_reward_earnings_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX kpi_reward_earnings_user_idx ON public.kpi_reward_earnings USING btree (user_id, period_start DESC);


--
-- Name: lead_session_attendance_batch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_session_attendance_batch_idx ON public.lead_session_attendance USING btree (batch_id);


--
-- Name: lead_session_attendance_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_session_attendance_email_idx ON public.lead_session_attendance USING btree (normalized_email);


--
-- Name: lead_session_attendance_lead_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_session_attendance_lead_idx ON public.lead_session_attendance USING btree (lead_id);


--
-- Name: lead_session_attendance_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_session_attendance_phone_idx ON public.lead_session_attendance USING btree (normalized_phone);


--
-- Name: lead_session_attendance_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX lead_session_attendance_unique ON public.lead_session_attendance USING btree (lead_id, session_key);


--
-- Name: leads_unique_email_per_pipeline; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX leads_unique_email_per_pipeline ON public.leads USING btree (lower(email), pipeline_id) WHERE ((email IS NOT NULL) AND (email <> ''::text) AND (archived_at IS NULL) AND (deleted_at IS NULL));


--
-- Name: mav_crm_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX mav_crm_uniq ON public.member_access_verifications USING btree (crm_lead_id) WHERE ((crm_lead_id IS NOT NULL) AND (paid_pipeline_lead_id IS NULL));


--
-- Name: mav_next_follow_up_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mav_next_follow_up_idx ON public.member_access_verifications USING btree (next_follow_up_at);


--
-- Name: mav_paid_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX mav_paid_uniq ON public.member_access_verifications USING btree (paid_pipeline_lead_id) WHERE (paid_pipeline_lead_id IS NOT NULL);


--
-- Name: media_buyer_aliases_alias_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX media_buyer_aliases_alias_key ON public.media_buyer_aliases USING btree (lower(TRIM(BOTH FROM alias_name))) WHERE (is_deleted = false);


--
-- Name: media_buyer_aliases_canonical_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_buyer_aliases_canonical_idx ON public.media_buyer_aliases USING btree (lower(TRIM(BOTH FROM canonical_name)));


--
-- Name: offer_items_name_lower_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX offer_items_name_lower_idx ON public.offer_items USING btree (lower(name)) WHERE (is_active = true);


--
-- Name: operations_leads_intake_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX operations_leads_intake_status_idx ON public.operations_leads USING btree (intake_status);


--
-- Name: operations_offer_deliveries_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX operations_offer_deliveries_due_idx ON public.operations_offer_deliveries USING btree (due_date);


--
-- Name: operations_offer_deliveries_lead_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX operations_offer_deliveries_lead_idx ON public.operations_offer_deliveries USING btree (operations_lead_id);


--
-- Name: operations_offer_deliveries_lead_offer_uk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX operations_offer_deliveries_lead_offer_uk ON public.operations_offer_deliveries USING btree (operations_lead_id, paid_lead_offer_item_id) WHERE (paid_lead_offer_item_id IS NOT NULL);


--
-- Name: operations_offer_deliveries_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX operations_offer_deliveries_status_idx ON public.operations_offer_deliveries USING btree (delivery_status);


--
-- Name: orrp_member_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orrp_member_idx ON public.operations_result_reward_payouts USING btree (team_member_id);


--
-- Name: orrp_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orrp_period_idx ON public.operations_result_reward_payouts USING btree (period_start, period_end);


--
-- Name: ors_approved_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ors_approved_at_idx ON public.operations_result_submissions USING btree (approved_at);


--
-- Name: ors_crm_lead_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ors_crm_lead_idx ON public.operations_result_submissions USING btree (crm_lead_id);


--
-- Name: ors_ops_lead_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ors_ops_lead_idx ON public.operations_result_submissions USING btree (operations_lead_id);


--
-- Name: ors_paid_lead_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ors_paid_lead_idx ON public.operations_result_submissions USING btree (paid_pipeline_lead_id);


--
-- Name: ors_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ors_status_idx ON public.operations_result_submissions USING btree (status);


--
-- Name: ors_submitted_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ors_submitted_by_idx ON public.operations_result_submissions USING btree (submitted_by);


--
-- Name: plo_crm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX plo_crm_idx ON public.paid_lead_offer_items USING btree (crm_lead_id);


--
-- Name: plo_dedup_paid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX plo_dedup_paid ON public.paid_lead_offer_items USING btree (paid_pipeline_lead_id, offer_item_id, source_context) WHERE ((paid_pipeline_lead_id IS NOT NULL) AND (offer_item_id IS NOT NULL) AND (source_context IS NOT NULL));


--
-- Name: plo_ops_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX plo_ops_idx ON public.paid_lead_offer_items USING btree (operations_lead_id);


--
-- Name: plo_paid_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX plo_paid_idx ON public.paid_lead_offer_items USING btree (paid_pipeline_lead_id);


--
-- Name: pr_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pr_period_idx ON public.payroll_runs USING btree (business_unit, period_start, period_end);


--
-- Name: pre_run_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pre_run_idx ON public.payroll_run_entries USING btree (payroll_run_id);


--
-- Name: ps_month_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ps_month_idx ON public.profit_statements USING btree (business_unit, statement_month);


--
-- Name: psl_stmt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX psl_stmt_idx ON public.profit_statement_lines USING btree (profit_statement_id);


--
-- Name: raal_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX raal_session_idx ON public.roas_attribution_audit_logs USING btree (attribution_session_id);


--
-- Name: rli_archived_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rli_archived_idx ON public.resource_library_items USING btree (archived_at);


--
-- Name: rli_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rli_category_idx ON public.resource_library_items USING btree (category);


--
-- Name: rli_visibility_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rli_visibility_idx ON public.resource_library_items USING btree (visibility);


--
-- Name: students_full_name_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX students_full_name_lower ON public.students USING btree (lower(full_name));


--
-- Name: students_search_text_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX students_search_text_trgm ON public.students USING gin (search_text public.gin_trgm_ops);


--
-- Name: students_unique_src_email_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX students_unique_src_email_phone ON public.students USING btree (source, COALESCE(email, ''::text), COALESCE(phone, ''::text)) WHERE ((COALESCE(email, ''::text) <> ''::text) OR (COALESCE(phone, ''::text) <> ''::text));


--
-- Name: task_submissions_task_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_submissions_task_id_idx ON public.task_submissions USING btree (task_id, created_at DESC);


--
-- Name: tpr_uniq_kpi; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tpr_uniq_kpi ON public.team_performance_reminders USING btree (user_id, kpi_entry_id, reminder_type, reminder_for_date) WHERE (kpi_entry_id IS NOT NULL);


--
-- Name: tpr_uniq_summary; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tpr_uniq_summary ON public.team_performance_reminders USING btree (user_id, reminder_type, reminder_for_date) WHERE (kpi_entry_id IS NULL);


--
-- Name: tpr_user_status_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tpr_user_status_date ON public.team_performance_reminders USING btree (user_id, status, reminder_for_date DESC);


--
-- Name: uniq_ops_leads_active_crm; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_ops_leads_active_crm ON public.operations_leads USING btree (crm_lead_id) WHERE ((crm_lead_id IS NOT NULL) AND (service_status <> ALL (ARRAY['stopped'::text, 'completed'::text])));


--
-- Name: uniq_ops_leads_active_paid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_ops_leads_active_paid ON public.operations_leads USING btree (paid_pipeline_lead_id) WHERE ((paid_pipeline_lead_id IS NOT NULL) AND (service_status <> ALL (ARRAY['stopped'::text, 'completed'::text])));


--
-- Name: uq_coc_ignore_crm; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_coc_ignore_crm ON public.code_of_conduct_suggestion_ignores USING btree (rule_id, crm_lead_id) WHERE (crm_lead_id IS NOT NULL);


--
-- Name: uq_coc_ignore_paid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_coc_ignore_paid ON public.code_of_conduct_suggestion_ignores USING btree (rule_id, paid_pipeline_lead_id) WHERE (paid_pipeline_lead_id IS NOT NULL);


--
-- Name: uq_coc_rules_active_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_coc_rules_active_stage ON public.code_of_conduct_rules USING btree (source, pipeline_id, stage_id) WHERE (is_active = true);


--
-- Name: uq_tag_crm_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_tag_crm_lead ON public.lead_tag_assignments USING btree (tag_id, crm_lead_id) WHERE (crm_lead_id IS NOT NULL);


--
-- Name: uq_tag_paid_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_tag_paid_lead ON public.lead_tag_assignments USING btree (tag_id, paid_pipeline_lead_id) WHERE (paid_pipeline_lead_id IS NOT NULL);


--
-- Name: uq_tags_name_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_tags_name_scope ON public.tags USING btree (lower(name), module_scope);


--
-- Name: ux_business_units_program_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_business_units_program_key ON public.business_units USING btree (program_key) WHERE (program_key IS NOT NULL);


--
-- Name: webinar_batches_name_date_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX webinar_batches_name_date_uidx ON public.webinar_batches USING btree (lower(COALESCE(batch_name, webinar_name, ''::text)), COALESCE(webinar_date, '1900-01-01'::date)) WHERE (is_deleted = false);


--
-- Name: webinars_active_norm_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX webinars_active_norm_uq ON public.webinars USING btree (normalized_name) WHERE (is_active = true);


--
-- Name: crm_conversion_rules crm_conversion_rules_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER crm_conversion_rules_touch_updated_at BEFORE UPDATE ON public.crm_conversion_rules FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: incentives inc_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inc_touch BEFORE UPDATE ON public.incentives FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: kpi_categories kpi_categories_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER kpi_categories_touch BEFORE UPDATE ON public.kpi_categories FOR EACH ROW EXECUTE FUNCTION public.tp_touch_updated_at();


--
-- Name: kpi_reward_earnings kpi_reward_earnings_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER kpi_reward_earnings_touch BEFORE UPDATE ON public.kpi_reward_earnings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: kpi_reward_rules kpi_reward_rules_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER kpi_reward_rules_touch BEFORE UPDATE ON public.kpi_reward_rules FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: lead_hotness_scores lead_hotness_scores_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lead_hotness_scores_touch BEFORE UPDATE ON public.lead_hotness_scores FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: lead_session_attendance lead_session_attendance_key_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lead_session_attendance_key_trg BEFORE INSERT OR UPDATE ON public.lead_session_attendance FOR EACH ROW EXECUTE FUNCTION public.lead_session_attendance_set_key();


--
-- Name: operations_result_reward_payouts orrp_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER orrp_touch BEFORE UPDATE ON public.operations_result_reward_payouts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: operations_result_reward_rules orrr_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER orrr_touch BEFORE UPDATE ON public.operations_result_reward_rules FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: operations_result_submissions ors_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ors_touch BEFORE UPDATE ON public.operations_result_submissions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: payroll_runs pr_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pr_touch BEFORE UPDATE ON public.payroll_runs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: payroll_run_entries pre_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pre_touch BEFORE UPDATE ON public.payroll_run_entries FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: profiles profiles_prevent_privilege_escalation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_prevent_privilege_escalation BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();


--
-- Name: profit_statements ps_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ps_touch BEFORE UPDATE ON public.profit_statements FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: quick_save_entries qse_touch_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER qse_touch_updated BEFORE UPDATE ON public.quick_save_entries FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: recurring_expense_templates ret_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ret_touch BEFORE UPDATE ON public.recurring_expense_templates FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: roas_master_sheets rms_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER rms_touch BEFORE UPDATE ON public.roas_master_sheets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: roas_master_sheet_tabs rmst_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER rmst_touch BEFORE UPDATE ON public.roas_master_sheet_tabs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: company_role_catalog role_catalog_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER role_catalog_touch BEFORE UPDATE ON public.company_role_catalog FOR EACH ROW EXECUTE FUNCTION public.tp_touch_updated_at();


--
-- Name: stage_sync_rules stage_sync_rules_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER stage_sync_rules_touch_updated_at BEFORE UPDATE ON public.stage_sync_rules FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: task_submissions task_submissions_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER task_submissions_set_updated_at BEFORE UPDATE ON public.task_submissions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: team_payroll_profiles tpp_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tpp_touch BEFORE UPDATE ON public.team_payroll_profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: team_performance_reminders tpr_touch_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tpr_touch_updated BEFORE UPDATE ON public.team_performance_reminders FOR EACH ROW EXECUTE FUNCTION public.tpr_touch_updated_at();


--
-- Name: access_templates trg_access_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_access_templates_updated_at BEFORE UPDATE ON public.access_templates FOR EACH ROW EXECUTE FUNCTION public.access_templates_set_updated_at();


--
-- Name: app_settings trg_app_settings_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_settings_updated BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: attendance_sessions trg_attendance_sessions_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_attendance_sessions_updated BEFORE UPDATE ON public.attendance_sessions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: business_units trg_business_units_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_business_units_updated_at BEFORE UPDATE ON public.business_units FOR EACH ROW EXECUTE FUNCTION public.tg_business_units_updated_at();


--
-- Name: code_of_conduct_requests trg_coc_after_signed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_coc_after_signed AFTER UPDATE ON public.code_of_conduct_requests FOR EACH ROW EXECUTE FUNCTION public.coc_after_signed_sync();


--
-- Name: code_of_conduct_automation_rules trg_coc_auto_rules_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_coc_auto_rules_updated_at BEFORE UPDATE ON public.code_of_conduct_automation_rules FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: code_of_conduct_guide_progress trg_coc_guide_progress_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_coc_guide_progress_updated_at BEFORE UPDATE ON public.code_of_conduct_guide_progress FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: code_of_conduct_requests trg_coc_mirror_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_coc_mirror_status AFTER INSERT OR UPDATE ON public.code_of_conduct_requests FOR EACH ROW EXECUTE FUNCTION public.coc_mirror_status();


--
-- Name: code_of_conduct_requests trg_coc_requests_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_coc_requests_updated BEFORE UPDATE ON public.code_of_conduct_requests FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: code_of_conduct_rules trg_coc_rules_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_coc_rules_updated BEFORE UPDATE ON public.code_of_conduct_rules FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: code_of_conduct_templates trg_coc_templates_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_coc_templates_updated BEFORE UPDATE ON public.code_of_conduct_templates FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: code_of_conduct_email_variants trg_coc_variants_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_coc_variants_updated_at BEFORE UPDATE ON public.code_of_conduct_email_variants FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: company_settings trg_company_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_company_settings_updated_at BEFORE UPDATE ON public.company_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: data_sources trg_data_sources_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_data_sources_updated BEFORE UPDATE ON public.data_sources FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: daily_custom_metrics trg_dcm_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_dcm_updated BEFORE UPDATE ON public.daily_custom_metrics FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: daily_lead_reports trg_dlr_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_dlr_updated BEFORE UPDATE ON public.daily_lead_reports FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: daily_lead_report_ad_accounts trg_dlraa_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_dlraa_updated BEFORE UPDATE ON public.daily_lead_report_ad_accounts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: daily_lead_report_media_buyers trg_dlrmb_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_dlrmb_updated BEFORE UPDATE ON public.daily_lead_report_media_buyers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: daily_lead_source_mappings trg_dlsm_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_dlsm_updated BEFORE UPDATE ON public.daily_lead_source_mappings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: daily_metric_templates trg_dmt_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_dmt_updated BEFORE UPDATE ON public.daily_metric_templates FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: paid_pipeline_leads trg_ensure_paid_buyer_has_paid_crm_card; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ensure_paid_buyer_has_paid_crm_card BEFORE INSERT OR UPDATE OF crm_lead_id, source_unpaid_lead_id, paid_batch_name, source_webinar, onboarding_batch_name, source_report_date, archived_at, deleted_at, is_deleted ON public.paid_pipeline_leads FOR EACH ROW EXECUTE FUNCTION public.ensure_paid_buyer_has_paid_crm_card();


--
-- Name: invoice_item_categories trg_invoice_item_categories_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_invoice_item_categories_updated_at BEFORE UPDATE ON public.invoice_item_categories FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: invoice_items trg_invoice_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_invoice_items_updated_at BEFORE UPDATE ON public.invoice_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: invoice_settings trg_invoice_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_invoice_settings_updated_at BEFORE UPDATE ON public.invoice_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: invoices trg_invoices_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: kpi_assignments trg_kpi_assignments_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_kpi_assignments_updated BEFORE UPDATE ON public.kpi_assignments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: kpi_definitions trg_kpi_defs_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_kpi_defs_updated BEFORE UPDATE ON public.kpi_definitions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: kpi_entries trg_kpi_entries_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_kpi_entries_updated BEFORE UPDATE ON public.kpi_entries FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: kpi_submissions trg_kpi_submissions_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_kpi_submissions_updated BEFORE UPDATE ON public.kpi_submissions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: kpi_templates trg_kpi_templates_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_kpi_templates_updated BEFORE UPDATE ON public.kpi_templates FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: leads trg_leads_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_leads_touch BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: member_access_verifications trg_mav_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_mav_updated_at BEFORE UPDATE ON public.member_access_verifications FOR EACH ROW EXECUTE FUNCTION public.mav_touch_updated_at();


--
-- Name: media_buyer_cases trg_mbc_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_mbc_touch_updated_at BEFORE UPDATE ON public.media_buyer_cases FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: media_buyer_aliases trg_media_buyer_aliases_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_media_buyer_aliases_updated_at BEFORE UPDATE ON public.media_buyer_aliases FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: notification_preferences trg_notification_prefs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notification_prefs_updated_at BEFORE UPDATE ON public.notification_preferences FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: notification_rules trg_notification_rules_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notification_rules_updated_at BEFORE UPDATE ON public.notification_rules FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: offer_items trg_offer_items_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_offer_items_updated BEFORE UPDATE ON public.offer_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: offer_presets trg_offer_presets_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_offer_presets_updated BEFORE UPDATE ON public.offer_presets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: offline_seminar_reports trg_offline_seminar_reports_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_offline_seminar_reports_updated_at BEFORE UPDATE ON public.offline_seminar_reports FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: operations_offer_deliveries trg_operations_offer_deliveries_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_operations_offer_deliveries_updated_at BEFORE UPDATE ON public.operations_offer_deliveries FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: operations_communication_templates trg_ops_comm_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ops_comm_updated_at BEFORE UPDATE ON public.operations_communication_templates FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: operations_conversion_reports trg_ops_conv_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ops_conv_updated_at BEFORE UPDATE ON public.operations_conversion_reports FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: operations_handoff_rules trg_ops_handoff_rules_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ops_handoff_rules_updated BEFORE UPDATE ON public.operations_handoff_rules FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: operations_lead_checklist_state trg_ops_lcs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ops_lcs_updated_at BEFORE UPDATE ON public.operations_lead_checklist_state FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: operations_lead_custom_values trg_ops_lcv_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ops_lcv_updated_at BEFORE UPDATE ON public.operations_lead_custom_values FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: operations_leads trg_ops_leads_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ops_leads_updated_at BEFORE UPDATE ON public.operations_leads FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: operations_reward_progress trg_ops_reward_progress_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ops_reward_progress_updated_at BEFORE UPDATE ON public.operations_reward_progress FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: operations_reward_rules trg_ops_reward_rules_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ops_reward_rules_updated_at BEFORE UPDATE ON public.operations_reward_rules FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: operations_process_templates trg_ops_tpl_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ops_tpl_updated_at BEFORE UPDATE ON public.operations_process_templates FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: program_products trg_pp_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pp_updated BEFORE UPDATE ON public.program_products FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: paid_pipeline_batches trg_ppb_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ppb_updated_at BEFORE UPDATE ON public.paid_pipeline_batches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_ppb();


--
-- Name: paid_pipeline_finance_details trg_ppfd_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ppfd_updated BEFORE UPDATE ON public.paid_pipeline_finance_details FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: paid_pipeline_followups trg_ppfu_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ppfu_updated_at BEFORE UPDATE ON public.paid_pipeline_followups FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: paid_pipeline_leads trg_ppl_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ppl_updated BEFORE UPDATE ON public.paid_pipeline_leads FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: paid_pipeline_settings trg_pps_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pps_updated BEFORE UPDATE ON public.paid_pipeline_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: profiles trg_profiles_prevent_self_escalation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profiles_prevent_self_escalation BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_self_privilege_escalation();


--
-- Name: leads trg_protect_paid_onboarding_crm_lead; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_protect_paid_onboarding_crm_lead BEFORE INSERT OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.protect_paid_onboarding_crm_lead();


--
-- Name: roas_calculation_drafts trg_rcd_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_rcd_touch BEFORE UPDATE ON public.roas_calculation_drafts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: resource_library_items trg_rli_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_rli_touch BEFORE UPDATE ON public.resource_library_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: roas_master_sheet_mappings trg_rmsm_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_rmsm_touch BEFORE UPDATE ON public.roas_master_sheet_mappings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: roas_data_sources trg_roas_ds_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_roas_ds_updated BEFORE UPDATE ON public.roas_data_sources FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: roas_enrollments trg_roas_enr_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_roas_enr_updated BEFORE UPDATE ON public.roas_enrollments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: roas_leads trg_roas_leads_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_roas_leads_updated BEFORE UPDATE ON public.roas_leads FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: roas_media_buyers trg_roas_mb_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_roas_mb_updated BEFORE UPDATE ON public.roas_media_buyers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: roas_ad_spends trg_roas_spend_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_roas_spend_updated BEFORE UPDATE ON public.roas_ad_spends FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: roas_webinars trg_roas_web_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_roas_web_updated BEFORE UPDATE ON public.roas_webinars FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: service_packages trg_service_packages_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_service_packages_updated BEFORE UPDATE ON public.service_packages FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: system_refinement_items trg_srefi_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_srefi_updated_at BEFORE UPDATE ON public.system_refinement_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: seminar_roas_reports trg_srr_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_srr_updated_at BEFORE UPDATE ON public.seminar_roas_reports FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: leads trg_sync_crm_owner_to_paid_pipeline; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_crm_owner_to_paid_pipeline AFTER UPDATE OF assigned_agent_id ON public.leads FOR EACH ROW EXECUTE FUNCTION public.sync_crm_owner_to_paid_pipeline();


--
-- Name: tags trg_tags_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tags_updated_at BEFORE UPDATE ON public.tags FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: tasks trg_tasks_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.tasks_set_updated_at();


--
-- Name: tax_code_master trg_tax_code_master_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tax_code_master_updated_at BEFORE UPDATE ON public.tax_code_master FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: webinar_batches trg_wb_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_wb_updated BEFORE UPDATE ON public.webinar_batches FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: webinars trg_webinars_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_webinars_updated BEFORE UPDATE ON public.webinars FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: access_readiness_logs access_readiness_logs_paid_pipeline_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_readiness_logs
    ADD CONSTRAINT access_readiness_logs_paid_pipeline_lead_id_fkey FOREIGN KEY (paid_pipeline_lead_id) REFERENCES public.paid_pipeline_leads(id) ON DELETE CASCADE;


--
-- Name: activity_logs activity_logs_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: announcements announcements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: attendance_logs attendance_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_logs
    ADD CONSTRAINT attendance_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: attribution_media_buyers attribution_media_buyers_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attribution_media_buyers
    ADD CONSTRAINT attribution_media_buyers_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.attribution_sessions(id) ON DELETE CASCADE;


--
-- Name: attribution_sales_detail attribution_sales_detail_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attribution_sales_detail
    ADD CONSTRAINT attribution_sales_detail_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.attribution_sessions(id) ON DELETE CASCADE;


--
-- Name: attribution_sessions attribution_sessions_fetch_log_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attribution_sessions
    ADD CONSTRAINT attribution_sessions_fetch_log_id_fkey FOREIGN KEY (fetch_log_id) REFERENCES public.roas_fetch_logs(id) ON DELETE SET NULL;


--
-- Name: attribution_sessions attribution_sessions_master_sheet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attribution_sessions
    ADD CONSTRAINT attribution_sessions_master_sheet_id_fkey FOREIGN KEY (master_sheet_id) REFERENCES public.roas_master_sheets(id) ON DELETE SET NULL;


--
-- Name: code_of_conduct_events code_of_conduct_events_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_of_conduct_events
    ADD CONSTRAINT code_of_conduct_events_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.code_of_conduct_requests(id) ON DELETE CASCADE;


--
-- Name: code_of_conduct_guide_progress code_of_conduct_guide_progress_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_of_conduct_guide_progress
    ADD CONSTRAINT code_of_conduct_guide_progress_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.code_of_conduct_requests(id) ON DELETE CASCADE;


--
-- Name: code_of_conduct_requests code_of_conduct_requests_email_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_of_conduct_requests
    ADD CONSTRAINT code_of_conduct_requests_email_variant_id_fkey FOREIGN KEY (email_variant_id) REFERENCES public.code_of_conduct_email_variants(id);


--
-- Name: code_of_conduct_requests code_of_conduct_requests_re_signature_for_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_of_conduct_requests
    ADD CONSTRAINT code_of_conduct_requests_re_signature_for_request_id_fkey FOREIGN KEY (re_signature_for_request_id) REFERENCES public.code_of_conduct_requests(id) ON DELETE SET NULL;


--
-- Name: code_of_conduct_requests code_of_conduct_requests_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_of_conduct_requests
    ADD CONSTRAINT code_of_conduct_requests_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.code_of_conduct_templates(id) ON DELETE SET NULL;


--
-- Name: code_of_conduct_rules code_of_conduct_rules_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_of_conduct_rules
    ADD CONSTRAINT code_of_conduct_rules_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.pipelines(id) ON DELETE CASCADE;


--
-- Name: code_of_conduct_rules code_of_conduct_rules_stage_id_after_signed_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_of_conduct_rules
    ADD CONSTRAINT code_of_conduct_rules_stage_id_after_signed_fkey FOREIGN KEY (stage_id_after_signed) REFERENCES public.stages(id) ON DELETE SET NULL;


--
-- Name: code_of_conduct_rules code_of_conduct_rules_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_of_conduct_rules
    ADD CONSTRAINT code_of_conduct_rules_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.stages(id) ON DELETE CASCADE;


--
-- Name: code_of_conduct_rules code_of_conduct_rules_tag_id_after_signed_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_of_conduct_rules
    ADD CONSTRAINT code_of_conduct_rules_tag_id_after_signed_fkey FOREIGN KEY (tag_id_after_signed) REFERENCES public.tags(id) ON DELETE SET NULL;


--
-- Name: code_of_conduct_rules code_of_conduct_rules_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_of_conduct_rules
    ADD CONSTRAINT code_of_conduct_rules_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.code_of_conduct_templates(id) ON DELETE RESTRICT;


--
-- Name: code_of_conduct_suggestion_ignores code_of_conduct_suggestion_ignores_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.code_of_conduct_suggestion_ignores
    ADD CONSTRAINT code_of_conduct_suggestion_ignores_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.code_of_conduct_rules(id) ON DELETE CASCADE;


--
-- Name: crm_conversion_rules crm_conversion_rules_destination_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_conversion_rules
    ADD CONSTRAINT crm_conversion_rules_destination_pipeline_id_fkey FOREIGN KEY (destination_pipeline_id) REFERENCES public.pipelines(id) ON DELETE SET NULL;


--
-- Name: crm_conversion_rules crm_conversion_rules_destination_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_conversion_rules
    ADD CONSTRAINT crm_conversion_rules_destination_stage_id_fkey FOREIGN KEY (destination_stage_id) REFERENCES public.stages(id) ON DELETE SET NULL;


--
-- Name: crm_conversion_rules crm_conversion_rules_source_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_conversion_rules
    ADD CONSTRAINT crm_conversion_rules_source_pipeline_id_fkey FOREIGN KEY (source_pipeline_id) REFERENCES public.pipelines(id) ON DELETE CASCADE;


--
-- Name: crm_lead_conversions crm_lead_conversions_destination_crm_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_lead_conversions
    ADD CONSTRAINT crm_lead_conversions_destination_crm_lead_id_fkey FOREIGN KEY (destination_crm_lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: crm_lead_conversions crm_lead_conversions_paid_pipeline_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_lead_conversions
    ADD CONSTRAINT crm_lead_conversions_paid_pipeline_lead_id_fkey FOREIGN KEY (paid_pipeline_lead_id) REFERENCES public.paid_pipeline_leads(id) ON DELETE SET NULL;


--
-- Name: crm_lead_conversions crm_lead_conversions_source_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_lead_conversions
    ADD CONSTRAINT crm_lead_conversions_source_lead_id_fkey FOREIGN KEY (source_lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: daily_lead_report_ad_accounts daily_lead_report_ad_accounts_report_media_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_lead_report_ad_accounts
    ADD CONSTRAINT daily_lead_report_ad_accounts_report_media_buyer_id_fkey FOREIGN KEY (report_media_buyer_id) REFERENCES public.daily_lead_report_media_buyers(id) ON DELETE CASCADE;


--
-- Name: daily_lead_report_media_buyers daily_lead_report_media_buyers_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_lead_report_media_buyers
    ADD CONSTRAINT daily_lead_report_media_buyers_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.daily_lead_reports(id) ON DELETE CASCADE;


--
-- Name: follow_up_reminders follow_up_reminders_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_up_reminders
    ADD CONSTRAINT follow_up_reminders_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: invoice_events invoice_events_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_events
    ADD CONSTRAINT invoice_events_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: invoice_items invoice_items_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.invoice_item_categories(id) ON DELETE SET NULL;


--
-- Name: invoice_line_items invoice_line_items_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT invoice_line_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_crm_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_crm_lead_id_fkey FOREIGN KEY (crm_lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_paid_pipeline_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_paid_pipeline_lead_id_fkey FOREIGN KEY (paid_pipeline_lead_id) REFERENCES public.paid_pipeline_leads(id) ON DELETE SET NULL;


--
-- Name: kpi_assignments kpi_assignments_kpi_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_assignments
    ADD CONSTRAINT kpi_assignments_kpi_id_fkey FOREIGN KEY (kpi_id) REFERENCES public.kpi_definitions(id) ON DELETE SET NULL;


--
-- Name: kpi_assignments kpi_assignments_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_assignments
    ADD CONSTRAINT kpi_assignments_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.kpi_templates(id) ON DELETE SET NULL;


--
-- Name: kpi_entries kpi_entries_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_entries
    ADD CONSTRAINT kpi_entries_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.kpi_assignments(id) ON DELETE CASCADE;


--
-- Name: kpi_entries kpi_entries_kpi_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_entries
    ADD CONSTRAINT kpi_entries_kpi_id_fkey FOREIGN KEY (kpi_id) REFERENCES public.kpi_definitions(id) ON DELETE CASCADE;


--
-- Name: kpi_reward_earnings kpi_reward_earnings_reward_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_reward_earnings
    ADD CONSTRAINT kpi_reward_earnings_reward_rule_id_fkey FOREIGN KEY (reward_rule_id) REFERENCES public.kpi_reward_rules(id) ON DELETE SET NULL;


--
-- Name: kpi_reward_rules kpi_reward_rules_applies_to_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_reward_rules
    ADD CONSTRAINT kpi_reward_rules_applies_to_user_id_fkey FOREIGN KEY (applies_to_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: kpi_submissions kpi_submissions_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_submissions
    ADD CONSTRAINT kpi_submissions_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.kpi_entries(id) ON DELETE CASCADE;


--
-- Name: kpi_template_items kpi_template_items_kpi_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_template_items
    ADD CONSTRAINT kpi_template_items_kpi_id_fkey FOREIGN KEY (kpi_id) REFERENCES public.kpi_definitions(id) ON DELETE CASCADE;


--
-- Name: kpi_template_items kpi_template_items_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_template_items
    ADD CONSTRAINT kpi_template_items_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.kpi_templates(id) ON DELETE CASCADE;


--
-- Name: lead_entries lead_entries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_entries
    ADD CONSTRAINT lead_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: lead_hotness_scores lead_hotness_scores_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_hotness_scores
    ADD CONSTRAINT lead_hotness_scores_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_notes lead_notes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_notes
    ADD CONSTRAINT lead_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: lead_notes lead_notes_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_notes
    ADD CONSTRAINT lead_notes_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_notes lead_notes_paid_pipeline_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_notes
    ADD CONSTRAINT lead_notes_paid_pipeline_lead_id_fkey FOREIGN KEY (paid_pipeline_lead_id) REFERENCES public.paid_pipeline_leads(id) ON DELETE SET NULL;


--
-- Name: lead_session_attendance lead_session_attendance_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_session_attendance
    ADD CONSTRAINT lead_session_attendance_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_tag_assignments lead_tag_assignments_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tag_assignments
    ADD CONSTRAINT lead_tag_assignments_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;


--
-- Name: leads leads_converted_to_crm_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_converted_to_crm_lead_id_fkey FOREIGN KEY (converted_to_crm_lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: leads leads_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.program_products(id) ON DELETE SET NULL;


--
-- Name: leads leads_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.pipelines(id) ON DELETE SET NULL;


--
-- Name: leads leads_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.business_units(id) ON DELETE SET NULL;


--
-- Name: leads leads_service_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_service_package_id_fkey FOREIGN KEY (service_package_id) REFERENCES public.service_packages(id) ON DELETE SET NULL;


--
-- Name: leads leads_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.stages(id) ON DELETE SET NULL;


--
-- Name: media_buyer_case_emails media_buyer_case_emails_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_buyer_case_emails
    ADD CONSTRAINT media_buyer_case_emails_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.media_buyer_cases(id) ON DELETE CASCADE;


--
-- Name: media_buyer_case_events media_buyer_case_events_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_buyer_case_events
    ADD CONSTRAINT media_buyer_case_events_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.media_buyer_cases(id) ON DELETE CASCADE;


--
-- Name: media_buyer_service_periods media_buyer_service_periods_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_buyer_service_periods
    ADD CONSTRAINT media_buyer_service_periods_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.media_buyer_cases(id) ON DELETE CASCADE;


--
-- Name: member_access_verifications member_access_verifications_crm_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_access_verifications
    ADD CONSTRAINT member_access_verifications_crm_lead_id_fkey FOREIGN KEY (crm_lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: member_access_verifications member_access_verifications_paid_pipeline_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_access_verifications
    ADD CONSTRAINT member_access_verifications_paid_pipeline_lead_id_fkey FOREIGN KEY (paid_pipeline_lead_id) REFERENCES public.paid_pipeline_leads(id) ON DELETE CASCADE;


--
-- Name: offer_preset_items offer_preset_items_offer_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_preset_items
    ADD CONSTRAINT offer_preset_items_offer_item_id_fkey FOREIGN KEY (offer_item_id) REFERENCES public.offer_items(id) ON DELETE SET NULL;


--
-- Name: offer_preset_items offer_preset_items_preset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_preset_items
    ADD CONSTRAINT offer_preset_items_preset_id_fkey FOREIGN KEY (preset_id) REFERENCES public.offer_presets(id) ON DELETE CASCADE;


--
-- Name: operations_conversion_reports operations_conversion_reports_media_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_conversion_reports
    ADD CONSTRAINT operations_conversion_reports_media_buyer_id_fkey FOREIGN KEY (media_buyer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: operations_conversion_reports operations_conversion_reports_operations_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_conversion_reports
    ADD CONSTRAINT operations_conversion_reports_operations_lead_id_fkey FOREIGN KEY (operations_lead_id) REFERENCES public.operations_leads(id) ON DELETE CASCADE;


--
-- Name: operations_conversion_reports operations_conversion_reports_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_conversion_reports
    ADD CONSTRAINT operations_conversion_reports_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: operations_handoff_rules operations_handoff_rules_source_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_handoff_rules
    ADD CONSTRAINT operations_handoff_rules_source_pipeline_id_fkey FOREIGN KEY (source_pipeline_id) REFERENCES public.pipelines(id) ON DELETE CASCADE;


--
-- Name: operations_lead_checklist_state operations_lead_checklist_state_checklist_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_lead_checklist_state
    ADD CONSTRAINT operations_lead_checklist_state_checklist_item_id_fkey FOREIGN KEY (checklist_item_id) REFERENCES public.operations_template_checklist_items(id) ON DELETE CASCADE;


--
-- Name: operations_lead_checklist_state operations_lead_checklist_state_operations_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_lead_checklist_state
    ADD CONSTRAINT operations_lead_checklist_state_operations_lead_id_fkey FOREIGN KEY (operations_lead_id) REFERENCES public.operations_leads(id) ON DELETE CASCADE;


--
-- Name: operations_lead_custom_values operations_lead_custom_values_field_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_lead_custom_values
    ADD CONSTRAINT operations_lead_custom_values_field_id_fkey FOREIGN KEY (field_id) REFERENCES public.operations_template_fields(id) ON DELETE CASCADE;


--
-- Name: operations_lead_custom_values operations_lead_custom_values_operations_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_lead_custom_values
    ADD CONSTRAINT operations_lead_custom_values_operations_lead_id_fkey FOREIGN KEY (operations_lead_id) REFERENCES public.operations_leads(id) ON DELETE CASCADE;


--
-- Name: operations_leads operations_leads_assigned_media_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_leads
    ADD CONSTRAINT operations_leads_assigned_media_buyer_id_fkey FOREIGN KEY (assigned_media_buyer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: operations_leads operations_leads_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_leads
    ADD CONSTRAINT operations_leads_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: operations_leads operations_leads_crm_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_leads
    ADD CONSTRAINT operations_leads_crm_lead_id_fkey FOREIGN KEY (crm_lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: operations_leads operations_leads_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_leads
    ADD CONSTRAINT operations_leads_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.program_products(id) ON DELETE SET NULL;


--
-- Name: operations_leads operations_leads_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_leads
    ADD CONSTRAINT operations_leads_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.pipelines(id) ON DELETE SET NULL;


--
-- Name: operations_leads operations_leads_process_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_leads
    ADD CONSTRAINT operations_leads_process_template_id_fkey FOREIGN KEY (process_template_id) REFERENCES public.operations_process_templates(id) ON DELETE SET NULL;


--
-- Name: operations_leads operations_leads_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_leads
    ADD CONSTRAINT operations_leads_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.business_units(id) ON DELETE SET NULL;


--
-- Name: operations_leads operations_leads_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_leads
    ADD CONSTRAINT operations_leads_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.stages(id) ON DELETE SET NULL;


--
-- Name: operations_offer_deliveries operations_offer_deliveries_operations_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_offer_deliveries
    ADD CONSTRAINT operations_offer_deliveries_operations_lead_id_fkey FOREIGN KEY (operations_lead_id) REFERENCES public.operations_leads(id) ON DELETE CASCADE;


--
-- Name: operations_offer_deliveries operations_offer_deliveries_paid_lead_offer_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_offer_deliveries
    ADD CONSTRAINT operations_offer_deliveries_paid_lead_offer_item_id_fkey FOREIGN KEY (paid_lead_offer_item_id) REFERENCES public.paid_lead_offer_items(id) ON DELETE SET NULL;


--
-- Name: operations_reward_progress operations_reward_progress_media_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_reward_progress
    ADD CONSTRAINT operations_reward_progress_media_buyer_id_fkey FOREIGN KEY (media_buyer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: operations_reward_progress operations_reward_progress_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_reward_progress
    ADD CONSTRAINT operations_reward_progress_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.operations_reward_rules(id) ON DELETE SET NULL;


--
-- Name: operations_service_events operations_service_events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_service_events
    ADD CONSTRAINT operations_service_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: operations_service_events operations_service_events_operations_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_service_events
    ADD CONSTRAINT operations_service_events_operations_lead_id_fkey FOREIGN KEY (operations_lead_id) REFERENCES public.operations_leads(id) ON DELETE CASCADE;


--
-- Name: operations_service_events operations_service_events_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_service_events
    ADD CONSTRAINT operations_service_events_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.operations_communication_templates(id) ON DELETE SET NULL;


--
-- Name: operations_template_checklist_items operations_template_checklist_items_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_template_checklist_items
    ADD CONSTRAINT operations_template_checklist_items_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.operations_process_templates(id) ON DELETE CASCADE;


--
-- Name: operations_template_fields operations_template_fields_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operations_template_fields
    ADD CONSTRAINT operations_template_fields_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.operations_process_templates(id) ON DELETE CASCADE;


--
-- Name: paid_lead_offer_items paid_lead_offer_items_crm_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paid_lead_offer_items
    ADD CONSTRAINT paid_lead_offer_items_crm_lead_id_fkey FOREIGN KEY (crm_lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: paid_lead_offer_items paid_lead_offer_items_offer_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paid_lead_offer_items
    ADD CONSTRAINT paid_lead_offer_items_offer_item_id_fkey FOREIGN KEY (offer_item_id) REFERENCES public.offer_items(id) ON DELETE SET NULL;


--
-- Name: paid_lead_offer_items paid_lead_offer_items_operations_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paid_lead_offer_items
    ADD CONSTRAINT paid_lead_offer_items_operations_lead_id_fkey FOREIGN KEY (operations_lead_id) REFERENCES public.operations_leads(id) ON DELETE CASCADE;


--
-- Name: paid_lead_offer_items paid_lead_offer_items_paid_pipeline_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paid_lead_offer_items
    ADD CONSTRAINT paid_lead_offer_items_paid_pipeline_lead_id_fkey FOREIGN KEY (paid_pipeline_lead_id) REFERENCES public.paid_pipeline_leads(id) ON DELETE CASCADE;


--
-- Name: paid_lead_offer_items paid_lead_offer_items_source_preset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paid_lead_offer_items
    ADD CONSTRAINT paid_lead_offer_items_source_preset_id_fkey FOREIGN KEY (source_preset_id) REFERENCES public.offer_presets(id) ON DELETE SET NULL;


--
-- Name: paid_pipeline_activity_logs paid_pipeline_activity_logs_paid_pipeline_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paid_pipeline_activity_logs
    ADD CONSTRAINT paid_pipeline_activity_logs_paid_pipeline_lead_id_fkey FOREIGN KEY (paid_pipeline_lead_id) REFERENCES public.paid_pipeline_leads(id) ON DELETE CASCADE;


--
-- Name: paid_pipeline_batches paid_pipeline_batches_service_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paid_pipeline_batches
    ADD CONSTRAINT paid_pipeline_batches_service_package_id_fkey FOREIGN KEY (service_package_id) REFERENCES public.service_packages(id) ON DELETE SET NULL;


--
-- Name: paid_pipeline_finance_details paid_pipeline_finance_details_paid_pipeline_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paid_pipeline_finance_details
    ADD CONSTRAINT paid_pipeline_finance_details_paid_pipeline_lead_id_fkey FOREIGN KEY (paid_pipeline_lead_id) REFERENCES public.paid_pipeline_leads(id) ON DELETE CASCADE;


--
-- Name: paid_pipeline_leads paid_pipeline_leads_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paid_pipeline_leads
    ADD CONSTRAINT paid_pipeline_leads_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.program_products(id) ON DELETE SET NULL;


--
-- Name: paid_pipeline_leads paid_pipeline_leads_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paid_pipeline_leads
    ADD CONSTRAINT paid_pipeline_leads_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.program_products(id) ON DELETE SET NULL;


--
-- Name: paid_pipeline_leads paid_pipeline_leads_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paid_pipeline_leads
    ADD CONSTRAINT paid_pipeline_leads_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.business_units(id) ON DELETE SET NULL;


--
-- Name: paid_pipeline_leads paid_pipeline_leads_service_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paid_pipeline_leads
    ADD CONSTRAINT paid_pipeline_leads_service_package_id_fkey FOREIGN KEY (service_package_id) REFERENCES public.service_packages(id) ON DELETE SET NULL;


--
-- Name: paid_pipeline_leads paid_pipeline_leads_source_unpaid_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paid_pipeline_leads
    ADD CONSTRAINT paid_pipeline_leads_source_unpaid_lead_id_fkey FOREIGN KEY (source_unpaid_lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: paid_pipeline_leads paid_pipeline_leads_webinar_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paid_pipeline_leads
    ADD CONSTRAINT paid_pipeline_leads_webinar_batch_id_fkey FOREIGN KEY (webinar_batch_id) REFERENCES public.webinar_batches(id) ON DELETE SET NULL;


--
-- Name: paid_pipeline_payments paid_pipeline_payments_paid_pipeline_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paid_pipeline_payments
    ADD CONSTRAINT paid_pipeline_payments_paid_pipeline_lead_id_fkey FOREIGN KEY (paid_pipeline_lead_id) REFERENCES public.paid_pipeline_leads(id) ON DELETE CASCADE;


--
-- Name: payroll_run_entries payroll_run_entries_payroll_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_run_entries
    ADD CONSTRAINT payroll_run_entries_payroll_run_id_fkey FOREIGN KEY (payroll_run_id) REFERENCES public.payroll_runs(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profit_statement_lines profit_statement_lines_profit_statement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profit_statement_lines
    ADD CONSTRAINT profit_statement_lines_profit_statement_id_fkey FOREIGN KEY (profit_statement_id) REFERENCES public.profit_statements(id) ON DELETE CASCADE;


--
-- Name: program_products program_products_default_operations_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_products
    ADD CONSTRAINT program_products_default_operations_template_id_fkey FOREIGN KEY (default_operations_template_id) REFERENCES public.operations_process_templates(id) ON DELETE SET NULL;


--
-- Name: program_products program_products_default_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_products
    ADD CONSTRAINT program_products_default_pipeline_id_fkey FOREIGN KEY (default_pipeline_id) REFERENCES public.pipelines(id) ON DELETE SET NULL;


--
-- Name: program_products program_products_default_service_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_products
    ADD CONSTRAINT program_products_default_service_package_id_fkey FOREIGN KEY (default_service_package_id) REFERENCES public.service_packages(id) ON DELETE SET NULL;


--
-- Name: program_products program_products_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_products
    ADD CONSTRAINT program_products_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.business_units(id) ON DELETE SET NULL;


--
-- Name: quick_save_entries quick_save_entries_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quick_save_entries
    ADD CONSTRAINT quick_save_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: roas_ad_spends roas_ad_spends_entered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roas_ad_spends
    ADD CONSTRAINT roas_ad_spends_entered_by_fkey FOREIGN KEY (entered_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: roas_ad_spends roas_ad_spends_media_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roas_ad_spends
    ADD CONSTRAINT roas_ad_spends_media_buyer_id_fkey FOREIGN KEY (media_buyer_id) REFERENCES public.roas_media_buyers(id) ON DELETE CASCADE;


--
-- Name: roas_ad_spends roas_ad_spends_webinar_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roas_ad_spends
    ADD CONSTRAINT roas_ad_spends_webinar_id_fkey FOREIGN KEY (webinar_id) REFERENCES public.roas_webinars(id) ON DELETE SET NULL;


--
-- Name: roas_attribution_audit_logs roas_attribution_audit_logs_attribution_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roas_attribution_audit_logs
    ADD CONSTRAINT roas_attribution_audit_logs_attribution_session_id_fkey FOREIGN KEY (attribution_session_id) REFERENCES public.attribution_sessions(id) ON DELETE CASCADE;


--
-- Name: roas_attribution_logs roas_attribution_logs_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roas_attribution_logs
    ADD CONSTRAINT roas_attribution_logs_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.roas_enrollments(id) ON DELETE CASCADE;


--
-- Name: roas_data_sources roas_data_sources_media_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roas_data_sources
    ADD CONSTRAINT roas_data_sources_media_buyer_id_fkey FOREIGN KEY (media_buyer_id) REFERENCES public.roas_media_buyers(id) ON DELETE SET NULL;


--
-- Name: roas_enrollments roas_enrollments_attributed_media_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roas_enrollments
    ADD CONSTRAINT roas_enrollments_attributed_media_buyer_id_fkey FOREIGN KEY (attributed_media_buyer_id) REFERENCES public.roas_media_buyers(id) ON DELETE SET NULL;


--
-- Name: roas_enrollments roas_enrollments_attributed_webinar_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roas_enrollments
    ADD CONSTRAINT roas_enrollments_attributed_webinar_id_fkey FOREIGN KEY (attributed_webinar_id) REFERENCES public.roas_webinars(id) ON DELETE SET NULL;


--
-- Name: roas_enrollments roas_enrollments_data_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roas_enrollments
    ADD CONSTRAINT roas_enrollments_data_source_id_fkey FOREIGN KEY (data_source_id) REFERENCES public.roas_data_sources(id) ON DELETE CASCADE;


--
-- Name: roas_enrollments roas_enrollments_matched_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roas_enrollments
    ADD CONSTRAINT roas_enrollments_matched_lead_id_fkey FOREIGN KEY (matched_lead_id) REFERENCES public.roas_leads(id) ON DELETE SET NULL;


--
-- Name: roas_fetch_logs roas_fetch_logs_master_sheet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roas_fetch_logs
    ADD CONSTRAINT roas_fetch_logs_master_sheet_id_fkey FOREIGN KEY (master_sheet_id) REFERENCES public.roas_master_sheets(id) ON DELETE SET NULL;


--
-- Name: roas_leads roas_leads_data_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roas_leads
    ADD CONSTRAINT roas_leads_data_source_id_fkey FOREIGN KEY (data_source_id) REFERENCES public.roas_data_sources(id) ON DELETE CASCADE;


--
-- Name: roas_leads roas_leads_media_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roas_leads
    ADD CONSTRAINT roas_leads_media_buyer_id_fkey FOREIGN KEY (media_buyer_id) REFERENCES public.roas_media_buyers(id) ON DELETE SET NULL;


--
-- Name: roas_master_sheet_tabs roas_master_sheet_tabs_master_sheet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roas_master_sheet_tabs
    ADD CONSTRAINT roas_master_sheet_tabs_master_sheet_id_fkey FOREIGN KEY (master_sheet_id) REFERENCES public.roas_master_sheets(id) ON DELETE CASCADE;


--
-- Name: roas_sync_logs roas_sync_logs_data_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roas_sync_logs
    ADD CONSTRAINT roas_sync_logs_data_source_id_fkey FOREIGN KEY (data_source_id) REFERENCES public.roas_data_sources(id) ON DELETE CASCADE;


--
-- Name: seminar_roas_report_days seminar_roas_report_days_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seminar_roas_report_days
    ADD CONSTRAINT seminar_roas_report_days_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.seminar_roas_reports(id) ON DELETE CASCADE;


--
-- Name: seminar_roas_report_products seminar_roas_report_products_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seminar_roas_report_products
    ADD CONSTRAINT seminar_roas_report_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.program_products(id) ON DELETE SET NULL;


--
-- Name: seminar_roas_report_products seminar_roas_report_products_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seminar_roas_report_products
    ADD CONSTRAINT seminar_roas_report_products_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.seminar_roas_reports(id) ON DELETE CASCADE;


--
-- Name: service_packages service_packages_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_packages
    ADD CONSTRAINT service_packages_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: service_packages service_packages_default_process_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_packages
    ADD CONSTRAINT service_packages_default_process_template_id_fkey FOREIGN KEY (default_process_template_id) REFERENCES public.operations_process_templates(id) ON DELETE SET NULL;


--
-- Name: stages stages_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stages
    ADD CONSTRAINT stages_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.pipelines(id) ON DELETE CASCADE;


--
-- Name: task_activity task_activity_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_activity
    ADD CONSTRAINT task_activity_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_activity task_activity_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_activity
    ADD CONSTRAINT task_activity_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: task_submissions task_submissions_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_submissions
    ADD CONSTRAINT task_submissions_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: team_performance_reminders team_performance_reminders_kpi_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_performance_reminders
    ADD CONSTRAINT team_performance_reminders_kpi_entry_id_fkey FOREIGN KEY (kpi_entry_id) REFERENCES public.kpi_entries(id) ON DELETE CASCADE;


--
-- Name: team_performance_reminders team_performance_reminders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_performance_reminders
    ADD CONSTRAINT team_performance_reminders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: webinar_batches webinar_batches_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webinar_batches
    ADD CONSTRAINT webinar_batches_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.pipelines(id) ON DELETE SET NULL;


--
-- Name: webinar_batches webinar_batches_process_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webinar_batches
    ADD CONSTRAINT webinar_batches_process_template_id_fkey FOREIGN KEY (process_template_id) REFERENCES public.operations_process_templates(id) ON DELETE SET NULL;


--
-- Name: webinar_batches webinar_batches_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webinar_batches
    ADD CONSTRAINT webinar_batches_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.business_units(id) ON DELETE SET NULL;


--
-- Name: webinar_batches webinar_batches_service_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webinar_batches
    ADD CONSTRAINT webinar_batches_service_package_id_fkey FOREIGN KEY (service_package_id) REFERENCES public.service_packages(id) ON DELETE SET NULL;


--
-- Name: webinar_templates webinar_templates_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webinar_templates
    ADD CONSTRAINT webinar_templates_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.business_units(id) ON DELETE SET NULL;


--
-- Name: access_readiness_logs Access readiness logs: insert by admin or related; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Access readiness logs: insert by admin or related" ON public.access_readiness_logs FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (EXISTS ( SELECT 1
   FROM (public.paid_pipeline_leads p
     LEFT JOIN public.leads l ON ((l.id = p.crm_lead_id)))
  WHERE ((p.id = access_readiness_logs.paid_pipeline_lead_id) AND ((p.assigned_sales_executive = auth.uid()) OR (p.created_by = auth.uid()) OR (l.assigned_agent_id = auth.uid())))))));


--
-- Name: access_readiness_logs Access readiness logs: read by admin or related; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Access readiness logs: read by admin or related" ON public.access_readiness_logs FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (EXISTS ( SELECT 1
   FROM (public.paid_pipeline_leads p
     LEFT JOIN public.leads l ON ((l.id = p.crm_lead_id)))
  WHERE ((p.id = access_readiness_logs.paid_pipeline_lead_id) AND ((p.assigned_sales_executive = auth.uid()) OR (p.created_by = auth.uid()) OR (l.assigned_agent_id = auth.uid())))))));


--
-- Name: operations_handoff_rules Active members can view handoff rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Active members can view handoff rules" ON public.operations_handoff_rules FOR SELECT USING (public.is_active(auth.uid()));


--
-- Name: lead_entries Active members insert leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Active members insert leads" ON public.lead_entries FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (user_id = auth.uid())));


--
-- Name: announcements Active members read announcements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Active members read announcements" ON public.announcements FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: lead_entries Active members read leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Active members read leads" ON public.lead_entries FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: profiles Active members see all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Active members see all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: offline_seminar_reports Active users can create offline seminar reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Active users can create offline seminar reports" ON public.offline_seminar_reports FOR INSERT WITH CHECK (public.is_active(auth.uid()));


--
-- Name: offline_seminar_reports Active users can delete offline seminar reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Active users can delete offline seminar reports" ON public.offline_seminar_reports FOR DELETE USING (public.is_active(auth.uid()));


--
-- Name: crm_lead_conversions Active users can insert conversions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Active users can insert conversions" ON public.crm_lead_conversions FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND ((created_by IS NULL) OR (created_by = auth.uid()))));


--
-- Name: access_templates Active users can read active templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Active users can read active templates" ON public.access_templates FOR SELECT TO authenticated USING ((public.is_active(auth.uid()) AND (is_active = true)));


--
-- Name: crm_conversion_rules Active users can read conversion rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Active users can read conversion rules" ON public.crm_conversion_rules FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: crm_lead_conversions Active users can read conversions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Active users can read conversions" ON public.crm_lead_conversions FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: offline_seminar_reports Active users can update offline seminar reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Active users can update offline seminar reports" ON public.offline_seminar_reports FOR UPDATE USING (public.is_active(auth.uid()));


--
-- Name: offline_seminar_reports Active users can view offline seminar reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Active users can view offline seminar reports" ON public.offline_seminar_reports FOR SELECT USING (public.is_active(auth.uid()));


--
-- Name: operations_result_reward_rules Active users read reward rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Active users read reward rules" ON public.operations_result_reward_rules FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: crm_conversion_rules Admins can delete conversion rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete conversion rules" ON public.crm_conversion_rules FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: operations_handoff_rules Admins can delete handoff rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete handoff rules" ON public.operations_handoff_rules FOR DELETE USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: profiles Admins can delete profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete profiles" ON public.profiles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: system_refinement_items Admins can delete refinement items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete refinement items" ON public.system_refinement_items FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: crm_conversion_rules Admins can insert conversion rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert conversion rules" ON public.crm_conversion_rules FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: operations_handoff_rules Admins can insert handoff rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert handoff rules" ON public.operations_handoff_rules FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: system_refinement_items Admins can insert refinement items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert refinement items" ON public.system_refinement_items FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: crm_conversion_rules Admins can update conversion rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update conversion rules" ON public.crm_conversion_rules FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: crm_lead_conversions Admins can update conversions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update conversions" ON public.crm_lead_conversions FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: operations_handoff_rules Admins can update handoff rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update handoff rules" ON public.operations_handoff_rules FOR UPDATE USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: system_refinement_items Admins can update refinement items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update refinement items" ON public.system_refinement_items FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: system_refinement_items Admins can view refinement items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view refinement items" ON public.system_refinement_items FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: profiles Admins insert profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins insert profiles" ON public.profiles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: access_templates Admins manage access templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage access templates" ON public.access_templates TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: operations_result_reward_payouts Admins manage all payouts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage all payouts" ON public.operations_result_reward_payouts TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: operations_result_submissions Admins manage all result submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage all result submissions" ON public.operations_result_submissions TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: announcements Admins manage announcements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage announcements" ON public.announcements TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: lead_entries Admins manage leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage leads" ON public.lead_entries TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_module_access Admins manage module access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage module access" ON public.user_module_access TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: operations_result_reward_rules Admins manage result reward rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage result reward rules" ON public.operations_result_reward_rules TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Admins manage roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage roles" ON public.user_roles TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: students Admins manage students; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage students" ON public.students TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: students Admins read students; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read students" ON public.students FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: attendance_logs Admins see all attendance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins see all attendance" ON public.attendance_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: profiles Admins update profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins update profiles" ON public.profiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: operations_result_reward_payouts Members view own payouts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members view own payouts" ON public.operations_result_reward_payouts FOR SELECT TO authenticated USING ((team_member_id = auth.uid()));


--
-- Name: operations_result_submissions Submitters create own submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Submitters create own submissions" ON public.operations_result_submissions FOR INSERT TO authenticated WITH CHECK ((submitted_by = auth.uid()));


--
-- Name: operations_result_submissions Submitters update own pending submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Submitters update own pending submissions" ON public.operations_result_submissions FOR UPDATE TO authenticated USING (((submitted_by = auth.uid()) AND (status = 'pending'::text))) WITH CHECK (((submitted_by = auth.uid()) AND (status = 'pending'::text)));


--
-- Name: operations_result_submissions Submitters view own submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Submitters view own submissions" ON public.operations_result_submissions FOR SELECT TO authenticated USING ((submitted_by = auth.uid()));


--
-- Name: attendance_logs Users insert own attendance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users insert own attendance" ON public.attendance_logs FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: user_module_access Users read own module access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users read own module access" ON public.user_module_access FOR SELECT USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (public.is_active(auth.uid()) AND (user_id = auth.uid()))));


--
-- Name: attendance_logs Users see own attendance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users see own attendance" ON public.attendance_logs FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: user_module_access Users see own module access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users see own module access" ON public.user_module_access FOR SELECT USING ((public.is_active(auth.uid()) AND (user_id = auth.uid())));


--
-- Name: profiles Users see own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users see own profile" ON public.profiles FOR SELECT TO authenticated USING ((auth.uid() = id));


--
-- Name: user_roles Users see own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users see own roles" ON public.user_roles FOR SELECT USING ((public.is_active(auth.uid()) AND (user_id = auth.uid())));


--
-- Name: profiles Users update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = id)) WITH CHECK (((auth.uid() = id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR (NOT (EXISTS ( SELECT 1
   FROM public.profiles old
  WHERE ((old.id = profiles.id) AND ((old.role IS DISTINCT FROM profiles.role) OR (old.status IS DISTINCT FROM profiles.status) OR (old.email IS DISTINCT FROM profiles.email) OR (old.department IS DISTINCT FROM profiles.department) OR (old.active_for_assignment IS DISTINCT FROM profiles.active_for_assignment) OR (old.can_receive_calling_crm_leads IS DISTINCT FROM profiles.can_receive_calling_crm_leads) OR (old.can_receive_paid_pipeline_leads IS DISTINCT FROM profiles.can_receive_paid_pipeline_leads) OR (old.can_receive_operations_leads IS DISTINCT FROM profiles.can_receive_operations_leads) OR (old.can_receive_follow_up_tasks IS DISTINCT FROM profiles.can_receive_follow_up_tasks) OR (old.can_receive_payment_recovery_leads IS DISTINCT FROM profiles.can_receive_payment_recovery_leads) OR (old.can_receive_media_buyer_cases IS DISTINCT FROM profiles.can_receive_media_buyer_cases) OR (old.include_in_round_robin IS DISTINCT FROM profiles.include_in_round_robin) OR (old.deactivated_at IS DISTINCT FROM profiles.deactivated_at) OR (old.deactivated_by IS DISTINCT FROM profiles.deactivated_by) OR (old.deactivation_reason IS DISTINCT FROM profiles.deactivation_reason)))))))));


--
-- Name: attribution_attendee_lists aal_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY aal_admin ON public.attribution_attendee_lists TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: attribution_attendee_lists aal_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY aal_delete ON public.attribution_attendee_lists FOR DELETE TO authenticated USING ((public.is_active(auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.attribution_sessions s
  WHERE ((s.id = attribution_attendee_lists.session_id) AND (s.created_by = auth.uid()))))));


--
-- Name: attribution_attendee_lists aal_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY aal_insert ON public.attribution_attendee_lists FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.attribution_sessions s
  WHERE ((s.id = attribution_attendee_lists.session_id) AND (s.created_by = auth.uid()))))));


--
-- Name: attribution_attendee_lists aal_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY aal_read ON public.attribution_attendee_lists FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: attribution_attendee_lists aal_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY aal_update ON public.attribution_attendee_lists FOR UPDATE TO authenticated USING ((public.is_active(auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.attribution_sessions s
  WHERE ((s.id = attribution_attendee_lists.session_id) AND (s.created_by = auth.uid())))))) WITH CHECK (public.is_active(auth.uid()));


--
-- Name: access_readiness_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.access_readiness_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: access_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.access_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_notes active users can insert lead notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "active users can insert lead notes" ON public.lead_notes FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (created_by = auth.uid())));


--
-- Name: stage_sync_rules active users can view stage sync rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "active users can view stage sync rules" ON public.stage_sync_rules FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: crm_batch_archives active users insert crm_batch_archives; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "active users insert crm_batch_archives" ON public.crm_batch_archives FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (archived_by = auth.uid())));


--
-- Name: lead_session_attendance active users read attendance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "active users read attendance" ON public.lead_session_attendance FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: crm_batch_archives active users read crm_batch_archives; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "active users read crm_batch_archives" ON public.crm_batch_archives FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: lead_hotness_scores active users read hotness; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "active users read hotness" ON public.lead_hotness_scores FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: media_buyer_aliases active_users_select_aliases; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY active_users_select_aliases ON public.media_buyer_aliases FOR SELECT USING (public.is_active(auth.uid()));


--
-- Name: activity_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: stage_sync_rules admins can delete stage sync rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins can delete stage sync rules" ON public.stage_sync_rules FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: stage_sync_rules admins can insert stage sync rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins can insert stage sync rules" ON public.stage_sync_rules FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: stage_sync_rules admins can update stage sync rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins can update stage sync rules" ON public.stage_sync_rules FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: lead_session_attendance admins delete attendance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins delete attendance" ON public.lead_session_attendance FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: lead_hotness_scores admins delete hotness; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins delete hotness" ON public.lead_hotness_scores FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: activity_logs admins manage activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage activity" ON public.activity_logs TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: crm_batch_archives admins manage crm_batch_archives; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage crm_batch_archives" ON public.crm_batch_archives TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: leads admins manage leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage leads" ON public.leads TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: pipelines admins manage pipelines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage pipelines" ON public.pipelines TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: lead_qualifier_sessions admins manage sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage sessions" ON public.lead_qualifier_sessions TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: stages admins manage stages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage stages" ON public.stages TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: stages admins update stages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins update stages" ON public.stages FOR UPDATE USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: media_buyer_aliases admins_delete_aliases; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_delete_aliases ON public.media_buyer_aliases FOR DELETE USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: media_buyer_aliases admins_insert_aliases; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_insert_aliases ON public.media_buyer_aliases FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: media_buyer_aliases admins_update_aliases; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_update_aliases ON public.media_buyer_aliases FOR UPDATE USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: leads agents insert leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "agents insert leads" ON public.leads FOR INSERT TO authenticated WITH CHECK (public.is_active(auth.uid()));


--
-- Name: leads agents update assigned leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "agents update assigned leads" ON public.leads FOR UPDATE USING ((public.is_active(auth.uid()) AND ((assigned_agent_id = auth.uid()) OR ((assigned_agent_id IS NULL) AND public.can_access_unassigned_leads(auth.uid())))));


--
-- Name: audit_logs al_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY al_admin ON public.audit_logs TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: audit_logs al_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY al_insert ON public.audit_logs FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR (actor_user_id = auth.uid()))));


--
-- Name: audit_logs al_read_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY al_read_admin_only ON public.audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: attribution_media_buyers amb_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY amb_admin ON public.attribution_media_buyers TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: attribution_media_buyers amb_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY amb_insert ON public.attribution_media_buyers FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.attribution_sessions s
  WHERE ((s.id = attribution_media_buyers.session_id) AND (s.created_by = auth.uid()))))));


--
-- Name: attribution_media_buyers amb_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY amb_read ON public.attribution_media_buyers FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: announcements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

--
-- Name: app_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: app_settings as_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY as_admin ON public.app_settings TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: attribution_sessions as_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY as_admin ON public.attribution_sessions TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: attribution_sessions as_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY as_insert ON public.attribution_sessions FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (created_by = auth.uid())));


--
-- Name: app_settings as_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY as_read ON public.app_settings FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: attribution_sessions as_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY as_read ON public.attribution_sessions FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (created_by = auth.uid())));


--
-- Name: attribution_sessions as_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY as_update_own ON public.attribution_sessions FOR UPDATE TO authenticated USING ((public.is_active(auth.uid()) AND ((created_by = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)))) WITH CHECK ((public.is_active(auth.uid()) AND ((created_by = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))));


--
-- Name: attribution_sales_detail asd_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY asd_admin ON public.attribution_sales_detail TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: attribution_sales_detail asd_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY asd_insert ON public.attribution_sales_detail FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.attribution_sessions s
  WHERE ((s.id = attribution_sales_detail.session_id) AND (s.created_by = auth.uid()))))));


--
-- Name: attribution_sales_detail asd_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY asd_read ON public.attribution_sales_detail FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: attendance_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance_sessions attendance_sessions admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "attendance_sessions admin manage" ON public.attendance_sessions TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: attendance_sessions attendance_sessions insert own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "attendance_sessions insert own" ON public.attendance_sessions FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND public.is_active(auth.uid())));


--
-- Name: attendance_sessions attendance_sessions read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "attendance_sessions read own" ON public.attendance_sessions FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: attendance_sessions attendance_sessions update own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "attendance_sessions update own" ON public.attendance_sessions FOR UPDATE TO authenticated USING (((user_id = auth.uid()) AND public.is_active(auth.uid()))) WITH CHECK ((user_id = auth.uid()));


--
-- Name: attribution_attendee_lists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attribution_attendee_lists ENABLE ROW LEVEL SECURITY;

--
-- Name: attribution_media_buyers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attribution_media_buyers ENABLE ROW LEVEL SECURITY;

--
-- Name: attribution_sales_detail; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attribution_sales_detail ENABLE ROW LEVEL SECURITY;

--
-- Name: attribution_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attribution_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_notes author can update own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "author can update own notes" ON public.lead_notes FOR UPDATE TO authenticated USING ((public.is_active(auth.uid()) AND (created_by = auth.uid()))) WITH CHECK ((created_by = auth.uid()));


--
-- Name: business_units bu_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bu_admin ON public.business_units TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: business_units bu_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bu_read ON public.business_units FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: business_units; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_units ENABLE ROW LEVEL SECURITY;

--
-- Name: code_of_conduct_automation_events coc_auto_events_active_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coc_auto_events_active_insert ON public.code_of_conduct_automation_events FOR INSERT TO authenticated WITH CHECK (public.is_active(auth.uid()));


--
-- Name: code_of_conduct_automation_events coc_auto_events_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coc_auto_events_admin_read ON public.code_of_conduct_automation_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: code_of_conduct_automation_rules coc_auto_rules_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coc_auto_rules_admin_delete ON public.code_of_conduct_automation_rules FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: code_of_conduct_automation_rules coc_auto_rules_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coc_auto_rules_admin_insert ON public.code_of_conduct_automation_rules FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: code_of_conduct_automation_rules coc_auto_rules_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coc_auto_rules_admin_update ON public.code_of_conduct_automation_rules FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: code_of_conduct_automation_rules coc_auto_rules_read_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coc_auto_rules_read_auth ON public.code_of_conduct_automation_rules FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: code_of_conduct_events coc_events_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coc_events_insert ON public.code_of_conduct_events FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR (request_id IS NULL) OR (EXISTS ( SELECT 1
   FROM (public.code_of_conduct_requests r
     LEFT JOIN public.leads l ON ((l.id = r.crm_lead_id)))
  WHERE ((r.id = code_of_conduct_events.request_id) AND ((r.created_by = auth.uid()) OR (l.assigned_agent_id = auth.uid()))))))));


--
-- Name: code_of_conduct_events coc_events_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coc_events_select ON public.code_of_conduct_events FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: code_of_conduct_guide_progress coc_guide_progress_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coc_guide_progress_admin_read ON public.code_of_conduct_guide_progress FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: code_of_conduct_suggestion_ignores coc_ignore_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coc_ignore_delete ON public.code_of_conduct_suggestion_ignores FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: code_of_conduct_suggestion_ignores coc_ignore_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coc_ignore_insert ON public.code_of_conduct_suggestion_ignores FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (ignored_by = auth.uid())));


--
-- Name: code_of_conduct_suggestion_ignores coc_ignore_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coc_ignore_select ON public.code_of_conduct_suggestion_ignores FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: code_of_conduct_requests coc_requests_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coc_requests_admin_delete ON public.code_of_conduct_requests FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: code_of_conduct_requests coc_requests_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coc_requests_insert ON public.code_of_conduct_requests FOR INSERT TO authenticated WITH CHECK (public.is_active(auth.uid()));


--
-- Name: code_of_conduct_requests coc_requests_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coc_requests_select ON public.code_of_conduct_requests FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.paid_pipeline_leads p
  WHERE ((p.id = code_of_conduct_requests.paid_pipeline_lead_id) AND (p.created_by = auth.uid()))))));


--
-- Name: code_of_conduct_requests coc_requests_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coc_requests_update ON public.code_of_conduct_requests FOR UPDATE USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (created_by = auth.uid()))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (created_by = auth.uid())));


--
-- Name: code_of_conduct_rules coc_rules_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coc_rules_admin_all ON public.code_of_conduct_rules TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: code_of_conduct_rules coc_rules_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coc_rules_select ON public.code_of_conduct_rules FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: code_of_conduct_templates coc_templates_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coc_templates_admin_all ON public.code_of_conduct_templates TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: code_of_conduct_templates coc_templates_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coc_templates_select ON public.code_of_conduct_templates FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: code_of_conduct_email_variants coc_variants_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coc_variants_delete_admin ON public.code_of_conduct_email_variants FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: code_of_conduct_email_variants coc_variants_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coc_variants_insert_admin ON public.code_of_conduct_email_variants FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: code_of_conduct_email_variants coc_variants_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coc_variants_select_authenticated ON public.code_of_conduct_email_variants FOR SELECT TO authenticated USING ((is_active OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: code_of_conduct_email_variants coc_variants_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coc_variants_update_admin ON public.code_of_conduct_email_variants FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: code_of_conduct_automation_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.code_of_conduct_automation_events ENABLE ROW LEVEL SECURITY;

--
-- Name: code_of_conduct_automation_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.code_of_conduct_automation_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: code_of_conduct_email_variants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.code_of_conduct_email_variants ENABLE ROW LEVEL SECURITY;

--
-- Name: code_of_conduct_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.code_of_conduct_events ENABLE ROW LEVEL SECURITY;

--
-- Name: code_of_conduct_guide_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.code_of_conduct_guide_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: code_of_conduct_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.code_of_conduct_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: code_of_conduct_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.code_of_conduct_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: code_of_conduct_suggestion_ignores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.code_of_conduct_suggestion_ignores ENABLE ROW LEVEL SECURITY;

--
-- Name: code_of_conduct_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.code_of_conduct_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: company_role_catalog; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_role_catalog ENABLE ROW LEVEL SECURITY;

--
-- Name: company_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: company_settings company_settings_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_settings_admin_delete ON public.company_settings FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: company_settings company_settings_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_settings_admin_insert ON public.company_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: company_settings company_settings_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_settings_admin_select ON public.company_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: company_settings company_settings_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_settings_admin_update ON public.company_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: crm_batch_archives; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_batch_archives ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_conversion_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_conversion_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_lead_conversions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_lead_conversions ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_custom_metrics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_custom_metrics ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_lead_report_ad_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_lead_report_ad_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_lead_report_media_buyers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_lead_report_media_buyers ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_lead_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_lead_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_lead_source_mappings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_lead_source_mappings ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_metric_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_metric_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: data_sources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.data_sources ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_custom_metrics dcm_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dcm_admin ON public.daily_custom_metrics TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: daily_custom_metrics dcm_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dcm_insert ON public.daily_custom_metrics FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND ((created_by = auth.uid()) OR (created_by IS NULL))));


--
-- Name: daily_custom_metrics dcm_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dcm_read ON public.daily_custom_metrics FOR SELECT TO authenticated USING ((public.is_active(auth.uid()) AND (is_active = true)));


--
-- Name: daily_custom_metrics dcm_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dcm_update_own ON public.daily_custom_metrics FOR UPDATE TO authenticated USING ((public.is_active(auth.uid()) AND (created_by = auth.uid()))) WITH CHECK ((public.is_active(auth.uid()) AND (created_by = auth.uid())));


--
-- Name: daily_lead_reports dlr_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dlr_admin ON public.daily_lead_reports TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: daily_lead_reports dlr_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dlr_delete_own ON public.daily_lead_reports FOR DELETE TO authenticated USING ((public.is_active(auth.uid()) AND (created_by = auth.uid())));


--
-- Name: daily_lead_reports dlr_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dlr_insert ON public.daily_lead_reports FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (created_by = auth.uid())));


--
-- Name: daily_lead_reports dlr_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dlr_read ON public.daily_lead_reports FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: daily_lead_reports dlr_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dlr_update_own ON public.daily_lead_reports FOR UPDATE TO authenticated USING ((public.is_active(auth.uid()) AND (created_by = auth.uid()))) WITH CHECK ((public.is_active(auth.uid()) AND (created_by = auth.uid())));


--
-- Name: daily_lead_report_ad_accounts dlraa_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dlraa_admin ON public.daily_lead_report_ad_accounts TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: daily_lead_report_ad_accounts dlraa_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dlraa_delete ON public.daily_lead_report_ad_accounts FOR DELETE TO authenticated USING ((public.is_active(auth.uid()) AND (EXISTS ( SELECT 1
   FROM (public.daily_lead_report_media_buyers mb
     JOIN public.daily_lead_reports r ON ((r.id = mb.report_id)))
  WHERE ((mb.id = daily_lead_report_ad_accounts.report_media_buyer_id) AND (r.created_by = auth.uid()))))));


--
-- Name: daily_lead_report_ad_accounts dlraa_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dlraa_insert ON public.daily_lead_report_ad_accounts FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (EXISTS ( SELECT 1
   FROM (public.daily_lead_report_media_buyers mb
     JOIN public.daily_lead_reports r ON ((r.id = mb.report_id)))
  WHERE ((mb.id = daily_lead_report_ad_accounts.report_media_buyer_id) AND (r.created_by = auth.uid()))))));


--
-- Name: daily_lead_report_ad_accounts dlraa_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dlraa_read ON public.daily_lead_report_ad_accounts FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: daily_lead_report_ad_accounts dlraa_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dlraa_update ON public.daily_lead_report_ad_accounts FOR UPDATE TO authenticated USING ((public.is_active(auth.uid()) AND (EXISTS ( SELECT 1
   FROM (public.daily_lead_report_media_buyers mb
     JOIN public.daily_lead_reports r ON ((r.id = mb.report_id)))
  WHERE ((mb.id = daily_lead_report_ad_accounts.report_media_buyer_id) AND (r.created_by = auth.uid())))))) WITH CHECK (public.is_active(auth.uid()));


--
-- Name: daily_lead_report_media_buyers dlrmb_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dlrmb_admin ON public.daily_lead_report_media_buyers TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: daily_lead_report_media_buyers dlrmb_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dlrmb_delete ON public.daily_lead_report_media_buyers FOR DELETE TO authenticated USING ((public.is_active(auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.daily_lead_reports r
  WHERE ((r.id = daily_lead_report_media_buyers.report_id) AND (r.created_by = auth.uid()))))));


--
-- Name: daily_lead_report_media_buyers dlrmb_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dlrmb_insert ON public.daily_lead_report_media_buyers FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.daily_lead_reports r
  WHERE ((r.id = daily_lead_report_media_buyers.report_id) AND (r.created_by = auth.uid()))))));


--
-- Name: daily_lead_report_media_buyers dlrmb_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dlrmb_read ON public.daily_lead_report_media_buyers FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: daily_lead_report_media_buyers dlrmb_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dlrmb_update ON public.daily_lead_report_media_buyers FOR UPDATE TO authenticated USING ((public.is_active(auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.daily_lead_reports r
  WHERE ((r.id = daily_lead_report_media_buyers.report_id) AND (r.created_by = auth.uid())))))) WITH CHECK (public.is_active(auth.uid()));


--
-- Name: daily_lead_source_mappings dlsm_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dlsm_admin ON public.daily_lead_source_mappings TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: daily_lead_source_mappings dlsm_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dlsm_delete_own ON public.daily_lead_source_mappings FOR DELETE TO authenticated USING ((public.is_active(auth.uid()) AND (created_by = auth.uid())));


--
-- Name: daily_lead_source_mappings dlsm_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dlsm_insert ON public.daily_lead_source_mappings FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (created_by = auth.uid())));


--
-- Name: daily_lead_source_mappings dlsm_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dlsm_read ON public.daily_lead_source_mappings FOR SELECT TO authenticated USING ((public.is_active(auth.uid()) AND (is_active = true)));


--
-- Name: daily_lead_source_mappings dlsm_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dlsm_update_own ON public.daily_lead_source_mappings FOR UPDATE TO authenticated USING ((public.is_active(auth.uid()) AND (created_by = auth.uid()))) WITH CHECK ((public.is_active(auth.uid()) AND (created_by = auth.uid())));


--
-- Name: daily_metric_templates dmt_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dmt_admin ON public.daily_metric_templates TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: daily_metric_templates dmt_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dmt_delete_own ON public.daily_metric_templates FOR DELETE TO authenticated USING ((public.is_active(auth.uid()) AND (created_by = auth.uid())));


--
-- Name: daily_metric_templates dmt_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dmt_insert ON public.daily_metric_templates FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND ((created_by = auth.uid()) OR (created_by IS NULL))));


--
-- Name: daily_metric_templates dmt_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dmt_read ON public.daily_metric_templates FOR SELECT TO authenticated USING ((public.is_active(auth.uid()) AND (is_active = true)));


--
-- Name: daily_metric_templates dmt_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dmt_update_own ON public.daily_metric_templates FOR UPDATE TO authenticated USING ((public.is_active(auth.uid()) AND (created_by = auth.uid()))) WITH CHECK ((public.is_active(auth.uid()) AND (created_by = auth.uid())));


--
-- Name: data_sources ds_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ds_admin ON public.data_sources TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: data_sources ds_member_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ds_member_update ON public.data_sources FOR UPDATE TO authenticated USING ((public.is_active(auth.uid()) AND (created_by = auth.uid()))) WITH CHECK ((public.is_active(auth.uid()) AND (created_by = auth.uid())));


--
-- Name: data_sources ds_member_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ds_member_write ON public.data_sources FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (created_by = auth.uid())));


--
-- Name: data_sources ds_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ds_read ON public.data_sources FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: follow_up_reminders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.follow_up_reminders ENABLE ROW LEVEL SECURITY;

--
-- Name: incentives inc_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inc_admin ON public.incentives TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: incentives; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.incentives ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_events ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_events invoice_events_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_events_insert ON public.invoice_events FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND ((created_by IS NULL) OR (created_by = auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.id = invoice_events.invoice_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR (i.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.paid_pipeline_leads p
          WHERE ((p.id = i.paid_pipeline_lead_id) AND (p.assigned_sales_executive = auth.uid()))))))))));


--
-- Name: invoice_events invoice_events_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_events_select ON public.invoice_events FOR SELECT TO authenticated USING ((public.is_active(auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.id = invoice_events.invoice_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR (i.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.paid_pipeline_leads p
          WHERE ((p.id = i.paid_pipeline_lead_id) AND (p.assigned_sales_executive = auth.uid()))))))))));


--
-- Name: invoice_item_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_item_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_item_categories invoice_item_categories_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_item_categories_admin_write ON public.invoice_item_categories TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: invoice_item_categories invoice_item_categories_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_item_categories_select ON public.invoice_item_categories FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: invoice_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_items invoice_items_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_items_admin_delete ON public.invoice_items FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: invoice_items invoice_items_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_items_admin_insert ON public.invoice_items FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: invoice_items invoice_items_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_items_admin_update ON public.invoice_items FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: invoice_items invoice_items_read_active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_items_read_active ON public.invoice_items FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: invoice_line_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_line_items invoice_line_items_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_line_items_all ON public.invoice_line_items TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.id = invoice_line_items.invoice_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR ((i.created_by = auth.uid()) AND (i.status = 'draft'::text))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.id = invoice_line_items.invoice_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR ((i.created_by = auth.uid()) AND (i.status = 'draft'::text)))))));


--
-- Name: invoice_line_items invoice_line_items_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_line_items_select ON public.invoice_line_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.id = invoice_line_items.invoice_id) AND public.is_active(auth.uid()) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR (i.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.paid_pipeline_leads p
          WHERE ((p.id = i.paid_pipeline_lead_id) AND (p.assigned_sales_executive = auth.uid())))))))));


--
-- Name: invoice_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_settings invoice_settings_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_settings_admin_delete ON public.invoice_settings FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: invoice_settings invoice_settings_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_settings_admin_insert ON public.invoice_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: invoice_settings invoice_settings_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_settings_admin_update ON public.invoice_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: invoice_settings invoice_settings_read_active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_settings_read_active ON public.invoice_settings FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices invoices_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoices_delete_admin ON public.invoices FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: invoices invoices_insert_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoices_insert_self ON public.invoices FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (created_by = auth.uid())));


--
-- Name: invoices invoices_select_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoices_select_scoped ON public.invoices FOR SELECT TO authenticated USING ((public.is_active(auth.uid()) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR (created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.paid_pipeline_leads p
  WHERE ((p.id = invoices.paid_pipeline_lead_id) AND (p.assigned_sales_executive = auth.uid())))))));


--
-- Name: invoices invoices_update_draft; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoices_update_draft ON public.invoices FOR UPDATE TO authenticated USING ((public.is_active(auth.uid()) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR ((created_by = auth.uid()) AND (status = 'draft'::text)))));


--
-- Name: kpi_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kpi_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: kpi_assignments kpi_assignments admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "kpi_assignments admin manage" ON public.kpi_assignments TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: kpi_assignments kpi_assignments read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "kpi_assignments read own" ON public.kpi_assignments FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: kpi_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kpi_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: kpi_categories kpi_categories_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kpi_categories_admin_write ON public.kpi_categories TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: kpi_categories kpi_categories_read_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kpi_categories_read_auth ON public.kpi_categories FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: kpi_definitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kpi_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: kpi_definitions kpi_defs admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "kpi_defs admin manage" ON public.kpi_definitions TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: kpi_definitions kpi_defs read active for active users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "kpi_defs read active for active users" ON public.kpi_definitions FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: kpi_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kpi_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: kpi_entries kpi_entries admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "kpi_entries admin manage" ON public.kpi_entries TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: kpi_entries kpi_entries read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "kpi_entries read own" ON public.kpi_entries FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: kpi_reward_earnings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kpi_reward_earnings ENABLE ROW LEVEL SECURITY;

--
-- Name: kpi_reward_earnings kpi_reward_earnings admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "kpi_reward_earnings admin manage" ON public.kpi_reward_earnings TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: kpi_reward_earnings kpi_reward_earnings read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "kpi_reward_earnings read own" ON public.kpi_reward_earnings FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: kpi_reward_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kpi_reward_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: kpi_reward_rules kpi_reward_rules admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "kpi_reward_rules admin manage" ON public.kpi_reward_rules TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: kpi_reward_rules kpi_reward_rules read active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "kpi_reward_rules read active" ON public.kpi_reward_rules FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: kpi_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kpi_submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: kpi_submissions kpi_submissions admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "kpi_submissions admin manage" ON public.kpi_submissions TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: kpi_submissions kpi_submissions insert own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "kpi_submissions insert own" ON public.kpi_submissions FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.kpi_entries e
  WHERE ((e.id = kpi_submissions.entry_id) AND (e.user_id = auth.uid()))))));


--
-- Name: kpi_submissions kpi_submissions read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "kpi_submissions read own" ON public.kpi_submissions FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: kpi_submissions kpi_submissions update own before review; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "kpi_submissions update own before review" ON public.kpi_submissions FOR UPDATE TO authenticated USING (((user_id = auth.uid()) AND (status = 'submitted'::text) AND (reviewed_at IS NULL))) WITH CHECK (((user_id = auth.uid()) AND (status = 'submitted'::text) AND (reviewed_at IS NULL)));


--
-- Name: kpi_template_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kpi_template_items ENABLE ROW LEVEL SECURITY;

--
-- Name: kpi_template_items kpi_template_items admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "kpi_template_items admin manage" ON public.kpi_template_items TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: kpi_template_items kpi_template_items read for active users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "kpi_template_items read for active users" ON public.kpi_template_items FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: kpi_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kpi_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: kpi_templates kpi_templates admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "kpi_templates admin manage" ON public.kpi_templates TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: kpi_templates kpi_templates read for active users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "kpi_templates read for active users" ON public.kpi_templates FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: lead_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_hotness_scores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_hotness_scores ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_qualifier_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_qualifier_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_session_attendance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_session_attendance ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_tag_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_tag_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_tag_assignments lta_delete_active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lta_delete_active ON public.lead_tag_assignments FOR DELETE TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: lead_tag_assignments lta_insert_active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lta_insert_active ON public.lead_tag_assignments FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (assigned_by = auth.uid())));


--
-- Name: lead_tag_assignments lta_select_active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lta_select_active ON public.lead_tag_assignments FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: member_access_verifications mav_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mav_delete ON public.member_access_verifications FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: member_access_verifications mav_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mav_insert ON public.member_access_verifications FOR INSERT TO authenticated WITH CHECK (public.can_access_member_verification(crm_lead_id, paid_pipeline_lead_id));


--
-- Name: member_access_verifications mav_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mav_select ON public.member_access_verifications FOR SELECT TO authenticated USING (public.can_access_member_verification(crm_lead_id, paid_pipeline_lead_id));


--
-- Name: member_access_verifications mav_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mav_update ON public.member_access_verifications FOR UPDATE TO authenticated USING (public.can_access_member_verification(crm_lead_id, paid_pipeline_lead_id)) WITH CHECK (public.can_access_member_verification(crm_lead_id, paid_pipeline_lead_id));


--
-- Name: media_buyer_attribution mba_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mba_admin ON public.media_buyer_attribution TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: media_buyer_attribution mba_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mba_insert ON public.media_buyer_attribution FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (created_by = auth.uid())));


--
-- Name: media_buyer_attribution mba_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mba_read ON public.media_buyer_attribution FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.attribution_sessions s
  WHERE ((s.id = media_buyer_attribution.session_id) AND (s.created_by = auth.uid()))))));


--
-- Name: media_buyer_cases mbc_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mbc_delete_admin ON public.media_buyer_cases FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: media_buyer_cases mbc_insert_admin_or_assignee; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mbc_insert_admin_or_assignee ON public.media_buyer_cases FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR (auth.uid() = created_by))));


--
-- Name: media_buyer_cases mbc_select_active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mbc_select_active ON public.media_buyer_cases FOR SELECT USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (auth.uid() = assigned_media_buyer_id) OR (auth.uid() = created_by)));


--
-- Name: media_buyer_cases mbc_update_admin_or_buyer; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mbc_update_admin_or_buyer ON public.media_buyer_cases FOR UPDATE USING ((public.is_active(auth.uid()) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR (auth.uid() = assigned_media_buyer_id))));


--
-- Name: media_buyer_case_events mbce_insert_active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mbce_insert_active ON public.media_buyer_case_events FOR INSERT TO authenticated WITH CHECK (public.is_active(auth.uid()));


--
-- Name: media_buyer_case_events mbce_select_active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mbce_select_active ON public.media_buyer_case_events FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: media_buyer_case_events mbce_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mbce_update_admin ON public.media_buyer_case_events FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: media_buyer_case_emails mbcm_insert_active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mbcm_insert_active ON public.media_buyer_case_emails FOR INSERT TO authenticated WITH CHECK (public.is_active(auth.uid()));


--
-- Name: media_buyer_case_emails mbcm_select_active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mbcm_select_active ON public.media_buyer_case_emails FOR SELECT USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.media_buyer_cases c
  WHERE ((c.id = media_buyer_case_emails.case_id) AND ((c.assigned_media_buyer_id = auth.uid()) OR (c.created_by = auth.uid())))))));


--
-- Name: media_buyer_case_emails mbcm_update_active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mbcm_update_active ON public.media_buyer_case_emails FOR UPDATE USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.media_buyer_cases c
  WHERE ((c.id = media_buyer_case_emails.case_id) AND ((c.assigned_media_buyer_id = auth.uid()) OR (c.created_by = auth.uid())))))));


--
-- Name: media_buyer_service_periods mbsp_insert_active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mbsp_insert_active ON public.media_buyer_service_periods FOR INSERT TO authenticated WITH CHECK (public.is_active(auth.uid()));


--
-- Name: media_buyer_service_periods mbsp_select_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mbsp_select_scoped ON public.media_buyer_service_periods FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.media_buyer_cases c
  WHERE ((c.id = media_buyer_service_periods.case_id) AND ((c.assigned_media_buyer_id = auth.uid()) OR (c.created_by = auth.uid())))))));


--
-- Name: media_buyer_service_periods mbsp_update_active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mbsp_update_active ON public.media_buyer_service_periods FOR UPDATE USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.media_buyer_cases c
  WHERE ((c.id = media_buyer_service_periods.case_id) AND ((c.assigned_media_buyer_id = auth.uid()) OR (c.created_by = auth.uid()))))))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.media_buyer_cases c
  WHERE ((c.id = media_buyer_service_periods.case_id) AND ((c.assigned_media_buyer_id = auth.uid()) OR (c.created_by = auth.uid())))))));


--
-- Name: media_buyer_aliases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.media_buyer_aliases ENABLE ROW LEVEL SECURITY;

--
-- Name: media_buyer_attribution; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.media_buyer_attribution ENABLE ROW LEVEL SECURITY;

--
-- Name: media_buyer_case_emails; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.media_buyer_case_emails ENABLE ROW LEVEL SECURITY;

--
-- Name: media_buyer_case_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.media_buyer_case_events ENABLE ROW LEVEL SECURITY;

--
-- Name: media_buyer_cases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.media_buyer_cases ENABLE ROW LEVEL SECURITY;

--
-- Name: media_buyer_service_periods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.media_buyer_service_periods ENABLE ROW LEVEL SECURITY;

--
-- Name: member_access_verifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.member_access_verifications ENABLE ROW LEVEL SECURITY;

--
-- Name: follow_up_reminders members delete reminders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "members delete reminders" ON public.follow_up_reminders FOR DELETE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (agent_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = follow_up_reminders.lead_id) AND (l.assigned_agent_id = auth.uid()))))));


--
-- Name: activity_logs members insert activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "members insert activity" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (public.is_active(auth.uid()) AND ((agent_id IS NULL) OR (agent_id = auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = activity_logs.lead_id) AND ((l.assigned_agent_id = auth.uid()) OR (l.assigned_agent_id IS NULL))))))));


--
-- Name: follow_up_reminders members insert reminders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "members insert reminders" ON public.follow_up_reminders FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (public.is_active(auth.uid()) AND ((agent_id IS NULL) OR (agent_id = auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = follow_up_reminders.lead_id) AND ((l.assigned_agent_id = auth.uid()) OR (l.assigned_agent_id IS NULL))))))));


--
-- Name: lead_qualifier_sessions members insert sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "members insert sessions" ON public.lead_qualifier_sessions FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (uploaded_by = auth.uid())));


--
-- Name: activity_logs members read activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "members read activity" ON public.activity_logs FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: leads members read leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "members read leads" ON public.leads FOR SELECT USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (public.is_active(auth.uid()) AND ((assigned_agent_id = auth.uid()) OR ((assigned_agent_id IS NULL) AND public.can_access_unassigned_leads(auth.uid()))))));


--
-- Name: pipelines members read pipelines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "members read pipelines" ON public.pipelines FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: lead_qualifier_sessions members read sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "members read sessions" ON public.lead_qualifier_sessions FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: stages members read stages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "members read stages" ON public.stages FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: follow_up_reminders members update reminders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "members update reminders" ON public.follow_up_reminders FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (agent_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = follow_up_reminders.lead_id) AND (l.assigned_agent_id = auth.uid())))))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (agent_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = follow_up_reminders.lead_id) AND (l.assigned_agent_id = auth.uid()))))));


--
-- Name: notification_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_delete_admin ON public.notifications FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: notifications notifications_insert_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_insert_auth ON public.notifications FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR ((triggered_by_user_id = auth.uid()) AND ((recipient_user_id IS NULL) OR (recipient_user_id = auth.uid())))));


--
-- Name: notifications notifications_select_own_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_select_own_or_admin ON public.notifications FOR SELECT TO authenticated USING (((is_deleted = false) AND ((recipient_user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))));


--
-- Name: notifications notifications_update_own_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_update_own_or_admin ON public.notifications FOR UPDATE TO authenticated USING (((recipient_user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: offer_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.offer_items ENABLE ROW LEVEL SECURITY;

--
-- Name: offer_items offer_items_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY offer_items_admin_delete ON public.offer_items FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: offer_items offer_items_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY offer_items_admin_insert ON public.offer_items FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: offer_items offer_items_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY offer_items_admin_update ON public.offer_items FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: offer_items offer_items_select_active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY offer_items_select_active ON public.offer_items FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: offer_preset_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.offer_preset_items ENABLE ROW LEVEL SECURITY;

--
-- Name: offer_preset_items offer_preset_items_active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY offer_preset_items_active ON public.offer_preset_items TO authenticated USING (public.is_active(auth.uid())) WITH CHECK (public.is_active(auth.uid()));


--
-- Name: offer_presets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.offer_presets ENABLE ROW LEVEL SECURITY;

--
-- Name: offer_presets offer_presets_active_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY offer_presets_active_write ON public.offer_presets TO authenticated USING (public.is_active(auth.uid())) WITH CHECK (public.is_active(auth.uid()));


--
-- Name: offer_presets offer_presets_select_active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY offer_presets_select_active ON public.offer_presets FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: offline_seminar_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.offline_seminar_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: operations_communication_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operations_communication_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: operations_conversion_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operations_conversion_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: operations_handoff_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operations_handoff_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: operations_intake_imports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operations_intake_imports ENABLE ROW LEVEL SECURITY;

--
-- Name: operations_lead_checklist_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operations_lead_checklist_state ENABLE ROW LEVEL SECURITY;

--
-- Name: operations_lead_custom_values; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operations_lead_custom_values ENABLE ROW LEVEL SECURITY;

--
-- Name: operations_leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operations_leads ENABLE ROW LEVEL SECURITY;

--
-- Name: operations_offer_deliveries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operations_offer_deliveries ENABLE ROW LEVEL SECURITY;

--
-- Name: operations_process_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operations_process_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: operations_result_reward_payouts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operations_result_reward_payouts ENABLE ROW LEVEL SECURITY;

--
-- Name: operations_result_reward_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operations_result_reward_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: operations_result_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operations_result_submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: operations_reward_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operations_reward_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: operations_reward_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operations_reward_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: operations_service_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operations_service_events ENABLE ROW LEVEL SECURITY;

--
-- Name: operations_template_checklist_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operations_template_checklist_items ENABLE ROW LEVEL SECURITY;

--
-- Name: operations_template_fields; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operations_template_fields ENABLE ROW LEVEL SECURITY;

--
-- Name: operations_communication_templates ops_comm_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ops_comm_admin_all ON public.operations_communication_templates TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: operations_communication_templates ops_comm_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ops_comm_read ON public.operations_communication_templates FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: operations_conversion_reports ops_conv_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ops_conv_admin_all ON public.operations_conversion_reports TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: operations_conversion_reports ops_conv_member_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ops_conv_member_insert_own ON public.operations_conversion_reports FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (media_buyer_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.operations_leads ol
  WHERE ((ol.id = operations_conversion_reports.operations_lead_id) AND (ol.assigned_media_buyer_id = auth.uid()))))));


--
-- Name: operations_conversion_reports ops_conv_member_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ops_conv_member_select_own ON public.operations_conversion_reports FOR SELECT TO authenticated USING ((public.is_active(auth.uid()) AND (media_buyer_id = auth.uid())));


--
-- Name: operations_offer_deliveries ops_deliveries_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ops_deliveries_admin_all ON public.operations_offer_deliveries USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: operations_offer_deliveries ops_deliveries_member_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ops_deliveries_member_insert ON public.operations_offer_deliveries FOR INSERT WITH CHECK ((public.is_active(auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.operations_leads ol
  WHERE ((ol.id = operations_offer_deliveries.operations_lead_id) AND (ol.assigned_media_buyer_id = auth.uid()))))));


--
-- Name: operations_offer_deliveries ops_deliveries_member_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ops_deliveries_member_select ON public.operations_offer_deliveries FOR SELECT USING ((public.is_active(auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.operations_leads ol
  WHERE ((ol.id = operations_offer_deliveries.operations_lead_id) AND (ol.assigned_media_buyer_id = auth.uid()))))));


--
-- Name: operations_offer_deliveries ops_deliveries_member_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ops_deliveries_member_update ON public.operations_offer_deliveries FOR UPDATE USING ((public.is_active(auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.operations_leads ol
  WHERE ((ol.id = operations_offer_deliveries.operations_lead_id) AND (ol.assigned_media_buyer_id = auth.uid())))))) WITH CHECK ((public.is_active(auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.operations_leads ol
  WHERE ((ol.id = operations_offer_deliveries.operations_lead_id) AND (ol.assigned_media_buyer_id = auth.uid()))))));


--
-- Name: operations_service_events ops_events_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ops_events_admin_all ON public.operations_service_events TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: operations_service_events ops_events_member_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ops_events_member_insert ON public.operations_service_events FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.operations_leads ol
  WHERE ((ol.id = operations_service_events.operations_lead_id) AND (ol.assigned_media_buyer_id = auth.uid()))))));


--
-- Name: operations_service_events ops_events_member_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ops_events_member_select ON public.operations_service_events FOR SELECT TO authenticated USING ((public.is_active(auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.operations_leads ol
  WHERE ((ol.id = operations_service_events.operations_lead_id) AND (ol.assigned_media_buyer_id = auth.uid()))))));


--
-- Name: operations_intake_imports ops_imp_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ops_imp_insert ON public.operations_intake_imports FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (created_by = auth.uid())));


--
-- Name: operations_intake_imports ops_imp_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ops_imp_read ON public.operations_intake_imports FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: operations_lead_checklist_state ops_lcs_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ops_lcs_read ON public.operations_lead_checklist_state FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: operations_lead_checklist_state ops_lcs_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ops_lcs_write ON public.operations_lead_checklist_state USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.operations_leads ol
  WHERE ((ol.id = operations_lead_checklist_state.operations_lead_id) AND ((ol.assigned_media_buyer_id = auth.uid()) OR (ol.created_by = auth.uid()))))))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.operations_leads ol
  WHERE ((ol.id = operations_lead_checklist_state.operations_lead_id) AND ((ol.assigned_media_buyer_id = auth.uid()) OR (ol.created_by = auth.uid())))))));


--
-- Name: operations_lead_custom_values ops_lcv_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ops_lcv_read ON public.operations_lead_custom_values FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: operations_lead_custom_values ops_lcv_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ops_lcv_write ON public.operations_lead_custom_values USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.operations_leads ol
  WHERE ((ol.id = operations_lead_custom_values.operations_lead_id) AND ((ol.assigned_media_buyer_id = auth.uid()) OR (ol.created_by = auth.uid()))))))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.operations_leads ol
  WHERE ((ol.id = operations_lead_custom_values.operations_lead_id) AND ((ol.assigned_media_buyer_id = auth.uid()) OR (ol.created_by = auth.uid())))))));


--
-- Name: operations_leads ops_leads_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ops_leads_admin_all ON public.operations_leads TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: operations_leads ops_leads_member_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ops_leads_member_select_own ON public.operations_leads FOR SELECT TO authenticated USING ((public.is_active(auth.uid()) AND (assigned_media_buyer_id = auth.uid())));


--
-- Name: operations_leads ops_leads_member_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ops_leads_member_update_own ON public.operations_leads FOR UPDATE TO authenticated USING ((public.is_active(auth.uid()) AND (assigned_media_buyer_id = auth.uid()))) WITH CHECK ((public.is_active(auth.uid()) AND (assigned_media_buyer_id = auth.uid())));


--
-- Name: operations_reward_progress ops_reward_progress_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ops_reward_progress_admin_all ON public.operations_reward_progress TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: operations_reward_progress ops_reward_progress_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ops_reward_progress_select_own ON public.operations_reward_progress FOR SELECT TO authenticated USING ((public.is_active(auth.uid()) AND (media_buyer_id = auth.uid())));


--
-- Name: operations_reward_rules ops_reward_rules_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ops_reward_rules_admin_write ON public.operations_reward_rules TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: operations_reward_rules ops_reward_rules_select_active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ops_reward_rules_select_active ON public.operations_reward_rules FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: operations_process_templates ops_tpl_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ops_tpl_admin_all ON public.operations_process_templates TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: operations_template_checklist_items ops_tpl_chk_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ops_tpl_chk_admin_all ON public.operations_template_checklist_items TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: operations_template_checklist_items ops_tpl_chk_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ops_tpl_chk_read ON public.operations_template_checklist_items FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: operations_template_fields ops_tpl_fld_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ops_tpl_fld_admin_all ON public.operations_template_fields TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: operations_template_fields ops_tpl_fld_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ops_tpl_fld_read ON public.operations_template_fields FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: operations_process_templates ops_tpl_read_active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ops_tpl_read_active ON public.operations_process_templates FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: paid_lead_offer_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.paid_lead_offer_items ENABLE ROW LEVEL SECURITY;

--
-- Name: paid_pipeline_activity_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.paid_pipeline_activity_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: paid_pipeline_batches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.paid_pipeline_batches ENABLE ROW LEVEL SECURITY;

--
-- Name: paid_pipeline_finance_details; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.paid_pipeline_finance_details ENABLE ROW LEVEL SECURITY;

--
-- Name: paid_pipeline_followups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.paid_pipeline_followups ENABLE ROW LEVEL SECURITY;

--
-- Name: paid_pipeline_leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.paid_pipeline_leads ENABLE ROW LEVEL SECURITY;

--
-- Name: paid_pipeline_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.paid_pipeline_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: paid_pipeline_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.paid_pipeline_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: paid_pipeline_to_crm_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.paid_pipeline_to_crm_links ENABLE ROW LEVEL SECURITY;

--
-- Name: payroll_run_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payroll_run_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: payroll_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: pipelines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;

--
-- Name: paid_lead_offer_items plo_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plo_delete_admin ON public.paid_lead_offer_items FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: paid_lead_offer_items plo_insert_active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plo_insert_active ON public.paid_lead_offer_items FOR INSERT TO authenticated WITH CHECK (public.is_active(auth.uid()));


--
-- Name: paid_lead_offer_items plo_select_active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plo_select_active ON public.paid_lead_offer_items FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: paid_lead_offer_items plo_update_active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plo_update_active ON public.paid_lead_offer_items FOR UPDATE TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: program_products pp_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pp_admin ON public.program_products TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: program_products pp_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pp_insert ON public.program_products FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (created_by = auth.uid())));


--
-- Name: program_products pp_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pp_read ON public.program_products FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: program_products pp_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pp_update_own ON public.program_products FOR UPDATE TO authenticated USING ((public.is_active(auth.uid()) AND ((created_by = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)))) WITH CHECK (public.is_active(auth.uid()));


--
-- Name: paid_pipeline_activity_logs ppal_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ppal_admin ON public.paid_pipeline_activity_logs TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: paid_pipeline_activity_logs ppal_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ppal_insert ON public.paid_pipeline_activity_logs FOR INSERT TO authenticated WITH CHECK (public.is_active(auth.uid()));


--
-- Name: paid_pipeline_activity_logs ppal_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ppal_read ON public.paid_pipeline_activity_logs FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: paid_pipeline_batches ppb_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ppb_admin ON public.paid_pipeline_batches TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: paid_pipeline_batches ppb_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ppb_insert ON public.paid_pipeline_batches FOR INSERT TO authenticated WITH CHECK (public.is_active(auth.uid()));


--
-- Name: paid_pipeline_batches ppb_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ppb_read ON public.paid_pipeline_batches FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: paid_pipeline_batches ppb_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ppb_update ON public.paid_pipeline_batches FOR UPDATE USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (created_by = auth.uid()))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (created_by = auth.uid())));


--
-- Name: paid_pipeline_finance_details ppfd_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ppfd_admin ON public.paid_pipeline_finance_details TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: paid_pipeline_finance_details ppfd_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ppfd_read ON public.paid_pipeline_finance_details FOR SELECT TO authenticated USING ((public.is_active(auth.uid()) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.paid_pipeline_leads p
  WHERE ((p.id = paid_pipeline_finance_details.paid_pipeline_lead_id) AND ((p.created_by = auth.uid()) OR (p.assigned_sales_executive = auth.uid()))))))));


--
-- Name: paid_pipeline_finance_details ppfd_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ppfd_update ON public.paid_pipeline_finance_details FOR UPDATE TO authenticated USING ((public.is_active(auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.paid_pipeline_leads l
  WHERE ((l.id = paid_pipeline_finance_details.paid_pipeline_lead_id) AND ((l.created_by = auth.uid()) OR (l.assigned_sales_executive = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))))))) WITH CHECK (public.is_active(auth.uid()));


--
-- Name: paid_pipeline_finance_details ppfd_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ppfd_write ON public.paid_pipeline_finance_details FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.paid_pipeline_leads l
  WHERE ((l.id = paid_pipeline_finance_details.paid_pipeline_lead_id) AND ((l.created_by = auth.uid()) OR (l.assigned_sales_executive = auth.uid())))))));


--
-- Name: paid_pipeline_followups ppfu_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ppfu_admin ON public.paid_pipeline_followups TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: paid_pipeline_followups ppfu_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ppfu_delete ON public.paid_pipeline_followups FOR DELETE TO authenticated USING ((public.is_active(auth.uid()) AND ((created_by = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))));


--
-- Name: paid_pipeline_followups ppfu_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ppfu_insert ON public.paid_pipeline_followups FOR INSERT TO authenticated WITH CHECK (public.is_active(auth.uid()));


--
-- Name: paid_pipeline_followups ppfu_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ppfu_read ON public.paid_pipeline_followups FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.paid_pipeline_leads p
  WHERE ((p.id = paid_pipeline_followups.paid_pipeline_lead_id) AND ((p.created_by = auth.uid()) OR (p.assigned_sales_executive = auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = paid_pipeline_followups.related_crm_lead_id) AND (l.assigned_agent_id = auth.uid()))))));


--
-- Name: paid_pipeline_followups ppfu_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ppfu_update ON public.paid_pipeline_followups FOR UPDATE TO authenticated USING ((public.is_active(auth.uid()) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR (created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.paid_pipeline_leads p
  WHERE ((p.id = paid_pipeline_followups.paid_pipeline_lead_id) AND ((p.created_by = auth.uid()) OR (p.assigned_sales_executive = auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = paid_pipeline_followups.related_crm_lead_id) AND (l.assigned_agent_id = auth.uid()))))))) WITH CHECK ((public.is_active(auth.uid()) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR (created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.paid_pipeline_leads p
  WHERE ((p.id = paid_pipeline_followups.paid_pipeline_lead_id) AND ((p.created_by = auth.uid()) OR (p.assigned_sales_executive = auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = paid_pipeline_followups.related_crm_lead_id) AND (l.assigned_agent_id = auth.uid())))))));


--
-- Name: paid_pipeline_leads ppl_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ppl_admin ON public.paid_pipeline_leads TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: paid_pipeline_leads ppl_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ppl_insert ON public.paid_pipeline_leads FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (created_by = auth.uid())));


--
-- Name: paid_pipeline_leads ppl_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ppl_read ON public.paid_pipeline_leads FOR SELECT USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (created_by = auth.uid()) OR (assigned_sales_executive = auth.uid()) OR ((crm_lead_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = paid_pipeline_leads.crm_lead_id) AND (l.assigned_agent_id = auth.uid())))))));


--
-- Name: paid_pipeline_leads ppl_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ppl_update ON public.paid_pipeline_leads FOR UPDATE USING ((public.is_active(auth.uid()) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR (created_by = auth.uid()) OR (assigned_sales_executive = auth.uid()) OR ((crm_lead_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = paid_pipeline_leads.crm_lead_id) AND (l.assigned_agent_id = auth.uid()))))))));


--
-- Name: paid_pipeline_payments ppp_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ppp_admin ON public.paid_pipeline_payments TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: paid_pipeline_payments ppp_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ppp_insert ON public.paid_pipeline_payments FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.paid_pipeline_leads l
  WHERE (l.id = paid_pipeline_payments.paid_pipeline_lead_id))) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_module_access(auth.uid(), 'paid_pipeline'::text) OR public.has_module_access(auth.uid(), 'payment_recovery'::text) OR (EXISTS ( SELECT 1
   FROM public.paid_pipeline_leads l
  WHERE ((l.id = paid_pipeline_payments.paid_pipeline_lead_id) AND ((l.created_by = auth.uid()) OR (l.assigned_sales_executive = auth.uid()) OR (l.finance_owner = (auth.uid())::text))))))));


--
-- Name: paid_pipeline_payments ppp_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ppp_read ON public.paid_pipeline_payments FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (created_by = auth.uid()) OR public.has_module_access(auth.uid(), 'paid_pipeline'::text) OR (EXISTS ( SELECT 1
   FROM public.paid_pipeline_leads p
  WHERE ((p.id = paid_pipeline_payments.paid_pipeline_lead_id) AND ((p.created_by = auth.uid()) OR (p.assigned_sales_executive = auth.uid())))))));


--
-- Name: paid_pipeline_payments ppp_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ppp_update ON public.paid_pipeline_payments FOR UPDATE TO authenticated USING ((public.is_active(auth.uid()) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR (created_by = auth.uid()) OR public.has_module_access(auth.uid(), 'paid_pipeline'::text)))) WITH CHECK ((public.is_active(auth.uid()) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR ((created_by = auth.uid()) AND public.has_module_access(auth.uid(), 'paid_pipeline'::text)))));


--
-- Name: paid_pipeline_settings pps_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pps_admin ON public.paid_pipeline_settings TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: paid_pipeline_settings pps_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pps_insert ON public.paid_pipeline_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: paid_pipeline_settings pps_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pps_read ON public.paid_pipeline_settings FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: paid_pipeline_settings pps_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pps_update_admin ON public.paid_pipeline_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: paid_pipeline_to_crm_links pptcl_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pptcl_admin ON public.paid_pipeline_to_crm_links TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: paid_pipeline_to_crm_links pptcl_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pptcl_insert ON public.paid_pipeline_to_crm_links FOR INSERT TO authenticated WITH CHECK (public.is_active(auth.uid()));


--
-- Name: paid_pipeline_to_crm_links pptcl_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pptcl_read ON public.paid_pipeline_to_crm_links FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: payroll_runs pr_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pr_admin ON public.payroll_runs TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: payroll_run_entries pre_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pre_admin ON public.payroll_run_entries TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: notification_preferences prefs_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prefs_delete_own ON public.notification_preferences FOR DELETE USING ((public.is_active(auth.uid()) AND ((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))));


--
-- Name: notification_preferences prefs_modify_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prefs_modify_own ON public.notification_preferences FOR INSERT WITH CHECK ((public.is_active(auth.uid()) AND ((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))));


--
-- Name: notification_preferences prefs_select_own_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prefs_select_own_or_admin ON public.notification_preferences FOR SELECT USING ((public.is_active(auth.uid()) AND ((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))));


--
-- Name: notification_preferences prefs_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prefs_update_own ON public.notification_preferences FOR UPDATE USING ((public.is_active(auth.uid()) AND ((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profit_statement_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profit_statement_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: profit_statements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profit_statements ENABLE ROW LEVEL SECURITY;

--
-- Name: program_products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.program_products ENABLE ROW LEVEL SECURITY;

--
-- Name: profit_statements ps_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ps_admin ON public.profit_statements TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: profit_statement_lines psl_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY psl_admin ON public.profit_statement_lines TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: quick_save_entries qse_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY qse_delete_admin ON public.quick_save_entries FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: quick_save_entries qse_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY qse_insert ON public.quick_save_entries FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (created_by = auth.uid())));


--
-- Name: quick_save_entries qse_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY qse_read ON public.quick_save_entries FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: quick_save_entries qse_soft_delete_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY qse_soft_delete_self ON public.quick_save_entries FOR UPDATE TO authenticated USING ((public.is_active(auth.uid()) AND (created_by = auth.uid()))) WITH CHECK ((public.is_active(auth.uid()) AND (created_by = auth.uid()) AND (is_active = false)));


--
-- Name: quick_save_entries qse_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY qse_update_admin ON public.quick_save_entries FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: quick_save_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quick_save_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: roas_attribution_audit_logs raal_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY raal_admin ON public.roas_attribution_audit_logs TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: roas_attribution_audit_logs raal_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY raal_insert ON public.roas_attribution_audit_logs FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND ((attribution_session_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.attribution_sessions s
  WHERE ((s.id = roas_attribution_audit_logs.attribution_session_id) AND (s.created_by = auth.uid())))))));


--
-- Name: roas_attribution_audit_logs raal_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY raal_read ON public.roas_attribution_audit_logs FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: roas_calculation_drafts rcd_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rcd_admin ON public.roas_calculation_drafts TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: roas_calculation_drafts rcd_owner_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rcd_owner_delete ON public.roas_calculation_drafts FOR DELETE TO authenticated USING ((public.is_active(auth.uid()) AND (user_id = auth.uid())));


--
-- Name: roas_calculation_drafts rcd_owner_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rcd_owner_insert ON public.roas_calculation_drafts FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (user_id = auth.uid())));


--
-- Name: roas_calculation_drafts rcd_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rcd_owner_select ON public.roas_calculation_drafts FOR SELECT TO authenticated USING ((public.is_active(auth.uid()) AND (user_id = auth.uid())));


--
-- Name: roas_calculation_drafts rcd_owner_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rcd_owner_update ON public.roas_calculation_drafts FOR UPDATE TO authenticated USING ((public.is_active(auth.uid()) AND (user_id = auth.uid()))) WITH CHECK ((public.is_active(auth.uid()) AND (user_id = auth.uid())));


--
-- Name: recurring_expense_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recurring_expense_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: resource_library_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.resource_library_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: resource_library_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.resource_library_items ENABLE ROW LEVEL SECURITY;

--
-- Name: recurring_expense_templates ret_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ret_admin ON public.recurring_expense_templates TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: roas_fetch_logs rfl_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rfl_admin ON public.roas_fetch_logs TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: roas_fetch_logs rfl_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rfl_insert ON public.roas_fetch_logs FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (fetched_by = auth.uid())));


--
-- Name: roas_fetch_logs rfl_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rfl_read ON public.roas_fetch_logs FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: resource_library_categories rlc_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rlc_admin_write ON public.resource_library_categories TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: resource_library_categories rlc_select_active_users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rlc_select_active_users ON public.resource_library_categories FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: resource_library_items rli_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rli_admin_write ON public.resource_library_items TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: resource_library_items rli_select_visible; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rli_select_visible ON public.resource_library_items FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR ((is_published = true) AND (archived_at IS NULL) AND public.can_view_resource_library_item(visibility, allowed_role_keys, allowed_module_keys))));


--
-- Name: roas_master_sheets rms_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rms_admin ON public.roas_master_sheets TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: roas_master_sheets rms_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rms_insert ON public.roas_master_sheets FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (created_by = auth.uid())));


--
-- Name: roas_master_sheets rms_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rms_read ON public.roas_master_sheets FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: roas_master_sheets rms_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rms_update_own ON public.roas_master_sheets FOR UPDATE TO authenticated USING ((public.is_active(auth.uid()) AND (created_by = auth.uid()))) WITH CHECK ((public.is_active(auth.uid()) AND (created_by = auth.uid())));


--
-- Name: roas_master_sheet_mappings rmsm_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rmsm_admin ON public.roas_master_sheet_mappings TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: roas_master_sheet_mappings rmsm_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rmsm_insert ON public.roas_master_sheet_mappings FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (created_by = auth.uid())));


--
-- Name: roas_master_sheet_mappings rmsm_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rmsm_read ON public.roas_master_sheet_mappings FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: roas_master_sheet_mappings rmsm_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rmsm_update_own ON public.roas_master_sheet_mappings FOR UPDATE TO authenticated USING ((public.is_active(auth.uid()) AND (created_by = auth.uid()))) WITH CHECK ((public.is_active(auth.uid()) AND (created_by = auth.uid())));


--
-- Name: roas_master_sheet_tabs rmst_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rmst_admin ON public.roas_master_sheet_tabs TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: roas_master_sheet_tabs rmst_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rmst_insert ON public.roas_master_sheet_tabs FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.roas_master_sheets m
  WHERE ((m.id = roas_master_sheet_tabs.master_sheet_id) AND ((m.created_by = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)))))));


--
-- Name: roas_master_sheet_tabs rmst_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rmst_read ON public.roas_master_sheet_tabs FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: roas_master_sheet_tabs rmst_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rmst_update ON public.roas_master_sheet_tabs FOR UPDATE TO authenticated USING ((public.is_active(auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.roas_master_sheets m
  WHERE ((m.id = roas_master_sheet_tabs.master_sheet_id) AND ((m.created_by = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))))))) WITH CHECK (public.is_active(auth.uid()));


--
-- Name: roas_ad_spends; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roas_ad_spends ENABLE ROW LEVEL SECURITY;

--
-- Name: roas_attribution_audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roas_attribution_audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: roas_attribution_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roas_attribution_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: roas_attribution_logs roas_attrlog_member_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roas_attrlog_member_insert ON public.roas_attribution_logs FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (changed_by = auth.uid()) AND (enrollment_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.roas_enrollments e
  WHERE (e.id = roas_attribution_logs.enrollment_id)))));


--
-- Name: roas_attribution_logs roas_attrlog_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roas_attrlog_read ON public.roas_attribution_logs FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: roas_calculation_drafts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roas_calculation_drafts ENABLE ROW LEVEL SECURITY;

--
-- Name: roas_data_sources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roas_data_sources ENABLE ROW LEVEL SECURITY;

--
-- Name: roas_data_sources roas_ds_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roas_ds_admin ON public.roas_data_sources TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: roas_data_sources roas_ds_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roas_ds_read ON public.roas_data_sources FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: roas_enrollments roas_enr_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roas_enr_admin ON public.roas_enrollments TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: roas_enrollments roas_enr_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roas_enr_read ON public.roas_enrollments FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: roas_enrollments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roas_enrollments ENABLE ROW LEVEL SECURITY;

--
-- Name: roas_fetch_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roas_fetch_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: roas_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roas_history ENABLE ROW LEVEL SECURITY;

--
-- Name: roas_history roas_history_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roas_history_admin ON public.roas_history TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: roas_history roas_history_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roas_history_insert ON public.roas_history FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (created_by = auth.uid())));


--
-- Name: roas_history roas_history_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roas_history_read ON public.roas_history FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: roas_leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roas_leads ENABLE ROW LEVEL SECURITY;

--
-- Name: roas_leads roas_leads_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roas_leads_admin ON public.roas_leads TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: roas_leads roas_leads_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roas_leads_read ON public.roas_leads FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: roas_master_sheet_mappings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roas_master_sheet_mappings ENABLE ROW LEVEL SECURITY;

--
-- Name: roas_master_sheet_tabs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roas_master_sheet_tabs ENABLE ROW LEVEL SECURITY;

--
-- Name: roas_master_sheets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roas_master_sheets ENABLE ROW LEVEL SECURITY;

--
-- Name: roas_media_buyers roas_mb_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roas_mb_admin ON public.roas_media_buyers TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: roas_media_buyers roas_mb_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roas_mb_read ON public.roas_media_buyers FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: roas_media_buyers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roas_media_buyers ENABLE ROW LEVEL SECURITY;

--
-- Name: roas_ad_spends roas_spend_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roas_spend_delete_admin ON public.roas_ad_spends FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: roas_ad_spends roas_spend_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roas_spend_insert ON public.roas_ad_spends FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (public.is_active(auth.uid()) AND (entered_by = auth.uid()) AND (media_buyer_id IS NULL))));


--
-- Name: roas_ad_spends roas_spend_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roas_spend_read ON public.roas_ad_spends FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (entered_by = auth.uid())));


--
-- Name: roas_ad_spends roas_spend_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roas_spend_update_own ON public.roas_ad_spends FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (public.is_active(auth.uid()) AND (entered_by = auth.uid())))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (public.is_active(auth.uid()) AND (entered_by = auth.uid()) AND (media_buyer_id IS NULL))));


--
-- Name: roas_sync_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roas_sync_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: roas_sync_logs roas_synclog_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roas_synclog_read ON public.roas_sync_logs FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: roas_webinars roas_web_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roas_web_admin ON public.roas_webinars TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: roas_webinars roas_web_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roas_web_read ON public.roas_webinars FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: roas_webinars; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roas_webinars ENABLE ROW LEVEL SECURITY;

--
-- Name: company_role_catalog role_catalog_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY role_catalog_admin_write ON public.company_role_catalog TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: company_role_catalog role_catalog_auth_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY role_catalog_auth_insert ON public.company_role_catalog FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: company_role_catalog role_catalog_read_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY role_catalog_read_auth ON public.company_role_catalog FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: notification_rules rules_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rules_admin_all ON public.notification_rules TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: lead_session_attendance scoped insert attendance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "scoped insert attendance" ON public.lead_session_attendance FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = lead_session_attendance.lead_id) AND (l.assigned_agent_id = auth.uid()))))));


--
-- Name: lead_hotness_scores scoped insert hotness; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "scoped insert hotness" ON public.lead_hotness_scores FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = lead_hotness_scores.lead_id) AND (l.assigned_agent_id = auth.uid()))))));


--
-- Name: lead_notes scoped read lead notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "scoped read lead notes" ON public.lead_notes FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = lead_notes.lead_id) AND (l.assigned_agent_id = auth.uid())))) OR ((paid_pipeline_lead_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.paid_pipeline_leads p
  WHERE ((p.id = lead_notes.paid_pipeline_lead_id) AND ((p.created_by = auth.uid()) OR (p.assigned_sales_executive = auth.uid()))))))));


--
-- Name: follow_up_reminders scoped read reminders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "scoped read reminders" ON public.follow_up_reminders FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (agent_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = follow_up_reminders.lead_id) AND (l.assigned_agent_id = auth.uid()))))));


--
-- Name: lead_session_attendance scoped update attendance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "scoped update attendance" ON public.lead_session_attendance FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = lead_session_attendance.lead_id) AND (l.assigned_agent_id = auth.uid())))))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = lead_session_attendance.lead_id) AND (l.assigned_agent_id = auth.uid()))))));


--
-- Name: lead_hotness_scores scoped update hotness; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "scoped update hotness" ON public.lead_hotness_scores FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = lead_hotness_scores.lead_id) AND (l.assigned_agent_id = auth.uid())))))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.leads l
  WHERE ((l.id = lead_hotness_scores.lead_id) AND (l.assigned_agent_id = auth.uid()))))));


--
-- Name: seminar_roas_report_days; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.seminar_roas_report_days ENABLE ROW LEVEL SECURITY;

--
-- Name: seminar_roas_report_products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.seminar_roas_report_products ENABLE ROW LEVEL SECURITY;

--
-- Name: seminar_roas_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.seminar_roas_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: service_packages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_packages ENABLE ROW LEVEL SECURITY;

--
-- Name: service_packages service_packages_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_packages_admin_write ON public.service_packages TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: service_packages service_packages_read_active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_packages_read_active ON public.service_packages FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: seminar_roas_reports srr_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srr_admin ON public.seminar_roas_reports TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: seminar_roas_reports srr_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srr_delete_own ON public.seminar_roas_reports FOR DELETE TO authenticated USING ((public.is_active(auth.uid()) AND (created_by = auth.uid())));


--
-- Name: seminar_roas_reports srr_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srr_insert ON public.seminar_roas_reports FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (created_by = auth.uid())));


--
-- Name: seminar_roas_reports srr_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srr_read ON public.seminar_roas_reports FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: seminar_roas_reports srr_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srr_update_own ON public.seminar_roas_reports FOR UPDATE TO authenticated USING ((public.is_active(auth.uid()) AND ((created_by = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)))) WITH CHECK ((public.is_active(auth.uid()) AND ((created_by = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))));


--
-- Name: seminar_roas_report_days srrd_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srrd_admin ON public.seminar_roas_report_days TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: seminar_roas_report_days srrd_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srrd_delete ON public.seminar_roas_report_days FOR DELETE TO authenticated USING ((public.is_active(auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.seminar_roas_reports r
  WHERE ((r.id = seminar_roas_report_days.report_id) AND (r.created_by = auth.uid()))))));


--
-- Name: seminar_roas_report_days srrd_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srrd_insert ON public.seminar_roas_report_days FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.seminar_roas_reports r
  WHERE ((r.id = seminar_roas_report_days.report_id) AND (r.created_by = auth.uid()))))));


--
-- Name: seminar_roas_report_days srrd_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srrd_read ON public.seminar_roas_report_days FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: seminar_roas_report_days srrd_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srrd_update ON public.seminar_roas_report_days FOR UPDATE TO authenticated USING ((public.is_active(auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.seminar_roas_reports r
  WHERE ((r.id = seminar_roas_report_days.report_id) AND (r.created_by = auth.uid())))))) WITH CHECK (public.is_active(auth.uid()));


--
-- Name: seminar_roas_report_products srrp_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srrp_admin ON public.seminar_roas_report_products TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: seminar_roas_report_products srrp_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srrp_delete ON public.seminar_roas_report_products FOR DELETE TO authenticated USING ((public.is_active(auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.seminar_roas_reports r
  WHERE ((r.id = seminar_roas_report_products.report_id) AND (r.created_by = auth.uid()))))));


--
-- Name: seminar_roas_report_products srrp_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srrp_insert ON public.seminar_roas_report_products FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.seminar_roas_reports r
  WHERE ((r.id = seminar_roas_report_products.report_id) AND (r.created_by = auth.uid()))))));


--
-- Name: seminar_roas_report_products srrp_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srrp_read ON public.seminar_roas_report_products FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: seminar_roas_report_products srrp_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srrp_update ON public.seminar_roas_report_products FOR UPDATE TO authenticated USING ((public.is_active(auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.seminar_roas_reports r
  WHERE ((r.id = seminar_roas_report_products.report_id) AND (r.created_by = auth.uid())))))) WITH CHECK (public.is_active(auth.uid()));


--
-- Name: stage_sync_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stage_sync_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: stages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stages ENABLE ROW LEVEL SECURITY;

--
-- Name: students; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

--
-- Name: system_refinement_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.system_refinement_items ENABLE ROW LEVEL SECURITY;

--
-- Name: tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

--
-- Name: tags tags_insert_active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tags_insert_active ON public.tags FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (created_by = auth.uid())));


--
-- Name: tags tags_select_active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tags_select_active ON public.tags FOR SELECT TO authenticated USING ((public.is_active(auth.uid()) AND (is_deleted = false)));


--
-- Name: tags tags_update_owner_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tags_update_owner_or_admin ON public.tags FOR UPDATE TO authenticated USING ((public.is_active(auth.uid()) AND ((created_by = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))));


--
-- Name: task_activity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.task_activity ENABLE ROW LEVEL SECURITY;

--
-- Name: task_activity task_activity_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_activity_insert ON public.task_activity FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.tasks t
  WHERE ((t.id = task_activity.task_id) AND ((t.assigned_to = auth.uid()) OR (t.created_by = auth.uid()))))))));


--
-- Name: task_activity task_activity_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_activity_select ON public.task_activity FOR SELECT TO authenticated USING ((public.is_active(auth.uid()) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.tasks t
  WHERE ((t.id = task_activity.task_id) AND ((t.created_by = auth.uid()) OR (t.assigned_to = auth.uid()))))))));


--
-- Name: task_assignee_visibility; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.task_assignee_visibility ENABLE ROW LEVEL SECURITY;

--
-- Name: task_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.task_submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: task_submissions task_submissions_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_submissions_delete_admin ON public.task_submissions FOR DELETE USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: task_submissions task_submissions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_submissions_insert ON public.task_submissions FOR INSERT WITH CHECK (((submitted_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.tasks t
  WHERE ((t.id = task_submissions.task_id) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR (t.assigned_to = auth.uid()) OR (t.created_by = auth.uid())))))));


--
-- Name: task_submissions task_submissions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_submissions_select ON public.task_submissions FOR SELECT USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (submitted_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.tasks t
  WHERE ((t.id = task_submissions.task_id) AND ((t.assigned_to = auth.uid()) OR (t.created_by = auth.uid())))))));


--
-- Name: task_submissions task_submissions_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY task_submissions_update_own ON public.task_submissions FOR UPDATE USING (((submitted_by = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks tasks_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tasks_delete_admin ON public.tasks FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: tasks tasks_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tasks_insert ON public.tasks FOR INSERT WITH CHECK ((public.is_active(auth.uid()) AND (created_by = auth.uid()) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR (assigned_to = auth.uid()))));


--
-- Name: tasks tasks_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tasks_select ON public.tasks FOR SELECT USING ((public.is_active(auth.uid()) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR (assigned_to = auth.uid()) OR (created_by = auth.uid()))));


--
-- Name: tasks tasks_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tasks_update ON public.tasks FOR UPDATE USING ((public.is_active(auth.uid()) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR (assigned_to = auth.uid()) OR (created_by = auth.uid()))));


--
-- Name: task_assignee_visibility tav_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tav_delete_own ON public.task_assignee_visibility FOR DELETE TO authenticated USING ((hidden_by = auth.uid()));


--
-- Name: task_assignee_visibility tav_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tav_insert_own ON public.task_assignee_visibility FOR INSERT TO authenticated WITH CHECK ((hidden_by = auth.uid()));


--
-- Name: task_assignee_visibility tav_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tav_select_own ON public.task_assignee_visibility FOR SELECT TO authenticated USING ((hidden_by = auth.uid()));


--
-- Name: task_assignee_visibility tav_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tav_update_own ON public.task_assignee_visibility FOR UPDATE TO authenticated USING ((hidden_by = auth.uid())) WITH CHECK ((hidden_by = auth.uid()));


--
-- Name: tax_code_master; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tax_code_master ENABLE ROW LEVEL SECURITY;

--
-- Name: tax_code_master tax_code_master_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tax_code_master_admin_write ON public.tax_code_master TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: tax_code_master tax_code_master_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tax_code_master_select ON public.tax_code_master FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: team_payroll_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_payroll_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: team_performance_reminders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_performance_reminders ENABLE ROW LEVEL SECURITY;

--
-- Name: team_salary_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_salary_history ENABLE ROW LEVEL SECURITY;

--
-- Name: team_payroll_profiles tpp_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tpp_admin ON public.team_payroll_profiles TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: team_performance_reminders tpr_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tpr_admin_all ON public.team_performance_reminders TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: team_performance_reminders tpr_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tpr_select_admin ON public.team_performance_reminders FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: team_performance_reminders tpr_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tpr_select_own ON public.team_performance_reminders FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: team_performance_reminders tpr_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tpr_update_own ON public.team_performance_reminders FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: team_salary_history tsh_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tsh_admin ON public.team_salary_history TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_module_access; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_module_access ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: webinar_batches wb_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wb_admin ON public.webinar_batches TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: webinar_batches wb_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wb_insert ON public.webinar_batches FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (created_by = auth.uid())));


--
-- Name: webinar_batches wb_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wb_read ON public.webinar_batches FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: webinar_batches wb_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wb_update_own ON public.webinar_batches FOR UPDATE TO authenticated USING ((public.is_active(auth.uid()) AND ((created_by = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)))) WITH CHECK (public.is_active(auth.uid()));


--
-- Name: webinar_batches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webinar_batches ENABLE ROW LEVEL SECURITY;

--
-- Name: webinar_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webinar_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: webinars; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webinars ENABLE ROW LEVEL SECURITY;

--
-- Name: webinars webinars_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY webinars_delete_admin ON public.webinars FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: webinars webinars_insert_active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY webinars_insert_active ON public.webinars FOR INSERT TO authenticated WITH CHECK (public.is_active(auth.uid()));


--
-- Name: webinars webinars_read_all_active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY webinars_read_all_active ON public.webinars FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- Name: webinars webinars_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY webinars_update_admin ON public.webinars FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: webinar_templates wt_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wt_admin ON public.webinar_templates TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: webinar_templates wt_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wt_insert ON public.webinar_templates FOR INSERT TO authenticated WITH CHECK ((public.is_active(auth.uid()) AND (created_by = auth.uid())));


--
-- Name: webinar_templates wt_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wt_read ON public.webinar_templates FOR SELECT TO authenticated USING (public.is_active(auth.uid()));


--
-- PostgreSQL database dump complete
--

\unrestrict NSFUNMvwdFO6ddLw0a46V2ZoaIJdZsmlGIIjxLJcM67ffhwPtJg5U9m5gJVCjQ9

