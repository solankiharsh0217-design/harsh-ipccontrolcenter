--
-- PostgreSQL database dump
--

\restrict SalrPeR9z6guYtUFf83kB7pE8paWdtOzjE5loaGd42DFexAhhw6xYuBm77Pco9q

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
-- Data for Name: lead_notes; Type: TABLE DATA; Schema: public; Owner: -
--

SET SESSION AUTHORIZATION DEFAULT;

ALTER TABLE public.lead_notes DISABLE TRIGGER ALL;

COPY public.lead_notes (id, lead_id, paid_pipeline_lead_id, note_text, note_type, created_by, created_at, updated_at) FROM stdin;
4da2915a-9822-44e3-9cca-2a6b121e3094	910f3812-3222-4108-88d0-e6e02fd711dc	\N	Hello	general	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	2026-06-02 01:15:25.459023+00	\N
cc037e7d-bca0-424e-a068-0a1b3342dc13	185df133-882d-436e-b9cd-e367e7296c14	\N	call back	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-02 05:11:16.305321+00	\N
8b5d2212-aa84-465a-a8aa-e49fb8f6531e	e2cf5ecb-bca9-45ea-ad5d-0a3ec22bc85c	\N	call disconnected	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-02 05:31:25.60214+00	\N
076a4698-7241-4cc2-99a3-3c98f0827431	5cd2e824-021d-43c6-a369-b9baa276b810	\N	share payment deails	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-02 06:02:13.130462+00	\N
9bdabc46-3f8a-4ea8-b85d-b624bf48cdb6	5cd2e824-021d-43c6-a369-b9baa276b810	\N	converted	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-02 06:31:47.583618+00	\N
2ebc8bd2-d0d5-48ec-bcda-78e6fea38629	a808612f-bdde-459c-a2d2-504cc173fd84	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-02 10:15:23.346383+00	\N
1fef0bd7-bcbb-4e8b-ad62-a9dae0580aab	852022dc-ed1b-4d6b-988a-9a978830d45c	482e6051-a3aa-4892-afef-d704fbed9c49	paid	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-02 10:34:21.937169+00	\N
37d86bea-67eb-435c-9715-f6dc01160260	e89fd696-1879-48ba-b777-accd7c8fb0e9	\N	no number	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-02 10:47:29.998807+00	\N
e026394e-897e-4af3-acad-f3f0ed19ddb9	e774297e-fd8f-4d5b-a1a7-de58cdbe164c	\N	No answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-02 11:04:03.109836+00	\N
cabda648-fae3-4c4a-90f9-0fa9dd25a25e	7a0b91b6-9dd6-41eb-953f-570bc8dbc396	\N	No respones	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-02 11:25:24.293388+00	\N
e0b867d6-5866-42d5-b7a6-e7f91ee9a12f	36245cb3-816a-4e76-bfdb-51da9c72317d	\N	he said he dont like workshop he alreday know about the meta ads	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-02 11:44:50.783736+00	\N
5c397d17-5ae0-40c0-b4ee-d5bcfb19d1d6	396c2a7c-7b8c-4f34-baa9-7cb98d77f044	f069b06b-6566-4680-ba83-16af635f3452	paid	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-02 12:04:11.894471+00	\N
717ebaf5-9d29-4161-82e4-23864fccc15f	9e60f8c0-0698-49f5-a8d6-79ce3076023a	\N	not attnebd propper seminar he will join later	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-02 13:16:55.03634+00	\N
55ad06c3-6038-475e-af34-3ab6280ea806	60ae55cc-563e-41e5-b7e1-2161d0d4ebf2	\N	voice not clear so he ask for a call back	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-02 13:28:51.102702+00	\N
de00cf6d-a20f-41af-b339-f8fb4883927f	948b2bce-e182-416b-a0b4-8c2e2c57eb72	\N	enggaed	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-03 05:06:16.612329+00	\N
164301bb-80c6-410a-bb0c-5d06a8a703a0	88bc8f69-60a6-4926-819e-d42ecfb121a5	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-03 05:41:33.667659+00	\N
8b5b6cf8-7322-4f5e-9ed4-67b60db5e547	506e2c95-decf-4cfe-9442-a3b29620e913	\N	call disconected	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-03 05:58:19.924054+00	\N
8d9c6f8a-df46-4152-ac3e-e4ac0ef50ee6	f5943866-22ab-4701-b133-fd5b0e0047d8	\N	During call having network issues so ask for a call back in sometimes	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-03 06:04:44.2237+00	\N
a6b3a056-4f2e-4ce0-ba60-d0aaaee6c2b6	c4657f57-3d35-4cd3-9f0c-0e4bcd01935b	\N	call disconnected	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-03 06:23:14.609653+00	\N
bc939a97-970a-42eb-a94d-ebefc2dceb99	4adc5ca4-2622-4fda-a3e5-70b9ab10212b	\N	call back after 2 pm	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-04 05:06:11.666599+00	\N
59fb967b-74e5-4e31-9008-143e294d207e	8107ebb7-4d90-47b5-af57-98751f2c6807	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-04 10:52:49.166412+00	\N
4445727a-4417-47c5-9622-db745bbfd6bd	cc9a881f-7a99-462b-93fc-f299c6da0bec	\N	busy on another call	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-04 12:46:09.532328+00	\N
01af1b52-4462-492d-bd74-a6e9222d086d	cc9a881f-7a99-462b-93fc-f299c6da0bec	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-04 13:31:18.359282+00	\N
59cbb66c-e8b0-4a7b-a165-1e3994d3625a	574da6f8-9901-4707-93d0-641d1db073d7	\N	enggade	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-04 14:25:45.017696+00	\N
adc9a0c4-5b56-4d1a-8a37-d3fed5b11db3	574da6f8-9901-4707-93d0-641d1db073d7	\N	busy in wedding so he ask for a call back	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-05 04:33:44.856046+00	\N
63c4f78f-22d4-4bd7-8a2c-11dd21e52220	f4612e9c-e549-4989-b915-7f2f4a089856	\N	enggade	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-05 04:47:24.914518+00	\N
c31965cb-c451-4094-803d-111c55f1fce1	6b3a16ff-0968-4ed4-b175-f4226d631767	\N	busy on another call	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-05 04:57:53.227075+00	\N
16863ccb-26b0-4393-9003-8bf7b7c0753e	a981a22b-f4ea-4986-867d-f8f2d9b29579	\N	he have fiancial issues so he need sometime	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-05 05:21:45.307901+00	\N
6178e08c-5d4b-4815-a3bc-049da50170c5	a7ae1bc3-fa67-42f4-a762-165dfacac80c	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-05 05:49:06.114256+00	\N
cc95c2cc-79f3-43f0-acc2-7dd5ba5649a9	d0f3af49-ded3-4535-adce-48fa138b010b	\N	incoming call is not active	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-05 09:16:08.265274+00	\N
86fc5fe7-1a96-46f7-828b-0022ff101f7b	7f72651f-a959-4ed4-8644-b92ebab38aab	\N	No answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-05 09:23:04.239402+00	\N
8fbc0d83-4f69-4235-8e0a-80580097b7a0	5a615318-d361-4ffe-a875-e07cb5271c79	\N	busy on another work so he ask for call back	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-05 09:31:09.026582+00	\N
afe89ef0-94d5-4ace-a7ca-b2ea5469b689	e82656d9-4649-40f8-a706-dcbd784bb0fa	\N	he said he is out with his family mmber so he ask for a call back	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-05 09:38:09.777679+00	\N
d3b17c17-269c-49bd-890c-f985bd38c64d	446354f6-6543-42d0-8e3a-6d42ea39617e	\N	fwd to voice email	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-05 09:42:09.037062+00	\N
60b602a7-e604-4d2d-beeb-0d66b003cbb0	bd012838-206a-4d55-a8f2-ef14e387d4ff	\N	share details	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-05 09:51:21.830119+00	\N
57f3a4f5-412b-49b4-a49e-542567275c5b	101545e5-42d1-4b75-8c08-3718cab96c88	\N	he have not attend full webinar he re join the session after 8 june	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-05 10:10:23.020251+00	\N
99103b43-a68c-4290-bee4-6080599efd74	f4a851e2-5f95-4bc3-821d-e8b165ad5170	\N	busy on another call	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-05 10:50:56.860303+00	\N
1a9ade9e-cb7c-4721-8583-e60e311e1ed5	f776409b-f861-40cd-b9a1-c7ef7031072a	\N	call back	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-05 10:55:30.713029+00	\N
9f13f202-03a7-40ca-bb87-fe161fb735c1	b7427aef-faab-4539-bb2a-80c5c1de2509	\N	call disconnected	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-05 11:07:08.414571+00	\N
17cd1d94-1ab8-451a-89d7-8d432f4a7717	ffedc9c6-a252-41f9-a53d-2aa8328368a7	\N	he said he have not decide to revenue	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-05 11:21:04.047367+00	\N
86623fcb-3bcf-4a8e-9f2b-60b964c6a0eb	e2e5cd61-20b5-4d2a-b944-5a45c333e55e	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-05 11:24:45.465732+00	\N
979bf579-541d-4a55-a9bd-7ff75118a3cb	7aedc512-3db5-4ea6-a83c-4c122a7dee98	\N	call back	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-05 11:26:21.573437+00	\N
b7c163d4-780e-480b-986f-7eb57452f80e	44b6fd5f-0896-4393-9333-815845401a75	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-05 11:31:50.43886+00	\N
6896c3b6-401a-4874-b82e-1590fdfdd2e9	d5a12ddf-0a9c-446f-8a9d-e86b63a61530	\N	call back after sometime	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-05 11:34:30.853396+00	\N
0e8e2b4d-29d4-4f10-a357-1f84ece19e68	190f0884-6ba4-48a9-be8b-292735e08509	\N	he is driving so he ask for a call back	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-05 11:42:35.661171+00	\N
fdeefd72-055e-4ede-ab88-b4740d5f4f3b	7be08df4-ca3b-4bf3-b4e0-2d2ceb899dda	\N	he will join tomrrow session	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-05 11:54:27.885992+00	\N
0066be03-0252-4eb5-bc23-ffffd8a18a98	d5a12ddf-0a9c-446f-8a9d-e86b63a61530	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-05 12:04:52.754699+00	\N
accc6b5b-5e55-4b35-b804-a3cec220adc8	edf20245-5c0b-41e3-979c-353133909d73	\N	enggade	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-05 12:08:47.686509+00	\N
286b9c31-e1bc-472e-8b98-ff5674b640ab	d9083a7f-eaf1-41e8-a672-d269ee275e58	\N	she is in another pogram so ask for a call back	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-05 12:12:14.739465+00	\N
e9430c16-4795-4c90-85c2-649e0bdc1633	78817096-0f32-492a-b643-e8ca896d8283	\N	busy on another call	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-05 12:23:06.122142+00	\N
a53cd80c-20a7-4771-bc7b-f01d572d78ec	5efcd36b-bc90-49d7-bf8a-1560cd5cfa81	\N	out of network	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-05 12:24:49.920851+00	\N
d68fe733-b18a-43c0-86cf-89f63a3121f1	dcc159ec-5394-4ae4-a8a7-54424dcd3843	\N	fwd to voice mail	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-05 12:28:14.973863+00	\N
b55af77f-333d-457b-a109-0cad19b0ad2c	2aa9b2d6-7f11-4a9d-8ebb-52eaded0bd8d	\N	busy on wedding shoot so he ask for a call back	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-05 12:37:21.116693+00	\N
2e9591f7-25ba-43ff-8171-45976856fcd3	74634b93-53ae-48ac-ac4b-2e1ceb6e71fe	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-05 12:50:03.825446+00	\N
c8852eb2-ce90-46d3-83d0-d6b304972365	7f8b28ca-c249-409c-b259-0b84aa0ae3e1	\N	He need to discuss with his wife	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-05 14:02:52.563676+00	\N
c1383b17-67a2-45ec-884d-728d69eacb84	6564cec6-00ff-4e98-bf53-7d02c22d0e22	\N	call disconnected	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-06 05:16:15.668948+00	\N
15302327-6d90-44b1-9184-d8088fa3f963	0657d590-430c-4819-a888-13ddf4b0f6bb	\N	enggade	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-06 06:02:09.528321+00	\N
623eedb6-ab9a-4a67-9160-5b695ae36d46	45dec408-a4fb-4a86-aa00-973f56a9ef9c	\N	paid	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-06 06:09:23.592914+00	\N
24bcf4d8-ae41-4403-84e8-2dff33868957	45f7df35-8925-423e-9a56-6a6868d30c6e	\N	financial issues he will join later	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-06 12:36:25.236013+00	\N
f1edb088-2ead-480a-8279-54a1404fa9a4	47063b20-597e-4733-8736-96a677ae1f81	\N	call disconnected	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-06 13:32:52.298024+00	\N
55077cdc-470b-4f03-8df7-421be68d2302	8247cc88-eb1c-40ad-aff4-8a628d1b63b6	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-06 14:16:57.208922+00	\N
6073fbf9-2434-4ef3-82d2-355d077af121	b3b0b813-217a-4c49-98d8-c4e974074503	\N	alreday diamond membar	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-08 05:41:46.488313+00	\N
827017f9-46b7-4aad-9c26-fd232de4b000	d8ac4cac-1d2f-41d5-a2ad-2f2b4f3e7ff1	\N	he was not responding properly	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-08 05:57:31.218247+00	\N
3fcbaf89-f73e-402f-9c64-e4a2f4ffa333	9cf32375-7deb-4c42-b2ac-2b81aa85d887	\N	wrong number	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-08 09:31:29.552048+00	\N
1b003ad3-e9ba-4504-905c-b8376635c58e	74d424ce-6391-477b-b331-2e29e63cc8c3	\N	fwd to voice mail	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-08 09:48:44.50484+00	\N
323a3d53-652a-4f79-b3b1-701fd422e2e8	20e05b5a-16d7-4a8d-b305-f2ab9819d5e3	\N	he said not attend full webinar	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-08 10:01:11.817194+00	\N
1f668681-ede1-4adf-b08d-1425ee5ebe0a	388a5cec-2d9c-4791-9dc9-41ef12111789	\N	no number	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-08 10:29:24.478972+00	\N
aec972b9-285a-4275-a98b-5f51f291aeb0	0640d63a-e983-46ad-aa3f-a3b1c463de8c	\N	busy on another work so he ask for a call back	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-08 10:47:11.17145+00	\N
4f1600fa-257c-4b06-a5e6-87046a60dd49	e4dcb415-ee5c-48f8-b310-18f176f7762e	\N	voice not clear	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-08 11:21:35.772046+00	\N
6c17b1aa-a061-4699-a6e8-9a88c3a65634	43bca448-7a8b-4015-8fac-598d2259167d	\N	Not attend full webinar	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-08 12:01:04.091368+00	\N
5cc672eb-facb-4cda-93f5-5bf43971b99f	ec0bf409-d7fe-42e9-b2e3-b728e3054f34	\N	he will give call back buz he busy and he is driving so he will give call back from his side	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-08 12:17:26.205047+00	\N
7c440695-4d17-4fa1-ac0a-952787024004	dd2d8937-643d-4404-b648-a34a2baa38f7	\N	busy on another work so he ask for a call back	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-08 13:23:36.190578+00	\N
dd106c9b-75ef-4551-b8d6-a8bb4c9850b9	9e86c6cd-6152-4828-8c80-df64df17c9f5	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-08 13:51:46.905286+00	\N
1e28bca4-6268-48da-bf1b-dc5f9e4440af	5490f144-ae3e-4c46-978a-a68897fc4aba	\N	busy	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-08 14:09:02.952167+00	\N
90069571-a3d2-4020-a36d-f56b9e37f78d	a229a944-a657-4df1-ae07-edbe222b8ff7	\N	no respones may be due to network issues	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-09 05:06:28.91965+00	\N
0cbfb211-db35-4eab-b706-58b0d8cc8320	54ee62c6-1d86-454d-bf7a-937019525b2b	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-09 05:13:40.147102+00	\N
7689833c-3f88-419b-8c22-82438ff70f3c	44ab558f-ac1c-4ce6-9d5f-0442567c5844	\N	out of network	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-09 05:19:45.934184+00	\N
5c76510e-6263-41e1-9032-7f7d0c3b3463	48842ed0-edf7-4b3a-a247-bd51a5c3d040	\N	enggade	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-09 05:34:27.143729+00	\N
48822ab7-0dca-4cb1-87e4-917abde0bff0	22212057-2a47-4856-95ca-fbda9fb4a585	\N	wrong number	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-09 05:52:18.274974+00	\N
a8dd68c3-3661-44b8-ab9e-3b8f515f34b3	4d7d9964-f53d-4bd0-854a-bc91f8769949	\N	swtich off	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-09 06:31:58.337603+00	\N
d84bd0ae-bfef-4a0f-9f58-9daf64a6b1f5	2b5f8496-55e2-4320-a109-1674356578e4	\N	Incoming call is not active	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-09 09:37:36.859434+00	\N
a79e9e7f-704f-4180-bdd5-4635ffe0d818	5ca80992-a331-4657-93d4-eacf9632eae6	\N	not attend full webinar	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-09 09:39:43.001353+00	\N
d19ff5fc-cdc4-4e62-b95c-2dac7d56206d	61db8a1f-2d15-4bb4-b363-4d3b577942b9	\N	busy on another call	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-09 09:43:05.199242+00	\N
c4f8f2f4-201c-4258-b38d-d27087e6dbfb	61db8a1f-2d15-4bb4-b363-4d3b577942b9	\N	not answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-09 09:43:49.975918+00	\N
c1d95cd6-42fa-4dbd-85d1-edbb367237df	61db8a1f-2d15-4bb4-b363-4d3b577942b9	\N	not interested	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-09 09:46:22.172013+00	\N
63c7fa43-6d7e-4909-af5f-0fbe7cb7060d	b96642a7-0ae7-42ef-b11a-fc11c7462ed6	\N	fwd to voice email	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-09 09:50:33.769614+00	\N
0a2601ca-de93-4d1d-8e14-33e4947ff892	47063135-21ff-432f-b4cf-2743f75e2d6b	\N	not reachable	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-09 09:52:12.980902+00	\N
5fe31878-f8c3-45c5-9c27-4c934a16e70c	ad40c266-cce5-4a57-8856-4b160eceb982	\N	paid member	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-09 10:14:41.830247+00	\N
1e519252-d86f-48a0-acb0-7dc6abda501b	317bb5ea-594a-4b88-8bcc-c53cf18b9e2d	\N	he allready know the details he just join to check what its showing	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-09 10:38:57.343519+00	\N
1a095cc6-f1f0-40e6-b4cc-009a76cd7ca0	5a774f58-214f-4be4-9bf6-67847ddacaa7	\N	no answere	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-09 10:49:40.363544+00	\N
dca82b60-7c08-4bb5-bb16-7db023d870b7	499be03e-6de0-421f-a649-19e68ada5722	\N	not attend full webinar	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-09 11:09:18.377395+00	\N
8b1428c0-583d-4259-8798-e123144972e0	3ae9c89e-96cc-42e3-b87e-6a9c4d35df32	\N	He said he doing promotion nothing els	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-09 11:59:37.97951+00	\N
658b29e2-4fe8-4ee2-8688-9038b665dd4f	5bfb62b7-2ece-4306-8001-c18b75e0051f	\N	he will join tomorrow sesion	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-09 13:33:47.990811+00	\N
f7b0ed10-4d04-4843-9b24-35184b7cd131	70889430-5373-4d1a-8fc9-e1ac7dffbd4d	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-10 05:15:03.50163+00	\N
91755002-f728-4947-84a1-d7e1761ef82a	47c8808a-d706-4603-8530-a0369a4a0be0	\N	incoming call is not active	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-10 05:42:55.267872+00	\N
23401b61-3219-4fcb-9bdf-800690a7d95f	4395a641-d31a-4530-8f49-f6a7a039b3b7	\N	busy in meeting so ask for a call back	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-10 05:44:30.830104+00	\N
33fe32e0-7c6c-446f-9331-401ed850ff35	b9267314-68dd-4f83-bb96-dbde315273a0	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-10 05:45:29.770999+00	\N
3d4842d2-c0b5-4d9f-9152-02478bbbd1be	b91cfd8b-d8ce-4b2e-9a45-b9323f2005c9	\N	he said workshop is not that much good	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-10 06:11:49.841373+00	\N
5a26a811-1cd4-4368-af21-9f5680df9a46	75beea13-fe19-4daa-af72-53723fb86264	\N	call disconneted	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-10 09:22:36.150798+00	\N
d77df8d4-1fc2-4ea1-95df-a4834efb9d22	07d47cc1-8c0f-45a1-9920-d9615b1a81be	\N	call dsconnected	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-10 12:11:06.207721+00	\N
c90431a8-c45e-4659-ba82-5d1c6baef5ac	b60a2bc0-9a71-4c08-8bbe-19e0dc7e3930	\N	enggade	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-10 12:26:28.183107+00	\N
505e49bb-70b3-4c15-b5b3-9b7a94062c16	3e2573b7-4941-4279-94a8-c318240b493d	\N	busy on another call	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-10 13:10:07.444813+00	\N
280f728e-a0cf-4390-b86d-cfad1d279d4f	9bb118ac-ddff-42ba-8aab-ca963c5838bd	\N	not attnd full webinar	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-10 13:12:11.249485+00	\N
968b56cd-b601-4791-a0ef-ab9d4ab7d017	2afe3d14-9d7c-47c8-9856-bf205c233af2	\N	he is not giving any respones	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-11 05:30:45.678264+00	\N
da63d27a-02c8-4446-8ba5-495dd7b35337	f8b1323e-88be-4181-b62c-b76483751aea	\N	not reachable	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-11 06:11:11.312324+00	\N
4b1ab1b6-1675-4e4e-b5d4-24b93c54f9d1	4eedb4f4-c4ee-4641-b455-7eb068dbbe58	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-11 06:20:57.002233+00	\N
7df23bbd-d041-4451-bb6f-086be2525c8a	3bcec132-b5b7-4533-8e92-bef3995e6f73	\N	links share	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-11 10:44:26.158785+00	\N
fca08957-ab52-47d7-be47-215e501c7539	3bcec132-b5b7-4533-8e92-bef3995e6f73	\N	converte d	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-11 10:52:28.158221+00	\N
c0e69ac2-5853-4492-9f78-299e3d1177b3	bc3c3d20-be70-48f4-a33d-22c01a086a90	\N	not interested	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-11 11:25:20.460284+00	\N
344eb3dc-3b44-4b2d-9bc5-3621ba06bc88	c800e367-4361-48a8-bb14-1be5fec26674	\N	he is repotr he just join to know how to photography	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-11 12:51:22.902853+00	\N
e5097b93-3abb-4f11-ad94-81ef1c257210	19ea6dbc-6511-40bf-b663-f8ce9af7216a	\N	call back	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-11 13:26:06.604011+00	\N
687768dd-39b4-4bdf-bf9f-96b26a5b8edd	101545e5-42d1-4b75-8c08-3718cab96c88	\N	not attend full webinar so he will join again	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-11 13:28:49.115418+00	\N
a9b54a2e-b868-43cf-afb2-d9c26da14f03	4af4b58b-cf62-4ac5-ab5e-dabf9f54ebf1	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-11 14:08:10.906418+00	\N
2f90a08e-53e6-4d1f-b96c-4998aa5dd4bf	cea8dc7a-de7b-4822-9ce9-f969226d2fca	\N	wrong number	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-12 05:26:22.604501+00	\N
be8e8b5e-f49e-4c27-8d13-cf49434de38e	3246be59-2c8c-4251-b6ca-a758a1164aaa	\N	wrong number	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-12 05:28:05.102616+00	\N
e4cb38f6-c27c-46d5-ac83-5df9f2799231	1d7574fb-7a88-4118-8034-0272690f4b5a	\N	Diamond member	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-12 05:28:52.366713+00	\N
21f60600-10bb-44a9-9d2b-d370f7a422ce	5afb3c64-9096-47c3-918a-ba8c1a4f73b0	\N	not attend 2nd day bottom camp	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-12 05:30:43.321+00	\N
bec2c38a-ea84-4504-a409-d42babb582f8	3bb5ae4b-71d3-44a0-a607-4c94fc8c3c2e	\N	swtich off	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-12 05:48:26.733417+00	\N
b66daf13-e00e-4d32-9b01-ab7affa3ee00	8b2d19bf-c17e-47ce-b6fa-8767edcea2d3	\N	he said there is nothing in session	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-12 06:05:17.56858+00	\N
6bde49c0-4e72-4b01-8e9a-34c196e51761	da80528c-3500-4efb-933d-6bd512c74c2f	\N	invalied number	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-12 10:03:37.984872+00	\N
a990daa7-942e-4a78-b1e2-0fa7f892a1bf	a81fed24-7f41-42da-92c4-00ecc9c56f4c	\N	enggade	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-12 11:04:39.982541+00	\N
1f0f2be8-6761-452e-99df-b83bb70f85f3	80601809-af4d-4bea-b260-bd59082d2bff	\N	No answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-12 12:11:47.954026+00	\N
fed85c0c-4922-4422-8a8c-6267b0f2c40b	80601809-af4d-4bea-b260-bd59082d2bff	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-13 05:25:01.881418+00	\N
40e4c422-1a5e-4f98-ae54-1808f3637f71	81cef51c-5eb6-41fc-baeb-bc131f5eb22e	\N	disconnected	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-13 05:30:03.240201+00	\N
2f7937e8-6c4c-44d2-b309-923c1109007d	06b7ab25-17d8-469c-9416-4ef75d99e1b2	\N	financial issues	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-13 10:47:30.767803+00	\N
4e5ff2b2-0534-47a5-a44a-69a617d58088	7f3fedd3-3972-4158-9ec4-5a6fc9c65688	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-13 11:24:29.376213+00	\N
7d268b96-ca36-4440-83c7-911a47c91a46	7f179577-50df-449c-b948-57a0df788d86	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-15 05:14:35.404576+00	\N
43fb6f91-bb31-4674-b2a3-c6e4e09eaa1e	0728a05a-ba8c-4354-905a-a61b210e2616	\N	No answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-18 11:19:44.487436+00	\N
ecd43cb8-5c7c-4829-914c-8062d2bb4899	cd03e8a8-dacf-41d1-a5f2-6f3924847487	\N	enggade	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-18 11:45:44.995784+00	\N
1885ea44-1655-4613-b341-65f25723a761	3a6b0e21-3c72-4281-a433-350b9b9d4ffb	\N	he said he alreday know about meta ads so he dont like that much	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-18 11:49:04.095488+00	\N
3410b92d-86a5-4897-b2a5-7706798e4ce8	561446db-22e2-4a06-877c-1a84c86bf3cb	\N	he will join later	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-18 12:01:47.323252+00	\N
4ee5a0b5-e93e-4afe-83d5-108ecce2f716	5b884414-6b15-4a58-9370-7d19ee241e65	\N	alreday a diamond member	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-18 12:10:48.415314+00	\N
8dc56540-cb90-4fe3-b3b5-8deaf17e7019	0a70bbe6-4160-441f-abdb-02f9a8f5d753	\N	not getting respones	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-18 12:13:16.887182+00	\N
276e8377-09b1-4342-aefe-679870be8077	e0cb9612-f855-4be9-86cc-e4801b9ca1be	\N	busy on another call	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-18 12:18:56.724894+00	\N
38a05003-de84-46fe-a080-c3a33a3c9565	dafdd58a-8317-4085-8cd6-bc4493571bfb	\N	call disconnected	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-18 12:39:46.052005+00	\N
468ef9f4-363f-4bd6-b40f-7175513bb0d4	fd7b4d5c-57c9-4668-86da-87ec5ea49ffb	\N	busy on another call	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-18 12:44:55.43024+00	\N
beff8eee-e4e6-4397-b66b-b0d2c742340e	890d6aac-eff4-4650-9d41-94198e5c2525	\N	enggade	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-18 12:52:25.264571+00	\N
1ed49603-e683-4eff-a648-d23d990cde07	49c1ed64-ad95-4aa2-b84a-b9e66bce198f	\N	busy on another call	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-18 13:10:46.911314+00	\N
5e07b672-e7da-4e02-88b5-32f06f62caa5	d652e9f2-d17b-45db-a6f9-2256e107350f	\N	call disconnected	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-20 05:05:16.213428+00	\N
f1145743-1b3c-4257-974f-08f4eb442c4d	ca339840-483a-48c1-9ccc-13ca6310f6ff	\N	call back	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-20 05:36:30.234441+00	\N
16d764cf-ba93-476c-a756-2989084f48b0	ae051be9-8f4a-4bba-94a6-a17151bd6c2d	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-20 05:53:13.428581+00	\N
be2503d1-0564-4d46-a3be-004d03e95ee1	fb709572-e37c-4e26-a81d-c082bfc40ca3	\N	enggade	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-20 06:08:51.69738+00	\N
e541ad6b-5bb0-4256-bd33-d5f2e324a9ae	fa083c77-040a-4525-a201-6391c25e6ea2	\N	not connected	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-20 06:27:22.36163+00	\N
35a9cbf5-0105-46f9-9ebb-23e39e9e1ba7	ab8c8ab1-6cdf-4a13-904a-ce67e9ff105c	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-20 11:01:51.529789+00	\N
7df735cc-5011-45df-9255-24edd9adee70	2ca3d905-9bae-452d-873a-d5f761ff4bba	\N	call back	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-20 11:11:56.460852+00	\N
bc0aba2b-ad55-4e0a-b845-93d731bbb40e	fc2e244d-9f67-4969-b22e-1e8c2097f60b	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-20 12:04:10.178167+00	\N
36286d2c-76d4-4548-9dc7-fa7b07c69f24	4e699508-d27c-4612-8702-e05e7db2fc31	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-20 12:25:44.176412+00	\N
fa93a0ce-93c6-419a-87b4-e0efa32a89f5	35d8f8fd-d88f-411d-ad0c-ec2a6a42674a	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-20 13:14:38.319839+00	\N
c156a116-cc03-4b0f-9e71-ef824219418a	9d26aedb-973e-41c8-b3eb-fce070c7e516	\N	no  answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-20 13:25:29.36826+00	\N
4030f73f-f0fb-4dd2-84b0-5dcda8a0a009	f8c34335-ab42-4ed1-a3b8-2e263bbdb4e4	\N	fwd to voice mail	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-20 14:11:40.87221+00	\N
fe74f01c-4526-4509-94f8-2b3e824de507	1a4bf6d2-fbd3-460b-9f9b-f8fda80d7eab	\N	paid	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-20 14:12:03.945949+00	\N
6a607d8e-1d43-4a7b-a731-48032f7fc9d7	1c571d57-bb9e-4d1a-9096-ce7e2cd5a6b3	\N	not attend full webinar	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-20 14:23:55.081897+00	\N
b1b70674-0db3-440f-9486-7a02db98456c	08950abf-73c1-46be-9eb4-4d0f606ed53d	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-20 14:25:47.450001+00	\N
60b969ca-20f3-4f9b-9bae-a4f19b9f4468	1c3a068e-8d6b-41f7-baea-393de95aee85	\N	wrong number	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-20 14:26:35.122205+00	\N
ef7599e5-8f88-437f-b072-a2c478f156d4	65371217-178f-4a9d-9d9d-0aee93fe5c25	\N	fwp today 10am	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-21 02:55:54.170375+00	\N
f0382c46-a4a1-4a33-af40-e34435440e37	1e22522c-cff5-473a-8ba5-def38aeb3f72	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-21 11:05:50.442669+00	\N
837eb413-aa01-4bb2-b6fa-5227793f1fc2	f62c90c1-0c1b-4ce7-b2a7-5325fdde75be	\N	fwd to voice email	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-21 11:37:41.53871+00	\N
31726a36-bd84-40ed-b1bd-56751d27fa89	f62c90c1-0c1b-4ce7-b2a7-5325fdde75be	\N	not attend full webinar	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-22 05:04:34.937879+00	\N
b16c1f54-338a-48b0-8ad6-a015a359fb95	67258c14-1bd9-48c3-af2e-8b8d3a137a7d	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-22 05:26:27.264585+00	\N
889ede34-657b-4d29-b335-491be19ee537	dc01d4cc-ad76-4688-ae6b-7a0de7784524	\N	he have not attend full webinar so he will rejoin the session	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-22 10:04:17.983473+00	\N
8745fda8-b2f9-43ea-9b16-9e25373b212f	25048c37-d407-45f4-9f4f-a2a12f0d8072	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-22 10:05:35.053743+00	\N
f71f80d1-911a-44f1-97fa-6c8f5ef40828	dd4b6489-4327-4628-9a65-1a8dea2d56ff	\N	his age is 48 plus and he have health issues so he dont want to join	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-22 10:20:17.46917+00	\N
ae925e2b-2144-4757-aee7-66e481db3975	98496616-9328-41d8-a0f9-cb0630fd53fb	\N	financial issues	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-22 10:29:04.728506+00	\N
fa4753c1-5465-4f71-a3f7-318e4a34d106	a56f23e0-bc83-4a91-a8fe-a7bdcdaeff2c	\N	paid	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-22 10:29:20.0862+00	\N
1a271092-3fd0-46a6-a225-b3666235073d	db960492-a32c-49c2-a892-708be2d5230d	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-22 10:32:23.878716+00	\N
d0424e99-577b-473e-8b4e-dd48abdd1146	4fc1d869-e376-48e9-ae0c-dabd99fd6cb7	\N	he is driving so he ask for a call back	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-22 10:54:06.947802+00	\N
3990ef50-4f91-4f1a-b643-455c143bf2cf	4fc1d869-e376-48e9-ae0c-dabd99fd6cb7	\N	financial issues	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-22 11:12:36.28212+00	\N
38d655e1-a1bf-492d-adb9-0f5df5b21555	ec7ed3b5-df47-4520-b2de-fb7b3a3f8af3	\N	engggade	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-22 14:25:19.163805+00	\N
4bae0f9d-0930-4b0e-addb-72e647f064e1	8f7bf124-fc0e-4c89-85f5-736f71d05475	\N	busy on another call	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-23 04:43:41.545458+00	\N
cafd51b6-e373-4d4a-ae79-d92f3bae87fd	5a0cc78f-4b15-4b32-bb4b-9b32de59c344	\N	wrong number	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-23 04:53:25.342076+00	\N
1cf4ccb4-80f0-4f8a-8236-bb55d79bc0d6	03342b03-82a0-4054-8bed-96fbf5af71f0	\N	not getting respones	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-23 06:00:02.667503+00	\N
1ecffcb8-138b-42c4-a689-8edebccb243e	31bce5c9-eca9-40f9-9fb9-235e24d37a69	\N	fwd to voice email	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-23 09:47:38.065634+00	\N
ead86015-a8ef-424c-861b-399da680f82c	e8341b8f-6f17-4945-9ae8-4c8469d5b17e	\N	swtich off	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-23 10:07:42.83125+00	\N
cfdc8774-4ce6-4a2e-9fdd-1bdfa47f8a2b	62f63391-953b-40ff-b969-db853360dfc6	\N	call back	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-23 11:02:18.687435+00	\N
32fbe61e-6e8b-49b0-8ea1-a3b794a9da2e	261d1fe4-1e19-4225-b9c9-d92e9ba18fff	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-23 11:52:03.633078+00	\N
b34a37ae-6de2-444e-ae7d-9aa5d9f22cb5	0cf64d6c-fa2d-48b9-aeed-513f1da7561b	\N	enggade	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-23 14:08:28.066974+00	\N
45c57b44-d804-4381-9311-c99d4ce451e0	c64cfdcc-a772-4028-9dd7-465362d4e83e	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-24 05:02:37.11732+00	\N
6b85f4d3-1233-4fc8-aa4b-5c8786154588	a39259fd-a230-4051-897e-8065a8e96ef9	\N	he was not spekaing properly and saying  his sayinh he dont know to teach ppl ect.....	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-24 05:39:40.479379+00	\N
b0850285-830d-4e79-9235-f4f6513778a2	994516ef-f7d9-4ff3-85d3-478eb5f7bddf	\N	network isuess during call	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-24 06:01:58.752708+00	\N
0c8d97f2-5b36-4eb3-86ee-668e1f6edf38	b5ad0f06-0e3b-4213-8ea4-3f2533a63868	\N	enggade	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-24 11:00:20.30333+00	\N
2105df7f-f3d3-4829-a6d0-deeb7222e2a2	35254377-c0af-4ecf-b240-66c76cca6e86	\N	call back in some time  during network isuess	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-24 11:03:03.737153+00	\N
fee7ebcb-a23e-44c8-8f46-8fe0dab7dafd	da85dec4-d0a1-4bbf-a4ad-b10c53551353	\N	busy on another call	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-24 11:47:14.588664+00	\N
633e1f98-ce45-4988-8e6f-75ca757f48e6	ecf78ad3-d292-4326-b4bd-4859305fdbc9	\N	swtich off	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-24 11:47:57.922619+00	\N
3132fe55-6cdd-4473-9957-3e970188dca7	c6605ce4-79f4-4d92-b6b7-b9b0abc8fc98	\N	he said he dont under stand the session	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-24 12:29:45.007891+00	\N
465b3c35-1423-4ac3-9c36-873b09207f9f	6d02f39a-9dcd-40ee-b6f2-5f0617f1e30d	\N	not attend full webinar	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-24 12:47:16.654882+00	\N
9853774d-82b0-4af4-9599-b4d06c66e000	02db24d2-ed3b-437f-be73-ac94d32ab8ad	\N	call back after 1 hrs	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-24 12:54:23.057422+00	\N
8480d792-1604-422e-adb8-25101cc8fb47	043a9b2e-d7e4-4c4a-b290-205f8c04f0c8	\N	call back tomorrow morning his is driving	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-24 13:22:10.654961+00	\N
3f1d2ee2-5506-422f-9661-f543fd468994	b19b42aa-c919-4947-8f9e-619801e78b5e	\N	busy on another call	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 05:07:37.120633+00	\N
6eaf1e19-9c27-4607-80d8-6d8afcd672d6	0c868fe2-40b4-4cf7-95a8-f65b5fdd8207	\N	not attend full webinar	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 05:09:40.460182+00	\N
8ff135c5-f4e7-4852-a7f7-b506f69bd0bb	a77bdd92-d12d-4f97-a2e5-3df2e0d01bfe	\N	busy in an other work	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 05:34:20.071416+00	\N
0a70e457-259c-484f-b054-806551fee3b7	1c53966f-0280-4254-8dc3-743a4a2f64c5	\N	fwd to voice email	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 06:08:52.710121+00	\N
5a919a4e-cb0a-4142-a05f-ce62a4be56c8	97df9aa2-c2e8-43f8-841c-25f7e5dab161	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 06:10:09.424633+00	\N
999bfd49-8220-4ba2-ae65-f4f65acf9932	dac4e450-3657-4e5b-88e3-d80075167cd7	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 06:22:14.5323+00	\N
a80d73bc-ffeb-4399-a226-97fdc7c26a1b	a15d296f-3c2e-4fe0-b90c-e8caf37668e6	\N	wrong number	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 09:56:42.561061+00	\N
0741d3fa-7221-41a2-9095-be7321af8a51	93923f3b-1451-47e8-81e2-ae2a28b40072	\N	network issues during call	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 09:58:26.301267+00	\N
81294d2a-0e1e-4f91-911a-9160540d5d97	48bc011e-e173-4601-ab1d-76278dfdaac2	\N	fwp call back in evening	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 10:14:14.855133+00	\N
dd385e89-4d58-4660-ab73-daa6d76b8cb9	fdb8f89d-aff6-4498-9e82-b13bba51956b	\N	ask for a call back in sometimes	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 10:21:28.38849+00	\N
057e0764-71e3-49b6-ad64-31448176f4ad	cf055f3e-74a1-451e-83bb-eb53624f1818	\N	financial issues	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 10:44:49.373737+00	\N
ba1d4a3e-8fcf-4410-981e-7076f2456e2d	181d9192-f4e1-4675-b1ed-ee7875af8ff5	\N	he has not attend full webinar due to some imp work  of office so he will re-join the session	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 10:51:21.523943+00	\N
b82db6f8-6d18-4265-9799-db7c4e1c4f52	3ba5e50c-c43b-4263-a284-1069343e8aa1	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 10:56:39.885635+00	\N
705dae53-96fb-47cc-9969-0e0e166fc769	3bab5ca7-9046-489a-96f9-353d423a1b81	\N	paid	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 11:05:48.251502+00	\N
bd54c861-e7d8-4e62-a1f9-ed645040a0e4	73a517d6-40d2-4469-a018-c50a1ef99fd0	\N	call back	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 11:10:52.962002+00	\N
cfe2e917-4396-4171-b3a5-fc826988c2f7	e4816404-a85b-407a-9578-582623c8d776	\N	he is tottaly beggnier for this feild so he need somtime to join	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 11:27:52.955155+00	\N
983a3fbc-4559-47a5-a1db-83103d02f74d	41a478b6-667a-4c3d-953b-388e26eae457	\N	call disconnected	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 11:40:56.402611+00	\N
bc420fa3-987a-4f05-9057-01dce7c67b20	3521ac4a-874a-4a17-997d-c996593ae034	\N	not attned full webinar	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 11:47:24.098013+00	\N
bbffe172-58d4-4e87-94ec-c42e95c5fb18	f366c3dc-0437-446b-8558-3563ecd355b7	\N	swtich off	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 11:50:49.303071+00	\N
97a72ffb-2014-453b-92c2-cc2608ae2940	81724a3a-d46b-4c12-84f6-7f34d0b9794e	\N	Ask for a call in half and hrs	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 11:52:35.485052+00	\N
5e05fd60-dcae-4789-b479-6e66c79e93e7	2030f86e-3c52-4f12-84a1-72885a3d76c3	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 11:59:29.261485+00	\N
0fe0e284-7e42-40a6-bcc9-ef011050e879	600936a4-c027-4fee-8d4d-49235aae2423	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 12:16:44.41464+00	\N
c0674780-747e-4e0f-9bdd-d126e5b851b1	b0f18649-b2fb-48d4-b227-0f716bd14fab	\N	wrong number	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 12:17:11.26388+00	\N
987aa5e4-3f09-41c2-b050-8387dbed3d84	4a549797-cb19-4305-8736-40c99270e4f0	\N	call back tomorrow	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 12:28:50.920385+00	\N
3a4df095-6272-4126-8647-e81083998bf1	0ad9b6e7-05cc-47da-8909-bf13cc05a5bb	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 12:36:59.238922+00	\N
8b70619e-fac6-4cf7-bf8c-0fc16859c5ac	b67a0324-574b-4f30-8297-d8a26f36f36d	\N	No answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 12:38:31.636249+00	\N
207224ca-975d-41f8-aca1-796276b9a771	5db9b199-0a29-4528-b984-d9acfacc36da	\N	No answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 12:45:06.091976+00	\N
d5659de4-3eb2-4f3f-98c4-0cd82b41ef1f	fb0aa340-c183-4ab3-a987-71fceb4b5c6c	\N	No answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 13:00:02.305511+00	\N
b861388f-c1c5-4437-8b7c-2e54c3c3993a	9c021ac7-cf81-4f41-b83d-6c3dde7014b7	\N	fwd to voice email	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 13:25:38.075144+00	\N
d021c88d-5e88-4ac2-bad7-3bd5cb945eaa	48bc011e-e173-4601-ab1d-76278dfdaac2	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 13:27:19.099314+00	\N
0e02fa50-9e43-49dc-b29f-31631b66bbcd	48a26d88-f18e-41ef-a089-9cf576c2465d	\N	not attend full webinar	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 13:59:05.469667+00	\N
d572f016-97dd-4994-85e8-4910606fcd36	8a6efcb6-79f9-4b35-af0e-6d09f497cb2e	\N	between in dicuss  the call has disconnected after tride twice its show the call is busy	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 14:16:45.866868+00	\N
a897f238-6a3e-4ccf-a1e6-d199d813eeb1	d8ea0f45-3513-4eee-9b18-f13a937d82af	\N	he was not attend first session and second session also he was not completed due to network issues so he will re-join tomorro webinar	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 14:19:59.935218+00	\N
b5a95dc6-016b-48f1-9c1d-6c131d09bc09	30162145-45a4-493d-87b0-7f16411e32c5	\N	fwd to voice email	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 14:20:52.300752+00	\N
5644bf49-31ac-436d-9842-f553bce470d4	3dd45323-15fe-4876-9678-14afc9bb4502	\N	He will join later	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 14:32:13.50903+00	\N
bd4807f2-80a6-4e22-bf18-5306de3dd9a6	c6086823-5697-436c-a0a1-529419c2e1f6	\N	fwp	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 14:33:09.868258+00	\N
acfa1b52-b13e-4bc8-a4d8-ad1e21cdd324	4da54b6a-3a17-4d0f-9a20-42e30363966c	\N	he want to learn how to do photograohy he is ntotaly beggnier	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-25 14:39:27.074612+00	\N
ddf08da6-7ea2-4e61-b1e1-5b3f4605019c	c1d93637-094c-4d93-8a43-627b18c952f7	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-27 05:37:36.791913+00	\N
4368a89f-cfab-4753-ad13-e0aed4858044	f4854843-9cac-445c-a406-47c52e707b1d	\N	busy on another call	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-27 06:07:07.21889+00	\N
24a1d766-ba8e-4017-bf83-601df57df882	14075aa3-272f-45e1-b1ae-ce5abf1cace1	\N	wrong number	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-27 06:13:48.731664+00	\N
98d8116d-cc53-4c51-b3e3-7b59b5ebeca8	c2eb9574-2dba-4b46-9f4c-0fb7c5a8dac0	\N	he put call on a long hold	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-27 06:15:59.032621+00	\N
b9c07964-3de0-4e1a-b663-f561aa23a05d	e582a878-0631-420b-82a6-46965f86ec6e	\N	call disconnected	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-27 06:26:22.418777+00	\N
d4eb997b-8974-4f62-a99e-e1d1fbeb061f	c8247748-6039-429c-ac6b-297204701050	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-27 10:12:24.19555+00	\N
7235ffca-7f36-4310-8df6-7683d80fb9d0	116d5721-e0a5-47e9-9f53-3e215e330a53	\N	network issues during call	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-27 10:37:35.942582+00	\N
6147dd12-7f5e-4bf8-8239-6d597fd95047	87d82ba5-0f5c-492f-9c4c-5feee57aa4ce	\N	he join learn photography not about busniess	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-27 10:51:32.947671+00	\N
63b90286-2561-4e92-a6c9-e3b0787abcb1	f6b3ebe2-abcc-4738-83c2-18ad325ac5d8	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-27 11:41:08.724868+00	\N
5428412d-593e-47e0-86ad-14b444f47a61	9cee7250-ecd0-475d-9c6c-d8d452c9f28b	\N	busy on another call	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-27 12:02:21.126213+00	\N
5a711464-c949-4024-b64e-6b7dc4e27611	43a11567-0ef0-4acb-b0ac-566a60880c26	\N	he is doing framing so he dont have that much time	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-27 12:16:49.962888+00	\N
a18e1062-6a85-4a70-9b03-fc72a27ec348	77e972cb-57ba-4eb7-abad-d6bdddcd4aff	\N	he was busy in shoot so he ask for a call back	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-27 12:22:38.232531+00	\N
ff455fc9-5821-4d31-bc6a-2c4de7fefe50	93bd2b8c-ae3a-4bf2-88be-799ff3a9c5d5	\N	he is busy now ask for a call back	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-27 12:31:01.64525+00	\N
71f74fa9-c210-4318-a795-f6694deceeea	4dfeee68-0289-4969-a292-345b2f44b847	\N	he have some doubt but he was in session so he will connect tomorrow	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-27 12:41:21.762894+00	\N
f365425a-12a2-4f84-8aa1-70732f7e4929	d26ea2d1-bea7-401e-913a-4d995dd4bd1d	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-27 14:27:56.275821+00	\N
e440b28d-a981-4b98-a217-272e16a35414	566f0c1c-e2f0-49cd-a678-c5c151d30649	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-30 04:46:36.914071+00	\N
8a4f885f-5c1d-4e7d-9421-413d9740961c	35068a19-f181-4958-b96c-a6966f343cd6	\N	he is in  office so he ask for a call back	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-30 04:51:57.59812+00	\N
091f4c5b-1911-4a40-9d30-54a3c9a02617	30c66cc8-c29b-46d3-a404-df3d31574f56	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-30 05:11:47.941345+00	\N
22fc3368-06fd-494e-8d4b-77c4f64b38f2	4b1815b5-3abd-4d50-bd49-93c435a9f2d3	\N	enggade	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-30 05:45:20.514676+00	\N
b516f4c9-a9ad-407b-96c9-638363376194	fa4678df-b4e9-4529-b73e-857839f2e80b	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-30 05:52:35.999737+00	\N
93f0a4cf-91c1-4024-959d-dced4fb38e85	662c1674-5935-4c9f-b405-08a5a59456b4	\N	enggade	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-30 09:48:54.098553+00	\N
0c6257c8-e1d4-440a-9717-0bd77cd2cff2	34d7695d-2fe7-44f3-8d23-fca215418221	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-30 10:00:30.630597+00	\N
51598480-a2be-4244-b5a5-40128dd0f0b2	df483fa8-1350-4949-9d48-a5b37e6dcf16	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-30 10:09:32.400891+00	\N
865cc23d-97a1-4e25-bbea-f6ba1034845b	f7b4170a-f076-461b-be5e-ca22950d0667	\N	incoming call is not active	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-30 10:15:34.589125+00	\N
f710e90e-7020-445a-8f3f-bea3e83e2931	df6619d3-487c-4ee8-868c-e28c5dd1aae0	\N	he will re-join the session	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-30 10:26:23.249556+00	\N
54ec8f30-8b35-4f00-a152-e246b0257907	12f17687-f343-4ec1-9f93-81dfcf715593	\N	call disconnected	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-30 11:14:30.731799+00	\N
0f6bf807-015a-4e0d-aedc-a39659e7b9ad	2aaad2f0-ebce-4ef6-867d-71e727a2fb4d	\N	incoming call is not active	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-30 11:34:46.926521+00	\N
dc3613f4-cf07-418e-abad-49ca19fba60d	f5531c59-0abd-45c2-a17e-7ec7e574f345	\N	out of network	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-30 11:49:05.901479+00	\N
3c2d620f-9918-48e4-b18d-45694ebe23dc	58271289-1274-438d-bdda-771705db377e	\N	he alrday running ads	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-30 12:05:01.29101+00	\N
62be620c-05eb-427c-a201-c4ddefd100d3	107b5464-2acb-4f6e-b1b8-a6e35eadbef5	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-30 12:16:10.215001+00	\N
5ab69b9b-ae2f-4950-848a-e8543d02e8eb	00769378-b499-40f7-a20f-4e1d0ab7f172	\N	network issues during call	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-30 12:57:16.381131+00	\N
6f989daa-df94-4f84-989c-14d6a674709b	17966c9a-6c97-4244-b86b-8f42b13784e7	\N	busy on another call	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-06-30 13:00:29.633387+00	\N
3296dd66-5441-487b-9643-c51cfb275047	1358493e-ca40-4d62-8450-9c256fe5e918	\N	call disconnected	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-01 04:38:32.570542+00	\N
3f393638-61e8-44ed-8275-f255d834c042	97e7b3a0-da1b-4fec-bef8-d927a1696692	\N	fwd to voice email	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-01 05:14:51.097368+00	\N
cab0b80a-379e-4849-b261-cb532ce81422	6fac138a-3be1-4e49-958e-ef7541d126a9	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-01 05:40:34.902572+00	\N
6af83e25-b5e6-448f-aaf0-c83b3547d107	30c66cc8-c29b-46d3-a404-df3d31574f56	\N	enggade	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-01 14:09:03.99129+00	\N
77e04652-75b7-47e1-a0a5-ce36a9fedf87	4b1815b5-3abd-4d50-bd49-93c435a9f2d3	\N	busy	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-03 04:44:07.602943+00	\N
da0efcfc-5aea-4274-a063-79cff8f049ed	1b9db8c1-6e11-4bd3-a98f-b2af7f090774	\N	during call techinacal issues	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-03 05:00:02.993388+00	\N
cc053b1f-9af0-410e-a4e7-7f235277143e	6ee05933-7791-4377-82e9-d2707e09f471	\N	team	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-03 05:00:35.48733+00	\N
407ad631-3444-480d-9f91-ddab1d1a4c93	f740d524-b269-4636-aae0-bdb55ce38360	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-03 05:50:39.273529+00	\N
95c92da0-25ff-40a1-9785-3e3f26169000	f740d524-b269-4636-aae0-bdb55ce38360	\N	call back	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-03 05:51:24.586565+00	\N
8fdd51f9-acc9-4760-9210-becb5cf693dd	c168232e-97f9-430e-bc54-79df827095b4	\N	paid member	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-03 06:16:02.622037+00	\N
0ac0c053-d032-42a3-b410-ad886b9b7e40	2b5f8496-55e2-4320-a109-1674356578e4	\N	Incoming call is not active	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-03 11:25:03.891574+00	\N
f8ec7d73-c893-489d-958c-0c2f67ac994d	47063135-21ff-432f-b4cf-2743f75e2d6b	\N	Enggade	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-03 11:44:11.018891+00	\N
2326d64b-1772-4f23-9136-6fa716b0e11d	cc2f1b4f-9437-446c-9007-1480da2aec58	\N	busy on anothr call	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-03 12:45:07.60556+00	\N
cf48ff96-419c-4e44-98c2-51589cca7abc	fde510e4-2bf7-418b-aa05-a6f4d2921718	\N	No answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-03 12:51:21.852611+00	\N
646cfe4c-57d7-4fd0-9f4b-afbd901cc386	91b1ad45-3b43-40fe-83de-e373f960e868	\N	busy on another call	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-03 12:59:18.642047+00	\N
868d55fd-ff33-4d18-b063-2e33fc1ff21e	5413f0f7-ac42-462a-b077-0ea6cf530781	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-03 13:35:59.150457+00	\N
103576f8-dda6-4c16-8275-12dc30cae21a	27396456-211d-4c3b-9954-7696da2cce53	\N	buyon another call	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-03 13:39:13.498289+00	\N
53db4258-9939-413e-919c-abb792c15e33	5413f0f7-ac42-462a-b077-0ea6cf530781	\N	he is not doing photography	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-04 04:56:08.764151+00	\N
a413a188-4cbf-42c8-bc4c-a22965cedbf1	19a83634-e34b-477f-be7a-0f245132c2ca	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-04 06:09:03.487689+00	\N
5a8a5138-2ba3-4a01-b65d-e2373ef3e1fb	41cc23d0-c8ca-452e-bb74-f5c775dccad8	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-04 06:14:00.969252+00	\N
e7df2eae-d613-42ae-9d80-ac80b23dedd5	3bb3fa5a-ed6f-4ea6-94eb-b767bfe7bd1e	\N	call disconnected	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-04 06:26:52.066691+00	\N
b9764c8e-dd84-4dba-8f97-a132e63df1a3	2d0b160d-cc0c-4feb-a8f6-2660e95383d8	\N	busy	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-04 10:37:44.576013+00	\N
176b6ee2-2545-4016-a9b3-014e9b77df0a	a23c0061-ce45-421e-a769-4227e729a541	\N	swtich off	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-04 11:54:32.568443+00	\N
76f00d80-e39d-4aeb-ba3a-42433b13417b	c0b856f9-9287-4585-97ca-413efdbabae7	\N	busy on another call	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-04 12:11:55.505494+00	\N
8ddd7a67-8506-446d-8ba0-1f1769067558	79bd4cdd-e3e4-49cb-9f7f-0820b39ddb0a	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-04 13:32:13.896371+00	\N
72e56708-1901-453d-a2d6-8299370e20c2	2943b69e-8b18-48e6-81d3-dc1a55ebe275	\N	fwp	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-04 14:01:29.99792+00	\N
2dd332ca-0a34-40d2-b26c-64ca70dd82b3	f9d4e4fd-f1ad-4701-b3ac-5a3dcab71110	\N	call back	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-04 14:02:05.038551+00	\N
32d5a5c8-55df-496d-95df-9360c20ac775	dde250e5-a9f9-4fb9-9dfd-2ecf6aec7d83	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-04 14:26:16.132571+00	\N
0a41abb1-9daa-48dc-b6a3-2ad310a6e0aa	b574abb2-1a51-471d-a165-46fad200ea67	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-05 13:24:39.305659+00	\N
b6803a3e-bd7b-4b7e-bd9a-20c907be0752	71b07d17-0d94-4151-baa1-2c4d3280d78d	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-05 13:30:54.516772+00	\N
2b121598-b2bc-47b4-a365-e4a8b403822e	a4c258b5-6b77-40d8-b83b-9a9554ef2089	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-06 04:42:03.782145+00	\N
aa6d200b-2a69-4983-9b1b-b3b6aa78266f	be28057c-91a0-45d2-8aaa-f1d6306143ad	\N	fwp call back at half and hrs	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-06 05:20:37.916003+00	\N
b799ad96-ec08-46d8-8a00-ac819266db22	b5d87f88-31e6-4f5a-b326-9d8b564c6ff0	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-06 06:16:32.545831+00	\N
87297181-d409-4cec-bfba-cee61c4f6a7f	3af9ae97-f174-476b-8941-40c42239c070	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-06 13:19:50.62033+00	\N
4783ff45-548c-494d-9451-194d7ae1c16b	b67c34a8-a5f4-4330-97ae-ac8db9cffd3c	\N	enggade	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-06 13:36:48.482316+00	\N
5f3cd88c-06e4-42b4-8940-fbced5fad844	c0f74317-7cd2-4791-b71e-f3e150172d63	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-07 05:19:07.360957+00	\N
0e1b0d1c-5e5e-4bc6-8e37-2ea243f7ff99	81e4f383-6fe9-4d85-bea8-94a0876173a5	\N	not attend full webinar	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-07 06:19:34.139467+00	\N
064dcdde-e37f-408c-920b-be4312c35b72	8f35280d-7ba2-4df4-a269-b09d4c78d46d	\N	his age 60 so he want to knw weather he can join or not	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-07 06:23:51.615267+00	\N
98451b48-833e-44e8-b6dd-33230cf8f00c	e5d5ba4c-6a30-4499-83dc-fb5e5e196032	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-07 10:59:56.580123+00	\N
d6e40920-a887-4f76-a137-01708f2e36ed	6e1ba691-fdee-44a1-a26d-e7d405b2c4b2	\N	out ofnetwork	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-07 11:12:46.775712+00	\N
f25e087b-7cea-4df0-ac0c-7b6ef19654c4	5ab632eb-0915-4895-b62a-1c8c2b783234	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-07 11:34:22.473876+00	\N
5aee7dc9-3ec0-487a-a3c3-7dd97c95b9b2	6ee05933-7791-4377-82e9-d2707e09f471	\N	not interested	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-07 11:35:30.676453+00	\N
4d97eb44-648e-448b-b983-ec9c6f6e8780	ab8c8ab1-6cdf-4a13-904a-ce67e9ff105c	\N	fwd to voice email	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-07 11:52:41.460021+00	\N
9041f0a9-1459-474e-ac25-491c21d3bdd5	47063135-21ff-432f-b4cf-2743f75e2d6b	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-07 13:32:16.526736+00	\N
583c95d7-2367-43f0-8ce4-1b65638d89f6	c41ae7a3-fc04-46cf-9fb1-7a13390564e2	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-07 14:26:07.590597+00	\N
41b91f86-72a5-4333-bf5c-67ecae7f2487	b41a764c-96bb-4881-8dca-e18c142ec94c	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-08 05:26:53.710144+00	\N
2c9267a6-64a8-419a-adaf-bda5aa92fb9d	7f14c36e-efe8-45bb-9252-cd0e892b2e72	\N	call back	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-08 05:35:36.332858+00	\N
d484966a-369e-4b00-bd45-3f4e99154b67	99cc7b86-ab20-4652-bf63-f04e3203bfda	\N	enggade	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-08 05:45:20.151597+00	\N
ac82a09e-c3f6-42d6-9ca8-2239cb25899a	cc2f1b4f-9437-446c-9007-1480da2aec58	\N	enngade	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-08 06:01:02.828166+00	\N
7cd13c52-de97-476d-84df-f9e4e81ffb7d	e6eca78e-8230-4fb0-b822-ba61d8967f5a	\N	not attend full webinar so he will re-join	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-08 11:34:57.901058+00	\N
a469095a-0c10-4426-85ea-83e57bb05046	d3bf9892-9798-437d-ab19-48f37fb9f8d5	\N	call busy	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-08 12:48:00.23637+00	\N
07bc3175-86d6-4dfb-9fb1-09da43e399d2	d45460cc-ec6c-4dce-8086-91e455bf8da9	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-08 13:07:49.391837+00	\N
36a824fa-f5bb-494b-8ef0-ba34718e15d9	a0aac1e6-f1c7-48f3-a59e-e329dd4cdbed	\N	wrong number	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-08 14:25:23.610457+00	\N
32e242fc-e25e-4479-b900-e182780ebb7f	6cac05ed-b7f0-4b1e-b835-755ee44666bf	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-08 14:28:57.017117+00	\N
8f3f5ac1-2e53-4173-8d56-ca9bac916637	ce6cdce2-37ca-47ec-a37d-c0bd540449cc	\N	not attend full webinar	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-09 05:05:37.497334+00	\N
95e18a83-e667-4c80-ab31-12ce4a5b5de7	10b23203-752a-4d85-9a3a-660a8cac77df	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-09 05:36:18.883016+00	\N
806523b9-7089-472b-aa54-38ebe4e7876c	9561453f-0d55-4182-a54c-aecfc543a21b	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-09 06:05:52.364215+00	\N
758f0f8a-8371-4cd0-b2dc-00c21c7e71e3	1b36a68c-7376-4090-812b-b6576ad36dbf	\N	he need sometime to arrange money	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-09 09:59:48.677371+00	\N
34d41447-8743-4981-a6b3-b6ba2be78f2b	1b36a68c-7376-4090-812b-b6576ad36dbf	\N	he is driving so he ask for a call back	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-09 10:05:00.418763+00	\N
1d3a8893-852c-49d4-9f38-333fbe8894c0	41cc23d0-c8ca-452e-bb74-f5c775dccad8	\N	out of network	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-09 11:21:02.151252+00	\N
8ade922d-3a98-482b-9a35-be6c2b1e4381	4d9463cb-3b19-446d-a23d-cd079ba349a7	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-09 11:35:56.979644+00	\N
22892cda-7186-47bb-8634-c2710d9996d4	e900d920-4519-4006-9d23-920ce7b1e78a	\N	buy on another call	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-09 12:09:13.915256+00	\N
1b850cd9-15d6-481c-878b-0899d6b3ed9a	5ab632eb-0915-4895-b62a-1c8c2b783234	\N	weong number	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-09 13:22:17.615698+00	\N
28374b51-8693-4f2c-b09c-2d457f39ff27	1358493e-ca40-4d62-8450-9c256fe5e918	\N	Call disconnected	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-10 05:19:07.834955+00	\N
5ffe924b-11d3-4782-8069-890ef404dc8d	b5dd546d-0aba-43a3-96f6-b2beac71897e	\N	he said he will join from his side he dont want call	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-10 11:03:06.814529+00	\N
7df66c97-de0b-403f-a7a6-916b0bfbdb32	c168232e-97f9-430e-bc54-79df827095b4	\N	paid member	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-10 11:03:56.638049+00	\N
4bc2292d-daa0-4de9-957c-e2ddb8158bb1	09277012-3850-45a1-8ea4-36cce290613e	\N	busy	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-10 11:22:34.440095+00	\N
1e431bfb-1305-44bb-8c66-ed8f75e0eae0	44ab558f-ac1c-4ce6-9d5f-0442567c5844	\N	paid	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-10 11:35:11.581627+00	\N
636e9112-2402-46e1-a6c7-fc61e3b20c09	88451467-eebc-4cae-a51f-9d4b021028ba	\N	enggade	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-10 12:18:23.565143+00	\N
a5af83c7-098a-48b2-80f7-436b39764e52	e82656d9-4649-40f8-a706-dcbd784bb0fa	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-10 14:10:31.426466+00	\N
df4d5cba-9547-4f54-b92f-d1bf9386bf99	4ad215cd-acc1-4ca6-a37c-fe96505765c5	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-11 05:41:53.66581+00	\N
416ddec1-bd97-4c53-bda4-e612c1843415	7726577f-d69d-4c46-b9f3-9ad9d4741a1f	\N	he said he not comfortable to do	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-11 05:54:55.839926+00	\N
795f07b0-aaa0-4977-a811-33cbb9c6a3e1	5962015d-9d2a-4468-ab27-7e2dbf4a1d82	\N	busy on another call	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-11 06:01:21.204603+00	\N
60ebafaa-d563-436b-b75a-93240850d649	b5d99a3a-ad87-40f7-906b-80026aef1d9f	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-11 06:08:55.51987+00	\N
eedf934b-f680-4069-9c32-88883da5e3a7	8baf9415-74cd-4f9b-8d8b-02bfc7783954	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-11 10:14:30.408785+00	\N
4a3e88cb-e091-4f16-8f4a-63be69cd3863	e620fb48-4656-4779-9bec-a857c84ae8dd	\N	he have own digital marketing studio	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-11 11:09:20.908645+00	\N
8b0e8467-b4ac-439d-bb98-415909bf0ead	6e87335d-b715-4d6d-8692-c3341f1ff253	\N	enggade	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-11 12:06:15.587778+00	\N
7b443800-9d88-4fd2-b646-29e522d288ee	928ad150-7575-4294-a361-348b860ae8a9	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-11 14:06:32.692268+00	\N
127a3f63-008c-4c91-be88-7d0e3a75ecb3	d5fbfcec-93cc-4e7b-8f65-57d900609ff3	\N	call disconnected	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-13 06:17:50.902305+00	\N
05ee7d0d-2bf7-4dd2-9c4d-f9e9e6f2c929	9cc46d8e-52e8-46c7-8b6e-e8c61d1e94a0	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-13 06:28:41.273834+00	\N
9342f4ae-b7eb-4be5-a9c3-13b11c4f7067	71f0469d-e83f-460c-9db7-c11b637278bc	\N	incoming call is not active	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-13 09:53:54.567427+00	\N
a0ea6292-7cf7-4e06-bc83-05c8d56f2185	e7112790-49f9-4518-90c9-bfae16982691	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-13 10:36:32.110899+00	\N
f7d2995c-628d-4a4c-b6ef-1f0e418f84cc	78fab620-65ab-489d-a39f-6cc49a00675c	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-13 11:18:33.897438+00	\N
19773a5f-a269-4e1c-a2ef-ef22b820b75b	ddc1a4cf-633e-4705-a093-d94947a59c38	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-13 11:19:58.502357+00	\N
9ad9f4e1-ed28-4fcf-bb07-4869ccfb00fb	c7bb7465-9447-4664-825c-f27d39cac633	\N	he said he dont have that much amount to pay so he will join later	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-13 11:26:55.811785+00	\N
2134c122-d03a-4176-9d74-dbb27f0e9126	c738ea46-ebe2-483a-821d-e8d773545191	\N	call back he was on shop so he  ask for a call back	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-13 11:33:59.54058+00	\N
7e4de882-224f-4b1d-b99e-c630d48e84b1	ebef08ad-393a-4807-89c3-fc75de196c49	\N	he have  some doubts and he needs to clear in the session only	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-13 11:42:34.323144+00	\N
b9905624-10b9-4126-bfd1-75953b412667	b74cd976-586d-42fd-a5fa-4e139727caad	\N	he will join later	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-13 11:57:25.90115+00	\N
33f73f22-e429-4eea-abcd-1da9e59cc77f	d5096bf6-36a0-4cfd-8eb5-7f39696ca541	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-13 12:02:11.733397+00	\N
3a4f52e6-4115-4177-a098-674865b52678	4c3a814d-3f87-44d1-bf69-5565cb2a0e3e	\N	he was no attend complet session	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-13 12:06:31.805231+00	\N
5ca0f384-2edd-4f01-a28e-8c96df4de220	39f3627a-81d8-4b00-b59d-6da12cb8f550	\N	his son is photography so he said he will join tomorrow and attend the webinar	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-13 12:10:49.742129+00	\N
312afdd9-47f2-4fbf-8ee0-62fa76546c81	e87cb9e0-7b86-4c01-99ae-2ffe71b096c9	\N	alrday diamond member	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-14 05:25:40.715689+00	\N
dfc9f704-00fe-4512-be46-8af6d831fea6	bed69ba7-9c10-4204-b0e9-377e76036429	\N	busy on another call	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-14 05:51:53.374443+00	\N
5be8175b-fc4a-4237-b443-a9f0c5e552d3	f5a4bdbd-aaf6-4d11-9401-cba245fa11d2	\N	diamond member	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-14 06:02:27.086969+00	\N
9cb89cef-1108-4544-8bd1-21f9f4830ace	6d74850e-4185-43ac-b14c-92013252feae	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-14 06:13:51.042737+00	\N
4bad1d51-10e8-4ca2-8591-04e010733ac4	41018a64-f35b-4110-92b8-17bcb8c31ea1	\N	wrong number	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-14 06:26:14.266881+00	\N
1caca988-4a50-4341-b43e-4d99d07a5f6c	d577944f-c6a1-4e70-8a3d-0c2831070666	\N	not attend full webinar	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-14 11:29:50.901889+00	\N
0d270409-4906-4c1b-9374-57e99acbdb55	2da1fb2a-019d-48b0-9253-4ac35e7e51aa	\N	enggade	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-14 11:46:10.756158+00	\N
6ec650d3-2e31-42b9-bcd8-4fe79869c8ee	ef4b22a5-421c-41d0-8339-bf6f0e99b1f4	\N	not reachable	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-14 12:06:10.458789+00	\N
a42b45cf-7212-4766-b690-af6d066df793	e1c7aa0d-b1e4-433f-8395-42867bb0763d	\N	his riding bike so he ask for a call back	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-14 12:31:07.789183+00	\N
5f03b75b-45f8-4697-a456-f4b1ab851bec	d5e089fb-ea39-4c30-8017-7d3d0ed1d953	\N	fwd to voiecemail	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-14 12:49:00.573837+00	\N
486646db-aff9-4991-9669-be935bd9661a	b51a93c2-9857-4a73-b994-4c63c4a8b658	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-14 12:54:29.02313+00	\N
2c9294c0-0ab7-4021-a03f-25ccf19f7f3b	9f851884-1af7-4369-a1d2-e0f0c2aa90b1	\N	call back	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-14 13:04:58.307309+00	\N
cec8449c-c5d8-4ea1-8bef-71cbd6a241d4	869c68e9-7343-404b-800d-6a20942d7130	\N	during call there is network issues	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-14 13:08:01.904128+00	\N
13403fc4-e0c5-4b89-9746-f1236560565b	c611a699-e744-4e7e-a404-1122d42f8e16	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-14 14:24:15.726473+00	\N
d671b414-8fa5-48f5-9fc0-667288f49388	5992b526-2057-413d-b15b-f7092f990c7a	\N	financial issues so he need sometime	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-15 05:29:37.200236+00	\N
ca12a9a1-49d9-421d-b594-1b21621441be	8b92678b-40d1-4454-80ff-de0f2cac2783	\N	swtich off	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-15 05:57:56.024078+00	\N
5bd52ab2-76d4-4b42-bd94-c241ea934398	e5a84b0f-04bd-4e9f-99cc-7791f1c42e69	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-15 06:20:05.981033+00	\N
b7757d96-ca49-4199-91bc-c46b35fac977	56837ea4-c145-42c1-ad83-2e72e297ac91	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-15 09:39:55.197642+00	\N
ab09bb13-d5a0-4264-8f1a-2f575fd94cd5	9c40b674-74e9-4b54-9b45-48dc7bd7dcae	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-07-15 11:33:41.421272+00	\N
7ea82ea0-15e0-45dc-a301-4fb230562535	591baa3b-61c0-4c35-abd2-d6b6233e4326	\N	paid	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-08-01 10:35:45.641282+00	\N
6b027ed6-9675-4cc0-8833-2738fb6aef68	453f1183-89eb-4cf6-af87-a617b25d9684	\N	team member	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-08-01 10:36:09.115766+00	\N
2c163f85-0b5b-4a70-a45a-177f50009c7f	1a82ece3-a31a-4831-93bb-d115c4422172	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-08-01 12:59:08.788809+00	\N
1787f0cb-3c35-46ff-bbad-5ef2288a2dce	36166c3a-84a3-4d67-801d-967db860aa5f	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-08-03 12:07:23.141945+00	\N
a41862fb-4c5b-420a-b856-3574d78f48fb	4ae7f636-e36e-4836-b488-d11653a880c5	\N	he said he have not attend any session	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-08-03 12:22:22.18126+00	\N
7a66c477-8a03-4517-90e6-03d53270273b	57c629a0-010c-4a7c-94ad-e36f59de1f48	\N	paid	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-08-03 12:23:10.056168+00	\N
9bc8d5b7-b020-44e2-ae4f-534518054d00	c0cfbd3d-1685-4ada-9ddb-4dceb545710a	\N	paid	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-08-03 12:23:42.621484+00	\N
d1dfef81-b3a4-4449-b411-97aa9319005e	8ff8231f-3621-42b3-b6df-8f043ed4e90c	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-08-04 05:45:09.341964+00	\N
6b94dd8f-2100-4cb8-ad40-a8da5119d4df	03632574-de30-4cc6-9d38-edbecce60324	\N	busy on another call	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-08-05 09:14:06.693491+00	\N
c6294287-49ed-41b1-b085-8382afc78690	42fdd2db-3265-4768-b62a-e41d89b41399	\N	busy in with another meeting so he ask for a call back tomorrow at the same time	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-08-05 09:16:59.911292+00	\N
552fee37-5da2-4729-8894-5b3088419916	66eccd43-767d-4459-b0a7-86e3870f3f01	\N	product details share	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-08-05 09:25:17.388286+00	\N
77f0a6da-15ff-4a59-9e48-3d087746a719	b52cac5b-2150-480d-b10c-f96fc847d6f2	\N	no answer	general	0720cd52-0df6-4ec0-9a5e-89be1d10dc93	2026-08-05 09:26:12.210494+00	\N
\.


ALTER TABLE public.lead_notes ENABLE TRIGGER ALL;

--
-- PostgreSQL database dump complete
--

\unrestrict SalrPeR9z6guYtUFf83kB7pE8paWdtOzjE5loaGd42DFexAhhw6xYuBm77Pco9q

