import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Landmark, Lock, LockOpen, MapPin } from "lucide-react";
import {
  sanitizeDesignBasisWrite,
  sanitizeSiteHazardWrite,
  WRITABLE_SOURCES,
  HAZARD_UNITS,
  RISK_CATEGORIES,
  EXPOSURE_CATEGORIES,
} from "./foundationDesignBasis";

// O-104/O-105 — project-level capture of the design-basis edition/locality
// and the site/hazard inputs. Renders inside the estimator's project
// settings surface (FoundationRatesPanel) and writes through the same
// { project, onChange } patch contract every other project field uses, so
// capture flows through the page's single commit/undo/dirty/save path.
//
// Nothing here is a default: fields render the recorded value or empty;
// "" clears back to unset (coords record an explicit null — the schema
// declares them nullable). Provenance (basis_source / entry_method /
// timestamps) is stamped by foundationDesignBasis on every authored write
// — 'api' is reserved and never offered.

const CODE_EDITION_SUGGESTIONS = [
  "ASCE 7-16",
  "ASCE 7-22",
  "IBC 2018",
  "IBC 2021",
  "IBC 2024",
  "OBC 2017",
  "OBC 2019",
  "OBC 2024",
];

const fmtTs = (ts) => {
  const t = typeof ts === "string" ? Date.parse(ts) : NaN;
  return Number.isFinite(t) ? new Date(t).toLocaleString() : "—";
};

