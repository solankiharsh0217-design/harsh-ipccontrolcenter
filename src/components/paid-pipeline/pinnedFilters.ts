import { useCallback, useEffect, useState } from "react";

export const PINNED_FILTERS_KEY = "paid-pipeline-pinned-filters";

export type PinnedFilterKey =
  | "dateRange"
  | "stage"
  | "priority"
  | "owner"
  | "financeStatus"
  | "financePartner"
  | "tags"
  | "followUp"
  | "webinarBatches"
  | "paidBatches"
  | "onboardingBatches"
  | "revenueStatus"
  | "paymentStatus";

export const FILTER_LABELS: { key: PinnedFilterKey; label: string }[] = [
  { key: "dateRange", label: "Date range" },
  { key: "stage", label: "Stage" },
  { key: "priority", label: "Priority" },
  { key: "owner", label: "Owner" },
  { key: "financeStatus", label: "Finance status" },
  { key: "financePartner", label: "Finance partner" },
  { key: "tags", label: "Tags" },
  { key: "followUp", label: "Follow-up" },
  { key: "webinarBatches", label: "Webinar batches" },
  { key: "paidBatches", label: "Paid batches" },
  { key: "onboardingBatches", label: "Onboarding batches" },
  { key: "revenueStatus", label: "Revenue status" },
  { key: "paymentStatus", label: "Payment status" },
];

export const DEFAULT_PINNED: PinnedFilterKey[] = ["dateRange", "stage", "owner"];

const ALL_KEYS = new Set(FILTER_LABELS.map((f) => f.key));

function readStored(): PinnedFilterKey[] {
  try {
    const raw = localStorage.getItem(PINNED_FILTERS_KEY);
    if (!raw) return DEFAULT_PINNED;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_PINNED;
    return parsed.filter((k): k is PinnedFilterKey => typeof k === "string" && ALL_KEYS.has(k as PinnedFilterKey));
  } catch {
    return DEFAULT_PINNED;
  }
}

/** Per-device UI preference for which filters are pinned to the front of the page. */
export function usePinnedFilters() {
  const [pinned, setPinned] = useState<PinnedFilterKey[]>(() => readStored());

  useEffect(() => {
    try {
      localStorage.setItem(PINNED_FILTERS_KEY, JSON.stringify(pinned));
    } catch {
      /* storage unavailable — preference simply won't persist */
    }
  }, [pinned]);

  const isPinned = useCallback((k: PinnedFilterKey) => pinned.includes(k), [pinned]);

  const toggle = useCallback((k: PinnedFilterKey) => {
    setPinned((prev) =>
      prev.includes(k)
        ? prev.filter((x) => x !== k)
        : [...FILTER_LABELS.map((f) => f.key)].filter((key) => key === k || prev.includes(key)),
    );
  }, []);

  const reset = useCallback(() => setPinned(DEFAULT_PINNED), []);

  return { pinned, isPinned, toggle, reset };
}
