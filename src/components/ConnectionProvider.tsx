import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { isConnectionError } from '../lib/connection';

interface ConnectionContextValue {
  /** True while at least one registered action failed because the database was unreachable. */
  failed: boolean;
  /**
   * Call with the error (and HTTP status) of a failed database call. Returns true when it was a
   * connection error; then `retry` is remembered under `key` and re-run when the user taps the retry button.
   */
  report: (key: string, error: unknown, status: number | undefined, retry: () => void) => boolean;
  /** Call when the action behind `key` succeeded (or was abandoned). */
  resolve: (key: string) => void;
  /** Re-runs all remembered actions; each re-reports itself if it fails again. */
  retryAll: () => void;
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const pending = useRef(new Map<string, () => void>());
  const [failed, setFailed] = useState(false);

  const report = useCallback<ConnectionContextValue['report']>((key, error, status, retry) => {
    // postgrest-js keeps the HTTP status next to the error, not inside it.
    const withStatus = typeof error === 'object' && error !== null ? { ...error, status } : error;
    if (!isConnectionError(withStatus)) return false;
    pending.current.set(key, retry);
    setFailed(true);
    return true;
  }, []);

  const resolve = useCallback((key: string) => {
    pending.current.delete(key);
    if (pending.current.size === 0) setFailed(false);
  }, []);

  const retryAll = useCallback(() => {
    const actions = [...pending.current.values()];
    pending.current.clear();
    setFailed(false);
    for (const action of actions) action();
  }, []);

  const value = useMemo(() => ({ failed, report, resolve, retryAll }), [failed, report, resolve, retryAll]);
  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnection(): ConnectionContextValue {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error('useConnection must be used inside ConnectionProvider');
  return ctx;
}
