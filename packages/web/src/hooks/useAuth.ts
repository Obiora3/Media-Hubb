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

  const fetchingForRef = useRef<string | null>(null);

  useEffect(() => {
    // Hard fallback: if onAuthStateChange never fires at all (Supabase completely
    // unreachable), unblock the spinner after 10s so the user sees the auth screen.
    const globalFallback = setTimeout(() => {
      setState((s) => s.loading ? { ...s, loading: false } : s);
    }, 10000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      clearTimeout(globalFallback);

      if (event === "PASSWORD_RECOVERY") {
        setState((s) => ({ ...s, needsPassword: true, session, user: session?.user ?? null, loading: false }));
        return;
      }

      if (event === "SIGNED_OUT" || !session) {
        fetchingForRef.current = null;
        setState({ session: null, user: null, profile: null, loading: false, needsPassword: false });
        return;
      }

      setState((s) => ({ ...s, session, user: session.user }));
      fetchProfile(session.user);
    });

    return () => {
      clearTimeout(globalFallback);
      subscription.unsubscribe();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchProfile(authUser: User) {
    // Skip if already fetching for this user
    if (fetchingForRef.current === authUser.id) return;
    fetchingForRef.current = authUser.id;

    // Race the DB query against a 8s hard timeout.
    // Without this, a hanging Supabase connection keeps loading:true forever.
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      fetchingForRef.current = null;
      setState((s) => ({ ...s, loading: false }));
    }, 8000);

    try {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .single();

      clearTimeout(timeoutId);
      if (timedOut) return; // timeout already fired, don't overwrite state

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
      clearTimeout(timeoutId);
      if (!timedOut) setState((s) => ({ ...s, loading: false }));
    } finally {
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
