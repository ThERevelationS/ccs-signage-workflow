import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  Box,
  BookmarkPlus,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  CopyPlus,
  Layers3,
  Link2,
  LockKeyhole,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Unlink,
} from "lucide-react";
import CreatePartGroupModal from "./CreatePartGroupModal";
import BuilderPartEditWarningModal from "./BuilderPartEditWarningModal";
import DetachedPartOverrideModal from "./DetachedPartOverrideModal";
import MasterPartPickerModal from "@/components/estimator/parts/MasterPartPickerModal";
import { base44 } from "@/api/base44Client";
import { detachBuilderPartOverride, updateDetachedPartOverride } from "@/components/estimator/builder/partSync";
import { addCatalogPartToProduct, removeManualProductPart, switchManualProductPart, updateManualProductPart } from "@/components/estimator/parts/customProductService";
import { typeDetails } from "@/components/estimator/parts/partCatalog";
import { money } from "@/components/estimator/aioPricing";
import { copyPartGroupToClipboard, copyPartToClipboard } from "@/components/estimator/products/clipboardService";
import { clonePartGroupInProduct, createPartGroupInProduct, dissolvePartGroup, moveIndependentPartGroup, renamePartGroup } from "@/components/estimator/parts/partGroupService";
import MovePartGroupModal from "./MovePartGroupModal";
import SavePartTemplateModal from "@/components/estimator/parts/SavePartTemplateModal";
import PartLibraryPickerModal from "@/components/estimator/parts/PartLibraryPickerModal";

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

