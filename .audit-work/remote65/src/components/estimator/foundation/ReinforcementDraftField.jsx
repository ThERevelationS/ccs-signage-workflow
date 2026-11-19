// Raw controlled input for draft numeric fields - preserves exact text, never parses or clamps.
export default function ReinforcementDraftField({ label, value, onChange, disabled, inputMode = "decimal", maxLength, suffix, placeholder, rawInvalid = false }) {
  const invalid = rawInvalid || (value != null && !["string", "number"].includes(typeof value))
    || (typeof value === "number" && !Number.isFinite(value));
  return (
    <label className="block min-w-0">
      <span className="text-[12px] text-gray-600">{label}</span>
      <span className="mt-0.5 flex items-center gap-1">
        <input
          type="text"
          aria-label={label}
          inputMode={inputMode}
          value={invalid ? "" : (value ?? "")}
          maxLength={maxLength}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-sm border border-gray-300 px-2 py-1 text-[13px] disabled:bg-gray-50 disabled:text-gray-400"
        />
        {invalid && <span className="text-[10px] text-red-600">Invalid</span>}
        {suffix && <span className="text-[12px] text-gray-500">{suffix}</span>}
      </span>
    </label>
  );
}
