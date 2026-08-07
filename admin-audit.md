# Phase 4 Audit: Admin Centre

## Files
- `src/pages/AdminCenter.tsx`: The primary hub (grid of cards) for all admin-related modules.
- `src/pages/MasterSettings.tsx`: The core business engine configuration (Business Profile, Products, Pipeline stages, etc.).
- `src/pages/Admin.tsx`: The "Admin Panel" for user management (Add Member), announcements, and student sync.
- `src/pages/MasterData.tsx`: Flat list management for `quick_save_entries` (Webinar names, Media Buyers, etc.).
- `src/pages/admin/CompanySettings.tsx` & `InvoiceSettings.tsx`: Invoice-specific identity and tax config.
- `src/components/admin/`: Component library for specific admin sub-sections.

## Current Structure
The Admin Centre is a **Hub-and-Spoke model**. `AdminCenter.tsx` serves as the central directory, linking out to standalone pages (spokes). Most "settings" pages use internal section navigation (e.g., `MasterSettings.tsx` has a vertical side nav).

## Modules & Features
- **Identity & Legal**: Business Profile, Company Settings (GSTIN, Bank), Invoice Settings (Numbering, Taxes).
- **Core Operations**: Products/Programs (Revenue rules, pricing), Pipeline Stages, Conversion Rules, Handoff Rules.
- **Team & Access**: Team Directory, Admin Panel (Add Member/Presets), Access Templates, Assignment Eligibility.
- **Reporting & Data**: Audit Log, System Refinement Checklist, Lead Rescue Search, Master Data (Dropdowns).
- **Performance**: Team Performance OS (KPIs, Rewards, Reviews).

## Sensitive Configuration & Side-Effects
1.  **Revenue Recognition Rules**: In `MasterSettings.tsx` -> `Products`. Changing these affects financial reporting calculations across the app.
2.  **GST/Tax Config**: In `InvoiceSettings.tsx` and `CompanySettings.tsx`. Directly affects invoice generation and tax liability reporting.
3.  **User Module Access**: In `Admin.tsx` (Add Member) and `AccessTemplates.tsx`. Controls RLS-bypassing/enforcing module visibility.
4.  **Operations Handoff Rules**: Defined in `MasterSettings.tsx`. Automates record movement between departments; incorrect rules can block sales-to-ops flow.
5.  **Danger Zone (Clean Slate)**: `src/pages/CleanSlate.tsx`. Hard wipe of lead data. Extremely sensitive.
6.  **Code of Conduct Automation**: `CompanySettings.tsx`. Automatically moves pipeline stages based on signing status.

Do not make any code changes yet.
