const quantity = (n) => (n > 0 && n < 0.0001 ? "<0.0001" : n.toLocaleString("en-US", { maximumFractionDigits: 4 }));

export default function FoundationReinforcementPricingInfo({ presentation, formatMoney }) {
  if (!presentation) return null;
  const amount = (n) =>
    typeof n !== "number" || !Number.isFinite(n) || n < 0
      ? "Unavailable"
      : n > 0 && n < 0.005
        ? "<$0.01"
        : formatMoney(n);
  const { current, frozen, frozenStatus, frozenAmount, removalPending, catalogUnverified } = presentation;
  const recorded = frozenStatus === "recorded";
  const pending = removalPending;

  return (
    <section className="rounded border border-gray-200 bg-white p-3">
      <div className="text-[9px] font-bold tracking-widest text-gray-500 mb-2">REINFORCEMENT PRICING</div>
      <dl className="space-y-1.5 text-[11px]">
        <div className="flex justify-between gap-3"><dt className="text-gray-500">Frozen quantity</dt><dd className="font-medium text-gray-800 text-right min-w-0 break-all">{recorded ? `${quantity(frozen.quantity)} ${frozen.unit}` : frozenStatus === "unrecorded" ? "Not recorded" : "Unavailable"}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-gray-500">Frozen unit cost</dt><dd className="font-medium text-gray-800 text-right min-w-0 break-all">{recorded ? `${amount(frozen.unit_cost)} / ${frozen.unit}` : frozenStatus === "unrecorded" ? "Not recorded" : "Unavailable"}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-gray-500">Frozen extended</dt><dd className="font-semibold text-gray-800 text-right min-w-0 break-all">{amount(frozenAmount)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-gray-500">Last priced quantity</dt><dd className="font-medium text-gray-800 text-right min-w-0 break-all">{current ? `${quantity(current.quantity)} ${current.unit}` : pending ? "Removal pending" : "Unavailable"}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-gray-500">Last unit cost</dt><dd className="font-medium text-gray-800 text-right min-w-0 break-all">{current ? `${amount(current.unit_cost)} / ${current.unit}` : pending ? "Not applicable" : "Unavailable"}</dd></div>
        {pending ? (
          <div className="flex justify-between gap-3"><dt className="text-gray-500">After removal</dt><dd className="font-semibold text-gray-800 text-right min-w-0 break-all">{amount(0)}</dd></div>
        ) : (
          <div className="flex justify-between gap-3"><dt className="text-gray-500">Last extended</dt><dd className="font-semibold text-gray-800 text-right min-w-0 break-all">{current ? amount(current.extended_cost) : "Unavailable"}</dd></div>
        )}
        {current && (
          <div className="flex justify-between gap-3"><dt className="text-gray-500">Physical steel</dt><dd className="font-medium text-gray-800 text-right min-w-0 break-all">{`${quantity(current.reinforcement_snapshot.physical_quantity_ft)} ft`}</dd></div>
        )}
        {current && (
          <div className="flex justify-between gap-3"><dt className="text-gray-500">Physical weight</dt><dd className="font-medium text-gray-800 text-right min-w-0 break-all">{`${quantity(current.reinforcement_snapshot.geometry_weight_lbs)} lb`}</dd></div>
        )}
      </dl>
      <div className="mt-2 space-y-1 text-[10px] text-gray-500">
        <div>Preliminary quantities; engineering and purchasing review required.</div>
        {catalogUnverified && <div className="text-amber-700">Catalog basis is unverified. Reopen and save Foundation before updating price.</div>}
        {frozenStatus === "invalid" && <div className="text-amber-700">Frozen price basis is invalid. Review pricing before updating the estimate.</div>}
        {frozenStatus === "unrecorded" && <div>Quantity and unit basis were not recorded; the frozen amount was retained without an inferred rate.</div>}
        {pending && <div>Frozen amount retained until Update Price is explicitly accepted; the previous geometry no longer represents the design.</div>}
      </div>
    </section>
  );
}
