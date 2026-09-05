# IPC Control Center

I am attaching an HTML visual design file with this prompt. This file contains the complete visual reference for every screen, every page, every component, and every design decision. Please read the entire HTML file and replicate the design exactly as shown — fonts, colors, spacing, layout, card styles, everything.

Project name: IPC Control Center Organization: India Photographers Club

DESIGN SYSTEM — follow this exactly as shown in the HTML file

Typography:

All headings, module names, large numbers, page titles, names, and the logo mark: Cormorant Garamond (weights 300, 400, 500, 600) from Google Fonts

All body text, labels, navigation items, descriptions, button text, input text, tags, meta information: Jost (weights 300, 400, 500) from Google Fonts

Description text size: 13.5px at weight 300

No other fonts anywhere in the system

Color palette — strictly three colors only, no exceptions:

Black: #0a0a0a

White: #ffffff

Gold: #C8A84B

Derived supporting tones only: off-white #F7F6F3, light border #E8E5DE, gold pale #FBF6E9, gold mid #E8D49A, muted text #888888, muted light #BBBBBB

Aesthetic principles:

Apple-level minimal. Maximum whitespace. Nothing decorative.

No gradients anywhere. No box shadows anywhere. No illustrations. No heavy icons.

All borders: 1px solid #E8E5DE

Border radius: 12px for all cards and panels, 9px for all inputs and buttons, 8px for navigation items

Every metric number and stat rendered in Cormorant Garamond

Navigation labels, tags, and category text in Jost 9px uppercase with 0.13em letter spacing

The system must feel premium, royal, clean, serious, and fast

Performance:

The design must be lightweight and fast. No unnecessary animations. No heavy transitions. Keep interactions instant. Speed is a core requirement.

APPLICATION LAYOUT

Fixed left sidebar — 228px wide:

Top section: IPC logo (black circle with gold "IPC" in Cormorant Garamond) + "India Photographers Club" in Cormorant Garamond 14px + "Control Center" in Jost 9px uppercase below

Navigation grouped into three labeled sections: Overview, Tools, People

Active navigation item: gold-pale background + 2.5px gold left border accent

Bottom section: logged-in user pill showing initials avatar (black circle, gold initials in Cormorant Garamond), full name in Cormorant Garamond, role in Jost 10px uppercase, and live login time on the right

Sticky topbar — 56px height:

Left: current page title in Cormorant Garamond 19px

Right: today's date in Jost 12px, search icon button, notification icon button

All icon buttons: 32px square, 1px border, 8px radius

Main content area: scrollable, to the right of the sidebar, max-width 1060px for dashboard

SCREEN 1 — LOGIN PAGE

Centered card on white background, max-width 400px, 1px border, 16px radius, 44px padding.

Top of card:

Black circle logo orb (48px) with gold "IPC" in Cormorant Garamond

"India Photographers Club" in Cormorant Garamond 20px below it

"Control Center" in Jost 9px uppercase muted below that

Two tabs below logo: "Sign In" and "Request Access" — pill toggle, active tab is black with white text, inactive is white with muted text.

Sign In tab:

Email address input field

Password input field

"Sign in to Control Center" button — full width, black background, white Jost text

On successful login: show a gold-pale success bar that says "Signed in successfully — login recorded at [time]" then redirect to dashboard after 1.2 seconds

Login time must be automatically captured at the exact moment of sign in — no manual input

Request Access tab:

Full name input

Email address input

Password input

Role dropdown: Media Buyer, Backend Operations, Community Manager, Content Creator, Operations Lead, Photography Lead

Department input

"Submit access request" button — full width, black

Helper text below: "Your request will be reviewed by the admin. You will receive an email once approved."

SCREEN 2 — DASHBOARD

Page title: "Good morning." in Cormorant Garamond 32px Subtitle: "Welcome to IPC Control Center — everything your team needs, in one place." in Jost 13px light muted

Three stat cards in a row:

Today's ROAS — gold-pale background with gold border, number in gold Cormorant Garamond 40px, label in Jost 9px uppercase

Leads this week — off-white background, number in black Cormorant Garamond 40px

Students in database — off-white background, number in black Cormorant Garamond 40px

Section divider label: "Core tools" in Jost 9px uppercase muted with bottom border

Three module cards in a row:

ROAS Calculator: featured card with gold border and gold-pale background

Student Search: standard white card

Daily Lead Flow: standard white card

Each module card contains: category tag in Jost 9px uppercase, small icon in a 38px rounded square, module name in Cormorant Garamond 20px, description in Jost 13.5px light muted, status dot (live/coming soon), and arrow button that turns black on hover

Section divider: "Announcements" Announcements preview panel showing two most recent announcements with tag, title, body, and date

SCREEN 3 — ROAS CALCULATOR

Back link at top: "← Back to dashboard" in Jost 12px muted Page title: "ROAS Calculator" in Cormorant Garamond 32px

Two-column input grid:

Total ad spend (₹)

Total revenue generated (₹)

Number of leads

Number of conversions

All inputs: 44px height, 1px border, 9px radius, Jost 13px, focus state shows gold border

Live output — updates in real time as user types, no button needed:

Full-width gold-pale card spanning both columns

"Return on ad spend" label in Jost 9px uppercase

ROAS value in Cormorant Garamond 52px gold with × symbol

Contextual note in Jost 12px muted: "Healthy return — above 3× target" / "Moderate — room to optimise" / "Below target — review your creatives"

