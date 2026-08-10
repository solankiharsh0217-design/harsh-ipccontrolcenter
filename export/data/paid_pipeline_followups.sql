--
-- PostgreSQL database dump
--

\restrict 39L93uf8XNsgZVTBn29y0a6YoyRiRav7dvXSaIPDfhDPCjF9kkHi3coLAc6veVJ

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
-- Data for Name: paid_pipeline_followups; Type: TABLE DATA; Schema: public; Owner: -
--

SET SESSION AUTHORIZATION DEFAULT;

ALTER TABLE public.paid_pipeline_followups DISABLE TRIGGER ALL;

COPY public.paid_pipeline_followups (id, paid_pipeline_lead_id, follow_up_date, follow_up_time, follow_up_reason, priority, status, assigned_to, notes, created_at, updated_at, created_by, completed_at, follow_up_type, source_module, related_payment_id, related_crm_lead_id, completed_by, is_deleted) FROM stdin;
c0ff3bbf-5403-4834-a595-b0596ef4f59e	a14c43ec-15d7-4e3d-8fae-b2e358503494	2026-06-06	11:00	\N	Normal	Pending	321f217b-131f-4f8f-a882-12b5a36bbdbb	\N	2026-06-06 13:37:27.991141+00	2026-06-06 13:37:27.991141+00	321f217b-131f-4f8f-a882-12b5a36bbdbb	\N	\N	paid_pipeline	\N	ee582785-9023-4142-904c-19ce5467bfd6	\N	f
8ececde6-9c75-4b24-8373-94875f2ed7d6	04bd7712-acba-435c-a914-ab66d6ef3e71	2026-05-26	11:00	\N	Normal	Done	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	\N	2026-05-25 13:30:29.119807+00	2026-05-25 13:49:41.691852+00	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	2026-05-25 13:49:41.622+00	\N	paid_pipeline	\N	39f29863-f166-4771-9acb-6b50d30476fe	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	f
4fb7b6df-bbf7-4903-9b03-6534b72bda46	8abbdf1d-dcb8-4b1d-a9cc-282c7d113b49	2026-05-26	11:00	\N	Normal	Done	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	\N	2026-05-25 13:31:31.947031+00	2026-05-30 05:40:31.763166+00	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	2026-05-25 13:48:12.993+00	\N	paid_pipeline	\N	f714e865-2eed-4536-af01-fd3d0c89d7f4	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	f
a55c837a-6275-4a28-9b2d-4b6c16b59df5	8abbdf1d-dcb8-4b1d-a9cc-282c7d113b49	2026-06-01	11:00	\N	Normal	Done	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	\N	2026-05-25 13:48:16.064493+00	2026-05-30 05:40:31.763166+00	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	2026-05-25 13:50:15.014+00	\N	paid_pipeline	\N	f714e865-2eed-4536-af01-fd3d0c89d7f4	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	f
ebe26035-9304-49c5-8ebd-db2cd818a940	8abbdf1d-dcb8-4b1d-a9cc-282c7d113b49	2026-05-28	11:00	WhatsApp	Normal	Done	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	\N	2026-05-25 13:50:21.5348+00	2026-05-30 05:40:31.763166+00	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	2026-05-25 13:50:31.895+00	WhatsApp	paid_pipeline	\N	f714e865-2eed-4536-af01-fd3d0c89d7f4	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	f
da65605c-ce5d-4885-a58b-d030d3483c75	8abbdf1d-dcb8-4b1d-a9cc-282c7d113b49	2026-05-28	11:00	WhatsApp	Normal	Done	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	\N	2026-05-25 13:50:35.280052+00	2026-05-30 05:40:31.763166+00	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	2026-05-25 13:50:41.178+00	WhatsApp	paid_pipeline	\N	f714e865-2eed-4536-af01-fd3d0c89d7f4	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	f
960e7780-4e29-4ced-a1b3-942b41703ca1	8abbdf1d-dcb8-4b1d-a9cc-282c7d113b49	2026-05-28	11:00	WhatsApp	Normal	Done	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	\N	2026-05-25 13:51:01.834781+00	2026-05-30 05:40:31.763166+00	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	2026-05-25 13:51:05.085+00	WhatsApp	paid_pipeline	\N	f714e865-2eed-4536-af01-fd3d0c89d7f4	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	f
eca1fea0-3ab7-45b1-9aea-d870135b6db3	8abbdf1d-dcb8-4b1d-a9cc-282c7d113b49	2026-05-25	11:00	\N	Normal	Done	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	\N	2026-05-25 14:00:11.861566+00	2026-05-30 05:40:31.763166+00	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	2026-05-25 14:00:21.906+00	\N	paid_pipeline	\N	f714e865-2eed-4536-af01-fd3d0c89d7f4	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	f
8c0e8cc4-a9f5-4cb1-b443-84fa66450ffe	f069b06b-6566-4680-ba83-16af635f3452	2026-06-03	11:00	Call	Normal	Pending	321f217b-131f-4f8f-a882-12b5a36bbdbb	\N	2026-06-02 01:33:21.839975+00	2026-06-02 01:33:21.839975+00	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	\N	Call	paid_pipeline	\N	a58be086-3db0-4c1a-8e0f-365a8f050197	\N	f
458bbedd-3e03-4fec-8fbc-c1ae98e46785	04bd7712-acba-435c-a914-ab66d6ef3e71	2026-06-01	11:00	\N	Normal	Cancelled	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	\N	2026-05-25 13:49:45.234683+00	2026-06-02 02:33:43.164163+00	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	\N	\N	paid_pipeline	\N	39f29863-f166-4771-9acb-6b50d30476fe	\N	t
8cbdc7ad-9dd3-43bc-a8a4-434c728f0c6f	dda2f541-f04b-4061-9f08-1675548ae122	2026-06-03	11:00	\N	Normal	Pending	321f217b-131f-4f8f-a882-12b5a36bbdbb	\N	2026-06-02 03:23:53.425561+00	2026-06-02 03:23:53.425561+00	321f217b-131f-4f8f-a882-12b5a36bbdbb	\N	\N	paid_pipeline	\N	\N	\N	f
45616d95-2d65-4cc0-b268-9baa3a31ac15	04bd7712-acba-435c-a914-ab66d6ef3e71	2026-06-05	11:00	\N	Warm	Pending	321f217b-131f-4f8f-a882-12b5a36bbdbb	\N	2026-06-02 02:33:45.377103+00	2026-06-02 03:24:16.516916+00	321f217b-131f-4f8f-a882-12b5a36bbdbb	\N	\N	paid_pipeline	\N	d8657679-6925-4ad9-bb68-84e63743e9ae	\N	f
bc12c32f-2bff-4aa4-9ae3-7cb33e84a23f	09dcd1aa-41df-4593-b549-e72f058ed574	2026-06-09	11:00	\N	Warm	Pending	321f217b-131f-4f8f-a882-12b5a36bbdbb	\N	2026-06-02 03:25:32.010429+00	2026-06-02 03:25:32.010429+00	321f217b-131f-4f8f-a882-12b5a36bbdbb	\N	\N	paid_pipeline	\N	004feb3c-ff7e-41df-afc9-8936cea34ff7	\N	f
10f1dc8d-ab72-4bce-be36-f358de5d6163	\N	2026-06-05	11:00	\N	Normal	Done	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	\N	2026-06-02 01:33:36.094369+00	2026-06-02 05:12:55.739613+00	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	2026-06-02 05:12:55.578+00	\N	crm	\N	910f3812-3222-4108-88d0-e6e02fd711dc	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	f
1c9efc20-5f4d-4f6a-af4b-54ce7fdf7807	\N	2026-05-31	11:00	Call	Hot	Done	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	share payment details	2026-05-30 13:37:26.225982+00	2026-06-03 11:13:36.426106+00	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-03 11:13:34.387+00	Call	crm	\N	262d3326-154e-44aa-99b0-f085bad528e5	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	f
527262f0-3bec-4d39-8504-f9149dbc3cd0	\N	2026-06-08	16:23	Call	Normal	Pending	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	share product details he will speak with his wife and he tell me know tomorrow 	2026-06-05 09:52:50.400001+00	2026-06-08 10:43:47.787829+00	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	\N	Call	crm	\N	bd012838-206a-4d55-a8f2-ef14e387d4ff	\N	f
fa102833-0be6-4dad-ac70-96a8de22262f	\N	2026-06-09	11:00	Call	Normal	Pending	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	calll bcak regarding information of diamond 	2026-06-08 12:17:50.312237+00	2026-06-08 12:17:50.312237+00	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	\N	Call	crm	\N	ec0bf409-d7fe-42e9-b2e3-b728e3054f34	\N	f
bb6bf724-b28d-4e38-88bb-a7acad9d108b	\N	2026-06-25	11:00	Call	Normal	Pending	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	infrom me in eveng 	2026-06-25 10:15:16.818464+00	2026-06-25 10:15:16.818464+00	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	\N	Call	crm	\N	48bc011e-e173-4601-ab1d-76278dfdaac2	\N	f
e7b21e46-72e1-4f2e-b57c-fb9914388141	\N	2026-06-28	11:00	Call	Urgent	Pending	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	he want to join but have some doubte 	2026-06-27 12:41:53.539821+00	2026-06-27 12:41:53.539821+00	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	\N	Call	crm	\N	4dfeee68-0289-4969-a292-345b2f44b847	\N	f
03f18ea3-e697-4b61-ba23-c05667307717	57f8cc56-ab8b-40fa-b355-dc17eda595ce	2026-07-17	11:00	\N	Normal	Pending	321f217b-131f-4f8f-a882-12b5a36bbdbb	\N	2026-07-13 11:53:22.17636+00	2026-07-13 11:53:22.17636+00	321f217b-131f-4f8f-a882-12b5a36bbdbb	\N	\N	paid_pipeline	\N	5ebdac48-b694-40ec-b6df-48472b37d0f3	\N	f
fed2437d-f0e3-4f0a-9e1d-b41aac3a1307	57f8cc56-ab8b-40fa-b355-dc17eda595ce	2026-07-13	11:00	Balance Follow-Up	Hot	Pending	321f217b-131f-4f8f-a882-12b5a36bbdbb	FRIDAY TAKREMAINING AMOUNT PAY KAREGE\n	2026-07-13 11:55:44.094227+00	2026-07-13 11:55:44.094227+00	321f217b-131f-4f8f-a882-12b5a36bbdbb	\N	Balance Follow-Up	paid_pipeline	\N	5ebdac48-b694-40ec-b6df-48472b37d0f3	\N	f
\.


ALTER TABLE public.paid_pipeline_followups ENABLE TRIGGER ALL;

--
-- PostgreSQL database dump complete
--

\unrestrict 39L93uf8XNsgZVTBn29y0a6YoyRiRav7dvXSaIPDfhDPCjF9kkHi3coLAc6veVJ