// Whole-value-commit text input for code_edition: intermediate keystrokes
// stay local so code_edition_prior always records the true superseded
// edition, not a mid-typing fragment. Commits on blur and Enter.
function EditionInput({ value, disabled, onCommit }) {
  const [draft, setDraft] = useState(null);
  const shown = draft !== null ? draft : value ?? "";
  const commit = () => {
    if (draft === null) return;
    const v = draft;
    setDraft(null);
    if (v !== (value ?? "")) onCommit(v);
  };
  return (
    <>
      <Input
        list="foundation-code-editions"
        placeholder="Locally adopted edition — e.g. ASCE 7-16"
        value={shown}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="h-[30px] text-[12px] mt-0.5"
      />
      <datalist id="foundation-code-editions">
        {CODE_EDITION_SUGGESTIONS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
}

// Decimal coordinate input: drafts freely while focused; "" commits an
// explicit null (recorded-but-unset), a finite number commits on the fly,
// and non-numeric fragments simply stay local until blur reverts to the
// recorded value.
function CoordInput({ label, value, onCommit }) {
  const [draft, setDraft] = useState(null);
  const shown =
    draft !== null ? draft : value === null || value === undefined ? "" : String(value);
  return (
    <label className="text-[11px] text-gray-500 block">
      {label}
      <Input
        inputMode="decimal"
        placeholder="—"
        value={shown}
        onChange={(e) => {
          const t = e.target.value;
          setDraft(t);
          if (t.trim() === "") onCommit(null);
          else {
            const n = Number(t);
            if (Number.isFinite(n)) onCommit(n);
          }
        }}
        onBlur={() => setDraft(null)}
        className="h-[30px] text-[12px] mt-0.5"
      />
    </label>
  );
}

const selectCls =
  "flex h-[30px] w-full rounded-md border border-input bg-transparent px-2 text-[12px] shadow-sm disabled:bg-gray-100";

export default function FoundationDesignBasisPanel({ project, onChange }) {
  const basis =
    project?.design_basis && typeof project.design_basis === "object"
      ? project.design_basis
      : undefined;
  const hazard =
    project?.site_hazard && typeof project.site_hazard === "object"
      ? project.site_hazard
      : undefined;
  const locked = basis?.basis_locked === true;
  // Arming = the recorded re-capture intent for this editing session. It is
  // passed as `confirmed` so locked-basis edits land through the model gate.
  // Scoped to project.id — this panel can stay mounted across a project
  // switch, and one project's unlock must never arm another's.
  const [armedFor, setArmedFor] = useState(null);
  const armed = armedFor === project?.id;
  const gated = locked && !armed;
  // Session-scoped provenance selection (also project.id-scoped). Defaults
  // to 'manual': an authored edit re-marks a captured basis manual unless
  // the user explicitly picks official-report transcription this session
  // (it then sticks for the session's writes). The select displays the
  // recorded value otherwise.
  const [sourceSelState, setSourceSelState] = useState({ id: null, v: null });
  const [entrySelState, setEntrySelState] = useState({ id: null, v: null });
  const sourceSel = sourceSelState.id === project?.id ? sourceSelState.v : null;
  const entrySel = entrySelState.id === project?.id ? entrySelState.v : null;
  const setSourceSel = (v) => setSourceSelState({ id: project?.id ?? null, v });
  const setEntrySel = (v) => setEntrySelState({ id: project?.id ?? null, v });
  const [basisIssues, setBasisIssues] = useState([]);
  const [hazardIssues, setHazardIssues] = useState([]);

  const sourceShown =
    sourceSel ?? (WRITABLE_SOURCES.includes(basis?.basis_source) ? basis.basis_source : "manual");
  const entryShown =
    entrySel ?? (WRITABLE_SOURCES.includes(hazard?.entry_method) ? hazard.entry_method : "manual");

  const writeBasis = (fields, { confirmed } = {}) => {
    const r = sanitizeDesignBasisWrite(basis, fields, {
      now: new Date().toISOString(),
      confirmed: confirmed === true || armed,
    });
    setBasisIssues(r.issues || []);
    if (r.rejected || r.changed === false) return;
    onChange({ design_basis: r.next === undefined ? null : r.next });
  };

  const writeContentBasis = (fields) =>
    writeBasis({ basis_source: sourceSel ?? "manual", ...fields });

  const writeHazard = (fields) => {
    const r = sanitizeSiteHazardWrite(hazard, fields, { now: new Date().toISOString() });
    setHazardIssues(r.issues || []);
    if (r.changed === false) return;
    onChange({ site_hazard: r.next === undefined ? null : r.next });
  };

  const writeContentHazard = (fields) =>
    writeHazard({ entry_method: entrySel ?? "manual", ...fields });

  const confirmRecapture = () =>
    window.confirm(
      `This project's design basis was locked${
        basis?.basis_captured_at ? ` after capture at ${fmtTs(basis.basis_captured_at)}` : ""
      }. Changing it is recorded as an explicit re-capture (the prior edition is preserved). Continue?`
    );

  const armForEdit = () => {
    if (confirmRecapture()) setArmedFor(project?.id ?? null);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold text-gray-900 flex items-center gap-1.5">
          <Landmark className="w-4 h-4 text-gray-400" /> Design basis &amp; site hazard
        </h2>
        <span className="text-xs text-gray-400">Captured per project — preliminary engineering inputs</span>
      </div>

      <p className="text-[11px] text-gray-500 leading-snug">
        Record which <b>locally adopted</b> code edition and jurisdiction this project's preliminary
        basis stands on — the newest published edition is never assumed to be the adopted one. Entries
        are manual or transcribed from an official report; API automation is a reserved path, not
        wired today.
      </p>

      {/* ---- O-104: design basis ---- */}
      <section className="rounded-lg border border-gray-100 bg-slate-50/60 p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-bold text-gray-700 uppercase tracking-wide flex items-center gap-1.5">
            {locked ? (
              <Lock className="w-3.5 h-3.5 text-amber-600" />
            ) : (
              <LockOpen className="w-3.5 h-3.5 text-gray-400" />
            )}
            Design basis
          </div>
          {gated ? (
            <button
              type="button"
              onClick={armForEdit}
              className="text-[11px] font-semibold text-red-700 hover:text-red-800 underline underline-offset-2"
            >
              Change basis…
            </button>
          ) : basis ? (
            <label className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={locked}
                onChange={(e) => {
                  if (e.target.checked) {
                    writeBasis({ basis_locked: true });
                    setArmedFor(null);
                  } else if (confirmRecapture()) {
                    // Unlocking is itself a gated write — the confirm IS the
                    // recorded re-capture intent for this change.
                    setArmedFor(project?.id ?? null);
                    writeBasis({ basis_locked: false }, { confirmed: true });
                  }
                }}
                className="accent-red-700"
              />
              Lock captured basis
            </label>
          ) : null}
        </div>

        {gated && (
          <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
            Basis locked — <b>{basis?.code_edition || "edition not recorded"}</b>
            {basis?.jurisdiction ? ` · ${basis.jurisdiction}` : ""} — captured{" "}
            {fmtTs(basis?.basis_captured_at)}. Use “Change basis…” to record a re-capture.
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-[11px] text-gray-500 block">
            Locally adopted code edition
            <EditionInput
              value={basis?.code_edition}
              disabled={gated}
              onCommit={(v) => writeContentBasis({ code_edition: v })}
            />
          </label>
          <label className="text-[11px] text-gray-500 block">
            Jurisdiction / locality
            <Input
              placeholder="e.g. City of Milford, Clermont County, OH"
              value={basis?.jurisdiction ?? ""}
              disabled={gated}
              onChange={(e) => writeContentBasis({ jurisdiction: e.target.value })}
              className="h-[30px] text-[12px] mt-0.5"
            />
          </label>
          <label className="text-[11px] text-gray-500 block sm:col-span-2">
            Basis notes — local amendments, ordinance refs, partial adoptions
            <Input
              placeholder="e.g. 2018 IBC as amended by City Ord. 19-44; ASCE 7-16 wind provisions retained"
              value={basis?.basis_notes ?? ""}
              disabled={gated}
              onChange={(e) => writeContentBasis({ basis_notes: e.target.value })}
              className="h-[30px] text-[12px] mt-0.5"
            />
          </label>
          <label className="text-[11px] text-gray-500 block">
            How was this basis recorded?
            <select
              value={sourceShown}
              disabled={gated}
              onChange={(e) => {
                const v = e.target.value;
                setSourceSel(v);
                writeBasis({ basis_source: v });
              }}
              className={selectCls + " mt-0.5"}
            >
              <option value="manual">Manual entry</option>
              <option value="official_report">Transcribed from official report</option>
            </select>
          </label>
        </div>

        {basisIssues.length > 0 && (
          <div className="text-[11px] text-red-700">{basisIssues.map((i) => i.message).join(" ")}</div>
        )}

        <div className="text-[10px] text-gray-400 pt-0.5">
          {basis?.basis_captured_at ? (
            <>
              Basis captured {fmtTs(basis.basis_captured_at)} · last edit {fmtTs(basis.basis_updated_at)}{" "}
              · source <b className="text-gray-500">{basis.basis_source || "manual"}</b>
              {basis.code_edition_prior ? (
                <>
                  {" "}
                  · prior edition <b className="text-amber-700">{basis.code_edition_prior}</b>
                </>
              ) : null}
            </>
          ) : (
            "No basis captured yet — record the locally adopted edition and jurisdiction."
          )}
        </div>
      </section>

      {/* ---- O-105: site / hazard inputs ---- */}
      <section className="rounded-lg border border-gray-100 bg-slate-50/60 p-3 space-y-2.5">
        <div className="text-[11px] font-bold text-gray-700 uppercase tracking-wide flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-gray-400" /> Site &amp; hazard inputs
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <CoordInput
            label="Latitude (decimal °)"
            value={hazard?.latitude}
            onCommit={(n) => writeContentHazard({ latitude: n })}
          />
          <CoordInput
            label="Longitude (decimal °)"
            value={hazard?.longitude}
            onCommit={(n) => writeContentHazard({ longitude: n })}
          />
          <label className="text-[11px] text-gray-500 block">
            Units
            <select
              value={hazard?.units ?? ""}
              onChange={(e) => writeContentHazard({ units: e.target.value })}
              className={selectCls + " mt-0.5"}
            >
              <option value="">— not recorded —</option>
              {HAZARD_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u === "imperial" ? "Imperial" : "Metric"}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-gray-500 block">
            Risk category
            <select
              value={hazard?.risk_category ?? ""}
              onChange={(e) => writeContentHazard({ risk_category: e.target.value })}
              className={selectCls + " mt-0.5"}
            >
              <option value="">— not recorded —</option>
              {RISK_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-gray-500 block">
            Exposure category
            <select
              value={hazard?.exposure_category ?? ""}
              onChange={(e) => writeContentHazard({ exposure_category: e.target.value })}
              className={selectCls + " mt-0.5"}
            >
              <option value="">— not recorded —</option>
              {EXPOSURE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-gray-500 block">
            Entry method
            <select
              value={entryShown}
              onChange={(e) => {
                const v = e.target.value;
                setEntrySel(v);
                writeHazard({ entry_method: v });
              }}
              className={selectCls + " mt-0.5"}
            >
              <option value="manual">Manual entry</option>
              <option value="official_report">Transcribed from official report</option>
            </select>
          </label>
          <label className="text-[11px] text-gray-500 block sm:col-span-3">
            Exposure / terrain assumption
            <Input
              placeholder="e.g. Exposure C assumed — open terrain, verify on site"
              value={hazard?.exposure_assumption ?? ""}
              onChange={(e) => writeContentHazard({ exposure_assumption: e.target.value })}
              className="h-[30px] text-[12px] mt-0.5"
            />
          </label>
        </div>

        {hazardIssues.length > 0 && (
          <div className="text-[11px] text-red-700">
            {hazardIssues.map((i) => i.message).join(" ")}
          </div>
        )}

        <div className="text-[10px] text-gray-400 pt-0.5">
          {hazard?.input_timestamp ? (
            <>
              Site inputs recorded {fmtTs(hazard.input_timestamp)} · entry{" "}
              <b className="text-gray-500">{hazard.entry_method || "manual"}</b> · standard edition
              tracked once under Design basis
            </>
          ) : (
            "No site/hazard inputs recorded yet — coordinates, units, risk and exposure are optional until engineering needs them."
          )}
        </div>
      </section>
    </div>
  );
}
