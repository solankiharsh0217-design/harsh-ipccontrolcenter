// Scroll-into-view + temporary pulse highlight for a Kanban card.
// Use by setting data-lead-card-id={id} on the card element.

import { useEffect } from "react";

export function useFocusKanbanCard(targetId: string | null | undefined, deps: any[] = []) {
  useEffect(() => {
    if (!targetId) return;
    let cancelled = false;
    let timer: any = null;
    let attempt = 0;
    const tryFocus = () => {
      if (cancelled) return;
      const el = document.querySelector<HTMLElement>(`[data-lead-card-id="${targetId}"]`);
      if (el) {
        try { el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" }); } catch {}
        el.classList.add("data-focus-pulse");
        timer = setTimeout(() => el.classList.remove("data-focus-pulse"), 3200);
        return;
      }
      if (attempt++ < 20) timer = setTimeout(tryFocus, 150);
    };
    // Defer until paint
    timer = setTimeout(tryFocus, 80);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId, ...deps]);
}
