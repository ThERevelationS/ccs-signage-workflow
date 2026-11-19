const fs = require('fs');
let s = fs.readFileSync('src/pages/FoundationEstimator.jsx', 'utf8');

// 1) Promise.all three reads + settings map + bumpEdit + flight predicate + isSaving guard
const oldReload = s.slice(s.indexOf('  const handleCatalogReload'), s.indexOf('  const assemblyIssues'));
const newReload = `  const handleCatalogReload = async () => {
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
      setInventory([...(inv || []), ...(concreteServices || []).map(normalizeConcreteSupplier)]);
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
      if (catalogReloadRef.current === flight) { catalogReloadRef.current = null; if (mountedRef.current && isCurrentFlight(flight)) setCatalogReloading(false); }
    }
  };

  // Invalidate an in-flight catalog reload on route/reload context change.
  useEffect(() => {
    catalogReloadRef.current = null;
    setCatalogReloading(false);
  }, [id, estimateId, reloadRevision]);

`;
s = s.replace(oldReload, newReload);
// autosave: also use catalogReloading state
s = s.replace(
  '    if (!autoSave || !dirty || recoveryRequired || catalogBlocked || catalogReloadRef.current) return;',
  '    if (!autoSave || !dirty || recoveryRequired || catalogBlocked || catalogReloading || catalogReloadRef.current) return;'
);
s = s.replace('  }, [autoSave, dirty, project, recoveryRequired]);', '  }, [autoSave, dirty, project, recoveryRequired, catalogBlocked, catalogReloading]);');
// 4) copy: move pricing guard after liveness checks
s = s.replace(
  `  const handleSaveAsCopy = () => {
    if (catalogBlocked || catalogReloadRef.current) {
      setSaveError("Pricing unavailable: selected pole, cap or wall catalog materials need attention. Resolve catalog availability before copying.");
      return null;
    }
    if (copyFlightRef.current) return copyFlightRef.current;
    const live0 = currentEditorRef.current;
    if (!mountedRef.current || !saveContext.loaded || !live0.loaded || live0.generation !== saveContext.generation || live0.sourceId !== saveContext.sourceId || live0.estimateId !== saveContext.estimateId || live0.editRevision !== saveContext.editRevision) return null;
    if (saveAttemptRef.current || saveSessionRef.current?.isSaving()) return null;`,
  `  const handleSaveAsCopy = () => {
    if (copyFlightRef.current) return copyFlightRef.current;
    const live0 = currentEditorRef.current;
    if (!mountedRef.current || !saveContext.loaded || !live0.loaded || live0.generation !== saveContext.generation || live0.sourceId !== saveContext.sourceId || live0.estimateId !== saveContext.estimateId || live0.editRevision !== saveContext.editRevision) return null;
    if (saveAttemptRef.current || saveSessionRef.current?.isSaving()) return null;
    if (catalogBlocked || catalogReloadRef.current) {
      setSaveError("Pricing unavailable: selected pole, cap or wall catalog materials need attention. Resolve catalog availability before copying.");
      return null;
    }`
);
// runSave: existing promise returns before pricing gate (already does — existing check precedes)
// 4) swap: preflight liveness before pricing guard
s = s.replace(
  `  const handleSwapToBrickStone = async () => {
    if (catalogBlocked || catalogReloadRef.current) {`,
  `  const handleSwapToBrickStone = async () => {
    {
      const live0 = currentEditorRef.current;
      if (!mountedRef.current || !saveContext.loaded || !live0.loaded || live0.generation !== saveContext.generation || live0.sourceId !== saveContext.sourceId || live0.estimateId !== saveContext.estimateId || live0.editRevision !== saveContext.editRevision) return null;
    }
    if (catalogBlocked || catalogReloadRef.current) {`
);
fs.writeFileSync('src/pages/FoundationEstimator.jsx', s);
console.log('page ok', s.includes('bumpEdit()'), s.includes('Concrete labor/services'));
