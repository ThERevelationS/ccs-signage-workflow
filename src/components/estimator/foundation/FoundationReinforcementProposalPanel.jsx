import ReinforcementDraftGeometry from "./ReinforcementDraftGeometry";
import ReinforcementDraftMaterial from "./ReinforcementDraftMaterial";

const verLabel = (v) => {
  if (v === null || v === undefined || v === 1) return "Legacy";
  if (v === 2) return "Version 2";
  return "Unsupported";
};

export default function FoundationReinforcementProposalPanel({
  item, draft, catalog = [], preview, disabled = false, busy = false, error,
  acknowledgments = null, onAcknowledgmentsChange,
  onStart, onDraftChange, onPreview, onAccept, onDiscard,
}) {
  const label = verLabel(item?.reinforcement_calculation_version);
  const blocked = disabled || busy || label === "Unsupported";
  const ackProvided = acknowledgments !== null && acknowledgments !== undefined;
  const ack = acknowledgments !== null && typeof acknowledgments === "object" && !Array.isArray(acknowledgments) &&
    (Object.getPrototypeOf(acknowledgments) === Object.prototype || Object.getPrototypeOf(acknowledgments) === null)
    ? acknowledgments : null;
  const ackEligible = !ackProvided || Boolean(
    ack?.preliminary === true &&
    Array.isArray(preview?.warningCodes) &&
    preview.warningCodes.every(
      (code) => typeof code === "string" && code.trim().length > 0 &&
        (Array.isArray(ack?.warningCodes) ? ack.warningCodes : []).includes(code)
    )
  );
  const eligible = Boolean(
    typeof preview?.id === "string" && preview.id.trim().length > 0 &&
    preview?.canAccept === true && preview?.stale !== true &&
    !blocked && ackEligible
  );

  const guard = (fn) => (...a) => { if (!blocked) fn?.(...a); };
  const changeDraft = (patch) => { if (!blocked) onDraftChange?.({ ...draft, ...patch }); };

  return (
    <div className="rounded-sm border border-gray-200 bg-white p-3 min-w-0 max-w-full">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-gray-800">Reinforcement proposal</p>
        <span className="rounded-sm bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">{label}</span>
      </div>
      <p className="mt-1 text-[11px] text-amber-700">Preliminary geometry and internal cost only. Not a structural design or engineering approval.</p>
      <p className="text-[11px] text-gray-500">Proposal edits do not change current prices until explicit acceptance; unknown supports/weights/units remain unknown.</p>
      {error && <div role="alert" className="mt-1 rounded-sm border border-red-200 bg-red-50 px-2 py-1 text-[12px] text-red-700">{String(error)}</div>}
      {label === "Unsupported" && (
        <div className="mt-1 rounded-sm border border-amber-300 bg-amber-50 px-2 py-1 text-[12px] text-amber-800">This reinforcement mode is unsupported; proposal edits are unavailable.</div>
      )}

      {!draft ? (
        <div className="mt-2">
          <p className="text-[12px] text-gray-500">No reinforcement draft yet. Start a controlled proposal to draft geometry and material.</p>
          <button type="button" disabled={blocked} onClick={guard(onStart)} className="mt-1 rounded-sm border border-amber-400 bg-amber-50 px-2 py-1 text-[12px] text-amber-800 disabled:text-gray-300">
            Start Proposal
          </button>
        </div>
      ) : (
        <fieldset disabled={blocked} className="mt-2 space-y-3 min-w-0">
          <ReinforcementDraftGeometry draft={draft} item={item} disabled={blocked} onChange={(design) => changeDraft({ design })} />
          <ReinforcementDraftMaterial draft={draft} catalog={catalog} disabled={blocked} onChange={(p) => { if (!blocked) onDraftChange?.({ ...draft, ...p }); }} />

          {preview && (
            <div className="break-words rounded-sm border border-gray-200 bg-gray-50 p-2 min-w-0 max-w-full">
              <p className="text-[12px] font-semibold text-gray-700">Preview</p>
              {preview.stale && <p className="text-[11px] text-amber-700">Preview is stale - refresh before accepting.</p>}
              {preview.rateSourceLabel && <p className="text-[11px] text-gray-500">{preview.rateSourceLabel}</p>}
              <div className="mt-1 space-y-0.5">
                {(preview.quantities || []).map((q, i) => (
                  <div key={i} className="flex flex-wrap justify-between gap-1 text-[12px] text-gray-600"><span>{q.label}</span><span>{q.before} - {q.after}</span></div>
                ))}
                {(preview.costs || []).map((c, i) => (
                  <div key={i} className="flex flex-wrap justify-between gap-1 text-[12px] text-gray-600"><span>{c.label}</span><span>{c.value} <span className="text-[10px] text-gray-400">({c.provenance})</span></span></div>
                ))}
              </div>
              {(preview.issues || []).map((i, k) => (
                <p key={k} className={`text-[11px] ${i.severity === "warning" ? "text-amber-700" : "text-red-700"}`}>{i.message}</p>
              ))}
            </div>
          )}

          {ackProvided && (() => {
            const ackPreliminary = ack?.preliminary === true;
            const ackCodes = Array.isArray(ack?.warningCodes) ? ack.warningCodes.filter((c) => typeof c === "string") : [];
            const issues = Array.isArray(preview?.issues) ? preview.issues : [];
            const uniqueCodes = [];
            (Array.isArray(preview?.warningCodes) ? preview.warningCodes : []).forEach((code) => {
              if (typeof code === "string" && code.trim().length > 0 && !uniqueCodes.includes(code)) uniqueCodes.push(code);
            });
            const ackDisabled = blocked || typeof onAcknowledgmentsChange !== "function";
            const emit = (preliminary, codes) => { if (!ackDisabled) onAcknowledgmentsChange?.({ preliminary, warningCodes: [...codes] }); };
            return (
              <div className="mt-1 space-y-1 text-[11px] text-gray-700">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={ackPreliminary}
                    disabled={ackDisabled}
                    onChange={(event) => emit(event.target.checked, ackCodes)}
                    className="h-3.5 w-3.5 rounded border-gray-300 flex-shrink-0"
                  />
                  <span>I understand this is preliminary only, not engineering approval.</span>
                </label>
                {uniqueCodes.map((code) => {
                  const issue = issues.find((entry) => entry && entry.severity === "warning" && entry.code === code);
                  return (
                    <label key={code} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={ackCodes.includes(code)}
                        disabled={ackDisabled}
                        onChange={(event) => emit(ackPreliminary, event.target.checked ? [...new Set([...ackCodes, code])] : ackCodes.filter((c) => c !== code))}
                        className="h-3.5 w-3.5 rounded border-gray-300 flex-shrink-0"
                      />
                      <span>{`Acknowledge warning: ${issue?.message || code}`}</span>
                    </label>
                  );
                })}
              </div>
            );
          })()}

          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={blocked} onClick={guard(onPreview)} className="rounded-sm border border-gray-300 px-2 py-1 text-[12px] text-gray-700 disabled:text-gray-300">
              Refresh Preview
            </button>
            <button type="button" disabled={!eligible} onClick={() => eligible && onAccept?.(preview.id)} className="rounded-sm border border-amber-400 bg-amber-50 px-2 py-1 text-[12px] text-amber-800 disabled:text-gray-300">
              Accept Proposal
            </button>
            <button type="button" disabled={blocked} onClick={guard(onDiscard)} className="rounded-sm border border-red-200 px-2 py-1 text-[12px] text-red-600 disabled:text-gray-300">
              Discard
            </button>
          </div>
        </fieldset>
      )}
    </div>
  );
}
