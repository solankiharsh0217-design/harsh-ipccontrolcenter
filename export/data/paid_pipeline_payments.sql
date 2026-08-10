--
-- PostgreSQL database dump
--

\restrict OpCTvpzeFu0UwNMyIFtu4WQUIXur3JiV97frZG6iYWFvRTlCnZLX2lrCtiowtyB

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
-- Data for Name: paid_pipeline_payments; Type: TABLE DATA; Schema: public; Owner: -
--

SET SESSION AUTHORIZATION DEFAULT;

ALTER TABLE public.paid_pipeline_payments DISABLE TRIGGER ALL;

COPY public.paid_pipeline_payments (id, paid_pipeline_lead_id, payment_type, amount, payment_mode, payment_date, payment_reference, is_token, is_final_payment, notes, is_deleted, created_by, created_at, payment_category, next_payment_expected_date, payment_description, finance_linked) FROM stdin;
a53b53f2-1555-4313-9621-5cac7a818103	04bd7712-acba-435c-a914-ab66d6ef3e71	First Token	9832	UPI	2026-05-21	\N	t	f	Token payment	f	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	2026-05-25 15:53:15.181692+00	Token Amount	\N	Token payment	f
6401d037-7310-4d95-8548-b20c2247379c	f9ce6974-5a78-4aa6-bc10-e2758d66003d	Token	4999	UPI	2026-05-30	\N	t	f	\N	f	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	2026-05-30 05:47:55.821731+00	Token Amount	\N	\N	f
f3adfa25-cee5-4591-b1dd-f52a0a335f21	51dc427b-5080-44d8-be0b-054ec584ea62	Token	9832	UPI	2026-05-30	\N	t	f	\N	f	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	2026-05-30 12:22:44.916935+00	Token Amount	\N	\N	f
ae1947b3-d2aa-4fe0-81fb-4ba5a050a5c7	a14c43ec-15d7-4e3d-8fae-b2e358503494	First Token	5000	UPI	2026-05-20	\N	t	f	Token payment	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-06-06 13:37:16.141941+00	Token Amount	\N	Token payment	f
d3e97e46-d852-4e7d-a5ab-b3aebb4129b8	ba7dd784-0bfc-4870-8a17-c1eadbbd0079	First Token	5000	UPI	2026-05-20	\N	t	f	Token payment	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-06-08 12:05:32.09361+00	Token Amount	\N	Token payment	f
fb2fcc6c-5bf7-445e-9e65-aabf7e3b6f00	ba7dd784-0bfc-4870-8a17-c1eadbbd0079	Second Token	15000	UPI	2026-05-26	\N	t	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-06-08 12:06:30.024796+00	Second Token	\N	\N	f
684ea379-d798-4b48-8b8c-4be6d0e0e0f0	cff53e33-df6b-4caa-af56-e1dba302fbfa	First Token	4999	UPI	2026-05-21	\N	t	f	Token payment	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-06-08 12:10:00.841799+00	Token Amount	\N	Token payment	f
a92bbf9b-2983-49cc-b9d2-98b6a30390fa	8abbdf1d-dcb8-4b1d-a9cc-282c7d113b49	First Token	4999	UPI	2026-05-20	\N	t	f	Token payment	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-06-11 11:34:10.815693+00	Token Amount	\N	Token payment	f
d8c0be52-e4c2-4b34-9a72-27b4a966f07c	8abbdf1d-dcb8-4b1d-a9cc-282c7d113b49	Second Token	14664	UPI	2026-06-08	\N	t	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-06-11 11:36:01.238234+00	Second Token	\N	\N	f
c8198b20-7ecb-4908-baac-4e69c0161b0e	0c1ee50e-81ce-460d-9e6e-0e1e643d94bf	First Token	9832	UPI	2026-06-15	\N	t	f	Token payment	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-06-15 05:07:14.355551+00	Token Amount	\N	Token payment	f
3d592f46-0f0d-4b55-a9b3-d0ed2a16030d	a9f2c43d-765b-4721-84fc-dfd19b0e698d	First Token	4999	UPI	2026-06-13	\N	t	f	\N	f	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	2026-06-15 16:06:39.878521+00	Token Amount	\N	\N	f
ac328aed-13bb-455b-8dc0-3b6e4e98ffbb	92c08456-64aa-4c77-ba2f-def6a36ef5e9	First Token	4999	UPI	2026-06-17	\N	t	f	\N	f	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	2026-06-18 15:37:15.441029+00	Token Amount	\N	\N	f
c6e98e63-2244-4b49-aeff-39ead32144c3	3af18ebf-6602-42f6-b5a8-de104eeadd1e	Bajaj Finance	85215	Finance Partner	2026-06-18	\N	f	t	\N	f	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	2026-06-18 15:39:14.133144+00	EMI / Finance Disbursement	\N	\N	t
52daed29-2d9f-4969-978b-cc8c6f28331c	3af18ebf-6602-42f6-b5a8-de104eeadd1e	First Token	4999	UPI	2026-06-18	\N	t	f	\N	f	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	2026-06-18 15:40:11.960859+00	Token Amount	\N	\N	f
fba7c177-e8af-4e93-aed2-44ac32e1c6cc	afd922f5-854a-488c-9bce-06eb90eac671	First Token	9832	UPI	2026-06-19	\N	t	f	Token payment	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-06-19 06:37:59.546176+00	Token Amount	\N	Token payment	f
2d84bc4c-39f3-47dd-bcba-a0bfc97a2733	0030f63a-b7b1-4e52-8eba-087fc6da57b0	First Token	4999	UPI	2026-07-01	\N	t	f	Token payment	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-02 11:43:35.011196+00	Token Amount	\N	Token payment	f
bc36a912-ba18-4243-b256-dfa307b31818	88fc1efb-63d9-48ae-82c3-2da22692910a	First Token	9832	Razorpay	2026-07-01	\N	t	f	Token payment	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-02 11:55:31.328682+00	Token Amount	\N	Token payment	f
b912bf4f-88d5-44fd-9211-82f280c1c735	88fc1efb-63d9-48ae-82c3-2da22692910a	Other	98335	UPI	2026-07-02	\N	t	f	9832 PAID.2nd token amount training me ane se pehle karege.Remaining 983335 done with JODO	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-02 12:00:01.290325+00	Token Amount	\N	9832 PAID.2nd token amount training me ane se pehle karege.Remaining 983335 done with JODO	f
4b888571-b261-41c2-9f61-8676e38102ec	86280c7e-1fe7-4533-8242-7497f2d639f0	First Token	999	UPI	2026-07-01	\N	t	f	Token payment	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-02 12:01:34.639261+00	Token Amount	\N	Token payment	f
ee5328ad-57b7-4ac7-9344-4dc281b28161	922b64ad-c642-4979-b7c2-93b6073bdade	Refund	4999	UPI	2026-06-25	\N	t	f	refund done	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-03 08:00:50.870174+00	Refund	\N	refund done	f
a4e8db07-0c84-4732-bbe5-caa837f3eefd	f8cb2206-6b09-44e1-b91f-324adb0247da	Refund	2500	UPI	2026-06-17	\N	t	f	refund pending	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-03 08:04:52.580985+00	Refund	\N	refund pending	f
122e00dc-2392-4c7b-97b7-a5ead2c2a4c4	8308c1d1-c1d6-4acf-b58a-6ed6c3f389ef	Refund	4999	UPI	2026-06-24	\N	t	f	refund done	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-03 08:06:40.597941+00	Refund	\N	refund done	f
0994ceee-160c-4997-b771-e38d8a8392b4	f1e5259a-2fb1-4b16-a085-fa2d889db8ae	First Token	4999	Other	2026-07-01	\N	t	f	TAGMANGO	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-03 10:16:34.236606+00	Token Amount	\N	TAGMANGO	f
f8c3f59a-6b8c-4028-930d-c58dd98e8436	74f10caa-3848-489a-b48c-328096f58a8a	First Token	4999	UPI	2026-07-01	\N	t	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-03 10:17:34.654339+00	Token Amount	\N	\N	f
3db2617c-dac2-4f9b-a6b8-66d88af54a2c	fe8f7cd8-9c61-426e-8a99-a60d7dcf4a9d	First Token	4999	Other	2026-07-01	\N	t	f	TAGMANGO	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-03 10:18:34.925777+00	Token Amount	\N	TAGMANGO	f
4fec3a5f-b828-4209-a8db-266e2eb06e58	fa4ed813-59e7-4f79-9dc9-81260e084d5c	First Token	9832	Other	2026-07-01	\N	t	f	TAGMANGO	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-03 10:19:23.531016+00	Token Amount	\N	TAGMANGO	f
a6dc3508-75ff-47f6-b510-8cbf6c070b1f	10f69834-8401-41a1-b39c-514771a43334	First Token	999	Other	2026-07-01	\N	t	f	TAGMANGO	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-03 10:23:17.82667+00	Token Amount	\N	TAGMANGO	f
a823c2ad-138d-433c-bd29-a893339e9071	e77cb9cd-acbb-4b34-8d79-ee8d8cf1484f	First Token	5000	Other	2026-07-01	\N	t	f	TAGMANGO	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-03 10:25:42.310287+00	Token Amount	\N	TAGMANGO	f
0d170ac4-c28f-4f74-aa9d-c2a2efbad85c	8cc5f0d3-3956-4055-9d2e-90887c04e124	First Token	4999	Other	2026-07-01	\N	t	f	TAGMANGO	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-03 10:28:18.339718+00	Token Amount	\N	TAGMANGO	f
8b314c63-4dd9-4f5d-a34a-9627f278d4f4	acd4d50e-56e4-41c9-a3be-fe6600300e6b	First Token	4999	Other	2026-07-01	\N	t	f	TAGMANGO	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-03 10:29:35.853814+00	Token Amount	\N	TAGMANGO	f
4e0073c9-c456-4a22-8104-e5e4d2d534a0	c78cf148-5704-4391-b8ca-1dac5c788200	First Token	999	Other	2026-07-01	\N	t	f	TAGMANGO	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-03 10:30:49.113451+00	Token Amount	\N	TAGMANGO	f
e4a99d63-7337-4265-a1b3-37912df9c04b	6d13be05-2bdd-4ebc-842b-8f9e6e5c7bf9	First Token	4999	UPI	2026-07-01	\N	t	f	NOORJAHA	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-03 10:32:19.801005+00	Token Amount	\N	NOORJAHA	f
b4b9443f-8172-4cbe-b840-45aee6ee6258	5f2a412c-301a-4bc7-a91a-abfa69ed9c48	First Token	4999	Other	2026-07-01	\N	t	f	TAGMANGO	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-03 10:34:08.618864+00	Token Amount	\N	TAGMANGO	f
9d455cd9-80a0-4efe-b787-b25d0539d899	fe8f7cd8-9c61-426e-8a99-a60d7dcf4a9d	First Token	4999	Other	2026-07-02	\N	t	f	TAGMANGO	t	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-03 10:35:47.672901+00	Token Amount	\N	TAGMANGO	f
6aa0b8d8-c480-4a16-bbd0-cf6b9864a88a	fe8f7cd8-9c61-426e-8a99-a60d7dcf4a9d	Bajaj Finance	98333	UPI	2026-07-02	\N	t	f	\N	t	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-03 10:38:37.535484+00	EMI / Finance Disbursement	\N	\N	t
074b46c3-582e-4687-9609-557a1b41597f	0030f63a-b7b1-4e52-8eba-087fc6da57b0	Bajaj Finance	65000	UPI	2026-07-02	\N	t	f	\N	t	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-02 11:58:16.340585+00	EMI / Finance Disbursement	\N	\N	t
e69d0da4-c6e6-469b-be2f-39ba71d7d494	8abbdf1d-dcb8-4b1d-a9cc-282c7d113b49	Bajaj Finance	98337	UPI	2026-05-23	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-06-11 11:37:29.39938+00	EMI / Finance Disbursement	\N	\N	t
2a17e9bd-3791-4eaa-9de8-20b23a81844e	f1e5259a-2fb1-4b16-a085-fa2d889db8ae	Bajaj Finance	98333	UPI	2026-07-02	\N	t	f	\N	t	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-03 10:24:28.459676+00	EMI / Finance Disbursement	\N	\N	t
276912f6-1f28-4ac6-b0a1-6e9e93ba7137	29fa8b5c-6395-4e4e-a58b-ce9fbe05be31	First Token	4999	UPI	2026-06-27	\N	t	f	Token payment	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-03 10:42:54.269827+00	Token Amount	\N	Token payment	f
b5c0ed98-b5a3-41ba-aa6c-8db5a78c69ef	09462478-7756-4989-8992-6d33e8a86905	First Token	9832	Other	2026-07-04	\N	t	f	TAGMANGO	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-06 13:53:35.669599+00	Token Amount	\N	TAGMANGO	f
0fd696cd-d4a5-4ddd-992d-6b5fc156b5bb	2d97f65a-a131-44d8-a706-8d19f3a55ac6	Token	4999	UPI	2026-07-06	\N	t	f	\N	f	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	2026-07-06 15:26:37.781354+00	Token Amount	\N	\N	f
87db103b-4055-47ca-8e9f-9a5f19724113	c750d4c5-bef5-432a-ba9a-127d9887de41	First Token	4999	UPI	2026-07-03	\N	t	f	Token payment	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-08 05:05:20.335037+00	Token Amount	\N	Token payment	f
bfc4a799-687e-45eb-837e-417d1e5c1a09	5ac8e698-b42b-49cf-90e0-88e6f3cbe1b0	First Token	999	Other	2026-07-08	\N	t	f	Token payment TAGMANGO	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-09 14:06:04.092041+00	Token Amount	\N	Token payment TAGMANGO	f
4f3a154e-e63f-4804-a658-15e7f8ce0d5a	57f8cc56-ab8b-40fa-b355-dc17eda595ce	First Token	1999	Other	2026-07-08	\N	t	f	Token payment TAGMANGO	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-09 14:11:58.577938+00	Token Amount	\N	Token payment TAGMANGO	f
9f4ddeb1-3c70-4bed-b66f-bec08e93a4f1	4aa171d3-2e9f-4db3-85c9-0636e1807aeb	First Token	999	Other	2026-07-08	\N	t	f	Token payment TAGMANGO	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-09 14:13:01.545049+00	Token Amount	\N	Token payment TAGMANGO	f
87928e94-1f56-48a3-8fd2-20851e93aeed	970249cd-223d-49dd-b966-bb4fd37695b9	First Token	4999	Other	2026-07-08	\N	t	f	Token payment TAGMANGO	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-09 14:14:04.463141+00	Token Amount	\N	Token payment TAGMANGO	f
8d6a9695-2157-439e-a658-4e7d3fdd58de	eb03738d-f531-4cbe-9239-b31b3e27722d	First Token	4999	UPI	2026-07-08	\N	t	f	Token payment	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-09 14:15:07.979197+00	Token Amount	\N	Token payment	f
e081ade1-f30f-4acf-a003-9766dabbfbc4	29261ad2-e7cb-4a0d-88d0-90e3f94c9e0d	First Token	9832	UPI	2026-07-08	\N	t	f	Token payment	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-09 14:16:14.271045+00	Token Amount	\N	Token payment	f
1c2accc7-6e1b-42f9-9b7c-5b031ce6a276	3168ab09-a4a3-4b4b-bc5e-5523486db9cf	First Token	4999	Other	2026-07-08	\N	t	f	Token payment TAGMANGO	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-09 14:16:41.640485+00	Token Amount	\N	Token payment TAGMANGO	f
07c4599e-37df-44ed-ad65-b4fd7c94fdf3	9207c988-bfd8-41a2-a76b-254400ab5a30	First Token	4999	UPI	2026-07-08	\N	t	f	Token payment	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-09 14:17:53.978785+00	Token Amount	\N	Token payment	f
28734096-e7ee-4bdd-b3c2-ed375319c7f7	0a2ab633-caf4-43db-a2aa-49a1849eb5db	First Token	4999	Other	2026-07-08	\N	t	f	Token payment TAGMANGO	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-09 14:18:19.647624+00	Token Amount	\N	Token payment TAGMANGO	f
b30581ac-77fa-45bf-b300-e9228c3f6b2c	99f407a0-af12-4339-b8d2-559267d4080e	First Token	9832	Other	2026-07-08	\N	t	f	Token payment TAGMANGO	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-09 14:18:51.886677+00	Token Amount	\N	Token payment TAGMANGO	f
6b262fdd-cab4-4f6d-b312-ddc2264c7e17	5a96a455-26b5-46c7-8493-9e1c8463f586	First Token	9832	Other	2026-07-08	\N	t	f	Token payment TAGMANGO	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-09 14:19:23.431923+00	Token Amount	\N	Token payment TAGMANGO	f
c72700d8-a251-4b44-910a-9f15f1f88ab2	2faf35a5-613e-4c47-8798-9573066c9387	First Token	9832	UPI	2026-07-08	\N	t	f	Token payment	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-09 14:20:11.637509+00	Token Amount	\N	Token payment	f
efe7567f-751e-457c-8e16-5390d762bd40	5ac8e698-b42b-49cf-90e0-88e6f3cbe1b0	Other	79999	Other	2026-07-11	\N	t	f	79,999 done with JODO.Remaining amount 18th july tak pay karege	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-11 11:56:16.159265+00	Token Amount	\N	79,999 done with JODO.Remaining amount 18th july tak pay karege	f
8d0b24cd-a559-4b64-9a2c-6d982a81e476	99f407a0-af12-4339-b8d2-559267d4080e	Other	73335	Other	2026-07-13	\N	t	f	JODO DONE 73335 	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-13 06:40:06.715472+00	Token Amount	\N	JODO DONE 73335 	f
1c9fd2c2-1669-4613-834d-db7733465693	99f407a0-af12-4339-b8d2-559267d4080e	Second Token	9833	UPI	2026-07-13	\N	t	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-13 07:09:29.754457+00	Second Token	\N	\N	f
9e66fd32-cde0-4628-9887-264e1ad21425	e8798d7c-80c7-4793-8ee2-400c35773af4	First Token	2000	UPI	2026-07-03	\N	t	f	Token payment	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-13 11:29:29.892119+00	Token Amount	\N	Token payment	f
50c6237a-0e10-4300-abce-7fc7c6bc3642	4aa171d3-2e9f-4db3-85c9-0636e1807aeb	Second Token	10000	UPI	2026-07-13	\N	t	f	10K PAID And remaining 8668 will pay later	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-13 11:57:01.468239+00	Second Token	\N	10K PAID And remaining 8668 will pay later	f
c8c7426e-52ef-45df-b2db-3b17b226f05a	72dcfab9-ad71-4456-b591-4d6d4c217273	First Token	1000	UPI	2026-07-04	\N	t	f	Token payment	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-13 12:10:52.98986+00	Token Amount	\N	Token payment	f
4e3d560b-d6a2-4f2c-8070-256ec3ed2e16	d81ee388-059a-40cf-9fce-c7a4aefe43a0	First Token	4999	Razorpay	2026-07-01	\N	t	f	Token payment	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-15 06:22:24.42461+00	Token Amount	\N	Token payment	f
8d07f2f6-2537-4fd8-9e36-2c3b9e60dcf3	0ac33c7a-181f-4707-9793-69b5ed902db3	Refund	4999	UPI	2026-07-20	\N	t	f	Token payment	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-20 13:54:19.798613+00	Refund	\N	Token payment	f
62a3d39a-6749-4af3-8b3c-746a3af23ce7	89be5cb9-ecea-4371-8c98-607bbc7ce4d1	First Token	9832	UPI	2026-07-29	\N	t	f	Token payment	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-08-05 12:01:16.190645+00	Token Amount	\N	Token payment	f
bc24ef74-8efe-4157-91ee-20bfa2de08b8	27675fdc-4f48-43b9-b165-d49fd45769c3	First Token	1499	UPI	2026-07-29	\N	t	f	Token payment	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-08-05 13:01:46.836583+00	Token Amount	\N	Token payment	f
45066407-d6d0-4a86-9503-da33c6d8e2a9	34b17685-4e1c-42bd-8d20-9a5d19d385c1	First Token	9832	UPI	2026-07-29	\N	t	f	Token payment	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-08-05 13:04:03.864097+00	Token Amount	\N	Token payment	f
a9404ac0-ab71-4814-99ba-649fd360afbd	8f441a05-8b44-43d4-945f-8ec66314e8da	First Token	9832	UPI	2026-08-01	\N	t	f	Token payment	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-08-06 04:10:40.828594+00	Token Amount	\N	Token payment	f
a92bea75-2ffa-40bc-8011-7db6fed89788	40314647-189a-4ebf-a094-d3845475ae7d	First Token	9832	UPI	2026-08-01	\N	t	f	Token payment	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-08-06 04:11:23.340715+00	Token Amount	\N	Token payment	f
b4656b11-1e96-4f81-96c1-f3c485d3af38	0e107046-a1b7-4535-bcc7-b42ce47c4435	First Token	98333	UPI	2026-08-04	\N	t	f	Token payment	t	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-08-06 04:39:54.139246+00	Token Amount	\N	Token payment	f
0468cffd-1d2b-4730-ae68-acff63782029	134a52a4-e1ae-4210-9ce7-abfd5df2b76f	First Token	999	UPI	2026-08-05	\N	t	f	Token payment	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-08-06 11:55:39.101876+00	Token Amount	\N	Token payment	f
67f90b1d-173a-4c41-b0a6-cb539c9e107c	71688a9c-c384-4f52-a4c1-6db1ff5193bb	First Token	999	UPI	2026-08-05	\N	t	f	Token payment	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-08-06 12:51:52.089704+00	Token Amount	\N	Token payment	f
3bf420b0-b08f-4ea4-be51-9c56567992e6	af9696fd-7e75-4d8f-a147-c9405348f5ed	First Token	999	UPI	2026-08-05	\N	t	f	Token payment	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-08-06 12:53:54.922276+00	Token Amount	\N	Token payment	f
c9135204-9d5b-47b7-bee5-3a34271e9a2a	cd9e8e80-6aa4-400e-bd34-15afcfe26c80	First Token	4999	UPI	2026-08-05	\N	t	f	Token payment	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-08-06 12:56:19.623039+00	Token Amount	\N	Token payment	f
54d2fac6-af99-4e86-9532-23acc0703fae	e8355bf6-7330-47ed-8bac-806fa9262a7f	First Token	4999	UPI	2026-08-05	\N	t	f	Token payment	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-08-06 12:57:29.447604+00	Token Amount	\N	Token payment	f
7b35b38e-757b-4002-aea5-86b8f9e49464	35260e13-fac4-40d9-b7a2-0318e8073689	First Token	9832	UPI	2026-08-05	\N	t	f	Token payment	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-08-06 12:58:32.786127+00	Token Amount	\N	Token payment	f
6f36059e-ddb5-44fe-a3d6-2b71a8d0db3e	74e19086-7834-4da6-96d3-cdf5ca366170	First Token	9832	UPI	2026-08-05	\N	t	f	Token payment	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-08-06 12:59:26.845771+00	Token Amount	\N	Token payment	f
b6188502-58f2-41f1-b69d-6354eac32457	252a64db-ae42-4d26-9385-618608df06e2	First Token	9832	UPI	2026-08-05	\N	t	f	Token payment	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-08-06 13:01:17.279748+00	Token Amount	\N	Token payment	f
1d9afcf9-2d75-4f9a-b4eb-3bcfef30cb00	ba7dd784-0bfc-4870-8a17-c1eadbbd0079	Bajaj Finance	88000	UPI	2026-05-24	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-06-11 11:39:56.437007+00	EMI / Finance Disbursement	\N	\N	t
ccefc6eb-cf45-4fd0-9cd0-e13b07eb9723	86280c7e-1fe7-4533-8242-7497f2d639f0	Bajaj Finance	98333	UPI	2026-07-02	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-02 12:02:03.480313+00	EMI / Finance Disbursement	\N	\N	t
0ea645db-6f8c-49b7-8b9b-36ce566c762b	10f69834-8401-41a1-b39c-514771a43334	Bajaj Finance	98333	UPI	2026-07-02	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-03 10:23:47.430883+00	EMI / Finance Disbursement	\N	\N	t
42859ce5-4988-4bdf-944c-4e21883d0532	e77cb9cd-acbb-4b34-8d79-ee8d8cf1484f	Bajaj Finance	30000	UPI	2026-07-02	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-03 10:26:06.360659+00	EMI / Finance Disbursement	\N	\N	t
052fc388-47e1-47c9-b52a-d39a6e27872f	fa4ed813-59e7-4f79-9dc9-81260e084d5c	Bajaj Finance	98333	UPI	2026-07-02	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-03 10:26:57.160577+00	EMI / Finance Disbursement	\N	\N	t
a66a121b-4b86-4fce-905e-0e4957fa4686	8cc5f0d3-3956-4055-9d2e-90887c04e124	Bajaj Finance	50000	UPI	2026-07-02	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-03 10:28:42.98824+00	EMI / Finance Disbursement	\N	\N	t
7c5bbe51-a288-419f-b447-f357a97a15a6	acd4d50e-56e4-41c9-a3be-fe6600300e6b	Bajaj Finance	83334	UPI	2026-07-02	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-03 10:29:58.75265+00	EMI / Finance Disbursement	\N	\N	t
bca7314f-7e2e-4503-be0d-e751cd462e14	c78cf148-5704-4391-b8ca-1dac5c788200	Bajaj Finance	98333	UPI	2026-07-02	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-03 10:31:08.175213+00	EMI / Finance Disbursement	\N	\N	t
ba91bc0e-1e6e-4810-9580-d87a36937975	6d13be05-2bdd-4ebc-842b-8f9e6e5c7bf9	Bajaj Finance	98333	UPI	2026-07-02	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-03 10:32:43.41666+00	EMI / Finance Disbursement	\N	\N	t
7356af22-cec8-4dcb-b895-26d80c5bb501	5f2a412c-301a-4bc7-a91a-abfa69ed9c48	Bajaj Finance	36666	UPI	2026-07-02	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-03 10:34:36.416185+00	EMI / Finance Disbursement	\N	\N	t
3ef45dc6-3e48-4df9-af8f-93ff5375dc40	fe8f7cd8-9c61-426e-8a99-a60d7dcf4a9d	Bajaj Finance	98333	Finance Partner	2026-07-02	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-03 10:39:41.547744+00	EMI / Finance Disbursement	\N	\N	t
837a52d8-dcf9-4561-8bd5-a01b03c74115	f1e5259a-2fb1-4b16-a085-fa2d889db8ae	Bajaj Finance	98333	Finance Partner	2026-07-02	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-03 10:40:31.461451+00	EMI / Finance Disbursement	\N	\N	t
fee5cbee-6ea7-461e-8b5f-825f1cb187f4	09462478-7756-4989-8992-6d33e8a86905	Bajaj Finance	95000	Finance Partner	2026-07-05	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-06 13:55:03.25425+00	EMI / Finance Disbursement	\N	\N	t
a199966d-6d6d-4b19-b682-6be4389bf400	c750d4c5-bef5-432a-ba9a-127d9887de41	Bajaj Finance	98333	Finance Partner	2026-07-06	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-08 05:06:22.762722+00	EMI / Finance Disbursement	\N	\N	t
d934d957-6cb7-4ab0-9b53-e17d9f376755	5ac8e698-b42b-49cf-90e0-88e6f3cbe1b0	Bajaj Finance	18000	Finance Partner	2026-07-09	\N	f	f	6 MONTH EMI.Per month 3000	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-09 14:09:13.986567+00	EMI / Finance Disbursement	\N	6 MONTH EMI.Per month 3000	t
4d5d1a18-752c-431c-9818-85f285c7de08	57f8cc56-ab8b-40fa-b355-dc17eda595ce	Bajaj Finance	98333	Finance Partner	2026-07-09	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-09 14:12:21.660834+00	EMI / Finance Disbursement	\N	\N	t
edeafb29-eb6e-4ebb-a944-a5c5b9af2703	970249cd-223d-49dd-b966-bb4fd37695b9	Bajaj Finance	98333	Finance Partner	2026-07-09	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-09 14:14:24.039834+00	EMI / Finance Disbursement	\N	\N	t
76c39e47-c642-48fc-92a5-97575c1d8671	eb03738d-f531-4cbe-9239-b31b3e27722d	Bajaj Finance	98333	Finance Partner	2026-07-09	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-09 14:15:25.645773+00	EMI / Finance Disbursement	\N	\N	t
657d6f2a-2f95-4376-aba8-037f48def901	3168ab09-a4a3-4b4b-bc5e-5523486db9cf	Bajaj Finance	98333	Finance Partner	2026-07-09	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-09 14:17:00.473472+00	EMI / Finance Disbursement	\N	\N	t
b0548943-17fb-4c08-b7de-9dc12962ab4f	5a96a455-26b5-46c7-8493-9e1c8463f586	Bajaj Finance	98333	Finance Partner	2026-07-09	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-09 14:19:41.965935+00	EMI / Finance Disbursement	\N	\N	t
eaf4244a-4c14-40cc-b171-6b6c848dd4d6	2faf35a5-613e-4c47-8798-9573066c9387	Bajaj Finance	98333	Finance Partner	2026-07-09	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-09 14:20:30.794514+00	EMI / Finance Disbursement	\N	\N	t
e89d2fe4-a411-4d7d-b581-2928829d7041	0030f63a-b7b1-4e52-8eba-087fc6da57b0	Bajaj Finance	65000	Finance Partner	2026-07-02	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-13 04:37:06.961919+00	EMI / Finance Disbursement	\N	\N	t
b5c78b80-33fa-4cb3-b924-0a2483d60778	4aa171d3-2e9f-4db3-85c9-0636e1807aeb	Bajaj Finance	98333	Finance Partner	2026-07-11	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-13 04:42:52.286315+00	EMI / Finance Disbursement	\N	\N	t
86b68504-55ee-48d5-8631-f7be4611b792	99f407a0-af12-4339-b8d2-559267d4080e	Bajaj Finance	25000	Finance Partner	2026-07-11	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-13 06:19:36.037921+00	EMI / Finance Disbursement	\N	\N	t
0d5ba919-2703-4252-b159-baf0ea237cda	e8798d7c-80c7-4793-8ee2-400c35773af4	Bajaj Finance	98333	Finance Partner	2026-07-13	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-13 11:30:19.835971+00	EMI / Finance Disbursement	\N	\N	t
b19947e2-90aa-4b55-9bae-c110fbeb7910	40314647-189a-4ebf-a094-d3845475ae7d	Bajaj Finance	35000	Finance Partner	2026-08-04	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-08-06 04:13:44.989033+00	EMI / Finance Disbursement	\N	\N	t
d80f408e-726e-4276-90de-c502a485c3eb	72dcfab9-ad71-4456-b591-4d6d4c217273	Bajaj Finance	35000	UPI	2026-07-05	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-07-13 12:13:19.477557+00	EMI / Finance Disbursement	\N	\N	t
399f4f0d-a65e-4b5e-9d98-a9c3bc6a9020	89be5cb9-ecea-4371-8c98-607bbc7ce4d1	Bajaj Finance	98333	Finance Partner	2026-07-30	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-08-05 12:04:37.057719+00	EMI / Finance Disbursement	\N	\N	t
40d04efd-5367-471a-8a0f-220e1e3afada	27675fdc-4f48-43b9-b165-d49fd45769c3	Bajaj Finance	70000	Finance Partner	2026-07-30	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-08-05 13:02:39.261986+00	EMI / Finance Disbursement	\N	\N	t
4bfa36e5-ee8f-4e5a-8b90-4f6d2964a339	34b17685-4e1c-42bd-8d20-9a5d19d385c1	Bajaj Finance	98333	Finance Partner	2026-07-30	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-08-05 13:04:35.033913+00	EMI / Finance Disbursement	\N	\N	t
14e9ab47-4982-4972-9020-ad3e188a9cc2	8f441a05-8b44-43d4-945f-8ec66314e8da	Bajaj Finance	30000	Finance Partner	2026-08-04	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-08-06 04:15:15.19163+00	EMI / Finance Disbursement	\N	\N	t
2333186e-40da-4456-a913-09f9a92805c4	0e107046-a1b7-4535-bcc7-b42ce47c4435	Bajaj Finance	98333	Finance Partner	2026-08-04	\N	f	f	Token payment	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-08-06 04:41:52.752249+00	EMI / Finance Disbursement	\N	Token payment	t
81c6d147-6517-450e-8d3e-ad525017493d	71688a9c-c384-4f52-a4c1-6db1ff5193bb	Bajaj Finance	98333	Finance Partner	2026-08-06	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-08-06 12:52:35.507289+00	EMI / Finance Disbursement	\N	\N	t
20d68e4a-0e6d-453e-ae61-89d9ac918122	af9696fd-7e75-4d8f-a147-c9405348f5ed	Bajaj Finance	98333	Finance Partner	2026-08-06	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-08-06 12:55:08.797757+00	EMI / Finance Disbursement	\N	\N	t
649df4db-ee04-4c48-9f3f-9c856e35ceaa	cd9e8e80-6aa4-400e-bd34-15afcfe26c80	Bajaj Finance	98333	Finance Partner	2026-08-06	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-08-06 12:56:49.924207+00	EMI / Finance Disbursement	\N	\N	t
057626b9-5477-4b2d-9497-1e197a395cfa	e8355bf6-7330-47ed-8bac-806fa9262a7f	Bajaj Finance	98333	Finance Partner	2026-08-06	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-08-06 12:58:03.351358+00	EMI / Finance Disbursement	\N	\N	t
44a555be-961e-4c73-8f41-c314957688c7	35260e13-fac4-40d9-b7a2-0318e8073689	Bajaj Finance	98333	Finance Partner	2026-08-06	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-08-06 12:58:52.444137+00	EMI / Finance Disbursement	\N	\N	t
629663f5-19eb-4fce-b67f-1c96877ffbe8	74e19086-7834-4da6-96d3-cdf5ca366170	Bajaj Finance	98333	Finance Partner	2026-08-06	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-08-06 13:00:08.60064+00	EMI / Finance Disbursement	\N	\N	t
dcc4dd94-ab89-451c-8ac1-f5cb5feb0d7f	252a64db-ae42-4d26-9385-618608df06e2	Bajaj Finance	98333	Finance Partner	2026-08-06	\N	f	f	\N	f	321f217b-131f-4f8f-a882-12b5a36bbdbb	2026-08-06 13:01:39.935567+00	EMI / Finance Disbursement	\N	\N	t
\.


ALTER TABLE public.paid_pipeline_payments ENABLE TRIGGER ALL;

--
-- PostgreSQL database dump complete
--

\unrestrict OpCTvpzeFu0UwNMyIFtu4WQUIXur3JiV97frZG6iYWFvRTlCnZLX2lrCtiowtyB

