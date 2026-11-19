import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Helper fractions: percentage of face area that needs masking.
// e.g. "1/4" = 25% of the face area gets masked.
export const COVERAGE_FACTORS = [
  "1/8", "1/4", "3/8", "1/2", "5/8", "3/4", "7/8",
  "1", "1-1/8", "1-1/4", "1-3/8", "1-1/2", "1-5/8", "1-3/4", "1-7/8", "2",
];

export const parseImperialFraction = (s) => {
  if (typeof s !== "string") return parseFloat(s) || 0;
  let total = 0;
  let rest = s;
  const [whole, fracPart] = s.split("-");
  if (fracPart !== undefined) {
    total += parseFloat(whole) || 0;
    rest = fracPart;
  }
  const [num, den] = rest.split("/");
  if (den !== undefined) {
    const n = parseFloat(num);
    const d = parseFloat(den);
    if (d) total += n / d;
  } else {
    total += parseFloat(rest) || 0;
  }
  return total;
};

/**
 * Reusable paint-mask + coverage helper input pair.
 *  - faceAreaSqft: the face area to compute coverage from (caller must compute & pass).
 *  - bothSides:    if true, multiplies the helper result by 2.
 *  - value:        current paint_mask_sqft
 *  - factor:       current coverage factor string ("1/4", etc.)
 *  - onChange({ paint_mask_sqft, approx_coverage_factor })
 */
export default function PaintCoverageHelper({
  faceAreaSqft = 0,
  bothSides = false,
  value = 0,
  factor = "1/4",
  onChange,
  className = "",
}) {
  const setFactor = (f) => {
    const frac = parseImperialFraction(f);
    const sides = bothSides ? 2 : 1;
    const calculated = (parseFloat(faceAreaSqft) || 0) * frac * sides;
    onChange({
      paint_mask_sqft: Number.isFinite(calculated) ? calculated : 0,
      approx_coverage_factor: f,
    });
  };

  const setManual = (v) => {
    onChange({
      paint_mask_sqft: parseFloat(v) || 0,
      approx_coverage_factor: factor,
    });
  };

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 ${className}`}>
      <div>
        <Label className="text-xs">Paint Mask Square Feet</Label>
        <Input
          type="number"
          min="0"
          step="0.25"
          value={value || ""}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setManual(e.target.value)}
          className="mt-1"
        />
        <p className="text-[11px] text-slate-500 mt-1">Manually enter sqft or use the helper.</p>
      </div>
      <div>
        <Label className="text-xs">Approx. Coverage Helper</Label>
        <Select value={factor || "1/4"} onValueChange={setFactor}>
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COVERAGE_FACTORS.map((f) => (
              <SelectItem key={f} value={f}>{f}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-slate-500 mt-1">
          {faceAreaSqft > 0
            ? <>Face area: <strong>{faceAreaSqft.toFixed(2)} sqft</strong>{bothSides ? " × 2 sides" : ""}</>
            : <>Calculates mask sqft based on face area.</>}
        </p>
      </div>
    </div>
  );
}