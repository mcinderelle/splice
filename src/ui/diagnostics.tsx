import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Button, Modal } from "@nextui-org/react";

export interface DiagnosticEntry {
  id: number;
  time: string;
  message: string;
  stack?: string;
  details?: any;
}

interface DiagnosticsContextValue {
  record: (message: string, details?: any, error?: Error) => void;
  open: () => void;
}

const DiagnosticsContext = createContext<DiagnosticsContextValue | null>(null);

export function useDiagnostics() {
  const ctx = useContext(DiagnosticsContext);
  if (!ctx) throw new Error("useDiagnostics must be used within DiagnosticsProvider");
  return ctx;
}

export function DiagnosticsProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<DiagnosticEntry[]>([]);
  const [isOpen, setOpen] = useState(false);
  const idRef = useRef(0);

  const record = useCallback((message: string, details?: any, error?: Error) => {
    const id = ++idRef.current;
    const entry: DiagnosticEntry = {
      id,
      time: new Date().toLocaleTimeString(),
      message,
      stack: error?.stack,
      details
    };
    setEntries((prev) => [entry, ...prev].slice(0, 200));
  }, []);

  const open = useCallback(() => setOpen(true), []);

  const value = useMemo(() => ({ record, open }), [record, open]);

  return (
    <DiagnosticsContext.Provider value={value}>
      {children}
      <Modal isOpen={isOpen} onOpenChange={setOpen} size="3xl">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Diagnostics</h3>
            <Button size="sm" variant="bordered" onClick={() => setOpen(false)}>Close</Button>
          </div>
          <p className="text-sm text-gray-400">Latest errors, network events, and measurements.</p>
          <div className="max-h-[60vh] overflow-auto space-y-3">
            {entries.length === 0 ? (
              <div className="text-sm text-gray-400">No diagnostic entries yet.</div>
            ) : entries.map(e => (
              <div key={e.id} className="p-3 rounded-lg bg-gray-800/40 border border-gray-700/40">
                <div className="text-xs text-gray-400">{e.time}</div>
                <div className="text-sm font-medium">{e.message}</div>
                {e.stack && <pre className="text-xs text-gray-400 whitespace-pre-wrap mt-2">{e.stack}</pre>}
                {e.details && <pre className="text-xs text-gray-400 whitespace-pre-wrap mt-2">{JSON.stringify(e.details, null, 2)}</pre>}
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </DiagnosticsContext.Provider>
  );
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  static contextType = DiagnosticsContext;
  declare context: React.ContextType<typeof DiagnosticsContext>;
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  componentDidCatch(error: Error) {
    this.setState({ error });
    this.context?.record?.("UI ErrorBoundary", undefined, error);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-8">
          <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
          <p className="text-sm text-gray-400 mb-4">Open Diagnostics to see details and a stack trace.</p>
          <pre className="text-xs text-gray-400 whitespace-pre-wrap">{this.state.error.stack ?? String(this.state.error)}</pre>
        </div>
      );
    }
    return this.props.children as any;
  }
}


