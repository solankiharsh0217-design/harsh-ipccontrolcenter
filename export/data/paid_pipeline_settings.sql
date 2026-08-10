--
-- PostgreSQL database dump
--

\restrict YyL13iYaccAzxQlyElMrIdRwro9zCpUm6xG1ZFJoAL5PBIV0NxuLe8ro8pM1hes

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
-- Data for Name: paid_pipeline_settings; Type: TABLE DATA; Schema: public; Owner: -
--

SET SESSION AUTHORIZATION DEFAULT;

ALTER TABLE public.paid_pipeline_settings DISABLE TRIGGER ALL;

COPY public.paid_pipeline_settings (id, business_unit, setting_type, label, value, sort_order, is_active, is_deleted, is_system, created_by, created_at, updated_at) FROM stdin;
d02066c2-1445-4911-98f9-8d7d30b0a2a4	\N	payment_type	Token	token	10	t	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-14 10:20:04.762103+00
f45e4702-8d72-4842-a1f4-1abcf77c1f40	\N	payment_type	Down Payment	down_payment	20	t	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-14 10:20:04.762103+00
21fa946b-8695-484f-88bb-e2d4e6366e55	\N	payment_type	Balance Payment	balance_payment	30	t	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-14 10:20:04.762103+00
0bfb82f9-92b1-4a9b-bc46-205673678649	\N	payment_type	Full Payment	full_payment	40	t	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-14 10:20:04.762103+00
62cddf1b-154b-44b5-838b-ee25674f327a	\N	payment_type	EMI Disbursement	emi_disbursement	50	t	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-14 10:20:04.762103+00
78d12fe2-aae3-464d-a6a7-f7d7ea795502	\N	payment_type	Refund	refund	60	t	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-14 10:20:04.762103+00
82327fe6-e292-423d-aab4-d279af411157	\N	payment_type	Adjustment	adjustment	70	t	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-14 10:20:04.762103+00
36543893-e490-47a6-b5f8-e6ab2ae3d302	\N	payment_model	Full Payment Collected	full_payment	10	t	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-14 10:20:04.762103+00
36afc218-7b87-42f0-a52e-d700f0e80368	\N	payment_model	Token + Balance Later	token_balance_later	20	t	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-14 10:20:04.762103+00
5dbd643c-85b4-4484-8c0b-2d2dfb2341aa	\N	payment_model	Token + Finance / EMI	token_finance	30	t	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-14 10:20:04.762103+00
1e58ead5-7ef7-44e8-9edd-5c20a41a0606	\N	payment_model	Partial Payment Collected	partial_payment	40	t	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-14 10:20:04.762103+00
e4501db3-4fd7-4d60-8934-ea6e9c34e848	\N	payment_model	No Token Collected	no_token	50	t	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-14 10:20:04.762103+00
2a794af7-7b6d-4880-8ce4-a18f162f9756	\N	payment_model	Free Enrollment / Manual Approval	free_enrollment	60	t	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-14 10:20:04.762103+00
e521fa63-e6ab-43fd-ad72-a81ab6b24da9	\N	pipeline_stage	Token Paid	token_paid	10	t	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-14 10:20:04.762103+00
1a452eca-f22f-4ea6-ae6b-d78dbe13d4b2	\N	pipeline_stage	Balance Pending	balance_pending	30	t	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-14 10:20:04.762103+00
e9209542-6cb6-4595-98c5-8d3d75cc360b	\N	pipeline_stage	Full Payment Received	full_payment_received	80	t	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-14 10:20:04.762103+00
3a15400e-4444-48ac-9d37-ce53c34dc0b0	\N	pipeline_stage	Enrolled / Activated	enrolled	90	t	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-14 10:20:04.762103+00
3b2994f1-c69b-4a07-a370-57efb99403ee	\N	finance_partner	Bajaj Finance	bajaj	10	t	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-14 10:20:04.762103+00
93ef4774-8ccd-4884-b1e2-eaa902d5843a	\N	finance_partner	Razorpay EMI	razorpay	20	t	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-14 10:20:04.762103+00
abb00d3e-75c4-46a3-95db-57f4ca1d389f	\N	finance_partner	Credit Card EMI	cc_emi	30	t	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-14 10:20:04.762103+00
46199448-92bd-48c8-b5dc-58bd379ea6c5	\N	finance_partner	Bank Transfer Installment	bank_installment	40	t	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-14 10:20:04.762103+00
da90446d-26b6-4cff-9a4b-d97705415ecf	\N	finance_partner	Manual Installment	manual	50	t	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-14 10:20:04.762103+00
c5a4fb81-ae02-431e-8c19-3d592e8181fa	\N	finance_status	Not Required	not_required	10	t	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-14 10:20:04.762103+00
184c605c-d8fd-41da-ba03-e64bf241da50	\N	finance_status	Interested	interested	20	t	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-14 10:20:04.762103+00
0699f175-a945-441f-abfa-769c168243b6	\N	finance_status	Documents Pending	docs_pending	30	t	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-14 10:20:04.762103+00
d2df9272-f507-44bb-8e57-c9610afe4739	\N	finance_status	Documents Submitted	docs_submitted	40	t	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-14 10:20:04.762103+00
6c95fee9-315c-4a00-954b-d71ba076f76b	\N	finance_status	Application Submitted	application_submitted	50	t	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-14 10:20:04.762103+00
973b5efb-e5a0-459c-93d5-ea17a70eb484	\N	finance_status	Approved	approved	60	t	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-14 10:20:04.762103+00
73f9727f-fedf-43c7-b392-7b38d12ea3fb	\N	finance_status	Rejected	rejected	70	t	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-14 10:20:04.762103+00
4f3ee7fb-46c7-4714-9d1c-4b54a82539e5	\N	finance_status	Disbursed	disbursed	80	t	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-14 10:20:04.762103+00
e6c4b221-bcd1-4aa0-8a65-35436a2387a7	\N	finance_status	Dropped	dropped	90	t	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-14 10:20:04.762103+00
81332dfe-1e16-4176-b70b-d07e9734ab2b	\N	revenue_recognition_rule	Token Collected Only	token_only	10	t	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-14 10:20:04.762103+00
639a9871-f16f-4415-9d26-07b91d56285f	\N	revenue_recognition_rule	Full Deal Value	full_deal_value	20	t	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-14 10:20:04.762103+00
e97ceca8-14ef-4e05-8f6e-23085e155645	\N	revenue_recognition_rule	Realized Revenue Only	realized_revenue_only	30	t	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-14 10:20:04.762103+00
68ed8881-519a-482c-913c-a17ca92c7b5f	\N	revenue_recognition_rule	Finance Approved Amount	finance_approved_amount	40	t	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-14 10:20:04.762103+00
b3c8863b-1c0d-45ba-a083-2d965b812dff	\N	finance_partner	JODO	JODO	5	t	f	f	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	2026-05-16 03:40:19.368593+00	2026-05-16 03:40:19.368593+00
e3fa6da7-9ba0-49c9-bcfc-0d0e3d711ab0	\N	pipeline_stage	Payment Follow-Up Pending	payment_followup_pending	20	f	t	t	\N	2026-05-14 10:20:04.762103+00	2026-05-24 17:30:06.076731+00
4af8ac8c-59e3-496f-920b-51c130fe6495	\N	pipeline_stage	Finance / EMI Documents Pending	finance_docs_pending	40	f	t	t	\N	2026-05-14 10:20:04.762103+00	2026-05-24 17:30:14.485621+00
5b029143-0b03-4142-aaf7-ec57fd8cc796	\N	pipeline_stage	Finance / EMI Applied	finance_applied	50	f	t	t	\N	2026-05-14 10:20:04.762103+00	2026-05-24 17:30:16.43165+00
01b582f1-2cb6-4f86-973e-822a2996139c	\N	pipeline_stage	Finance / EMI Approved	finance_approved	60	f	t	t	\N	2026-05-14 10:20:04.762103+00	2026-05-24 17:30:17.578935+00
defb1933-6dbd-4fec-903c-5681d0d92a35	\N	pipeline_stage	Finance / EMI Disbursed	finance_disbursed	70	f	t	t	\N	2026-05-14 10:20:04.762103+00	2026-05-24 17:30:18.658881+00
19db9f24-7cf3-4f49-96f1-98b8bf5f8690	\N	lead_priority	Urgent	{"color": "#DC2626"}	10	t	f	f	\N	2026-05-24 17:49:49.692016+00	2026-05-24 17:49:49.692016+00
8404080f-2844-448d-a7ba-5605baab4ddf	\N	lead_priority	Hot	{"color": "#EA580C"}	20	t	f	f	\N	2026-05-24 17:49:49.692016+00	2026-05-24 17:49:49.692016+00
758883f9-fcb4-4263-aff8-d9ae877add16	\N	lead_priority	Warm	{"color": "#CA8A04"}	30	t	f	f	\N	2026-05-24 17:49:49.692016+00	2026-05-24 17:49:49.692016+00
f425043f-99a6-4757-a524-400aff57a936	\N	lead_priority	Cold	{"color": "#2563EB"}	40	t	f	f	\N	2026-05-24 17:49:49.692016+00	2026-05-24 17:49:49.692016+00
aaf4b83c-9e8a-41d5-9a5b-8906638bd18a	\N	lead_priority	Not Interested	{"color": "#6B7280"}	50	t	f	f	\N	2026-05-24 17:49:49.692016+00	2026-05-24 17:49:49.692016+00
2ba3cd62-7a23-4cc2-97c8-9e3ede1cd71d	\N	lead_priority	Dropped Risk	{"color": "#991B1B"}	60	t	f	f	\N	2026-05-24 17:49:49.692016+00	2026-05-24 17:49:49.692016+00
f3045cbe-ca33-454f-9180-cbc1704722a3	\N	pipeline_stage	Closed Lost	closed_lost	120	f	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-24 18:01:17.449849+00
86776686-cee2-4a1a-86b4-9fb7a280a21a	\N	pipeline_stage	Refund / Adjustment	refund_adjustment	110	f	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-24 18:01:22.847894+00
c4dc886d-7004-4b8a-93c5-d590ff199210	\N	pipeline_stage	Dropped After Token	dropped_after_token	100	f	f	t	\N	2026-05-14 10:20:04.762103+00	2026-05-24 18:01:25.29574+00
7d932bbe-852b-4a14-9b2c-4d9dccb09874	\N	pipeline_stage	2nd Token Pending	{}	50	t	f	f	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	2026-05-24 18:01:42.7825+00	2026-05-24 18:01:42.7825+00
1336acea-2ceb-4388-ac88-2cb097b3990f	\N	pipeline_stage	Bajaj Pending	{}	60	t	f	f	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	2026-05-25 09:58:36.634088+00	2026-05-25 09:58:36.634088+00
\.


ALTER TABLE public.paid_pipeline_settings ENABLE TRIGGER ALL;

--
-- PostgreSQL database dump complete
--

\unrestrict YyL13iYaccAzxQlyElMrIdRwro9zCpUm6xG1ZFJoAL5PBIV0NxuLe8ro8pM1hes

