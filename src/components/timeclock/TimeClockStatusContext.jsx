import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { usePolling } from "@/lib/usePolling";

const TimeClockStatusContext = createContext(null);

const FALLBACK_STATUS = {
  isFallback: true,
  data: null,
  error: null,
  loadedAt: 0,
  version: 0,
  refresh: async () => null,
};

export function useTimeClockStatus() {
  const ctx = useContext(TimeClockStatusContext);
  return ctx || FALLBACK_STATUS;
}

export function TimeClockStatusProvider({ children }) {
  const { currentUser, sessionToken } = useAuth();
  const email = String(currentUser?.email || "").trim().toLowerCase();
  const token = String(sessionToken || "");
  const scopeKey = `${email}|${token}`;

  const scopeRef = useRef({ scope: scopeKey, email, token });
  scopeRef.current = { scope: scopeKey, email, token };
  const inFlightRef = useRef(null);
  const queuedRefreshRef = useRef(null);
  const cacheRef = useRef({ scope: "", at: 0, promise: null });

  const [state, setState] = useState({ scope: scopeKey, data: null, error: null, loadedAt: 0, version: 0 });
  const data = state.scope === scopeKey ? state.data : null;
  const error = state.scope === scopeKey ? state.error : null;
  const loadedAt = state.scope === scopeKey ? state.loadedAt : 0;
  const version = state.scope === scopeKey ? state.version : 0;

  const refresh = useCallback(({ force = false } = {}) => {
    const { scope: requestScope, email: requestEmail, token: requestToken } = scopeRef.current;
    if (!requestEmail || !requestToken) {
      if (scopeRef.current.scope === requestScope) {
        setState(prev => ({ ...prev, scope: requestScope, data: null, error: null }));
      }
      return Promise.resolve(null);
    }

    const inFlight = inFlightRef.current;
    if (inFlight && !force) return inFlight;
    if (!force && cacheRef.current.scope === requestScope && Date.now() - cacheRef.current.at < 5000) {
      return cacheRef.current.promise;
    }
    if (inFlight && queuedRefreshRef.current) return queuedRefreshRef.current;

    const launch = () => {
      const promise = (async () => {
        const payload = {
          session_token: requestToken,
          target_email: requestEmail,
        };
        const liteResponse = await base44.functions.invoke("timeClockAction", {
          action: "status_lite",
          ...payload,
        });
        let data = liteResponse?.data || liteResponse;
        if (data?.requires_full_status) {
          const response = await base44.functions.invoke("timeClockAction", {
            action: "status",
            ...payload,
          });
          data = response?.data || response;
        }
        if (!data?.success) throw new Error(data?.error || "Work Pause status could not be verified.");
        if (scopeRef.current.scope === requestScope) {
          cacheRef.current = { scope: requestScope, at: Date.now(), promise: Promise.resolve(data) };
          setState(prev => ({
            scope: requestScope,
            data,
            error: null,
            loadedAt: Date.now(),
            version: prev.version + 1,
          }));
        }
        return data;
      })();
      inFlightRef.current = promise;
      promise.catch(err => {
        if (scopeRef.current.scope === requestScope) {
          setState(prev => ({ ...prev, scope: requestScope, error: err }));
        }
      }).finally(() => {
        if (inFlightRef.current === promise) inFlightRef.current = null;
      });
      return promise;
    };

    if (inFlight) {
      const queued = inFlight.catch(() => {}).then(launch);
      queuedRefreshRef.current = queued;
      queued.catch(() => {}).finally(() => {
        if (queuedRefreshRef.current === queued) queuedRefreshRef.current = null;
      });
      return queued;
    }

    return launch();
  }, []);

  usePolling(() => refresh({ force: true }), 180000, {
    enabled: Boolean(email && token),
  });

  useEffect(() => {
    const onPauseChanged = () => { void refresh({ force: true }).catch(() => {}); };
    const onStorage = (event) => {
      if (event.key === "ccs_work_pause_signal") void refresh({ force: true }).catch(() => {});
    };
    window.addEventListener("ccs-timeclock-work-pause-changed", onPauseChanged);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("ccs-timeclock-work-pause-changed", onPauseChanged);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  const value = { data, error, loadedAt, version, refresh };
  return (
    <TimeClockStatusContext.Provider value={value}>
      {children}
    </TimeClockStatusContext.Provider>
  );
}