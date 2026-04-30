import { useState, useEffect, useRef } from "react";
import type { Session, User, AuthError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/types";

const ROLE_PERMISSIONS: Record<Profile["role"], Profile["permissions"]> = {
  admin: ["dashboard", "mpo", "clients", "finance", "budgets", "revenue-target", "reports", "calendar", "analytics", "reminders", "users", "audit", "invoice-wf", "settings", "dataviz", "feed"],
  manager: ["dashboard", "mpo", "clients", "finance", "budgets", "revenue-target", "reports", "calendar", "analytics", "reminders", "audit", "invoice-wf", "feed"],
  viewer: ["dashboard", "mpo", "clients", "revenue-target", "calendar", "feed"],
  client: ["dashboard", "revenue-target"],
};

const PROFILE_COLORS = ["#534AB7", "#185FA5", "#3B6D11", "#854F0B", "#D85A30"];

function metadataString(authUser: User, key: string): string {
  const value = authUser.user_metadata?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRole(role: unknown): Profile["role"] {
  return role === "admin" || role === "manager" || role === "client" ? role : "viewer";
}

function initialsFor(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase())
    .slice(0, 2)
    .join("") || "?";
}

function fallbackProfile(authUser: User, existing?: Partial<Profile> | null): Profile {
  const metadataName = metadataString(authUser, "name") || metadataString(authUser, "full_name");
  const name = existing?.name?.trim() || metadataName || authUser.email?.split("@")[0] || "";
  const role = normalizeRole(existing?.role || metadataString(authUser, "role"));
  const workspaceId = existing?.workspace_id || metadataString(authUser, "workspace_id") || null;
  const initials = existing?.initials?.trim() || initialsFor(name);

  return {
    id: authUser.id,
    workspace_id: workspaceId,
    name,
    email: authUser.email ?? "",
    role,
    permissions: existing?.permissions?.length ? existing.permissions : ROLE_PERMISSIONS[role],
    color: existing?.color || PROFILE_COLORS[Math.abs(authUser.id.charCodeAt(0) || 0) % PROFILE_COLORS.length],
    initials,
    created_at: existing?.created_at || new Date().toISOString(),
  } as Profile;
}

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
      setState((s) => ({ ...s, profile: fallbackProfile(authUser), loading: false }));
    }, 8000);

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .maybeSingle();

      if (timedOut) return; // timeout already fired, don't overwrite state

      if (error) {
        console.warn("[MediaHub] Could not load profile; using auth fallback.", error.message);
      }

      let resolvedProfile = fallbackProfile(authUser, data as Partial<Profile> | null);

      if (!data) {
        const repairPayload = {
          id: resolvedProfile.id,
          workspace_id: resolvedProfile.workspace_id,
          name: resolvedProfile.name,
          role: resolvedProfile.role,
          permissions: resolvedProfile.permissions,
          color: resolvedProfile.color,
          initials: resolvedProfile.initials,
        };

        const { data: repaired, error: repairError } = await supabase
          .from("profiles")
          .upsert(repairPayload)
          .select("*")
          .maybeSingle();

        if (timedOut) return; // timeout already fired, don't overwrite state

        if (repairError) {
          console.warn("[MediaHub] Could not repair missing profile; continuing with local fallback.", repairError.message);
        } else if (repaired) {
          resolvedProfile = fallbackProfile(authUser, repaired as Partial<Profile>);
        }
      }

      clearTimeout(timeoutId);
      setState((s) => ({
        ...s,
        profile: resolvedProfile,
        loading: false,
      }));
    } catch {
      clearTimeout(timeoutId);
      if (!timedOut) setState((s) => ({ ...s, profile: fallbackProfile(authUser), loading: false }));
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

    const permissions = ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS.viewer;

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
