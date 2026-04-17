import { useState, useCallback } from "react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
  id: number;
  msg: string;
  type: ToastType;
  visible: boolean;
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((msg: string, type: ToastType = "success") => {
    const id = Date.now();
    setToasts((t) => [...t, { id, msg, type, visible: false }]);
    // Trigger entrance animation
    setTimeout(
      () =>
        setToasts((t) =>
          t.map((x) => (x.id === id ? { ...x, visible: true } : x))
        ),
      10
    );
    // Remove after 3.4s
    setTimeout(
      () => setToasts((t) => t.filter((x) => x.id !== id)),
      3400
    );
  }, []);

  return { toasts, show };
}
