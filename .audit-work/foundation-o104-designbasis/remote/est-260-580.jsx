          draftSessionRef.current.pending = false;
          setDraftOffer({ store: draftStore, warning: found.message });
        } else {
          draftSessionRef.current.revision = null;
          draftSessionRef.current.pending = false;
          setDraftOffer(null);
        }
        setProject(normalized);
        projectRef.current = normalized;
        const rec = foundationSyncRecoveryState({ project: merged, estimateId, estimate: est });
        if (["pending", "unsupported", "mismatch"].includes(rec.status)) {
          setRecoveryRequired(true);
          setDirty(true);
        } else {
          setRecoveryRequired(false);
        }
        // Canonicalize once at state ingress (CMP-A08): every downstream read â€”
        // catalog memo, tab props, BOM, and calcProject â€” sees canonical rows.
        setInventory(normalizeFoundationInventoryRows([...(inv || []), ...(concreteServices || []).map(normalizeConcreteSupplier)]));
        setSettings(
          Object.fromEntries((settingRows || []).map((s) => [s.setting_name, s.setting_value]))
        );
      })
      .catch((error) => {
        if (!active) return;
        console.error("Foundation Builder prerequisites could not be loaded:", error);
        setLoadError(error?.message || "Foundation Builder prerequisites could not be verified.");
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id, estimateId, reloadRevision, ownerId, draftStore]);

  const savedSourceProject = acknowledgedVersionRef.current?.sourceId === project?.id && acknowledgedVersionRef.current?.ownerId === ownerId
    ? acknowledgedVersionRef.current?.sourceSnapshot ?? null : null;
  const calc = useMemo(
    () => (project ? calcProject(project, inventory, settings, { savedProject: savedSourceProject }) : null),
    [project, inventory, settings, savedSourceProject]
  );

  const catalogBlocked = Boolean(calc?.catalogIssues?.length);
  const inputIssues = calc?.inputIssues || [];
  const inputBlocked = inputIssues.length > 0;
  const pricingBlocked = catalogBlocked || inputBlocked;
  // Advisory construction checks (CMP-B16) â€” verify-style warnings only;
  // they render on the diagnostics surface but never block save or handoff.
  const constructionWarnings = calc?.constructionWarnings || [];
  const [catalogReloading, setCatalogReloading] = useState(false);
  const catalogReloadRef = useRef(null);

  const handleCatalogReload = async () => {
    if (draftSessionRef.current.pending) return;
    const live = currentEditorRef.current;
    const generation = live.generation;
    const sourceId = live.sourceId;
    const estimateKey = live.estimateId;
    if (!mountedRef.current || !live.loaded || saveAttemptRef.current || copyFlightRef.current || saveSessionRef.current?.isSaving() || catalogReloadRef.current) return;
    const isCurrentFlight = (flight) => {
      const l = currentEditorRef.current;
      return mountedRef.current && catalogReloadRef.current === flight && l.loaded
        && l.sourceId === sourceId && l.estimateId === estimateKey && l.generation === generation;
    };
    const flight = (async () => {
      const [inv, concreteServices, settingRows] = await Promise.all([
        loadAllEntityRows({ entity: staffEntities.FoundationInventory, query: { show_in_foundation: true }, sort: "material_name", label: "Foundation inventory" }),
        loadAllEntityRows({ entity: staffEntities.LaborServiceInventory, query: { service_category: "concrete_service", is_active: true }, sort: "service_name", label: "Concrete labor/services" }),
        loadAllEntityRows({ entity: staffEntities.Settings, sort: "created_date", label: "Estimator Settings" }),
      ]);
      if (!isCurrentFlight(flight)) return; // stale reply: never install into a newer context
      bumpEdit();
      setInventory(normalizeFoundationInventoryRows([...(inv || []), ...(concreteServices || []).map(normalizeConcreteSupplier)]));
      setSettings(Object.fromEntries((settingRows || []).map((r) => [r.setting_name, r.setting_value])));
      setAutoSave(false);
      setDirty(true);
      setSaveError("");
    })();
    catalogReloadRef.current = flight;
    setCatalogReloading(true);
    try { await flight; }
    catch (e) {
      if (isCurrentFlight(flight)) setSaveError("Catalog reload failed: " + (e?.message || "unknown error") + " Last known catalog retained; retry.");
    } finally {
      if (catalogReloadRef.current === flight) {
        const current = isCurrentFlight(flight);
        catalogReloadRef.current = null;
        if (current) setCatalogReloading(false);
      }
    }
  };

  // Invalidate an in-flight catalog reload on route/reload context change.
  useEffect(() => {
    catalogReloadRef.current = null;
    setCatalogReloading(false);
  }, [id, estimateId, reloadRevision, ownerId]);

  const assemblyIssues = useMemo(() => (project ? foundationAssemblyIssues(project) : []), [project]);

  const catalog = useMemo(
    () => ({
      concrete: inventory.filter((i) =>
        ["concrete_service", "bagged_concrete"].includes(i.material_type) &&
        i.show_in_foundation !== false
      ),
      poles: inventory.filter((i) => i.material_type === "pole"),
      walls: inventory.filter((i) => ["brick_stone", "wall_material"].includes(i.material_type)),
      fill: inventory.filter((i) => i.material_type === "fill_material"),
      forming: inventory.filter((i) => ["forming", "forming_material"].includes(i.material_type)),
      caps: inventory.filter((i) => i.material_type === "wall_cap"),
      equipment: inventory.filter((i) => i.material_type === "excavation_equipment"),
    }),
    [inventory]
  );

  // Auto-save (debounced)
  useEffect(() => {
    if (!autoSave || !dirty || recoveryRequired || pricingBlocked || catalogReloading || catalogReloadRef.current || draftSessionRef.current.pending) return;
    const t = setTimeout(() => saveRef.current?.(), 2000);
    return () => clearTimeout(t);
  }, [autoSave, dirty, project, recoveryRequired, pricingBlocked, catalogReloading]);

  // Ctrl+S / Cmd+S saves the section without leaving the editor.
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!saving) saveRef.current?.();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saving]);
  // Block accidental navigation while a save is in flight.
  useEffect(() => {
    if (!saving && !dirty && !recoveryRequired && !draftSessionRef.current.pending) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saving, dirty, recoveryRequired, draftOffer]);

  // In-app dirty-route-leave guard. The app router is a declarative
  // BrowserRouter (no data-router blocker APIs), so a page-scoped guard covers
  // the two real leave paths: internal anchor clicks (shell nav, in-page links)
  // and browser Back/Forward. Unsent edits are already persisted to the tab
  // draft on every commit â€” the confirm makes an accidental leave a choice.
  const navGuardArmedRef = useRef(false);
  useEffect(() => {
    const needsGuard = () => saving || dirty || recoveryRequired || draftSessionRef.current.pending;
    const confirmLeave = () => window.confirm(
      "You have unsaved changes or an unacknowledged Builder sync. Leave without saving?" +
      (draftSessionRef.current.revision ? " Unsent edits stay backed up in this browser tab only." : ""));
    const onClickCapture = (e) => {
      if (!needsGuard() || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = e.target?.closest?.("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href") || "";
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      let url;
      try { url = new URL(href, window.location.href); } catch { return; }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (!confirmLeave()) { e.preventDefault(); e.stopPropagation(); }
    };
    // A same-URL sentinel history entry makes a Back press land on this page's
    // own URL first, where it can be confirmed before the app actually leaves.
    // Cancel steps back onto the sentinel via forward() (no new entry â€” stale
    // sentinels never accumulate); confirm disarms then really goes back. A
    // stale sentinel popped while clean passes straight through. Standalone
    // mode only â€” embedded, a route pop unmounts us before we could confirm,
    // so the sentinel would only leave a dead entry.
    if (!embedded && !navGuardArmedRef.current && needsGuard()) {
      try { window.history.pushState({ ccsFoundationLeaveGuard: true }, "", window.location.href); navGuardArmedRef.current = true; } catch { /* best effort */ }
    }
    const onPop = (e) => {
      if (!navGuardArmedRef.current) return;
      if (e.state?.ccsFoundationLeaveGuard === true) return; // landed on the armed sentinel itself (Forward / re-entry) â€” nothing to do
      if (!needsGuard()) { navGuardArmedRef.current = false; window.history.back(); return; }
      if (confirmLeave()) { navGuardArmedRef.current = false; window.history.back(); }
      else { try { window.history.forward(); } catch { /* best effort */ } }
    };
    document.addEventListener("click", onClickCapture, true);
    if (navGuardArmedRef.current) window.addEventListener("popstate", onPop);
    return () => { document.removeEventListener("click", onClickCapture, true); window.removeEventListener("popstate", onPop); };
  }, [embedded, saving, dirty, recoveryRequired, draftOffer]);

  // Versioned reinforcement proposal editor (CMP-B/O-031): the session owns
  // disposable previews and acknowledgments; every mutation goes through the
  // page's single `commit` (undo history, dirty marking, browser-draft
  // persistence, edit-revision bump) so an accepted proposal is an ordinary
  // undoable edit that reaches the entity only through the normal save path.
  // `blocked` mirrors the same busy/availability gates other edits honor;
  // pricingBlocked is intentionally NOT included â€” a held item can still be
  // drafted and previewed, and acceptance only lands through commit/save.
  const reinforcementEditor = useFoundationReinforcementEditor({
    getCurrent: () => {
      const live = currentEditorRef.current;
      const ack = acknowledgedVersionRef.current;
      return {
        project: projectRef.current,
        savedProject: ack?.sourceSnapshot ?? null,
        inventory,
        settings,
        context: {
          ...live,
          loaded: mountedRef.current && live.loaded,
          ownerId,
          sourceUpdatedAt: ack?.updated_date ?? null,
          estimateUpdatedAt: linkedEstimate?.updated_date ?? null,
        },
        blocked:
          saving || !!saveAttemptRef.current || !!copyFlightRef.current || !!catalogReloadRef.current ||
          catalogReloading || draftSessionRef.current.pending || recoveryRequired ||
          !!sourceRefreshRef.current || !ack?.sourceSnapshot || ack?.ownerId !== ownerId ||
          ack?.sourceId !== live.sourceId,
      };
    },
    commit: (updater) => commit(updater),
  });

  if (loading) return <div className="p-10 text-center text-gray-400">Loading sectionâ€¦</div>;
  if (loadError) return <div className="p-10 text-center text-red-700 bg-red-50 border border-red-200 rounded">Foundation Builder unavailable. Required project data, foundation inventory, concrete services, or Settings could not be verified. {loadError}</div>;
  if (!project) return <div className="p-10 text-center text-gray-500">Foundation section not found.</div>;

  const persistBrowserDraft = (next) => {
    const session = draftSessionRef.current;
    if (!session.store || session.store !== draftStore || !mountedRef.current) return;
    const ack = acknowledgedVersionRef.current;
    const base = ack?.sourceId === id && ack?.ownerId === ownerId ? ack.updated_date : null;
    if (!base) { setDraftOffer({ store: draftStore, warning: "Latest edits could not be backed up; no saved source to anchor the browser draft." }); return; }
    const result = session.store.write({
      project: next,
      baseUpdatedAt: base,
      token: newCreationRequestKey("foundation_draft"),
      savedAt: new Date().toISOString(),
      expectedRevision: session.revision,
    });
    if (result.status === "stored") {
      session.revision = result.revision;
      session.pending = false;
      setDraftOffer({ store: draftStore, backedUp: true, message: "Design and customer-pricing edits backed up in this browser tab only â€” closing the tab loses them; save to keep all changes." });
    } else if (result.status === "conflict") {
      // Never overwrite â€” re-read latest and surface a decision.
      const latest = session.store.read();
      session.revision = latest.status !== "unavailable" ? latest.revision ?? null : result.revision ?? session.revision;
      session.pending = true;
      if (latest.status === "found") setDraftOffer({ store: draftStore, revision: latest.revision, draft: latest.draft, savedAt: latest.savedAt, baseUpdatedAt: latest.baseUpdatedAt, conflict: true });
      else if (latest.status === "empty") { session.pending = false; setDraftOffer({ store: draftStore, warning: "Browser draft was removed elsewhere; nothing to merge." }); }
      else if (latest.status === "unavailable") setDraftOffer({ store: draftStore, revision: session.revision, message: latest.message || "Draft changed in another tab; could not re-read." });
      else setDraftOffer({ store: draftStore, revision: latest.revision ?? null, message: latest.message || "Draft changed in another tab; review before continuing." });
    } else {
      setDraftOffer({ store: draftStore, warning: `Latest edits could not be backed up; save before leaving. ${result.message || ""}` });
    }
  };

  const commit = (updater, opts = {}) => {
    const live = currentEditorRef.current;
    if (!mountedRef.current || !saveContext.loaded || !live.loaded || live.generation !== saveContext.generation || live.sourceId !== saveContext.sourceId) return false;
    if (draftSessionRef.current.pending && !opts.restoreDraft) return false;
    const prev = projectRef.current ?? project;
    let next;
    try {
      next = normalizeFoundationAssembly(
        { ...prev, ...updater(prev) },
        { previous: prev, createId: (kind) => newCreationRequestKey(`foundation_${kind}`) }
      ).project;
    } catch (e) {
      setSaveError(e?.message || "Foundation assembly update was rejected.");
      return false;
    }
    bumpEdit();
    setHistory((h) => ({ past: [...h.past.slice(-40), prev], future: [] }));
    projectRef.current = next;
    setProject(next);
    setDirty(true);
    if (opts.restoreDraft) draftSessionRef.current.pending = false;
    persistBrowserDraft(next);
    return true;
  };

  const patch = (changes) => commit(() => changes);

  const patchItem = (index, changes) =>
    commit((prev) => ({
      items: prev.items.map((it, i) => (i === index ? { ...it, ...changes } : it)),
    }));

  const removeItem = (index) => {
    const label = project.items?.[index]?.description || `item ${index + 1}`;
    if (!window.confirm(`Delete "${label}"? Dependent placements are retained for review.`)) return;
    commit((prev) => ({ items: prev.items.filter((_, i) => i !== index) }));
  };

  const duplicateItem = (index) =>
    commit((prev) => {
      const items = [...prev.items];
      items.splice(index + 1, 0, { ...JSON.parse(JSON.stringify(items[index])), component_id: newCreationRequestKey("foundation_item") });
      return { items };
    });

  const addItem = (type) => commit((prev) => ({ items: [...(prev.items || []), blankItem(type)] }));

  const restoreBrowserDraft = () => {
    const session = draftSessionRef.current;
    const offer = draftVisible;
    if (!session.store || session.store !== draftStore || !offer?.revision) return;
    const latest = session.store.read();
    if (latest.status !== "found" || latest.revision !== offer.revision) {
      // Storage changed since the offer â€” surface the newest, never restore stale data.
      // Preserve the known revision on a failed read so a retry does not conflict falsely.
      if (latest.status !== "unavailable") session.revision = latest.revision ?? null;
      if (latest.status === "found") setDraftOffer({ store: draftStore, revision: latest.revision, draft: latest.draft, savedAt: latest.savedAt, baseUpdatedAt: latest.baseUpdatedAt });
      else if (latest.status === "empty") { session.pending = false; setDraftOffer({ store: draftStore, warning: "Browser draft was removed elsewhere; nothing to restore." }); }
      else if (latest.status === "unavailable") setDraftOffer({ ...offer, warning: `Browser draft could not be read; try again. ${latest.message || ""}` });
      else setDraftOffer({ store: draftStore, revision: latest.revision ?? null, message: latest.message || "Browser draft changed; nothing restored." });
      return;
    }
    session.revision = latest.revision;
    const baseChanged = latest.baseUpdatedAt && acknowledgedVersionRef.current?.updated_date !== latest.baseUpdatedAt;
    if ((dirty || baseChanged) && !window.confirm("Restoring the browser draft replaces the current design edits in this editor. Continue?")) return;
    setAutoSave(false);
    // Single undoable edit through the normal commit path (restores sanitized design keys only).