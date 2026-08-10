--
-- PostgreSQL database dump
--

\restrict Dhie2amAgZ1AwWIQerVMRyUGjO1gRdvko5Da9YejDLyJ13gaZvebrCikUXMfQ1M

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
-- Data for Name: access_templates; Type: TABLE DATA; Schema: public; Owner: -
--

SET SESSION AUTHORIZATION DEFAULT;

ALTER TABLE public.access_templates DISABLE TRIGGER ALL;

COPY public.access_templates (id, name, description, module_keys, grants_admin, is_active, created_by, created_at, updated_at) FROM stdin;
346efb97-2642-4e13-9d30-3503f67d6d3b	Media Buyer / Operations	Task manager, follow-ups, operations CRM, rewards, and resource library.	{dashboard,tasks,follow_up_command_center,operations_crm,media_buyer_operations,resource_library}	f	t	\N	2026-07-09 03:48:20.414202+00	2026-07-09 03:48:20.414202+00
37cd141a-363a-4cf4-8691-ffd2a938a8c7	Sales Executive	Calling CRM, lead qualifier, follow-up board, task manager, resource library.	{dashboard,calling_crm,crm,lead-qualifier,follow_up_command_center,tasks,resource_library}	f	t	\N	2026-07-09 03:48:20.414202+00	2026-07-09 03:48:20.414202+00
d2d0c40f-eea1-4c21-97e0-04a7772c95dc	Admin (Full Access)	Grants admin role plus all modules.	{dashboard,founder_dashboard,announcements,roas,search,daily-reporting,reports,lead-qualifier,calling_crm,crm,paid_pipeline,follow_up_command_center,payment_recovery,media_buyer_operations,operations_crm,offline_seminar_roas,webinar_performance,tasks,profit-statement,team,admin,master-data,master_settings,audit_log,notifications,resource_library}	t	t	\N	2026-07-09 03:48:20.414202+00	2026-07-09 03:48:20.414202+00
14aabaea-3e42-4027-92b5-9c178b4b2b83	Finance	Revenue center, invoices, analytics, finance dashboards, resource library.	{dashboard,reports,profit-statement,payment_recovery,resource_library}	f	t	\N	2026-07-09 03:48:20.414202+00	2026-07-09 03:48:20.414202+00
5c58e841-2bc4-4eb6-bfad-7e6b3d1bd255	Backend Operations	Access readiness, operations CRM, follow-up board, task manager, resource library.	{dashboard,paid_pipeline,operations_crm,follow_up_command_center,tasks,resource_library}	f	t	\N	2026-07-09 03:48:20.414202+00	2026-07-09 03:48:20.414202+00
bc166a04-fd5c-45c9-8851-2ac06086a968	Media Buyer	For media buying and operations support team members. Grants operations CRM, tasks, team performance, resource library, and read access to related CRM/Paid records.	{dashboard,notifications,team_performance,tasks,operations_crm,media_buyer_operations,follow_up_command_center,daily-reporting,reports,calling_crm,paid_pipeline,announcements}	f	t	\N	2026-07-16 09:49:51.03593+00	2026-07-16 09:49:51.03593+00
\.


ALTER TABLE public.access_templates ENABLE TRIGGER ALL;

--
-- PostgreSQL database dump complete
--

\unrestrict Dhie2amAgZ1AwWIQerVMRyUGjO1gRdvko5Da9YejDLyJ13gaZvebrCikUXMfQ1M