Three sub-stat cards below in a row:

Cost per lead (₹) — Cormorant Garamond 24px

Conversion rate (%) — Cormorant Garamond 24px

Net profit (₹) — Cormorant Garamond 24px

SCREEN 4 — STUDENT SEARCH

Back link at top Page title: "Student Search" in Cormorant Garamond 32px

Connection section — off-white rounded card:

Label: "Connect Google Sheet"

Input field + "Connect" button side by side

Helper text: "Your sheet must be published to the web as CSV. Go to File → Share → Publish to web → select CSV format → publish."

On connect: green confirmation text "✓ Connected — [X] student records loaded"

Search section:

Large search input: "Type a name to search…"

Live search as user types — no button needed

Results appear instantly as cards below

Each result card: student name in Cormorant Garamond 22px, Phone row with muted label, Email row with muted label

Empty state: "No student found matching that name." centered muted text

Google Sheet columns expected: Column A = Name, Column B = Phone, Column C = Email

SCREEN 5 — DAILY LEAD FLOW

Back link at top Page title: "Daily Lead Flow" in Cormorant Garamond 32px

Log entry form — four columns in a row:

Date (date picker, defaults to today)

Ad Spend ₹ (number input)

Leads (number input)

"Log entry" button in black

Trend chart area — off-white rounded card:

Line chart using Chart.js

Gold colored line #C8A84B

Gold area fill with very low opacity

Gold data point dots with white stroke and border

Lead count labels above each dot

X axis: dates in Jost 11px muted

Y axis: lead counts in Jost 11px muted

Grid lines very subtle

Placeholder shown when fewer than 2 entries exist

Data table below chart:

Columns: Date, Ad Spend ₹, Leads, Cost per Lead, Performance

Performance column: "Strong" in green / "Average" in amber / "Low" in red

Most recent entry at top

Table only shown when entries exist

Row hover: off-white background

SCREEN 6 — TEAM DIRECTORY

Back link at top Page title: "Team Directory" in Cormorant Garamond 32px

Two-column grid of team member cards:

Each card: 1px border, 12px radius, horizontal layout

Initials avatar: 44px black circle, gold initials in Cormorant Garamond (alternating with gold-pale circle variant)

Member name in Cormorant Garamond 17px

Role in Jost 10px uppercase muted below name

Last login time on the right in Jost 10px muted

Card hover: off-white background transition

Data sourced from approved registered users in Supabase

SCREEN 7 — ANNOUNCEMENTS

Back link at top Page title: "Announcements" in Cormorant Garamond 32px

Single panel card with all announcements stacked:

Each announcement: tag pill + title in Cormorant Garamond 18px + body in Jost 13.5px light + date in Jost 10px muted

Tag types: Urgent (red tint #FEF2F2 text #B91C1C border #FECACA) / Update (gold tint) / Info (off-white)

Item hover: off-white background

Read only for team members

Admin can create, edit, delete from Admin Panel

SCREEN 8 — ADMIN PANEL

Visible in sidebar only when logged in as admin account. Back link at top Page title: "Admin Panel" in Cormorant Garamond 32px

Four overview stat cards in a 2x2 grid:

Active team members

Logins today

Pending approvals

Announcements posted

Pending access requests section:

Each pending member shown with name in Cormorant Garamond, role in Jost muted

Approve button: black background white text

Reject button: white background red text red border

On approve: move member to active, send confirmation email

On reject: remove request

Post announcement section — off-white card:

Title input

Body textarea

Tag type dropdown: Info / Update / Urgent

"Post announcement" button black

Today's attendance log — full table:

Columns: Name (Cormorant Garamond), Role, Login Time, Date

All team members who logged in today

Sourced from Supabase attendance_logs table

AUTHENTICATION AND ATTENDANCE SYSTEM

Use Supabase for all backend:

Login flow:

Standard Supabase email and password authentication

On every successful login, automatically insert a record into attendance_logs table: user_id, full_name, role, login_time (timestamp), date

No manual input from the user for attendance — it is captured automatically

Show login time in the sidebar user pill after sign in

Admin account:

One admin account managed via Supabase environment variable

Admin sees Admin Panel in sidebar navigation

Admin can approve or reject pending registrations

Admin can post, edit, delete announcements

Admin can view full attendance log

Registration flow:

New user submits Request Access form

Account created in Supabase with status: pending

Admin approves from Admin Panel — status changes to active

User receives email confirmation on approval

Pending users cannot log in until approved

Supabase tables needed:

users: id, full_name, email, role, department, status (pending/active/admin), created_at

attendance_logs: id, user_id, full_name, role, login_time, date

announcements: id, title, body, tag_type, created_at, created_by

TECH STACK

React with React Router for all page navigation

Tailwind CSS for layout and spacing utilities

Supabase for authentication, database, and row-level security

Chart.js for the Daily Lead Flow trend graph

Google Fonts: Cormorant Garamond and Jost

Single URL deployment

DO NOT BUILD ANY OF THE FOLLOWING

No shoot scheduler

No calendar or events of any kind

No asset library

No analytics module

No dark mode

No mobile layout — desktop only

No social features

No file uploads

No gradients

No shadows

No heavy animations

No slow transitions

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://ipccontrolcenter.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/61610b3f-cb6a-42cd-8e26-0cf1fe90c2c6).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
