import { useState, useEffect } from "react";
import type { Session, User, AuthError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/types";

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
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
  });

  // Load session on mount and listen for changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState((s) => ({ ...s, session, user: session?.user ?? null }));
      if (session?.user) fetchProfile(session.user.id);
      else setState((s) => ({ ...s, loading: false }));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setState((s) => ({ ...s, session, user: session?.user ?? null }));
      if (session?.user) fetchProfile(session.user.id);
      else setState((s) => ({ ...s, profile: null, loading: false }));
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    setState((s) => ({ ...s, profile: data as Profile | null, loading: false }));
  }

  async function signIn(email: string, password: string): Promise<SignInResult> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  async function signUp(
    email: string,
    password: string,
    name: string,
    role: Profile["role"] = "viewer"
  ): Promise<SignUpResult> {
    // 1. Create auth user
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error || !data.user) return { error };

    // 2. Upsert profile row (workspace_id defaults to the first workspace; invite flow can override)
    const initials = name
      .split(" ")
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase();

    const colors = ["#534AB7", "#185FA5", "#3B6D11", "#854F0B", "#D85A30"];
    const color = colors[Math.floor(Math.random() * colors.length)];

    const defaultPermissions: Profile["permissions"] = ["dashboard", "feed"];

    await supabase.from("profiles").upsert({
      id: data.user.id,
      name,
      role,
      initials,
      color,
      permissions: defaultPermissions,
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

  return {
    ...state,
    signIn,
    signUp,
    signOut,
    resetPassword,
  };
}
