import { useState, useEffect, useRef } from "react";
import type { Session, User, AuthError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/types";

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  needsPassword: boolean;
}

interface SignInResult {
  error: AuthError | null;
}

interface SignUpResult {
  error: AuthError | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    profile: null,
    loading: true,
    needsPassword: typeof window !== "undefined" &&
      (window.location.hash.includes("type=invite") ||
       window.location.hash.includes("type=recovery")),
  });

  // Prevent concurrent or duplicate profile fetches for the same user
  const fetchingForRef = useRef<string | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearFallback() {
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }

  useEffect(() => {
    // Only fires if Supabase never responds at all (completely unreachable project).
    // Cleared immediately once any auth event arrives.
    fallbackTimerRef.current = setTimeout(() => {
      setState((s) => s.loading ? { ...s, loading: false } : s);
    }, 8000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Supabase is responding — cancel the no-response fallback immediately.
      clearFallback();

      if (event === "PASSWORD_RECOVERY") {
        setState((s) => ({ ...s, needsPassword: true, session, user: session?.user ?? null, loading: false }));
        return;
      }

      if (event === "SIGNED_OUT" || !session) {
        setState({ session: null, user: null, profile: null, loading: false, needsPassword: false });
        return;
      }

      // Session present — update session/user immediately, then fetch profile.
      setState((s) => ({ ...s, session, user: session.user }));
      fetchProfile(session.user);
    });

    return () => {
      clearFallback();
      subscription.unsubscribe();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchProfile(authUser: User) {
    if (fetchingForRef.current === authUser.id) return;
    fetchingForRef.current = authUser.id;

    // Profile-specific timeout: if the profiles table query hangs, stop after 15s.
    // This is separate from the auth fallback so a slow DB doesn't flash the error screen.
    const profileTimeoutId = setTimeout(() => {
      fetchingForRef.current = null;
      setState((s) => ({ ...s, loading: false }));
    }, 15000);

    try {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .single();

      const metadataName =
        (authUser.user_metadata?.name as string | undefined)
        ?? (authUser.user_metadata?.full_name as string | undefined)
        ?? "";

      const resolvedName = data?.name?.trim() || metadataName || authUser.email?.split("@")[0] || "";
      const resolvedInitials =
        data?.initials?.trim()
        || resolvedName.split(" ").filter(Boolean).map((p: string) => p[0]?.toUpperCase()).slice(0, 2).join("")
        || "?";

      setState((s) => ({
        ...s,
        profile: data
          ? {
              ...(data as Profile),
              email: authUser.email ?? "",
              name: resolvedName,
              initials: resolvedInitials,
            }
          : null,
        loading: false,
      }));
    } catch {
      setState((s) => ({ ...s, loading: false }));
    } finally {
      clearTimeout(profileTimeoutId);
      fetchingForRef.current = null;
    }
  }

  async function signIn(email: string, password: string): Promise<SignInResult> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  async function signUp(
    email: string,
    password: string,
    name: string,
    inviteCode: string,
    role: Profile["role"] = "viewer"
  ): Promise<SignUpResult> {
    const { data: wsRows, error: wsErr } = await supabase
      .rpc("get_workspace_by_invite_code", { code: inviteCode.trim() });

    if (wsErr || !wsRows || wsRows.length === 0) {
      return { error: { name: "AuthApiError", message: "Invalid invite code. Please check with your workspace admin." } as any };
    }

    const workspace_id = wsRows[0].id;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { workspace_id, role, name } },
    });
    if (error || !data.user) return { error };

    const permissionsByRole: Record<string, Profile["permissions"]> = {
      admin:   ["dashboard","mpo","clients","finance","budgets","reports","calendar","analytics","reminders","users","audit","invoice-wf","settings","dataviz","feed"],
      manager: ["dashboard","mpo","clients","finance","budgets","reports","calendar","analytics","reminders","audit","invoice-wf","feed"],
      viewer:  ["dashboard","mpo","clients","calendar","feed"],
      client:  ["dashboard"],
    };
    const permissions = permissionsByRole[role] ?? permissionsByRole["viewer"];

    const initials = name.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
    const colors = ["#534AB7", "#185FA5", "#3B6D11", "#854F0B", "#D85A30"];
    const color = colors[Math.floor(Math.random() * colors.length)];

    await supabase.from("profiles").upsert({
      id: data.user.id,
      workspace_id,
      name,
      role,
      initials,
      color,
      permissions,
    });

    return { error: null };
  }

  async function signOut() {
    // Clear state immediately so the UI responds at once, then tell Supabase.
    setState({ session: null, user: null, profile: null, loading: false, needsPassword: false });
    fetchingForRef.current = null;
    await supabase.auth.signOut();
  }

  async function resetPassword(email: string): Promise<SignInResult> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error };
  }

  async function setPassword(password: string): Promise<{ error: AuthError | null }> {
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) setState((s) => ({ ...s, needsPassword: false }));
    return { error };
  }

  return {
    ...state,
    signIn,
    signUp,
    signOut,
    resetPassword,
    setPassword,
  };
}
