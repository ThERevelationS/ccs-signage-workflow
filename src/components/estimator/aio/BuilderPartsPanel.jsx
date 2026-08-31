import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Box,
  ChevronDown,
  ChevronRight,
  Layers3,
  Link2,
  LockKeyhole,
  Unlink,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { money } from "@/components/estimator/aioPricing";

const num = (value, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

const typeLabel = (part) =>
  String(part?.part_type || "part")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const priceStateMeta = (part) => {
  if (["detached", "reattach_available"].includes(part.inventory_link_state) || part.price_state === "detached") {
    return { label: "Detached", className: "bg-amber-50 text-amber-700 border-amber-200", icon: Unlink };
  }
  if (part.price_state === "changed") {
    return { label: "Price updated", className: "bg-amber-50 text-amber-700 border-amber-200", icon: AlertTriangle };
  }
  if (part.price_state === "legacy_frozen") {
    return { label: "Frozen legacy price", className: "bg-slate-100 text-slate-600 border-slate-200", icon: LockKeyhole };
  }
  return { label: "Price current", className: "bg-green-50 text-green-700 border-green-200", icon: Link2 };
};

function PartRow({ part, index }) {
  const [open, setOpen] = useState(false);
  const frozen = num(part.frozen_extended_cost);
  const current = num(part.current_extended_cost, frozen);
  const differs = Math.abs(current - frozen) > 0.005;
  const meta = priceStateMeta(part);
  const StatusIcon = meta.icon;

  return (
    <div className="border border-gray-200 rounded-sm bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="w-full min-h-[42px] px-3 py-2 flex items-center gap-2 text-left hover:bg-gray-50"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />}
        <Box className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-[9px] font-bold tracking-wider text-gray-400 w-[52px] flex-shrink-0">PART {String(index + 1).padStart(2, "0")}</span>
        <span className="text-[12px] font-semibold text-gray-900 truncate flex-1">{part.client_label || part.part_name || "Part"}</span>
        <span className="hidden md:inline text-[10px] text-gray-500 px-2 py-0.5 rounded bg-gray-100">{typeLabel(part)}</span>
        <span className={`hidden sm:inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full border ${meta.className}`}>
          <StatusIcon className="w-3 h-3" /> {meta.label}
        </span>
        <div className="text-right w-[92px] flex-shrink-0">
          <div className="text-[11px] font-bold text-gray-800">{money(frozen)}</div>
          {differs && <div className="text-[9px] text-amber-600">current {money(current)}</div>}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-200 bg-gray-50 px-3 py-3 grid grid-cols-1 lg:grid-cols-3 gap-3">
          <section className="rounded border border-gray-200 bg-white p-3">
            <div className="text-[9px] font-bold tracking-widest text-gray-400 mb-2">PART INFORMATION</div>
            <dl className="space-y-1.5 text-[11px]">
              <div className="flex justify-between gap-3"><dt className="text-gray-500">Type</dt><dd className="font-medium text-gray-800 text-right">{typeLabel(part)}</dd></div>
              {part.part_subtype && <div className="flex justify-between gap-3"><dt className="text-gray-500">Subtype</dt><dd className="font-medium text-gray-800 text-right">{String(part.part_subtype).replaceAll("_", " ")}</dd></div>}
              <div className="flex justify-between gap-3"><dt className="text-gray-500">Quantity</dt><dd className="font-medium text-gray-800 text-right">{num(part.quantity, 1).toLocaleString()} {part.unit || ""}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-500">Builder source</dt><dd className="font-medium text-gray-800 text-right truncate max-w-[190px]">{part.source_module_key || "Manual"}</dd></div>
            </dl>
          </section>

          <section className="rounded border border-gray-200 bg-white p-3">
            <div className="text-[9px] font-bold tracking-widest text-gray-400 mb-2">MASTER INVENTORY LINK</div>
            <dl className="space-y-1.5 text-[11px]">
              <div className="flex justify-between gap-3"><dt className="text-gray-500">Status</dt><dd className="font-medium text-right">{part.inventory_link_state === "manual" ? "Manual / Builder cost" : String(part.inventory_link_state || "manual").replaceAll("_", " ")}</dd></div>
              {part.inventory_item_name && <div className="flex justify-between gap-3"><dt className="text-gray-500">Inventory Part</dt><dd className="font-medium text-gray-800 text-right truncate max-w-[190px]">{part.inventory_item_name}</dd></div>}
              {part.inventory_entity && <div className="flex justify-between gap-3"><dt className="text-gray-500">Inventory Type</dt><dd className="font-medium text-gray-800 text-right truncate max-w-[190px]">{part.inventory_entity}</dd></div>}
              {part.reattach_candidate_name && <div className="flex justify-between gap-3"><dt className="text-gray-500">Suggested match</dt><dd className="font-medium text-lime-700 text-right truncate max-w-[190px]">{part.reattach_candidate_name}</dd></div>}
            </dl>
          </section>

          <section className="rounded border border-gray-200 bg-white p-3">
            <div className="text-[9px] font-bold tracking-widest text-gray-400 mb-2">PRICING INFORMATION</div>
            <dl className="space-y-1.5 text-[11px]">
              <div className="flex justify-between gap-3"><dt className="text-gray-500">Frozen unit cost</dt><dd className="font-semibold text-gray-800">{money(num(part.frozen_unit_cost))}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-500">Frozen extended</dt><dd className="font-semibold text-gray-800">{money(frozen)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-500">Current unit cost</dt><dd className={differs ? "font-semibold text-amber-700" : "font-semibold text-gray-800"}>{money(num(part.current_unit_cost, num(part.frozen_unit_cost)))}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-500">Current extended</dt><dd className={differs ? "font-semibold text-amber-700" : "font-semibold text-gray-800"}>{money(current)}</dd></div>
            </dl>
          </section>
        </div>
      )}
    </div>
  );
}

