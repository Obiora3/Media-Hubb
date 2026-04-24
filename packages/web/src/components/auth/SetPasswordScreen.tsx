import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";

export function SetPasswordScreen() {
  const { setPassword, user } = useAuth();
  const [password, setPasswordVal] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true);
    const { error } = await setPassword(password);
    if (error) setError(error.message);
    setLoading(false);
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-mark">M</div>
          <div>
            <div className="auth-logo-name">MediaHub</div>
            <div className="auth-logo-sub">Media Agency Platform</div>
          </div>
        </div>

        <h2 className="auth-title">Set your password</h2>
        <p style={{ fontSize: 13, color: "var(--text3)", marginBottom: 16, textAlign: "center" }}>
          Welcome! Before you continue, please set a password so you can sign in
          next time.
          {user?.email && (
            <span style={{ display: "block", marginTop: 4, fontWeight: 600, color: "var(--text2)" }}>
              {user.email}
            </span>
          )}
        </p>

        {error && <div className="auth-alert auth-alert-error">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="form-row">
            <label className="form-label" htmlFor="sp-password">New password</label>
            <input
              id="sp-password"
              className="form-input"
              type="password"
              placeholder="Min. 8 characters"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPasswordVal(e.target.value)}
              required
            />
          </div>
          <div className="form-row">
            <label className="form-label" htmlFor="sp-confirm">Confirm password</label>
            <input
              id="sp-confirm"
              className="form-input"
              type="password"
              placeholder="Repeat password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          <button className="btn btn-primary auth-submit" type="submit" disabled={loading}>
            {loading ? "Saving…" : "Set password & continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
