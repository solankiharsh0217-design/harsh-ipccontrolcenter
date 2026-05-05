import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { formatTime } from "@/lib/format";
import { toast } from "sonner";

const ROLES = ["Media Buyer","Backend Operations","Community Manager","Content Creator","Operations Lead","Photography Lead"];

export default function Login() {
  const [tab, setTab] = useState<"signin"|"register">("signin");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const nav = useNavigate();
  const { setLoginTime } = useAuth();

  // Sign in
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Register
  const [rName, setRName] = useState("");
  const [rEmail, setREmail] = useState("");
  const [rPass, setRPass] = useState("");
  const [rRole, setRRole] = useState("");
  const [rDept, setRDept] = useState("");

  const doLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return toast.error("Enter email and password.");
    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setBusy(false); return toast.error(error.message); }
    const t = formatTime(new Date());
    // attendance log
    if (data.user) {
      const { data: prof } = await supabase.from("profiles").select("full_name, role, status").eq("id", data.user.id).maybeSingle();
      if (prof?.status === "active") {
        await supabase.from("attendance_logs").insert({
          user_id: data.user.id,
          full_name: prof.full_name,
          role: prof.role,
        });
      }
    }
    setLoginTime(t);
    setSuccess(t);
    setTimeout(() => nav("/"), 1200);
  };

  const doRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rName || !rEmail || !rPass || !rRole) return toast.error("Please fill all required fields.");
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: rEmail,
      password: rPass,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { full_name: rName, role: rRole, department: rDept },
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Access requested. The admin will review your account.");
    setTab("signin");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-6">
      <div className="w-full max-w-[400px] border border-line rounded-2xl p-11 bg-white">
        <div className="text-center mb-9">
          <div className="w-12 h-12 rounded-full bg-black flex items-center justify-center mx-auto mb-3.5">
            <span className="font-serif text-sm text-gold font-medium tracking-wider">IPC</span>
          </div>
          <h1 className="font-serif text-xl font-normal text-black">India Photographers Club</h1>
          <div className="font-sans text-[9px] uppercase tracking-[0.16em] text-muted-foreground mt-1">Control Center</div>
        </div>

        <div className="flex border border-line rounded-md overflow-hidden mb-7">
          {(["signin","register"] as const).map((t,i) => (
            <button
              key={t}
              onClick={() => { setTab(t); setSuccess(null); }}
              className={`flex-1 h-[38px] font-sans text-xs font-medium transition-colors ${tab===t ? "bg-black text-white" : "bg-white text-muted-foreground"}`}
            >
              {t === "signin" ? "Sign In" : "Request Access"}
            </button>
          ))}
        </div>

        {tab === "signin" && (
          <form onSubmit={doLogin}>
            {success && (
              <div className="bg-gold-pale border border-gold-mid rounded-lg px-4 py-3 mb-5 font-sans text-xs text-gold-deep">
                ✓ Signed in successfully — login recorded at {success}
              </div>
            )}
            <div className="mb-5">
              <label className="form-label">Email address</label>
              <input className="ipc-input" type="email" placeholder="yourname@ipc.in" value={email} onChange={(e)=>setEmail(e.target.value)} />
            </div>
            <div className="mb-5">
              <label className="form-label">Password</label>
              <input className="ipc-input" type="password" placeholder="••••••••" value={password} onChange={(e)=>setPassword(e.target.value)} />
            </div>
            <button disabled={busy} className="ipc-btn ipc-btn-black w-full mt-1" type="submit">
              {busy ? "Signing in…" : "Sign in to Control Center"}
            </button>
          </form>
        )}

        {tab === "register" && (
          <form onSubmit={doRegister}>
            <div className="mb-5"><label className="form-label">Full name</label>
              <input className="ipc-input" value={rName} onChange={(e)=>setRName(e.target.value)} placeholder="Your full name" /></div>
            <div className="mb-5"><label className="form-label">Email address</label>
              <input className="ipc-input" type="email" value={rEmail} onChange={(e)=>setREmail(e.target.value)} placeholder="yourname@ipc.in" /></div>
            <div className="mb-5"><label className="form-label">Password</label>
              <input className="ipc-input" type="password" value={rPass} onChange={(e)=>setRPass(e.target.value)} placeholder="Choose a password" /></div>
            <div className="mb-5"><label className="form-label">Role</label>
              <select className="ipc-input cursor-pointer" value={rRole} onChange={(e)=>setRRole(e.target.value)}>
                <option value="" disabled>Select your role</option>
                {ROLES.map(r => <option key={r}>{r}</option>)}
              </select></div>
            <div className="mb-5"><label className="form-label">Department</label>
              <input className="ipc-input" value={rDept} onChange={(e)=>setRDept(e.target.value)} placeholder="e.g. Marketing, Education" /></div>
            <button disabled={busy} className="ipc-btn ipc-btn-black w-full mt-1" type="submit">
              {busy ? "Submitting…" : "Submit access request"}
            </button>
            <p className="font-sans text-[11px] text-muted-foreground text-center mt-3.5 leading-relaxed">
              Your request will be reviewed by the admin. You will receive an email once approved.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