function PartGroup({ group, parts, globalOffset }) {
  const [open, setOpen] = useState(!group.is_collapsed);
  const frozen = parts.reduce((sum, part) => sum + num(part.frozen_extended_cost), 0);

  return (
    <div className="border border-gray-300 rounded-sm overflow-hidden bg-gray-50">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="w-full px-3 py-2 flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-left"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-gray-600" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-600" />}
        <Layers3 className="w-4 h-4 text-gray-600" />
        <span className="text-[9px] font-extrabold tracking-widest text-gray-500">PART GROUP</span>
        <span className="text-[12px] font-bold text-gray-900 truncate flex-1">{group.group_name || "Part Group"}</span>
        <span className="text-[10px] text-gray-500">{parts.length} parts</span>
        <span className="text-[11px] font-bold text-gray-800 w-[92px] text-right">{money(frozen)}</span>
      </button>
      {open && (
        <div className="p-2 space-y-2 border-t border-gray-200">
          {parts.map((part, index) => (
            <PartRow key={part.id} part={part} index={globalOffset + index} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function BuilderPartsPanel({ builderProductId, refreshKey, onLoaded }) {
  const [loading, setLoading] = useState(!!builderProductId);
  const [parts, setParts] = useState([]);
  const [groups, setGroups] = useState([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!builderProductId) {
        setParts([]);
        setGroups([]);
        setLoading(false);
        onLoaded?.(0);
        return;
      }
      setLoading(true);
      try {
        const [partRows, groupRows] = await Promise.all([
          base44.entities.BuilderPart.filter({ builder_product_id: builderProductId }),
          base44.entities.BuilderPartGroup.filter({ builder_product_id: builderProductId }),
        ]);
        if (!active) return;
        const activeParts = (partRows || [])
          .filter((part) => part.is_active !== false)
          .sort((a, b) => num(a.sort_order) - num(b.sort_order));
        const activeGroups = (groupRows || [])
          .filter((group) => group.is_active !== false)
          .sort((a, b) => num(a.sort_order) - num(b.sort_order));
        setParts(activeParts);
        setGroups(activeGroups);
        onLoaded?.(activeParts.length);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [builderProductId, refreshKey]);

  const grouped = useMemo(() => {
    const byGroup = new Map();
    groups.forEach((group) => byGroup.set(group.id, []));
    const ungrouped = [];
    parts.forEach((part) => {
      if (part.part_group_id && byGroup.has(part.part_group_id)) byGroup.get(part.part_group_id).push(part);
      else ungrouped.push(part);
    });
    return { byGroup, ungrouped };
  }, [parts, groups]);

  if (!builderProductId) {
    return <div className="px-4 py-4 text-[11px] text-gray-400">This legacy Product does not have Builder Parts yet.</div>;
  }
  if (loading) {
    return <div className="px-4 py-4 text-[11px] text-gray-400">Loading Parts…</div>;
  }
  if (!parts.length) {
    return (
      <div className="px-4 py-5 text-center border-t border-gray-200 bg-gray-50">
        <div className="text-[11px] font-semibold text-gray-600">No Parts have been materialized yet.</div>
        <div className="text-[10px] text-gray-400 mt-1">Open and save this Builder once to generate its frozen BOM Parts.</div>
      </div>
    );
  }

  let offset = 0;
  return (
    <div className="border-t border-gray-300 bg-[#f6f6f6] px-3 py-3 space-y-2">
      {groups.map((group) => {
        const groupParts = grouped.byGroup.get(group.id) || [];
        if (!groupParts.length) return null;
        const node = <PartGroup key={group.id} group={group} parts={groupParts} globalOffset={offset} />;
        offset += groupParts.length;
        return node;
      })}
      {grouped.ungrouped.map((part, index) => (
        <PartRow key={part.id} part={part} index={offset + index} />
      ))}
    </div>
  );
}
