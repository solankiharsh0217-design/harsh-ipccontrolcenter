--
-- PostgreSQL database dump
--

\restrict 69vcVxCFrJHhgUJ66BIEZXZ6GcEPLh8fqqTV4V8E6hEAc52AVh3OySjN7xgSqJM

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
-- Data for Name: app_settings; Type: TABLE DATA; Schema: public; Owner: -
--

SET SESSION AUTHORIZATION DEFAULT;

ALTER TABLE public.app_settings DISABLE TRIGGER ALL;

COPY public.app_settings (id, setting_group, setting_key, setting_value, business_unit, is_active, is_deleted, created_at, updated_at, created_by) FROM stdin;
\.


ALTER TABLE public.app_settings ENABLE TRIGGER ALL;

--
-- PostgreSQL database dump complete
--

\unrestrict 69vcVxCFrJHhgUJ66BIEZXZ6GcEPLh8fqqTV4V8E6hEAc52AVh3OySjN7xgSqJM

