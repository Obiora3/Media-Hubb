import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type Row = Record<string, unknown> & { id: string };

interface UseSupabaseTableOptions {
  /** Extra .eq() filters beyond workspace_id */
  filters?: Record<string, string | number | boolean>;
  /** Column to order by. Defaults to created_at descending. */
  orderBy?: { column: string; ascending?: boolean };
  /** Skip the query (e.g. when workspaceId is not yet known) */
  enabled?: boolean;
}

interface UseSupabaseTableReturn<T extends Row> {
  data: T[];
  loading: boolean;
  error: string | null;
  insert: (row: Omit<T, "id" | "created_at">) => Promise<T | null>;
  update: (id: string, changes: Partial<T>) => Promise<T | null>;
  remove: (id: string) => Promise<boolean>;
  refresh: () => void;
}

export function useSupabaseTable<T extends Row>(
  table: string,
  workspaceId: string | null | undefined,
  options: UseSupabaseTableOptions = {}
): UseSupabaseTableReturn<T> {
  const { filters = {}, orderBy, enabled = true } = options;

  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rev, setRev] = useState(0);

  const refresh = useCallback(() => setRev((r) => r + 1), []);

  // ── Initial fetch ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!workspaceId || !enabled) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    let query = supabase
      .from(table)
      .select("*")
      .eq("workspace_id", workspaceId);

    Object.entries(filters).forEach(([col, val]) => {
      query = query.eq(col, val);
    });

    const ob = orderBy ?? { column: "created_at", ascending: false };
    query = query.order(ob.column, { ascending: ob.ascending ?? false });

    query.then(({ data: rows, error: err }) => {
      if (cancelled) return;
      if (err) setError(err.message);
      else setData((rows as T[]) ?? []);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [table, workspaceId, enabled, rev]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    if (!workspaceId || !enabled) return;

    const channel = supabase
      .channel(`${table}:${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload: RealtimePostgresChangesPayload<T>) => {
          if (payload.eventType === "INSERT") {
            setData((d) => [payload.new as T, ...d]);
          } else if (payload.eventType === "UPDATE") {
            setData((d) =>
              d.map((r) => (r.id === (payload.new as T).id ? (payload.new as T) : r))
            );
          } else if (payload.eventType === "DELETE") {
            setData((d) => d.filter((r) => r.id !== (payload.old as T).id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, workspaceId, enabled]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const insert = useCallback(
    async (row: Omit<T, "id" | "created_at">): Promise<T | null> => {
      const { data: inserted, error: err } = await supabase
        .from(table)
        .insert({ ...row, workspace_id: workspaceId })
        .select()
        .single();

      if (err) { setError(err.message); return null; }
      // Realtime will add it, but add optimistically for speed
      setData((d) => [inserted as T, ...d]);
      return inserted as T;
    },
    [table, workspaceId]
  );

  const update = useCallback(
    async (id: string, changes: Partial<T>): Promise<T | null> => {
      const { data: updated, error: err } = await supabase
        .from(table)
        .update(changes as Record<string, unknown>)
        .eq("id", id)
        .select()
        .single();

      if (err) { setError(err.message); return null; }
      setData((d) => d.map((r) => (r.id === id ? (updated as T) : r)));
      return updated as T;
    },
    [table]
  );

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      const { error: err } = await supabase.from(table).delete().eq("id", id);
      if (err) { setError(err.message); return false; }
      setData((d) => d.filter((r) => r.id !== id));
      return true;
    },
    [table]
  );

  return { data, loading, error, insert, update, remove, refresh };
}
