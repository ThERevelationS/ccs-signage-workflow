import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import {
  defaultPrefs, migratePrefs, deepMerge, setPath, getPath, SECTION_PATHS,
  localLoadPrefs, localSavePrefs, localOrderStamp, saveOrderStamp,
  applyAppearance, newRequestId,
} from "./workspacePrefs";
import { saveNavOrder } from "./navPreferences";

const WorkspacePrefsContext = createContext(null);
const sessionToken = () => { try { return localStorage.getItem("sss_session_token") || ""; } catch { return ""; } };
const WRITE_DEBOUNCE_MS = 900;

export function WorkspacePreferencesProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const email = String(user?.email || "").toLowerCase();
  const [prefs, setPrefs] = useState(() => {
    const local = email ? localLoadPrefs(email) : null;
    return migratePrefs(local?.prefs);
  });
  const [profiles, setProfiles] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const prefsRef = useRef(prefs);
  const profilesRef = useRef(profiles);
  const pendingRef = useRef(false);
  const timerRef = useRef(null);
  const loadedForRef = useRef("");
  prefsRef.current = prefs;
  profilesRef.current = profiles;

  // Seed from localStorage instantly (no flicker), then hydrate from server.
  useEffect(() => {
    if (!isAuthenticated || !email || loadedForRef.current === email) return;
    loadedForRef.current = email;
    const local = localLoadPrefs(email);
    if (local?.prefs) { setPrefs(migratePrefs(local.prefs)); setProfiles(Array.isArray(local.profiles) ? local.profiles : []); }
    (async () => {
      try {
        const res = await base44.functions.invoke("workspacePrefsAction", { action: "prefs_get", session_token: sessionToken() });
        const serverPrefs = res?.data?.prefs ?? res?.prefs ?? null;
        const serverProfiles = res?.data?.profiles ?? res?.profiles ?? [];
        const merged = migratePrefs(serverPrefs);
        // Server-authoritative nav order, but only when it is newer than the
        // order this device last wrote (last-write-wins across devices).
        const serverAt = merged.navigation.orderUpdatedAt || "";
        const localAt = localOrderStamp(email);
        if (serverAt && serverAt > localAt && merged.navigation.order.length) {
          saveNavOrder(email, merged.navigation.order);
          saveOrderStamp(email, serverAt);
        } else if (!serverAt && merged.navigation.order.length) {
          saveNavOrder(email, merged.navigation.order);
        }
        if (merged.navigation.order.length) window.dispatchEvent(new Event("ccs-nav-order-sync"));
        setPrefs(merged);
        setProfiles(Array.isArray(serverProfiles) ? serverProfiles : []);
        localSavePrefs(email, merged, serverProfiles);
      } catch (e) {
        setSaveError(String(e?.message || "Could not load workspace preferences."));
      } finally {
        setLoaded(true);
      }
    })();
  }, [isAuthenticated, email]);

  // Side effects: theme class, density attr, font scale, accent, motion.
  useEffect(() => { applyAppearance(prefs); }, [prefs]);

  const flush = useCallback(async () => {
    if (!email || !sessionToken()) return;
    const snapshot = prefsRef.current;
    const snapshotProfiles = profilesRef.current;
    pendingRef.current = false;
    setSaving(true);
    try {
      await base44.functions.invoke("workspacePrefsAction", {
        action: "prefs_update",
        session_token: sessionToken(),
        request_id: newRequestId(),
        prefs: snapshot,
        profiles: snapshotProfiles,
      });
      setSaveError("");
      localSavePrefs(email, snapshot, snapshotProfiles);
    } catch (e) {
      pendingRef.current = true; // retry on next flush
      setSaveError(String(e?.message || "Save failed — will retry."));
    } finally {
      setSaving(false);
    }
  }, [email]);

  const scheduleWrite = useCallback(() => {
    pendingRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, WRITE_DEBOUNCE_MS);
  }, [flush]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const updatePrefs = useCallback((path, value) => {
    setPrefs((prev) => { const next = migratePrefs(setPath(prev, path, value)); return next; });
    scheduleWrite();
  }, [scheduleWrite]);

  const patchPrefs = useCallback((patch) => {
    setPrefs((prev) => migratePrefs(deepMerge(prev, patch)));
    scheduleWrite();
  }, [scheduleWrite]);

  const resetSection = useCallback((section) => {
    const paths = SECTION_PATHS[section];
    if (!paths) return;
    setPrefs((prev) => {
      let next = { ...prev };
      const d = defaultPrefs();
      for (const p of paths) next = setPath(next, p, getPath(d, p));
      return migratePrefs(next);
    });
    scheduleWrite();
  }, [scheduleWrite]);

  const resetAll = useCallback(() => {
    setPrefs(defaultPrefs());
    scheduleWrite();
  }, [scheduleWrite]);

  // Layout calls this after a successful drag reorder. The order is written
  // both to localStorage (already done by the caller) and the server blob.
  const reportNavOrder = useCallback((urls) => {
    const iso = new Date().toISOString();
    saveOrderStamp(email, iso);
    setPrefs((prev) => {
      const next = setPath(prev, "navigation.order", Array.isArray(urls) ? urls : []);
      return migratePrefs(setPath(next, "navigation.orderUpdatedAt", iso));
    });
    scheduleWrite();
  }, [email, scheduleWrite]);

  const saveProfile = useCallback((name) => {
    const clean = String(name || "").trim().slice(0, 40);
    if (!clean) return;
    setProfiles((prev) => {
      const snapshot = { name: clean, prefs: prefsRef.current, saved_at: new Date().toISOString() };
      const rest = prev.filter((p) => p?.name !== clean);
      const next = [...rest, snapshot].slice(0, 10);
      profilesRef.current = next;
      return next;
    });
    scheduleWrite();
  }, [scheduleWrite]);

  const applyProfile = useCallback((name) => {
    const hit = profilesRef.current.find((p) => p?.name === name);
    if (hit?.prefs) { setPrefs(migratePrefs(hit.prefs)); scheduleWrite(); }
  }, [scheduleWrite]);

  const deleteProfile = useCallback((name) => {
    setProfiles((prev) => {
      const next = prev.filter((p) => p?.name !== name);
      profilesRef.current = next;
      return next;
    });
    scheduleWrite();
  }, [scheduleWrite]);

  const value = useMemo(() => ({
    prefs, profiles, loaded, saving, saveError,
    updatePrefs, patchPrefs, resetSection, resetAll,
    reportNavOrder, saveProfile, applyProfile, deleteProfile,
  }), [prefs, profiles, loaded, saving, saveError, updatePrefs, patchPrefs, resetSection, resetAll, reportNavOrder, saveProfile, applyProfile, deleteProfile]);

  return <WorkspacePrefsContext.Provider value={value}>{children}</WorkspacePrefsContext.Provider>;
}

export function useWorkspacePreferences() {
  const ctx = useContext(WorkspacePrefsContext);
  // Soft fallback so non-wrapped subtrees (fixtures/tests) still render.
  return ctx || { prefs: defaultPrefs(), profiles: [], loaded: false, saving: false, saveError: "",
    updatePrefs: () => {}, patchPrefs: () => {}, resetSection: () => {}, resetAll: () => {},
    reportNavOrder: () => {}, saveProfile: () => {}, applyProfile: () => {}, deleteProfile: () => {} };
}
