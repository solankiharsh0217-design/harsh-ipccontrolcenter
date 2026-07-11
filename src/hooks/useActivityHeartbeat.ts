import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Privacy-safe activity heartbeat.
 *
 * Rules:
 * - Only runs when tab is VISIBLE and window is FOCUSED.
 * - Only counts a minute if the user showed input activity
 *   (mouse move, click, keydown, scroll, touch) within `idleTimeoutMs`.
 * - Sends a single RPC call per minute (server also enforces once-per-minute).
 * - NEVER captures keystrokes, screenshots, mouse coordinates, or page content.
 * - Server-side RPC is a no-op unless admin has enabled active tracking and the
 *   user has an attendance session for today (i.e. checked in).
 */
export function useActivityHeartbeat(opts: { enabled: boolean; idleTimeoutMinutes?: number }) {
  const { enabled, idleTimeoutMinutes = 5 } = opts;
  const lastActivityRef = useRef<number>(Date.now());
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const idleMs = Math.max(1, idleTimeoutMinutes) * 60_000;
    const bump = () => { lastActivityRef.current = Date.now(); };

    // Passive listeners; no data is captured, only timestamps are updated locally.
    const events: Array<[keyof WindowEventMap, boolean]> = [
      ["mousemove", true], ["mousedown", true], ["keydown", true],
      ["scroll", true], ["touchstart", true], ["click", true],
    ];
    events.forEach(([e, passive]) => window.addEventListener(e, bump, { passive } as any));

    const tick = async () => {
      try {
        const visible = document.visibilityState === "visible";
        const focused = document.hasFocus();
        const activeRecently = Date.now() - lastActivityRef.current <= idleMs;
        if (!visible || !focused || !activeRecently) return;
        const sb: any = supabase;
        await sb.rpc("record_active_minute");
      } catch { /* non-fatal */ }
    };

    // Fire once shortly after mount, then every 60s.
    const first = window.setTimeout(tick, 5000);
    timerRef.current = window.setInterval(tick, 60_000);

    return () => {
      events.forEach(([e]) => window.removeEventListener(e, bump));
      window.clearTimeout(first);
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [enabled, idleTimeoutMinutes]);
}
