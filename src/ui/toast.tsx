import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

export type ToastType = "info" | "success" | "warning" | "error";

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  notify: (type: ToastType, message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback((type: ToastType, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, type, message }]);
    // Auto-dismiss
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toast container */}
      <div className="fixed z-50 bottom-4 right-4 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id}
               className={`pointer-events-auto px-4 py-3 rounded-lg shadow-lg text-sm min-w-64 backdrop-blur-sm border ${
                 t.type === 'success' ? 'bg-green-500/10 border-green-400/30 text-green-200'
                 : t.type === 'warning' ? 'bg-yellow-500/10 border-yellow-400/30 text-yellow-200'
                 : t.type === 'error' ? 'bg-red-500/10 border-red-400/30 text-red-200'
                 : 'bg-gray-700/50 border-gray-500/30 text-gray-100'
               }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}