function PartRow({ part, index, selectionMode = false, selected = false, onSelect, onChanged, onEditBuilder, estimateId, expectedEstimateUpdatedAt = "", readOnly = false }) {
  const [open, setOpen] = useState(false);
  const [warningOpen, setWarningOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saveLibraryOpen, setSaveLibraryOpen] = useState(false);
  const frozen = num(part.frozen_extended_cost);
  const current = num(part.current_extended_cost, frozen);
  const differs = Math.abs(current - frozen) > 0.005;
  const meta = priceStateMeta(part);
  const StatusIcon = meta.icon;
  const isManual = part.builder_sync_state === "manual";
  const isManualAddon = part.builder_sync_state === "manual_addon";
  const isDetachedOverride = part.builder_sync_state === "detached_override";
  const isDirectlyEditable = isManual || isManualAddon;
  const isIndependent = isDirectlyEditable || isDetachedOverride;
  const inventoryDetails = typeDetails(part.inventory_entity, part.frozen_inventory_snapshot || {}, part.detail_overrides || {});

  return (
    <div className="border border-gray-200 rounded-sm bg-white overflow-hidden">
      <div className="w-full min-h-[42px] px-3 py-2 flex items-center gap-2 text-left hover:bg-gray-50">
        {selectionMode && (
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => onSelect?.(part.id, event.target.checked)}
            className="h-4 w-4 rounded border-gray-300 accent-lime-500 flex-shrink-0"
            aria-label={`Select ${part.part_name || "Part"}`}
          />
        )}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex-1 min-w-0 flex items-center gap-2 text-left"
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
      </div>

      {open && (
        <div className="border-t border-gray-200 bg-gray-50 px-3 py-3">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="text-[10px] text-gray-500">
              {isManual ? "Custom Product Part — edit directly or keep tracking its Master Inventory price." : isManualAddon ? "Independent add-on Part — not controlled by this Builder and safe from Builder recalculation." : isDetachedOverride ? "Independent override — Builder synchronization is disabled." : "Builder-linked Part — edit through the Builder or detach it first."}
            </div>
            <div className="flex items-center gap-1.5">
              {estimateId && (
                <button
                  type="button"
                  disabled={copying}
                  onClick={async () => {
                    setCopying(true);
                    try {
                      await copyPartToClipboard({ estimateId, builderProductId: part.builder_product_id, part });
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    } catch (error) {
                      window.alert(error?.message || "Part could not be copied to the estimator clipboard.");
                    } finally {
                      setCopying(false);
                    }
                  }}
                  className="h-[28px] px-2.5 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-700 hover:bg-gray-100 inline-flex items-center gap-1 disabled:opacity-50"
                  title="Copy Part to 30-day Clipboard"
                ><ClipboardCopy className="w-3 h-3" /> {copied ? "Copied" : "Copy"}</button>
              )}
              <button type="button" onClick={() => setSaveLibraryOpen(true)} className="h-[28px] px-2.5 rounded border border-violet-200 bg-white text-[11px] font-semibold text-violet-700 hover:bg-violet-50 inline-flex items-center gap-1" title="Save Part permanently to Part Library"><BookmarkPlus className="w-3 h-3" /> Save</button>
              {!readOnly && isDirectlyEditable && (
                <button type="button" onClick={() => setSwitchOpen(true)} className="h-[28px] px-3 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-700 hover:bg-gray-100 inline-flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Switch Part</button>
              )}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => isIndependent ? setOverrideOpen(true) : setWarningOpen(true)}
                  className="h-[28px] px-3 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-700 hover:bg-gray-100"
                >
                  {isDetachedOverride ? "Edit Override" : "Edit Part"}
                </button>
              )}
              {!readOnly && isDirectlyEditable && (
                <button type="button" onClick={async () => { if (!window.confirm(`Remove “${part.part_name || "Part"}” from this Product?`)) return; await removeManualProductPart(part.id, { expectedEstimateUpdatedAt, expectedPartUpdatedAt: part.updated_date || "" }); await onChanged?.(); }} className="h-[28px] px-2.5 rounded border border-red-200 bg-white text-[11px] font-semibold text-red-600 hover:bg-red-50" title="Remove Part"><Trash2 className="w-3 h-3" /></button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
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

          <section className="rounded border border-gray-200 bg-white p-3">
            <div className="text-[9px] font-bold tracking-widest text-gray-400 mb-2">TYPE-SPECIFIC DETAILS</div>
            {inventoryDetails.length ? (
              <dl className="space-y-1.5 text-[11px] max-h-[170px] overflow-y-auto pr-1">
                {inventoryDetails.map((detail) => (
                  <div key={detail.field} className="flex justify-between gap-3 border-b border-gray-50 pb-1 last:border-b-0">
                    <dt className="text-gray-500 flex items-center gap-1">{detail.label}{detail.overridden && <span className="text-[8px] px-1 rounded bg-amber-100 text-amber-700 border border-amber-200">OVERRIDE</span>}</dt>
                    <dd className="font-medium text-gray-800 text-right max-w-[190px] break-words">
                      {Array.isArray(detail.value) ? detail.value.join(", ") : String(detail.value).replaceAll("_", " ")}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <div className="text-[10px] text-gray-400">No additional type-specific inventory fields for this Part.</div>
            )}
          </section>
          </div>
        </div>
      )}

      <BuilderPartEditWarningModal
        open={warningOpen}
        part={part}
        onCancel={() => setWarningOpen(false)}
        onEditBuilder={() => {
          setWarningOpen(false);
          onEditBuilder?.();
        }}
        onDetach={async () => {
          await detachBuilderPartOverride(part.id, undefined, { expectedEstimateUpdatedAt, expectedPartUpdatedAt: part.updated_date || "" });
          setWarningOpen(false);
          setOverrideOpen(true);
          await onChanged?.();
        }}
      />
      <DetachedPartOverrideModal
        open={overrideOpen}
        part={part}
        mode={isDirectlyEditable ? "manual" : "detached"}
        onClose={() => setOverrideOpen(false)}
        onSave={async (changes) => {
          if (isDirectlyEditable) await updateManualProductPart(part.id, changes, { expectedEstimateUpdatedAt, expectedPartUpdatedAt: part.updated_date || "" });
          else await updateDetachedPartOverride(part.id, changes, { expectedEstimateUpdatedAt, expectedPartUpdatedAt: part.updated_date || "" });
          setOverrideOpen(false);
          await onChanged?.();
        }}
      />
      <SavePartTemplateModal
        open={saveLibraryOpen}
        itemType="part"
        part={part}
        estimateId={estimateId}
        builderProductId={part.builder_product_id}
        onClose={() => setSaveLibraryOpen(false)}
      />
      {isDirectlyEditable && (
        <MasterPartPickerModal
          open={switchOpen}
          mode="switch"
          initialQuantity={part.quantity || 1}
          onClose={() => setSwitchOpen(false)}
          onAdd={async (item) => {
            await switchManualProductPart(part.id, item, { expectedEstimateUpdatedAt, expectedPartUpdatedAt: part.updated_date || "" });
            setSwitchOpen(false);
            await onChanged?.();
          }}
        />
      )}
    </div>
  );
}

function PartGroup({ group, parts, globalOffset, selectionMode, selectedIds, onSelect, onChanged, builderProductId, onEditBuilder, estimateId, expectedEstimateUpdatedAt = "", availableProducts = [], readOnly = false }) {
  const [open, setOpen] = useState(!group.is_collapsed);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(group.group_name || "Part Group");
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [saveLibraryOpen, setSaveLibraryOpen] = useState(false);
  const structuralActionRef = useRef(false);
  const groupVersionRef = useRef(group.updated_date || "");
  useEffect(() => {
    groupVersionRef.current = group.updated_date || groupVersionRef.current;
  }, [group.updated_date]);
  const frozen = parts.reduce((sum, part) => sum + num(part.frozen_extended_cost), 0);
  const canMove = parts.length > 0 && parts.every((part) => ["manual", "manual_addon"].includes(part.builder_sync_state));
  const moveTargets = (availableProducts || []).filter((line) => line.builder_product_id && line.builder_product_id !== builderProductId);

  const toggleOpen = async () => {
    const next = !open;
    setOpen(next);
    if (!readOnly) {
      const updated = await base44.entities.BuilderPartGroup.update(group.id, { is_collapsed: !next }).catch(() => null);
      if (updated?.updated_date) groupVersionRef.current = updated.updated_date;
      else {
        const current = await base44.entities.BuilderPartGroup.get(group.id).catch(() => null);
        if (current?.updated_date) groupVersionRef.current = current.updated_date;
      }
    }
  };

  const saveName = async () => {
    if (structuralActionRef.current) return;
    structuralActionRef.current = true;
    const nextName = name.trim() || "Part Group";
    setName(nextName);
    setRenaming(false);
    try {
      await renamePartGroup({
        builderProductId,
        groupId: group.id,
        groupName: nextName,
        expectedEstimateUpdatedAt,
        expectedGroupUpdatedAt: groupVersionRef.current,
      });
      await onChanged?.();
    } catch (error) {
      window.alert(error?.message || "Part Group could not be renamed.");
    } finally {
      structuralActionRef.current = false;
    }
  };

  const dissolve = async () => {
    if (structuralActionRef.current) return;
    if (!window.confirm(`Dissolve “${group.group_name || "Part Group"}”? The Parts will stay in this Product and keep all frozen pricing.`)) return;
    structuralActionRef.current = true;
    try {
      await dissolvePartGroup({
        builderProductId,
        groupId: group.id,
        expectedEstimateUpdatedAt,
        expectedGroupUpdatedAt: groupVersionRef.current,
        expectedPartVersions: Object.fromEntries(parts.map((part) => [part.id, part.updated_date || ""])),
      });
      await onChanged?.();
    } catch (error) {
      window.alert(error?.message || "Part Group could not be dissolved.");
    } finally {
      structuralActionRef.current = false;
    }
  };

  return (
    <div className="border border-gray-300 rounded-sm overflow-hidden bg-gray-50">
      <div className="w-full px-3 py-2 flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-left">
        <button type="button" onClick={toggleOpen} className="flex items-center gap-2 min-w-0 flex-1 text-left">
        {open ? <ChevronDown className="w-3.5 h-3.5 text-gray-600" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-600" />}
        <Layers3 className="w-4 h-4 text-gray-600" />
          <span className="text-[9px] font-extrabold tracking-widest text-gray-500">PART GROUP</span>
          {renaming ? (
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  saveName();
                }
                if (event.key === "Escape") {
                  setName(group.group_name || "Part Group");
                  setRenaming(false);
                }
              }}
              onBlur={saveName}
              className="h-[25px] px-2 border border-gray-300 rounded bg-white text-[12px] font-bold text-gray-900 flex-1 min-w-[120px]"
            />
          ) : (
            <span className="text-[12px] font-bold text-gray-900 truncate flex-1">{group.group_name || "Part Group"}</span>
          )}
          <span className="text-[10px] text-gray-500">{parts.length} parts</span>
          <span className="text-[11px] font-bold text-gray-800 w-[92px] text-right">{money(frozen)}</span>
        </button>
        {!selectionMode && (
          <div className="flex items-center gap-1 ml-1">
            {estimateId && (
              <button
                type="button"
                disabled={copying}
                onClick={async () => {
                  setCopying(true);
                  try {
                    await copyPartGroupToClipboard({ estimateId, builderProductId, group, parts });
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  } catch (error) {
                    window.alert(error?.message || "Part Group could not be copied to the estimator clipboard.");
                  } finally {
                    setCopying(false);
                  }
                }}
                className="h-[26px] px-2 rounded border border-gray-300 bg-white flex items-center gap-1 text-[10px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                title="Copy Part Group to 30-day Clipboard"
              ><ClipboardCopy className="w-3 h-3" /> {copied ? "Copied" : "Copy"}</button>
            )}
            <button
              type="button"
              onClick={() => setSaveLibraryOpen(true)}
              className="h-[26px] px-2 rounded border border-violet-200 bg-white flex items-center gap-1 text-[10px] font-semibold text-violet-700 hover:bg-violet-50"
              title="Save Part Group permanently to Part Library"
            ><BookmarkPlus className="w-3 h-3" /> Save</button>
            {!readOnly && <>
              <button
                type="button"
                disabled={cloning}
                onClick={async () => {
                  if (!window.confirm(`Clone “${group.group_name || "Part Group"}” and all ${parts.length} Part${parts.length === 1 ? "" : "s"}?`)) return;
                  if (structuralActionRef.current) return;
                  structuralActionRef.current = true;
                  setCloning(true);
                  try {
                    await clonePartGroupInProduct({
                      builderProductId,
                      groupId: group.id,
                      expectedEstimateUpdatedAt,
                      expectedGroupUpdatedAt: groupVersionRef.current,
                      expectedPartVersions: Object.fromEntries(parts.map((part) => [part.id, part.updated_date || ""])),
                    });
                    await onChanged?.();
                  } catch (error) {
                    window.alert(error?.message || "Part Group could not be cloned.");
                  } finally {
                    structuralActionRef.current = false;
                    setCloning(false);
                  }
                }}
                className="h-[26px] px-2 rounded border border-gray-300 bg-white flex items-center gap-1 text-[10px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                title="Clone Part Group in this Product"
              ><CopyPlus className="w-3 h-3" /> {cloning ? "Cloning…" : "Clone"}</button>
              <button
                type="button"
                disabled={!canMove || moveTargets.length === 0}
                onClick={() => setMoveOpen(true)}
                className="h-[26px] px-2 rounded border border-gray-300 bg-white flex items-center gap-1 text-[10px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                title={canMove ? "Move Part Group to another Product" : "Builder-owned Parts cannot move directly. Use Clone or Copy instead."}
              ><ArrowRightLeft className="w-3 h-3" /> Move</button>
              <button
                type="button"
                onClick={() => setRenaming(true)}
                className="w-[26px] h-[26px] rounded border border-gray-300 bg-white flex items-center justify-center text-gray-600 hover:bg-gray-50"
                title="Rename Part Group"
              >
                <Pencil className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={dissolve}
                className="w-[26px] h-[26px] rounded border border-gray-300 bg-white flex items-center justify-center text-gray-500 hover:text-red-600 hover:bg-red-50"
                title="Dissolve Part Group"
              >
                <Unlink className="w-3 h-3" />
              </button>
            </>}
          </div>
        )}
      </div>
      {open && (
        <div className="p-2 space-y-2 border-t border-gray-200">
          {parts.map((part, index) => (
            <PartRow
              key={part.id}
              part={part}
              index={globalOffset + index}
              selectionMode={selectionMode}
              selected={selectedIds.has(part.id)}
              onSelect={onSelect}
              onChanged={onChanged}
              onEditBuilder={onEditBuilder}
              estimateId={estimateId}
              expectedEstimateUpdatedAt={expectedEstimateUpdatedAt}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}
      <MovePartGroupModal
        open={moveOpen}
        group={group}
        sourceBuilderProductId={builderProductId}
        products={moveTargets}
        onClose={() => setMoveOpen(false)}
        onMove={async (targetBuilderProductId) => {
          if (structuralActionRef.current) return;
          structuralActionRef.current = true;
          try {
            await moveIndependentPartGroup({
              sourceBuilderProductId: builderProductId,
              targetBuilderProductId,
              groupId: group.id,
              expectedEstimateUpdatedAt,
              expectedGroupUpdatedAt: groupVersionRef.current,
              expectedPartVersions: Object.fromEntries(parts.map((part) => [part.id, part.updated_date || ""])),
            });
            setMoveOpen(false);
            await onChanged?.();
          } finally {
            structuralActionRef.current = false;
          }
        }}
      />
      <SavePartTemplateModal
        open={saveLibraryOpen}
        itemType="part_group"
        group={group}
        parts={parts}
        estimateId={estimateId}
        builderProductId={builderProductId}
        onClose={() => setSaveLibraryOpen(false)}
      />
    </div>
  );
}

export default function BuilderPartsPanel({ builderProductId, refreshKey, onLoaded, onEditBuilder, onProductRefresh, allowAddParts = false, estimateId, expectedEstimateUpdatedAt = "", availableProducts = [], readOnly = false }) {
  const [loading, setLoading] = useState(!!builderProductId);
  const [parts, setParts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [partPickerOpen, setPartPickerOpen] = useState(false);
  const [partLibraryOpen, setPartLibraryOpen] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const groupCreateRef = useRef(false);

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
  }, [builderProductId, refreshKey, refreshNonce]);

  const togglePartSelection = (partId, checked) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(partId);
      else next.delete(partId);
      return next;
    });
  };

  const cancelSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setGroupModalOpen(false);
  };

  const createGroup = async (groupName) => {
    const selectedParts = parts.filter((part) => selectedIds.has(part.id));
    if (!builderProductId || selectedParts.length < 2 || groupCreateRef.current) return;
    groupCreateRef.current = true;
    try {
      await createPartGroupInProduct({
        builderProductId,
        partIds: selectedParts.map((part) => part.id),
        groupName,
        expectedEstimateUpdatedAt,
        expectedPartVersions: Object.fromEntries(selectedParts.map((part) => [part.id, part.updated_date || ""])),
      });
      setGroupModalOpen(false);
      setSelectionMode(false);
      setSelectedIds(new Set());
      setRefreshNonce((value) => value + 1);
      await onProductRefresh?.();
    } finally {
      groupCreateRef.current = false;
    }
  };

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
        <div className="text-[11px] font-semibold text-gray-600">This Product does not have any Parts yet.</div>
        <div className="text-[10px] text-gray-400 mt-1">Add a Part from Master Inventory now. Builder-generated BOM Parts will also appear here after the Builder is saved; manually added Parts remain independent add-ons.</div>
        {allowAddParts && !readOnly && (
          <div className="mt-3 flex items-center justify-center gap-2">
            <button type="button" onClick={() => setPartPickerOpen(true)} className="h-[30px] px-3 rounded border border-lime-400 bg-lime-200 text-[11px] font-bold text-gray-900 hover:bg-lime-300 inline-flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Add Part</button>
            <button type="button" onClick={() => setPartLibraryOpen(true)} className="h-[30px] px-3 rounded border border-violet-200 bg-white text-[11px] font-bold text-violet-700 hover:bg-violet-50 inline-flex items-center gap-1.5"><BookmarkPlus className="w-3.5 h-3.5" /> Add Saved Part</button>
          </div>
        )}
        <MasterPartPickerModal
          open={partPickerOpen}
          onClose={() => setPartPickerOpen(false)}
          onAdd={async (item, quantity) => {
            await addCatalogPartToProduct({ builderProductId, catalogItem: item, quantity, expectedEstimateUpdatedAt });
            setRefreshNonce((value) => value + 1);
            await onProductRefresh?.();
          }}
        />
        <PartLibraryPickerModal
          open={partLibraryOpen}
          estimateId={estimateId}
          builderProductId={builderProductId}
          expectedEstimateUpdatedAt={expectedEstimateUpdatedAt}
          onClose={() => setPartLibraryOpen(false)}
          onAdded={async () => {
            setRefreshNonce((value) => value + 1);
            await onProductRefresh?.();
          }}
        />
      </div>
    );
  }

  let offset = 0;
  return (
    <div className="border-t border-gray-300 bg-[#f6f6f6] px-3 py-3 space-y-2">
      <div className="flex items-center justify-between gap-2 pb-1">
        <div className="text-[10px] font-bold tracking-widest text-gray-500">PRODUCT PARTS · {parts.length}</div>
        {selectionMode ? (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500">{selectedIds.size} selected</span>
            <button
              type="button"
              onClick={cancelSelection}
              className="h-[28px] px-3 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={selectedIds.size < 2}
              onClick={() => setGroupModalOpen(true)}
              className="h-[28px] px-3 rounded border border-lime-400 bg-lime-200 text-[11px] font-bold text-gray-900 hover:bg-lime-300 disabled:opacity-40"
            >
              Group Selected Parts
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {allowAddParts && !readOnly && (
              <>
                <button type="button" onClick={() => setPartPickerOpen(true)} className="h-[28px] px-3 rounded border border-lime-400 bg-lime-200 text-[11px] font-bold text-gray-900 hover:bg-lime-300 inline-flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Add Part</button>
                <button type="button" onClick={() => setPartLibraryOpen(true)} className="h-[28px] px-3 rounded border border-violet-200 bg-white text-[11px] font-bold text-violet-700 hover:bg-violet-50 inline-flex items-center gap-1.5"><BookmarkPlus className="w-3.5 h-3.5" /> Add Saved Part</button>
              </>
            )}
            {!readOnly && <button
              type="button"
              onClick={() => setSelectionMode(true)}
              className="h-[28px] px-3 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-700 hover:bg-gray-100 inline-flex items-center gap-1.5"
            >
              <Layers3 className="w-3.5 h-3.5" /> Group Parts
            </button>}
          </div>
        )}
      </div>

      {groups.map((group) => {
        const groupParts = grouped.byGroup.get(group.id) || [];
        if (!groupParts.length) return null;
        const node = (
          <PartGroup
            key={group.id}
            group={group}
            parts={groupParts}
            globalOffset={offset}
            selectionMode={selectionMode}
            selectedIds={selectedIds}
            onSelect={togglePartSelection}
            onChanged={async () => {
              setRefreshNonce((value) => value + 1);
              await onProductRefresh?.();
            }}
            builderProductId={builderProductId}
            onEditBuilder={onEditBuilder}
            estimateId={estimateId}
            expectedEstimateUpdatedAt={expectedEstimateUpdatedAt}
            availableProducts={availableProducts}
            readOnly={readOnly}
          />
        );
        offset += groupParts.length;
        return node;
      })}
      {grouped.ungrouped.map((part, index) => (
        <PartRow
          key={part.id}
          part={part}
          index={offset + index}
          selectionMode={selectionMode}
          selected={selectedIds.has(part.id)}
          onSelect={togglePartSelection}
          onChanged={async () => {
            setRefreshNonce((value) => value + 1);
            await onProductRefresh?.();
          }}
          onEditBuilder={onEditBuilder}
          estimateId={estimateId}
          expectedEstimateUpdatedAt={expectedEstimateUpdatedAt}
          readOnly={readOnly}
        />
      ))}

      <CreatePartGroupModal
        open={groupModalOpen}
        selectedCount={selectedIds.size}
        onClose={() => setGroupModalOpen(false)}
        onCreate={createGroup}
      />
      <MasterPartPickerModal
        open={partPickerOpen}
        onClose={() => setPartPickerOpen(false)}
        onAdd={async (item, quantity) => {
          await addCatalogPartToProduct({ builderProductId, catalogItem: item, quantity, expectedEstimateUpdatedAt });
          setRefreshNonce((value) => value + 1);
          await onProductRefresh?.();
        }}
      />
      <PartLibraryPickerModal
        open={partLibraryOpen}
        estimateId={estimateId}
        builderProductId={builderProductId}
        expectedEstimateUpdatedAt={expectedEstimateUpdatedAt}
        onClose={() => setPartLibraryOpen(false)}
        onAdded={async () => {
          setRefreshNonce((value) => value + 1);
          await onProductRefresh?.();
        }}
      />
    </div>
  );
}
