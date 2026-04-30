import { useState, useEffect } from "react";
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
  // Detect invite/recovery links before Supabase clears the hash
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    profile: null,
    loading: true,
    needsPassword: typeof window !== "undefined" &&
      (window.location.hash.includes("type=invite") ||
       window.location.hash.includes("type=recovery")),
  });

  // Load session on mount and listen for changes
  useEffect(() => {
    // Fallback: if Supabase never responds (paused project, network issue), stop the spinner after 5s.
    // Timeout must stay alive until fetchProfile resolves — don't clear it in getSession().then().
    const timeout = setTimeout(() => {
      setState((s) => s.loading ? { ...s, loading: false } : s);
    }, 5000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      setState((s) => ({ ...s, session, user: session?.user ?? null }));
      if (session?.user) {
        fetchProfile(session.user).finally(() => clearTimeout(timeout));
      } else {
        clearTimeout(timeout);
        setState((s) => ({ ...s, loading: false }));
      }
    }).catch(() => {
      clearTimeout(timeout);
      setState((s) => ({ ...s, loading: false }));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setState((s) => ({ ...s, needsPassword: true, session, user: session?.user ?? null }));
        if (session?.user) fetchProfile(session.user);
        return;
      }
      setState((s) => ({ ...s, session, user: session?.user ?? null }));
      if (session?.user) fetchProfile(session.user);
      else setState((s) => ({ ...s, profile: null, loading: false }));
    });

    return () => { clearTimeout(timeout); subscription.unsubscribe(); };
  }, []);

  async function fetchProfile(authUser: User) {
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
        || resolvedName.split(" ").filter(Boolean).map((part: string) => part[0]?.toUpperCase()).slice(0, 2).join("")
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
    // 1. Validate invite code and resolve workspace
    const { data: wsRows, error: wsErr } = await supabase
      .rpc("get_workspace_by_invite_code", { code: inviteCode.trim() });

    if (wsErr || !wsRows || wsRows.length === 0) {
      return { error: { name: "AuthApiError", message: "Invalid invite code. Please check with your workspace admin." } as any };
    }

    const workspace_id = wsRows[0].id;

    // 2. Create auth user — pass workspace_id in metadata so the DB trigger assigns it
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { workspace_id, role, name } },
    });
    if (error || !data.user) return { error };

    // 3. Role-based permissions
    const permissionsByRole: Record<string, Profile["permissions"]> = {
      admin:   ["dashboard","mpo","clients","finance","budgets","reports","calendar","analytics","reminders","users","audit","invoice-wf","settings","dataviz","feed"],
      manager: ["dashboard","mpo","clients","finance","budgets","reports","calendar","analytics","reminders","audit","invoice-wf","feed"],
      viewer:  ["dashboard","mpo","clients","calendar","feed"],
      client:  ["dashboard"],
    };
    const permissions = permissionsByRole[role] ?? permissionsByRole["viewer"];

    const initials = name
      .split(" ")
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase();

    const colors = ["#534AB7", "#185FA5", "#3B6D11", "#854F0B", "#D85A30"];
    const color = colors[Math.floor(Math.random() * colors.length)];

    // 4. Fill in the profile (trigger may have already created the row)
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
