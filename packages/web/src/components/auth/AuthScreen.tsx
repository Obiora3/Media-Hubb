import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";

type Mode = "signin" | "signup" | "reset";

interface AuthScreenProps {
  onSuccess: () => void;
}

const IconMail = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="2" y="4" width="20" height="16" rx="2"/>
    <path d="m22 7-10 7L2 7"/>
  </svg>
);

const IconLock = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="3" y="11" width="18" height="11" rx="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

const IconUser = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

const IconKey = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="7.5" cy="15.5" r="5.5"/>
    <path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>
  </svg>
);

const IconEye = ({ open }: { open: boolean }) => open ? (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
) : (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);

function AuthField({
  label, id, type = "text", value, onChange, placeholder,
  autoComplete, required, icon, hint, inputStyle,
}: {
  label: string; id: string; type?: string; value: string;
  onChange: (v: string) => void; placeholder?: string;
  autoComplete?: string; required?: boolean;
  icon?: React.ReactNode; hint?: string; inputStyle?: React.CSSProperties;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="af-wrap">
      <label className="af-label" htmlFor={id}>{label}</label>
      <div className={`af-box${focused ? " af-focused" : ""}`}>
        <input
          id={id} type={type} className="af-input"
          placeholder={placeholder} autoComplete={autoComplete}
          value={value} onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          required={required} style={inputStyle}
        />
        {icon && <span className="af-icon">{icon}</span>}
      </div>
      {hint && <div className="af-hint">{hint}</div>}
    </div>
  );
}

const DECO_DAYS = [["Mon","19"],["Tue","20"],["Wed","21"],["Thu","22"],["Fri","23"],["Sat","24"]];
const DECO_COLORS = ["#534AB7","#e06b45","#20a060","#c04080"];

