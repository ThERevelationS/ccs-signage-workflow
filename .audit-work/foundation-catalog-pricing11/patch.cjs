const fs = require('fs');
let p, s;

// ---------- FoundationEstimator.jsx ----------
p = 'src/pages/FoundationEstimator.jsx'; s = fs.readFileSync(p, 'utf8');
// import catalog integrity helper
s = s.replace(
  'import { money, calcProject } from "@/components/estimator/foundation/foundationCalc";',
  'import { money, calcProject } from "@/components/estimator/foundation/foundationCalc";\nimport { hasFoundationCostSnapshot } from "@/components/estimator/foundation/foundationCatalogIntegrity";'
);
if (!s.includes('foundationCatalogIntegrity')) {
  // fallback anchor
  s = s.replace(/import \{ money[^}]*\} from "@\/components\/estimator\/foundation\/foundationCalc";/,
    m => m + '\nimport { hasFoundationCostSnapshot } from "@/components/estimator/foundation/foundationCatalogIntegrity";');
}
// catalog blocked + reload state
s = s.replace(
  '  const assemblyIssues = useMemo(',
  `  const catalogBlocked = Boolean(calc?.catalogIssues?.length);
  const [catalogReloading, setCatalogReloading] = useState(false);
  const catalogReloadRef = useRef(null);

  const handleCatalogReload = async () => {
    const live = currentEditorRef.current;
    const generation = live.generation;
    const sourceId = live.sourceId;
    const estimateKey = live.estimateId;
    if (!mountedRef.current || !live.loaded || saveAttemptRef.current || copyFlightRef.current || catalogReloadRef.current) return;
    const flight = (async () => {
      const [inv, concreteServices, settingRows] = await Promise.all([
        loadAllEntityRows({ entity: staffEntities.FoundationInventory, query: { show_in_foundation: true }, sort: "material_name", label: "Foundation inventory" }),
        loadAllEntityRows({ entity: staffEntities.LaborServiceInventory, query: { service_category: "concrete_service", is_active: true }, sort: "service_name", label: "Concrete labor/services" }),
        loadAllEntityRows({ entity: staffEntities.Settings, sort: "created_date", label: "Estimator Settings" }),
      ]);
      const liveNow = currentEditorRef.current;
      if (!mountedRef.current || catalogReloadRef.current !== flight || !liveNow.loaded || liveNow.sourceId !== sourceId || liveNow.estimateId !== estimateKey || liveNow.generation !== generation) {
        return; // stale reply: never install into a newer context
      }
      editRevisionRef.current += 1; // fence off old captured handlers
      setInventory([...(inv || []), ...(concreteServices || []).map(normalizeConcreteSupplier)]);
      setSettings(settingRows?.[0] || {});
      setAutoSave(false);
      setDirty(true);
      setSaveError("");
    })();
    catalogReloadRef.current = flight;
    setCatalogReloading(true);
    try { await flight; }
    catch (e) {
      if (mountedRef.current && catalogReloadRef.current === flight) setSaveError("Catalog reload failed: " + (e?.message || "unknown error") + " Last known catalog retained; retry.");
    } finally {
      if (catalogReloadRef.current === flight) { catalogReloadRef.current = null; if (mountedRef.current) setCatalogReloading(false); }
    }
  };

  const assemblyIssues = useMemo(`
);
// autosave stop when blocked
s = s.replace(
  '    if (!autoSave || !dirty || recoveryRequired) return;',
  '    if (!autoSave || !dirty || recoveryRequired || catalogBlocked || catalogReloadRef.current) return;'
);
// runSave guard: after marker check, before captured
s = s.replace(
  `    if (copyFlightRef.current) return Promise.resolve(staleOutcome);
    {
      const marker = sourceRefreshRef.current;
      if (marker && liveNow.loaded && liveNow.sourceId === marker.sourceId && liveNow.generation === marker.generation) {
        return Promise.resolve({ ...staleOutcome, status: "conflict", error: new Error("The project must be reloaded after the earlier save finished.") });
      }
    }`,
  `    if (copyFlightRef.current) return Promise.resolve(staleOutcome);
    {
      const marker = sourceRefreshRef.current;
      if (marker && liveNow.loaded && liveNow.sourceId === marker.sourceId && liveNow.generation === marker.generation) {
        return Promise.resolve({ ...staleOutcome, status: "conflict", error: new Error("The project must be reloaded after the earlier save finished.") });
      }
    }
    if (catalogBlocked || catalogReloadRef.current) {
      setSaveError("Pricing unavailable: selected pole, cap or wall catalog materials need attention. Resolve catalog availability before saving.");
      setDirty(true);
      return Promise.resolve({ ...staleOutcome, status: "failed", error: new Error("Save paused: catalog pricing is incomplete.") });
    }`
);
// copy guard at top of handleSaveAsCopy
s = s.replace(
  `  const handleSaveAsCopy = () => {
    if (copyFlightRef.current) return copyFlightRef.current;`,
  `  const handleSaveAsCopy = () => {
    if (catalogBlocked || catalogReloadRef.current) {
      setSaveError("Pricing unavailable: selected pole, cap or wall catalog materials need attention. Resolve catalog availability before copying.");
      return null;
    }
    if (copyFlightRef.current) return copyFlightRef.current;`
);
// swap guard at top of handleSwapToBrickStone
s = s.replace(
  `  const handleSwapToBrickStone = async () => {
    setSaving(true);`,
  `  const handleSwapToBrickStone = async () => {
    if (catalogBlocked || catalogReloadRef.current) {
      setSaveError("Pricing unavailable: selected pole, cap or wall catalog materials need attention. Resolve catalog availability before swapping.");
      return null;
    }
    setSaving(true);`
);
// toolbar + totals props
s = s.replace('          autoSave={autoSave}', '          autoSave={autoSave}\n          pricingUnavailable={catalogBlocked}');
s = s.replace('<FoundationTotals totals={calc.totals} />', '<FoundationTotals totals={calc.totals} pricingUnavailable={catalogBlocked} />');
// section total text
s = s.replace(
  '                    Section total flowing to estimate: <b className="text-red-700">{money(sectionTotal)}</b>',
  '                    Section total flowing to estimate: {catalogBlocked ? <b className="text-amber-700">Estimate handoff paused</b> : <b className="text-red-700">{money(sectionTotal)}</b>}'
);
// global alert + reload button after saveError block
s = s.replace(
  `        {(() => {
          const marker = sourceRefreshRef.current;`,
  `        {catalogBlocked && (
          <div role="alert" className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
            <div className="font-semibold">Pricing unavailable: selected pole, cap or wall catalog materials need attention. Amounts shown are saved snapshots, not current prices. Save and estimate handoff are paused.</div>
            <ul className="mt-1 list-disc pl-5">
              {calc.catalogIssues.map((i, idx) => <li key={idx}>{i.message}</li>)}
            </ul>
            <button type="button" onClick={handleCatalogReload} disabled={catalogReloading || loading || saving}
              className="mt-2 rounded-sm border border-amber-400 bg-white px-2 py-1 text-[12px] font-semibold text-amber-800 disabled:opacity-50">
              {catalogReloading ? "Reloading catalogs…" : "Reload catalogs"}
            </button>
          </div>
        )}

        {(() => {
          const marker = sourceRefreshRef.current;`
);
// customer pricing panels hide when blocked
s = s.replace(
  '                <CustomerPricingPanel\n                  cost={sectionTotal}',
  '                {catalogBlocked ? (\n                  <div className="rounded-sm border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-800">Customer pricing unavailable: catalog pricing is incomplete. Resolve catalog materials first.</div>\n                ) : (<>\n                <CustomerPricingPanel\n                  cost={sectionTotal}'
);
s = s.replace(
  '                  onApplyTier={(tier) => patch({\n                    customer_pricing: { ...(project.customer_pricing || {}), applied: true, tier_number: tier },\n                  })}',
  '                  onAp
