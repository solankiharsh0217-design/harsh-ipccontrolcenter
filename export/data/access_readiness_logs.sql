--
-- PostgreSQL database dump
--

\restrict 000fpMQ3QsgdwrmYNBf4PWl7DE1jMyiYPaiAQlarJSAixw7JTCiQBWEPzgCCGK3

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
-- Data for Name: access_readiness_logs; Type: TABLE DATA; Schema: public; Owner: -
--

SET SESSION AUTHORIZATION DEFAULT;

ALTER TABLE public.access_readiness_logs DISABLE TRIGGER ALL;

COPY public.access_readiness_logs (id, paid_pipeline_lead_id, action, previous_status, new_status, channel, note, blocker_reason, performed_by, performed_by_name, metadata, created_at) FROM stdin;
\.


ALTER TABLE public.access_readiness_logs ENABLE TRIGGER ALL;

--
-- PostgreSQL database dump complete
--

\unrestrict 000fpMQ3QsgdwrmYNBf4PWl7DE1jMyiYPaiAQlarJSAixw7JTCiQBWEPzgCCGK3

