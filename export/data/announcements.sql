--
-- PostgreSQL database dump
--

\restrict IK7gq9NW2VpPrmRaEk6c4yq3Iqh122YzhZ2JvfI3IxbWvFVFUVahB09wEigs1BX

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
-- Data for Name: announcements; Type: TABLE DATA; Schema: public; Owner: -
--

SET SESSION AUTHORIZATION DEFAULT;

ALTER TABLE public.announcements DISABLE TRIGGER ALL;

COPY public.announcements (id, title, body, tag_type, created_by, created_at) FROM stdin;
\.


ALTER TABLE public.announcements ENABLE TRIGGER ALL;

--
-- PostgreSQL database dump complete
--

\unrestrict IK7gq9NW2VpPrmRaEk6c4yq3Iqh122YzhZ2JvfI3IxbWvFVFUVahB09wEigs1BX

