import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { fetchMyAppraisal, type AppraisalSummary } from "@/lib/accountabilityData";

/** This month's Appraisal Score (0–1000) for the signed-in person. */
export function useMyScore() {
  const { user } = useAuth();
  const [data, setData] = useState<AppraisalSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) { setLoading(false); return; }
    (async () => {
      try {
        const res = await fetchMyAppraisal(user.id);
        if (!cancelled) setData(res);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  return { data, loading };
}
