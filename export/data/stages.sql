--
-- PostgreSQL database dump
--

\restrict SMM2CpdcMW8U8ZPZEptqeSbbp0vvjiZvIVNFgPVwwWwBO6IsCUMHsae9X5zelpR

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
-- Data for Name: stages; Type: TABLE DATA; Schema: public; Owner: -
--

SET SESSION AUTHORIZATION DEFAULT;

ALTER TABLE public.stages DISABLE TRIGGER ALL;

COPY public.stages (id, pipeline_id, name, color, "position", is_protected, is_won, is_lost, created_at, is_active) FROM stdin;
3eb8f2b5-c5e7-4e41-8b7c-a55f46465dd3	10eb9d2c-99a3-4f2e-9366-7cd73e4acb4c	New	purple	0	f	f	f	2026-05-06 02:55:50.982338+00	t
beed9b63-29bc-4c46-a4c9-2ea9bc20d6a5	10eb9d2c-99a3-4f2e-9366-7cd73e4acb4c	Not Reachable	gray	8	f	f	f	2026-05-06 02:55:50.982338+00	t
d77dce6b-b944-436f-9d6d-eda7df399484	36004cf1-0062-4953-bad7-ccd39c7e7efc	New Assignment	gray	0	f	f	f	2026-05-25 02:47:01.860206+00	t
5248752c-b35e-476a-9a00-bf28f2e9589e	36004cf1-0062-4953-bad7-ccd39c7e7efc	Client Contact Pending	amber	1	f	f	f	2026-05-25 02:47:01.860206+00	t
6320fff1-a4b4-4c47-a067-22412488ef93	36004cf1-0062-4953-bad7-ccd39c7e7efc	Client Contacted	blue	2	f	f	f	2026-05-25 02:47:01.860206+00	t
751e7302-c27f-4dac-b38b-fa012d89e671	36004cf1-0062-4953-bad7-ccd39c7e7efc	Ad Access Requested	blue	3	f	f	f	2026-05-25 02:47:01.860206+00	t
d3b56c46-051c-4dc0-9853-4d95e62cd3aa	36004cf1-0062-4953-bad7-ccd39c7e7efc	Ad Access Received	indigo	4	f	f	f	2026-05-25 02:47:01.860206+00	t
2019432b-955b-4eef-8d92-41d787437a66	36004cf1-0062-4953-bad7-ccd39c7e7efc	Ads Launched	green	5	f	f	f	2026-05-25 02:47:01.860206+00	t
8e475c87-71d1-4d3a-8a29-c5031860c174	36004cf1-0062-4953-bad7-ccd39c7e7efc	Optimization Ongoing	green	6	f	f	f	2026-05-25 02:47:01.860206+00	t
87efe8a4-214c-48d0-966f-cd88bc0861ec	36004cf1-0062-4953-bad7-ccd39c7e7efc	Paused	amber	7	f	f	f	2026-05-25 02:47:01.860206+00	t
13a6cafe-046d-4720-b386-a68058b4c111	36004cf1-0062-4953-bad7-ccd39c7e7efc	Stopped	red	8	f	f	f	2026-05-25 02:47:01.860206+00	t
d5756e26-642d-4d0a-bbca-985dfa960307	36004cf1-0062-4953-bad7-ccd39c7e7efc	Completed	purple	9	f	f	f	2026-05-25 02:47:01.860206+00	t
33657bb6-7a0a-4617-b3e2-fe3f1fc89aad	36004cf1-0062-4953-bad7-ccd39c7e7efc	Issue / Escalation	red	10	f	f	f	2026-05-25 02:47:01.860206+00	t
c3f3a270-4dbd-4c82-9cc3-d4bb0199ddcd	10eb9d2c-99a3-4f2e-9366-7cd73e4acb4c	Not connected	gray	9	f	f	f	2026-05-27 13:49:07.696875+00	t
ec731076-08c7-431f-a81b-62399454dccf	7629660f-13d9-4b95-8eab-38a0071bd4fb	Payment Confirmed	green	0	f	f	f	2026-05-28 14:50:09.693789+00	t
1b33cc4c-9ecf-4072-b683-059d41b28908	7629660f-13d9-4b95-8eab-38a0071bd4fb	Welcome Call Done	blue	1	f	f	f	2026-05-28 14:50:09.693789+00	t
c50dca72-8a96-40f6-b7cc-facffc8634b7	7629660f-13d9-4b95-8eab-38a0071bd4fb	Onboarding Call Done	blue	2	f	f	f	2026-05-28 14:50:09.693789+00	t
472c37ff-0d77-4ed5-9eb2-b8c9df98aae0	7629660f-13d9-4b95-8eab-38a0071bd4fb	Documents Requested	amber	3	f	f	f	2026-05-28 14:50:09.693789+00	t
62f9d1b0-86df-4a24-9dff-96b1508a229f	7629660f-13d9-4b95-8eab-38a0071bd4fb	Documents Received	amber	4	f	f	f	2026-05-28 14:50:09.693789+00	t
1d61e162-3dee-4e59-9afa-970f6ff128f8	7629660f-13d9-4b95-8eab-38a0071bd4fb	Bajaj Finance Submitted	purple	5	f	f	f	2026-05-28 14:50:09.693789+00	t
fbd8bd43-1537-48a5-be81-9c60217d3281	7629660f-13d9-4b95-8eab-38a0071bd4fb	Finance Approved	green	6	f	f	f	2026-05-28 14:50:09.693789+00	t
ee884513-1b61-4661-8eac-784dc22148bf	7629660f-13d9-4b95-8eab-38a0071bd4fb	Active Member	green	9	t	t	f	2026-05-28 14:50:09.693789+00	t
d839f2a4-2792-4634-bea4-566ac1686e98	10eb9d2c-99a3-4f2e-9366-7cd73e4acb4c	call back	gold	4	f	f	f	2026-05-06 02:55:50.982338+00	f
30cf47c8-b6f7-4662-9faf-0014b04d6e01	7629660f-13d9-4b95-8eab-38a0071bd4fb	Code of Conduct Sign	gold	7	f	f	f	2026-05-28 14:50:09.693789+00	t
d23266c7-1cbf-4962-b9e1-7a07a04d8964	10eb9d2c-99a3-4f2e-9366-7cd73e4acb4c	Already a Diamond Member	gray	10	f	f	f	2026-05-29 03:31:01.264899+00	t
de071356-d766-434f-a56d-1ccdefd0e508	10eb9d2c-99a3-4f2e-9366-7cd73e4acb4c	Conversion Successful	gray	11	f	f	f	2026-05-30 07:58:35.465324+00	t
df802e82-1aab-46f6-8cae-705a36e9249d	10eb9d2c-99a3-4f2e-9366-7cd73e4acb4c	Not interested	blue	5	f	f	f	2026-05-06 02:55:50.982338+00	t
227eac0e-724b-47c9-b2d4-05fda38becf7	10eb9d2c-99a3-4f2e-9366-7cd73e4acb4c	Financial issues	green	6	t	t	f	2026-05-06 02:55:50.982338+00	t
3f77cf45-4de2-4e3f-a83e-9094f273b298	10eb9d2c-99a3-4f2e-9366-7cd73e4acb4c	During call Tecnical error	red	7	t	f	t	2026-05-06 02:55:50.982338+00	t
c308eab6-73dc-4d38-a738-3f02d0bd9685	10eb9d2c-99a3-4f2e-9366-7cd73e4acb4c	Not attend full webinar	pink	12	f	f	f	2026-06-08 12:00:46.736694+00	t
e18d48e9-9260-4f3b-9abf-c4b6ae22acf1	10eb9d2c-99a3-4f2e-9366-7cd73e4acb4c	Connected	blue	3	f	f	f	2026-05-06 02:55:50.982338+00	t
5ab314b1-67f1-42d8-bf3f-85919944e8a2	10eb9d2c-99a3-4f2e-9366-7cd73e4acb4c	Wrong number	amber	13	f	f	f	2026-06-09 05:52:34.17778+00	t
79ffddb9-0cff-46e0-b318-bc2ed7a09fc6	7629660f-13d9-4b95-8eab-38a0071bd4fb	REFUND	red	10	f	f	f	2026-06-13 06:30:35.03374+00	t
1302273e-92a5-4ba6-8ac1-59d3c54a0ee7	7629660f-13d9-4b95-8eab-38a0071bd4fb	Access & WhatsApp Group Joined	green	8	t	f	f	2026-05-28 14:50:09.693789+00	t
392f355c-ad58-4fac-88f6-b7c343d87e5f	10eb9d2c-99a3-4f2e-9366-7cd73e4acb4c	Join later	amber	14	f	f	f	2026-06-25 11:28:34.249217+00	t
e652c921-0b93-47f0-b651-ee561e968ddf	10eb9d2c-99a3-4f2e-9366-7cd73e4acb4c	Follow-up Scheduled	amber	1	f	f	f	2026-05-06 02:55:50.982338+00	t
dd7c8f70-bd54-4458-8217-d896e98b9940	10eb9d2c-99a3-4f2e-9366-7cd73e4acb4c	call disconnected	gray	2	f	f	f	2026-05-06 02:55:50.982338+00	t
1f662fc2-dd7f-4cb0-acfc-20cd36830c3a	a56bd7ab-71e0-4deb-ad7a-75c76392884b	Payment Confirmed	green	0	f	f	f	2026-06-26 14:53:24.158749+00	t
c95fa8b6-1594-4bea-aa6f-2168545f3662	a56bd7ab-71e0-4deb-ad7a-75c76392884b	Welcome Call Done	blue	1	f	f	f	2026-06-26 14:53:24.158749+00	t
48f6a525-2d45-447c-92c3-5feb9d30652b	a56bd7ab-71e0-4deb-ad7a-75c76392884b	Onboarding Call Done	blue	2	f	f	f	2026-06-26 14:53:24.158749+00	t
58f4bd9e-43e5-44f8-b25e-2afe01a0f2b2	a56bd7ab-71e0-4deb-ad7a-75c76392884b	Documents Requested	amber	3	f	f	f	2026-06-26 14:53:24.158749+00	t
f297cb1b-ea9c-42ed-bcf9-163d4365fa4e	a56bd7ab-71e0-4deb-ad7a-75c76392884b	Documents Received	amber	4	f	f	f	2026-06-26 14:53:24.158749+00	t
6be4120a-16ca-460b-9e1f-cfe37e245d09	a56bd7ab-71e0-4deb-ad7a-75c76392884b	Bajaj Finance Submitted	purple	5	f	f	f	2026-06-26 14:53:24.158749+00	t
fd99eb44-6350-4c3f-8845-a5691ea7bcba	a56bd7ab-71e0-4deb-ad7a-75c76392884b	Finance Approved	green	6	f	f	f	2026-06-26 14:53:24.158749+00	t
a400a6ad-192f-484d-b9f7-4434ccef334c	a56bd7ab-71e0-4deb-ad7a-75c76392884b	Code of Conduct Signed	gold	7	f	f	f	2026-06-26 14:53:24.158749+00	t
33269104-874a-468e-a2c2-d91e870ef919	a56bd7ab-71e0-4deb-ad7a-75c76392884b	Access Given	green	8	t	f	f	2026-06-26 14:53:24.158749+00	t
53ceee6e-a893-42ae-8063-db57616923fe	a56bd7ab-71e0-4deb-ad7a-75c76392884b	Active Member	green	9	t	t	f	2026-06-26 14:53:24.158749+00	t
07585000-d6c2-4f4e-8374-c9bdb295c1a3	10eb9d2c-99a3-4f2e-9366-7cd73e4acb4c	Another profession	gray	15	f	f	f	2026-07-04 04:56:38.746481+00	t
\.


ALTER TABLE public.stages ENABLE TRIGGER ALL;

--
-- PostgreSQL database dump complete
--

\unrestrict SMM2CpdcMW8U8ZPZEptqeSbbp0vvjiZvIVNFgPVwwWwBO6IsCUMHsae9X5zelpR