function DecoPanel() {
  return (
    <div className="auth-right">
      <div className="auth-deco-bg" />

      {/* Yellow task card */}
      <div className="auth-deco-task">
        <div className="auth-deco-task-header">
          <span className="auth-deco-task-dot" />
          <span className="auth-deco-task-title">Q2 Revenue Target</span>
        </div>
        <div className="auth-deco-task-time">85% of $2.4M goal · On track</div>
        <div className="auth-deco-task-sub">Updated just now</div>
      </div>

      {/* Week strip */}
      <div className="auth-deco-week">
        {DECO_DAYS.map(([d, n]) => (
          <div key={d} className={`auth-deco-day${d === "Wed" ? " auth-deco-day-active" : ""}`}>
            <span className="auth-deco-day-name">{d}</span>
            <span className="auth-deco-day-num">{n}</span>
          </div>
        ))}
      </div>

      {/* Floating avatars */}
      <div className="auth-deco-avs-float">
        {DECO_COLORS.slice(0, 3).map((c, i) => (
          <div key={i} className="auth-deco-av-float" style={{ background: c, zIndex: 3 - i, right: i * 22 }} />
        ))}
      </div>

      {/* White meeting card */}
      <div className="auth-deco-meeting">
        <div className="auth-deco-meeting-top">
          <span className="auth-deco-meeting-dot" />
        </div>
        <div className="auth-deco-meeting-title">Performance Review</div>
        <div className="auth-deco-meeting-time">Monthly KPI tracker</div>
        <div className="auth-deco-meeting-avs">
          {DECO_COLORS.map((c, i) => (
            <div key={i} className="auth-deco-mav" style={{ background: c, marginLeft: i ? -8 : 0 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function AuthScreen({ onSuccess }: AuthScreenProps) {
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");

  const [email, setEmail]                   = useState("");
  const [password, setPassword]             = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName]                     = useState("");
  const [inviteCode, setInviteCode]         = useState("");
  const [showPassword, setShowPassword]     = useState(false);
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState<string | null>(null);
  const [info, setInfo]                     = useState<string | null>(null);

  const clearMessages = () => { setError(null); setInfo(null); };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearMessages();

    if (mode === "signup") {
      if (password !== confirmPassword) { setError("Passwords do not match."); return; }
      if (password.length < 8)          { setError("Password must be at least 8 characters."); return; }
      if (!name.trim())                  { setError("Please enter your full name."); return; }
      if (!inviteCode.trim())            { setError("Please enter your workspace invite code."); return; }
    }

    setLoading(true);
    const timer = setTimeout(() => {
      setLoading(false);
      setError("Connection timed out. Check your internet and try again.");
    }, 10000);

    try {
      if (mode === "signin") {
        const { error } = await signIn(email, password);
        if (error) setError(error.message);
        else onSuccess();

      } else if (mode === "signup") {
        const { error } = await signUp(email, password, name.trim(), inviteCode.trim());
        if (error) setError(error.message);
        else {
          setInfo("Account created! Check your email to confirm your address, then sign in.");
          setMode("signin");
        }

      } else if (mode === "reset") {
        const { error } = await resetPassword(email);
        if (error) setError(error.message);
        else {
          setInfo("Password reset link sent — check your inbox.");
          setMode("signin");
        }
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }

  const go = (m: Mode) => { setMode(m); clearMessages(); };

  return (
    <div className="auth-page">
      <div className="auth-card">

        {/* ── Left panel ── */}
        <div className="auth-left">

          {/* Logo pill */}
          <div className="auth-logo-pill">
            <div className="auth-logo-mark">M</div>
            <span>MediaHub</span>
          </div>

          {/* Form area */}
          <div className="auth-form-area">
            <div className="auth-heading-block">
              <h1 className="auth-heading">
                {mode === "signin" && "Welcome back"}
                {mode === "signup" && "Create an account"}
                {mode === "reset"  && "Reset your password"}
              </h1>
              <p className="auth-subtext">
                {mode === "signin" && "Sign in to your workspace"}
                {mode === "signup" && "Sign up and get started today"}
                {mode === "reset"  && "Enter your email to receive a reset link"}
              </p>
            </div>

            {error && <div className="auth-alert auth-alert-error">{error}</div>}
            {info  && <div className="auth-alert auth-alert-info">{info}</div>}

            <form onSubmit={handleSubmit} noValidate>

              {mode === "signup" && (
                <div className="auth-row-2">
                  <AuthField
                    label="Full name" id="auth-name" value={name} onChange={setName}
                    placeholder="Amaka Okonkwo" autoComplete="name" required icon={<IconUser />}
                  />
                  <AuthField
                    label="Invite code" id="auth-invite"
                    value={inviteCode} onChange={v => setInviteCode(v.toUpperCase())}
                    placeholder="QVTM7X2A" autoComplete="off" required icon={<IconKey />}
                    inputStyle={{ textTransform: "uppercase", letterSpacing: "0.1em" }}
                    hint="Get this from your workspace admin"
                  />
                </div>
              )}

              <AuthField
                label="Email" id="auth-email" type="email"
                value={email} onChange={setEmail}
                placeholder="you@company.com" autoComplete="email" required icon={<IconMail />}
              />

              {mode !== "reset" && (
                <AuthField
                  label="Password" id="auth-password"
                  type={showPassword ? "text" : "password"}
                  value={password} onChange={setPassword}
                  placeholder={mode === "signup" ? "Min. 8 characters" : "••••••••"}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  required
                  icon={
                    <button type="button" className="af-eye-btn"
                      onClick={() => setShowPassword(v => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}>
                      <IconEye open={showPassword} />
                    </button>
                  }
                />
              )}

              {mode === "signup" && (
                <AuthField
                  label="Confirm password" id="auth-confirm"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword} onChange={setConfirmPassword}
                  placeholder="Repeat password" autoComplete="new-password" required icon={<IconLock />}
                />
              )}

              <button type="submit" className="auth-btn-submit" disabled={loading}>
                {loading ? "Please wait…" : (
                  mode === "signin" ? "Sign in" :
                  mode === "signup" ? "Create account" :
                  "Send reset link"
                )}
              </button>

            </form>
          </div>

          {/* Footer */}
          <div className="auth-footer">
            <span className="auth-footer-text">
              {mode === "signin" && <>No account?{" "}<button className="auth-footer-link" onClick={() => go("signup")}>Sign up</button></>}
              {mode === "signup" && <>Have an account?{" "}<button className="auth-footer-link" onClick={() => go("signin")}>Sign in</button></>}
              {mode === "reset"  && <button className="auth-footer-link" onClick={() => go("signin")}>Back to sign in</button>}
            </span>
            {mode === "signin"
              ? <button className="auth-footer-link auth-footer-link-muted" onClick={() => go("reset")}>Forgot password?</button>
              : <span />
            }
          </div>

        </div>

        {/* ── Right decorative panel ── */}
        <DecoPanel />

      </div>
    </div>
  );
}
