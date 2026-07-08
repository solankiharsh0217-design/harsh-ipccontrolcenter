import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function ResetPassword() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // Supabase recovery links land here with a token in the URL hash.
    // The client picks it up automatically and fires a PASSWORD_RECOVERY event.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setHasSession(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setHasSession(true);
      setReady(true);
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (pw.length < 8) { setErr("Password must be at least 8 characters."); return; }
    if (pw !== pw2) { setErr("Passwords do not match."); return; }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      toast.success("Password updated. Please sign in with your new password.");
      await supabase.auth.signOut();
      nav("/login", { replace: true });
    } catch (e: any) {
      setErr(e?.message ?? "Failed to update password");
    } finally {
      setSaving(false);
    }
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-off">
      <div className="w-full max-w-[400px] bg-white border border-line rounded-xl p-6">
        <h1 className="font-serif text-[20px] font-medium text-black mb-1">Reset your password</h1>
        <p className="font-sans text-[12px] text-muted-foreground mb-4">
          Set a new password for your Control Center account.
        </p>

        {!hasSession ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 text-amber-800 p-3 font-sans text-[12px]">
            This reset link is invalid or expired. Please request a new password reset from your admin, or from the login screen.
            <div className="mt-3">
              <button onClick={() => nav("/login")} className="ipc-btn ipc-btn-black h-8 px-3 text-[12px]">Back to sign in</button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="font-sans text-[11px] text-muted-foreground block mb-1">New password</label>
              <input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete="new-password"
                className="w-full h-10 px-3 rounded-md border border-line text-[13px]"
                placeholder="At least 8 characters"
                required
              />
            </div>
            <div>
              <label className="font-sans text-[11px] text-muted-foreground block mb-1">Confirm new password</label>
              <input
                type="password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                autoComplete="new-password"
                className="w-full h-10 px-3 rounded-md border border-line text-[13px]"
                required
              />
            </div>
            {err && <div className="text-red-700 text-[12px] font-sans">{err}</div>}
            <button
              type="submit"
              disabled={saving}
              className="ipc-btn ipc-btn-black w-full h-10 text-[13px] disabled:opacity-50"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5 inline" />}
              Update password
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
