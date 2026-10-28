import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ArrowDown, ArrowUp, ArrowUpDown, Edit, Trash2, Package } from "lucide-react";
import { expectedEntityFields, replaceEntityFieldsIfUnchanged } from "@/components/estimator/builder/builderEntityPersistence";
import { findInventoryEstimateUsage } from "./inventoryPersistence";
import { base44 } from "@/api/base44Client";

// Lazily resolves how many estimates consume this item's inventory row via
// BuilderPart → BuilderProduct joins. Clicking expands which estimates.
function UsageBadge({ itemId }) {
  const [usage, setUsage] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [names, setNames] = useState(null);
  useEffect(() => {
    let active = true;
    findInventoryEstimateUsage(itemId)
      .then((u) => { if (active && u?.estimates > 0) setUsage(u); })
      .catch(() => {});
    return () => { active = false; };
  }, [itemId]);
  useEffect(() => {
    if (!expanded || names !== null || !usage?.estimateIds?.length) return;
    let active = true;
    (async () => {
      const out = [];
      for (const id of usage.estimateIds) {
        const row = await base44.entities.AllInOneEstimate.get(id).catch(() => null);
        out.push(row?.estimate_name || row?.name || row?.project_name || id);
      }
      if (active) setNames(out);
    })();
    return () => { active = false; };
  }, [expanded, names, usage]);
  if (!usage) return null;
  return (
    <span className="relative inline-block">
      <button type="button" onClick={() => setExpanded(!expanded)}
        className="ml-1.5 inline-flex items-center rounded bg-sky-100 px-1 py-0.5 text-[9px] font-semibold text-sky-800 align-middle hover:bg-sky-200"
        title={`Used in ${usage.estimates} estimate${usage.estimates === 1 ? "" : "s"} across ${usage.products} product${usage.products === 1 ? "" : "s"} — click to list`}>
        {usage.estimates} est
      </button>
      {expanded && (
        <span className="absolute left-0 top-full z-20 mt-1 block w-52 rounded border border-slate-200 bg-white p-2 text-[10px] text-slate-700 shadow-lg normal-case">
          <span className="block font-semibold mb-1">Estimates using this item:</span>
          {names === null
            ? <span className="text-slate-400">Resolving…</span>
            : <span className="block space-y-0.5">{names.map((n, i) => <span key={i} className="block truncate">• {n}</span>)}</span>}
        </span>
      )}
    </span>
  );
}

const formatCell = (val, field) => {
  if (val === null || val === undefined || val === "") return "—";
  if (field.type === "number") {
    const n = parseFloat(val);
    if (Number.isNaN(n)) return "—";
    if (field.label.includes("$") || field.name.includes("cost")) {
      return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return n.toLocaleString();
  }
  if (field.type === "boolean") return val ? "Yes" : "No";
  return String(val).replace(/_/g, " ");
};

export default function InventoryTable({ source, items, canEdit, onEdit, onDelete, onInlineToggle }) {
  const tableFields = source.fields.filter((f) => f.table);
  const toggleRef = useRef(new Set());
  const [sort, setSort] = useState(null);

  const toggleSort = (name) => {
    setSort((prev) => {
      if (!prev || prev.name !== name) return { name, dir: "asc" };
      if (prev.dir === "asc") return { name, dir: "desc" };
      return null;
    });
  };

  const sortedItems = !sort ? items : [...items].sort((a, b) => {
    const field = tableFields.find((f) => f.name === sort.name);
    const av = a[sort.name], bv = b[sort.name];
    if (field?.type === "number") {
      const an = parseFloat(av), bn = parseFloat(bv);
      if (Number.isNaN(an) && Number.isNaN(bn)) return 0;
      if (Number.isNaN(an)) return 1;
      if (Number.isNaN(bn)) return -1;
      return sort.dir === "asc" ? an - bn : bn - an;
    }
    const as = (av === null || av === undefined) ? "" : String(av);
    const bs = (bv === null || bv === undefined) ? "" : String(bv);
    const cmp = as.localeCompare(bs, undefined, { numeric: true, sensitivity: "base" });
    return sort.dir === "asc" ? cmp : -cmp;
  });

  const handleToggle = async (item, field, next) => {
    const lockKey = `${item.id}:${field.name}`;
    if (!canEdit || toggleRef.current.has(lockKey)) return;
    toggleRef.current.add(lockKey);
    try {
      // Per-row entity routing for combined-view tabs (e.g. Extruded Metals & Poles).
      // The row may carry an explicit `_entity` reference; otherwise fall back to source.entity.
      const entity = item._entity || source.entity;
      if (!entity) {
        console.warn("No entity available for inline toggle on", item);
        return;
      }
      const live = await entity.get(item.id);
      if (live?.[field.name] !== item[field.name]) {
        onInlineToggle?.(item.id, field.name, live?.[field.name]);
        alert("This inventory toggle changed in another session. The latest value has been restored; review it before changing again.");
        return;
      }
      const togglePatch = { [field.name]: next };
      const saved = await replaceEntityFieldsIfUnchanged({
        entity,
        id: item.id,
        expectedFields: expectedEntityFields(live, togglePatch),
        nextFields: togglePatch,
        label: `Inventory ${field.label || field.name} toggle`,
      });
      onInlineToggle?.(item.id, field.name, saved?.[field.name] ?? next);
    } catch (e) {
      console.error("Toggle failed:", e);
      alert("Failed to update toggle.");
    } finally {
      toggleRef.current.delete(lockKey);
    }
  };

  if (!items.length) {
    return (
      <div className="text-center py-16 text-slate-500">
        <Package className="w-12 h-12 mx-auto mb-4 text-slate-300" />
        <p className="font-medium">No items found</p>
        <p className="text-sm">
          {canEdit ? "Click \"Add Item\" to create your first one." : "Ask an admin to add items here."}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <table className="w-full text-sm table-fixed">
        <thead className="border-b bg-slate-50">
          <tr className="text-left">
            {tableFields.map((f) => (
              <th key={f.name} className="px-2 py-3 font-medium text-slate-600 text-xs">
                <button type="button" onClick={() => toggleSort(f.name)} className="inline-flex items-center gap-1 hover:text-slate-900" title={`Sort by ${f.label}`}>
                  {f.label}
                  {sort?.name === f.name
                    ? (sort.dir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)
                    : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                </button>
              </th>
            ))}
            {canEdit && <th className="px-2 py-3 font-medium text-slate-600 text-right text-xs w-20">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y">
          {sortedItems.map((item) => (
            <tr key={item.id} className="hover:bg-slate-50 transition-colors">
              {tableFields.map((f, idx) => (
                <td key={f.name} className="px-2 py-3 align-top">
                  {idx === 0 ? (
                    <span className="font-medium text-slate-900">{formatCell(item[f.name], f)}<UsageBadge itemId={item.id} /></span>
                  ) : f.type === "boolean" ? (
                    canEdit ? (
                      <Switch
                        checked={!!item[f.name]}
                        onCheckedChange={(next) => handleToggle(item, f, next)}
                      />
                    ) : (
                      <span className="text-slate-700">{formatCell(item[f.name], f)}</span>
                    )
                  ) : f.type === "select" ? (
                    <Badge variant="outline" className="font-normal">
                      {formatCell(item[f.name], f)}
                    </Badge>
                  ) : (
                    <span className="text-slate-700">{formatCell(item[f.name], f)}</span>
                  )}
                </td>
              ))}
              {canEdit && (
                <td className="px-2 py-3 text-right whitespace-nowrap">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(item)}>
                    <Edit className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                    onClick={() => onDelete(item)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}