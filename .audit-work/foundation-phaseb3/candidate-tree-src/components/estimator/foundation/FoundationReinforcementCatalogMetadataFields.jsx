import { FOUNDATION_REINFORCEMENT_CATALOG_METADATA_FIELDS, prepareFoundationReinforcementCatalogMetadataDraft } from "./foundationReinforcementCatalogMetadata";
import ReinforcementDraftField from "./ReinforcementDraftField";

export default function FoundationReinforcementCatalogMetadataFields({ draft, onChange, disabled = false }) {
  const prepared = prepareFoundationReinforcementCatalogMetadataDraft(draft);
  return (
    <div className="rounded-sm border border-gray-200 bg-gray-50 p-2 mt-1 space-y-1">
      <h3 className="text-[12px] font-semibold text-gray-700">Preliminary reinforcement metadata</h3>
      <p className="text-[11px] text-gray-500">Optional explicit measurements for preliminary reinforcement. Blank is not recorded, not zero. No diameter or weight is inferred from the bar-size label; this is not engineering approval.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {FOUNDATION_REINFORCEMENT_CATALOG_METADATA_FIELDS.map((field) => (
          <ReinforcementDraftField
            key={field.key}
            label={field.label}
            value={draft?.[field.key]}
            disabled={disabled}
            inputMode="decimal"
            maxLength={64}
            placeholder="Not recorded"
            onChange={(value) => onChange?.({ ...(draft && typeof draft === "object" ? draft : {}), [field.key]: value })}
          />
        ))}
      </div>
      {!prepared.ok && (
        <div role="alert" className="text-[11px] text-red-700 space-y-0.5">
          {prepared.issues.map((issue, i) => <p key={i}>{issue.message}</p>)}
        </div>
      )}
    </div>
  );
}
