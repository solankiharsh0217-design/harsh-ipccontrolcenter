--
-- PostgreSQL database dump
--

\restrict fAdLBtpGa1YdkhrmYgNSTw0IcNjtofvHWc6Apx6z4hJwEePjj8y2PB83GVga9ku

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
-- Data for Name: task_activity; Type: TABLE DATA; Schema: public; Owner: -
--

SET SESSION AUTHORIZATION DEFAULT;

ALTER TABLE public.task_activity DISABLE TRIGGER ALL;

COPY public.task_activity (id, task_id, user_id, user_name, action, created_at) FROM stdin;
cbd624d6-cbc0-42cd-ad2d-65d8993f0575	a1412b1f-8de9-479d-9797-beea975d488e	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	created this task	2026-06-03 03:38:40.483956+00
3ae1cf51-16dd-43ab-a79e-b3b008b8a464	6c2afe46-1190-469d-8965-aeaf1398dd0e	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	created this task	2026-06-03 03:46:48.621361+00
5aad8817-0ee2-492f-bb51-8c3ee8eb469d	6c2afe46-1190-469d-8965-aeaf1398dd0e	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	changed status to In Progress	2026-06-03 08:00:56.91467+00
332699c6-a85d-47b2-ab5a-38e7ce1038c7	6c2afe46-1190-469d-8965-aeaf1398dd0e	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	changed status to To Do	2026-06-03 08:00:58.030302+00
e83447ae-c58b-413f-8e7d-1f87d33cfd77	6c2afe46-1190-469d-8965-aeaf1398dd0e	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	changed status to In Progress	2026-06-03 08:01:02.121345+00
9055b813-7bde-4538-9405-435d5299ef0a	a1412b1f-8de9-479d-9797-beea975d488e	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	changed status to In Progress	2026-06-03 08:01:03.991893+00
a0ccbd2f-97d0-42e2-b95f-aadc07b7bbe7	6c2afe46-1190-469d-8965-aeaf1398dd0e	8dca6892-3cf8-4a59-95a9-7484b6672cac	Nisha	changed status to Done	2026-06-03 13:10:20.548792+00
4dc1e32f-5735-4a8e-bffa-0d73555610c8	a1412b1f-8de9-479d-9797-beea975d488e	8dca6892-3cf8-4a59-95a9-7484b6672cac	Nisha	changed status to Done	2026-06-03 13:10:43.000764+00
3a02b941-385c-4b1b-9d85-b0469c02b231	9c8de4c0-3d26-42f8-9fa9-9e11cb673b0b	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	created this task	2026-06-04 01:07:23.761877+00
5699e1c9-2fcc-462e-a77d-4acb84158185	54f9ac91-a293-45bd-83fa-1106c17d978d	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	created this task	2026-06-04 01:14:32.02506+00
c3ff3e07-4085-4473-9a92-68ba12144d69	1c9309e1-d79e-4e3c-bf21-cc5f33cbce89	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	created this task	2026-06-04 01:20:25.215849+00
e95bbcc1-0b6d-4fc9-b6b5-ff993c6eeaf0	9c8de4c0-3d26-42f8-9fa9-9e11cb673b0b	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	reassigned to Nisha	2026-06-04 02:18:18.20869+00
67385c71-7368-46ed-8574-99d7bd8cc118	1c9309e1-d79e-4e3c-bf21-cc5f33cbce89	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	reassigned to Nisha	2026-06-04 02:18:25.428022+00
bdf16633-fadf-4001-99b2-0317c485c6b8	7496b9d2-6011-4589-9ae4-18df14592269	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	created this task	2026-06-04 07:44:21.247768+00
ab074422-552e-4652-a09a-fb0fe102f3b3	7913f443-a1f8-4fc5-ab17-2f732660ccb0	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	created this task	2026-06-05 05:20:39.544699+00
3769fd5c-3158-410e-8569-4203490fbdc1	9c8de4c0-3d26-42f8-9fa9-9e11cb673b0b	8dca6892-3cf8-4a59-95a9-7484b6672cac	Nisha	changed status to Done	2026-06-05 07:40:45.760018+00
62246aae-627f-4873-bbf8-eb1f38f9f452	54f9ac91-a293-45bd-83fa-1106c17d978d	8dca6892-3cf8-4a59-95a9-7484b6672cac	Nisha	updated the note	2026-06-05 08:16:47.210224+00
2dc51957-553c-4493-8c86-a7f64fd9a286	61d81e9a-4a8f-4c2c-97e7-93adfa8218e1	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	created this task	2026-06-05 08:59:02.920757+00
3699c81b-6507-4cbf-9f8f-f3452ee857f2	17fdb9fb-2f13-4f00-a212-b5b681bac899	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	created this task	2026-06-05 08:59:20.056871+00
5d3ccfe8-a742-4f2b-b837-a45bc3fb74ae	f6a984ef-a161-48c5-bebf-f7370725cbe0	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	created this task	2026-06-06 07:17:08.319098+00
499b73ae-94a9-4c07-9b6a-afb7d0fc1e28	7913f443-a1f8-4fc5-ab17-2f732660ccb0	8dca6892-3cf8-4a59-95a9-7484b6672cac	Nisha	changed status to Done	2026-06-06 07:47:18.689646+00
5a1fb6a1-0135-4a1c-852e-d889b9e910ef	7496b9d2-6011-4589-9ae4-18df14592269	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	reassigned to Abdul Hans	2026-06-06 11:50:45.109445+00
b4711ab2-638f-46eb-82ff-9ff6d59f6420	7496b9d2-6011-4589-9ae4-18df14592269	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	reassigned to Nisha	2026-06-06 11:50:47.281079+00
9e7b83de-90a7-41de-a4ea-cb4b429e85d6	1e790ffc-6117-4bb0-93e9-6dfe61039562	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	created this task	2026-06-07 17:12:44.280101+00
5d245716-4beb-4ced-a106-8e98ed0e9120	ed0e05e1-13b0-4541-99d1-ed94655c92ff	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	created this task	2026-06-08 01:30:33.654341+00
b735e5ef-9608-4248-8b43-9edb8434022c	ed0e05e1-13b0-4541-99d1-ed94655c92ff	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	updated the note	2026-06-08 01:33:49.457718+00
ae3f417d-1050-4bc0-ba65-252dde6e46fb	1c9309e1-d79e-4e3c-bf21-cc5f33cbce89	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	submitted work	2026-06-08 07:02:52.69556+00
aeac60c5-bd05-4706-a9dd-25164eaae3c3	1c9309e1-d79e-4e3c-bf21-cc5f33cbce89	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	changed status to Review	2026-06-08 07:02:53.054509+00
a9bb732d-0b7e-410b-a83c-f443137c230b	1c9309e1-d79e-4e3c-bf21-cc5f33cbce89	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	changed status to Done	2026-06-08 07:34:34.2871+00
40250388-bb08-4843-8180-a357cabc2148	54f9ac91-a293-45bd-83fa-1106c17d978d	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	submitted work	2026-06-10 11:38:35.121042+00
f97f8633-6484-4014-bc08-d39458951a1b	54f9ac91-a293-45bd-83fa-1106c17d978d	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	changed status to Review	2026-06-10 11:38:35.329411+00
48e1fec8-5f2c-4296-bdaf-a06e85ee8b4f	1e790ffc-6117-4bb0-93e9-6dfe61039562	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	submitted work	2026-06-12 07:53:56.298164+00
ef1a56cf-3b9c-4cc0-9ee6-d88ffc936d62	1e790ffc-6117-4bb0-93e9-6dfe61039562	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	changed status to Review	2026-06-12 07:53:56.542558+00
5971e199-34ff-4ae2-9167-22bc32050c07	7496b9d2-6011-4589-9ae4-18df14592269	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	submitted work	2026-06-12 08:09:36.043018+00
443759b9-dd44-4f42-ab7c-2a6574dc44e3	7496b9d2-6011-4589-9ae4-18df14592269	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	changed status to Review	2026-06-12 08:09:36.339148+00
ae6500a6-c9d3-440a-8d17-ed51bd979478	abdd8762-00f3-4099-9452-c1dc587dec42	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	created this task	2026-06-16 03:07:18.666612+00
e344fe51-ae05-47bd-bd48-eded3943c2ac	ed0e05e1-13b0-4541-99d1-ed94655c92ff	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	changed status to Done	2026-06-16 03:16:53.997134+00
5bae1e32-6afa-406c-9725-8b17105d9047	f6a984ef-a161-48c5-bebf-f7370725cbe0	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	changed status to Done	2026-06-16 03:17:12.769728+00
e00a46f0-dee4-4b07-871b-277d547b1f3c	9dfdeb6f-b934-4221-9653-119402de97fc	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	created this task	2026-06-16 03:44:51.383319+00
44609442-52b6-4db6-af8c-8ce5f957f0a2	b3beb993-e595-48d2-b660-b37b15e25e27	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	created this task	2026-06-16 04:21:16.021277+00
4b78e76f-3141-4343-8fd1-82eab5ac5ffa	1e790ffc-6117-4bb0-93e9-6dfe61039562	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	changed status to Done	2026-06-16 08:31:18.195345+00
79f2c10d-5fb1-4cf6-a0ac-7fee1692e66a	7496b9d2-6011-4589-9ae4-18df14592269	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	changed status to Done	2026-06-16 08:31:21.188079+00
46e92023-fc16-4ad6-8ba9-71561ef7f0cf	2fe0af70-73c4-44fa-9e7a-2529cd43115b	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	created this task	2026-06-16 13:44:17.568147+00
f70ea000-955e-44e2-885e-e55bea85b9e8	54f9ac91-a293-45bd-83fa-1106c17d978d	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	changed status to Done	2026-06-20 11:50:41.805225+00
fb53a2e0-917c-4199-9fd6-01ce1cd46ac0	ed0e05e1-13b0-4541-99d1-ed94655c92ff	2acd3768-d89d-4838-8800-6d2cb48c84f9	Aman	changed status to To Do	2026-07-08 09:51:32.989021+00
2d73acb1-38a5-4cc6-9f73-334ca9cfd6c1	26323a30-c892-4063-8c70-a5f8fdab1d5f	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	created this task	2026-07-14 06:15:34.121192+00
5d44fda2-8c49-4b28-b398-f496acde3298	26323a30-c892-4063-8c70-a5f8fdab1d5f	2acd3768-d89d-4838-8800-6d2cb48c84f9	Aman	changed status to In Progress	2026-07-14 06:16:10.230757+00
e35359c1-f16d-4631-93c2-5627f54c6ce3	26323a30-c892-4063-8c70-a5f8fdab1d5f	2acd3768-d89d-4838-8800-6d2cb48c84f9	Aman	changed status to Review	2026-07-14 06:16:12.757403+00
4b09fd25-7d88-4537-a7bc-61b643db1896	26323a30-c892-4063-8c70-a5f8fdab1d5f	2acd3768-d89d-4838-8800-6d2cb48c84f9	Aman	changed status to In Progress	2026-07-14 06:16:13.756541+00
b2735776-62f5-4ac6-9235-d0096d10f797	26323a30-c892-4063-8c70-a5f8fdab1d5f	2acd3768-d89d-4838-8800-6d2cb48c84f9	Aman	changed status to Review	2026-07-14 06:16:25.678461+00
eb5f6f5b-396f-42ae-a8d7-68c86e475d84	81dd8949-f42e-4623-854f-79e2c879625a	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	created this task	2026-07-22 17:37:30.822594+00
9bbaaa1b-5ed6-4bb7-ba37-0d6478099fd5	f6a984ef-a161-48c5-bebf-f7370725cbe0	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	changed status to Blocked	2026-07-27 11:09:23.974893+00
ac6f7416-aa3d-4177-8ed6-f8cbdf78c6ae	81dd8949-f42e-4623-854f-79e2c879625a	2acd3768-d89d-4838-8800-6d2cb48c84f9	Aman	changed status to Done	2026-07-29 17:39:44.241692+00
3787b060-cb59-4ea8-a931-8bc300a1ccca	26323a30-c892-4063-8c70-a5f8fdab1d5f	2acd3768-d89d-4838-8800-6d2cb48c84f9	Aman	changed status to Done	2026-07-29 17:39:46.613002+00
7228aaf0-87d6-48ac-99f5-1338ec799ee2	9029a5e3-bb4f-4bf4-a246-138249f95649	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	created this task	2026-07-29 17:40:17.816181+00
3f7b332d-770b-4a85-b1c1-d8304b817c47	0f1fbf9c-21d1-416a-878b-1f9a6712da69	89eddcfc-f32c-4f2b-b348-c30d77ce0c4b	Abdul Hans	created this task	2026-08-05 17:08:55.691117+00
\.


ALTER TABLE public.task_activity ENABLE TRIGGER ALL;

--
-- PostgreSQL database dump complete
--

\unrestrict fAdLBtpGa1YdkhrmYgNSTw0IcNjtofvHWc6Apx6z4hJwEePjj8y2PB83GVga9ku

