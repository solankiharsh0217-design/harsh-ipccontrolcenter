// Access Follow-up ↔ CRM deep-link helpers.
//
// The Access Follow-up tab (Finance Success Dashboard) opens the existing CRM
// LeadDrawer via `/crm?lead=<id>&focus=code-of-conduct`. To let verifiers
// return to Access Follow-up (with filters preserved) after Save & Return /
// Cancel / X, we embed an internal `returnTo` path in the URL and cache
// view state in sessionStorage.

export const ACCESS_FOLLOWUP_ORIGIN = "access-followup";
export const ACCESS_FOLLOWUP_ROUTE = "/finance-success-dashboard";
export const ACCESS_FOLLOWUP_STATE_KEY = "ipc.accessFollowup.viewState.v1";

export interface AccessFollowupViewState {
  view: "members" | "daily";
  quick: string;
  search: string;
  ownerFilter: string[];
  batchFilter: string[];
  scrollY: number;
  updatedAt: number;
}

/** Validate that a return path is a same-origin internal application path. */
export function isSafeInternalPath(raw: string | null | undefined): boolean {
  if (!raw) return false;
  if (typeof raw !== "string") return false;
  if (!raw.startsWith("/")) return false;
  if (raw.startsWith("//")) return false; // protocol-relative
  if (raw.startsWith("/\\")) return false;
  // Disallow embedded schemes / hosts
  if (/^\/[^/]*:\/\//.test(raw)) return false;
  if (/[\r\n\t]/.test(raw)) return false;
  return true;
}

/** Sanitize a return path or fall back to the Access Follow-up tab. */
export function safeReturnTo(raw: string | null | undefined): string {
  if (isSafeInternalPath(raw)) return raw as string;
  return `${ACCESS_FOLLOWUP_ROUTE}?tab=access`;
}

/** Build a CRM deep link that carries origin + returnTo metadata. */
export function buildCrmDeepLinkFromAccessFollowup(
  crmLeadId: string,
  opts?: { focus?: string; returnTo?: string },
): string {
  const focus = opts?.focus ?? "code-of-conduct";
  const returnTo = safeReturnTo(opts?.returnTo);
  const params = new URLSearchParams({
    lead: crmLeadId,
    focus,
    origin: ACCESS_FOLLOWUP_ORIGIN,
    returnTo,
  });
  return `/crm?${params.toString()}`;
}

/** Serialise the current Access Follow-up view state before navigating away. */
export function persistAccessFollowupState(state: AccessFollowupViewState): void {
  try {
    sessionStorage.setItem(ACCESS_FOLLOWUP_STATE_KEY, JSON.stringify(state));
  } catch { /* sessionStorage unavailable */ }
}

/** Read + clear (peek only) the cached Access Follow-up view state. */
export function readAccessFollowupState(): AccessFollowupViewState | null {
  try {
    const raw = sessionStorage.getItem(ACCESS_FOLLOWUP_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AccessFollowupViewState;
    // Ignore entries older than 2 hours to avoid stale restores.
    if (!parsed?.updatedAt || Date.now() - parsed.updatedAt > 2 * 60 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Build the canonical Access Follow-up returnTo path (also usable as fallback). */
export function accessFollowupReturnPath(): string {
  return `${ACCESS_FOLLOWUP_ROUTE}?tab=access`;
}
