import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";

type Mode = "signin" | "signup" | "reset";

interface AuthScreenProps {
  onSuccess: () => void;
}

export function AuthScreen({ onSuccess }: AuthScreenProps) {
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");

  // Form fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const clearMessages = () => { setError(null); setInfo(null); };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearMessages();

    // Inline validation (no async needed)
    if (mode === "signup") {
      if (password !== confirmPassword) { setError("Passwords do not match."); return; }
      if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
      if (!name.trim()) { setError("Please enter your full name."); return; }
      if (!inviteCode.trim()) { setError("Please enter your workspace invite code."); return; }
    }

    setLoading(true);

    // Force-clear loading after 10s so the button never stays stuck if Supabase hangs
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

  return (
    <div className="auth-screen">
      <div className="auth-card">
        {/* Logo */}
        <div className="auth-logo">
          <div className="auth-logo-mark">M</div>
          <div>
            <div className="auth-logo-name">MediaHub</div>
            <div className="auth-logo-sub">Media Agency Platform</div>
          </div>
        </div>

        <h2 className="auth-title">
          {mode === "signin" && "Sign in to your account"}
          {mode === "signup" && "Create your account"}
          {mode === "reset" && "Reset your password"}
        </h2>

        {error && <div className="auth-alert auth-alert-error">{error}</div>}
        {info  && <div className="auth-alert auth-alert-info">{info}</div>}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>

          {mode === "signup" && (
            <>
              <div className="form-row">
                <label className="form-label" htmlFor="auth-name">Full name</label>
                <input
                  id="auth-name"
                  className="form-input"
                  type="text"
                  placeholder="Amaka Okonkwo"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="form-row">
                <label className="form-label" htmlFor="auth-invite-code">Workspace invite code</label>
                <input
                  id="auth-invite-code"
                  className="form-input"
                  type="text"
                  placeholder="e.g. QVTM7X2A"
                  autoComplete="off"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  required
                  style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}
                />
                <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4 }}>
                  Get this code from your workspace admin
                </div>
              </div>
            </>
          )}

          <div className="form-row">
            <label className="form-label" htmlFor="auth-email">Email address</label>
            <input
              id="auth-email"
              className="form-input"
              type="email"
              placeholder="you@company.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {mode !== "reset" && (
            <div className="form-row">
              <label className="form-label" htmlFor="auth-password">Password</label>
              <div style={{ position: "relative" }}>
                <input
                  id="auth-password"
                  className="form-input"
                  type={showPassword ? "text" : "password"}
                  placeholder={mode === "signup" ? "Min. 8 characters" : "••••••••"}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ paddingRight: 40 }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text3)", fontSize: 14, padding: 0, lineHeight: 1 }}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >{showPassword ? "Hide" : "Show"}</button>
              </div>
            </div>
          )}

          {mode === "signup" && (
            <div className="form-row">
              <label className="form-label" htmlFor="auth-confirm">Confirm password</label>
              <div style={{ position: "relative" }}>
                <input
                  id="auth-confirm"
                  className="form-input"
                  type={showPassword ? "text" : "password"}
                  placeholder="Repeat password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  style={{ paddingRight: 40 }}
                  required
                />
              </div>
            </div>
          )}

          <button className="btn btn-primary auth-submit" type="submit" disabled={loading}>
            {loading ? "Please wait…" : (
              mode === "signin" ? "Sign in" :
              mode === "signup" ? "Create account" :
              "Send reset link"
            )}
          </button>
        </form>

        <div className="auth-links">
          {mode === "signin" && (
            <>
              <button className="auth-link" onClick={() => { setMode("signup"); clearMessages(); }}>
                Don't have an account? Sign up
              </button>
              <button className="auth-link auth-link-muted" onClick={() => { setMode("reset"); clearMessages(); }}>
                Forgot password?
              </button>
            </>
          )}
          {mode === "signup" && (
            <button className="auth-link" onClick={() => { setMode("signin"); clearMessages(); }}>
              Already have an account? Sign in
            </button>
          )}
          {mode === "reset" && (
            <button className="auth-link" onClick={() => { setMode("signin"); clearMessages(); }}>
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
