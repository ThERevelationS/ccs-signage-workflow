import { officeIdentityComparison } from "./officeIdentityComparison.mjs";

export default function OfficeIdentityComparisonPanel({ office }) {
  const comparison = officeIdentityComparison(office);
  if (!comparison) return null;
  return <section aria-label="Retained official identity comparison" className="border-t border-amber-200 pt-2 space-y-2">
    <h6 className="font-semibold">Official names observed for comparison</h6>
    <p>Retained official observations at the dates below. These are not a fresh website check or an approved identity match.</p>
    {comparison.warning && <p role="status" className="text-amber-900">{comparison.warning}</p>}
    {comparison.observations.map(proof => <div key={proof.url} className="rounded border bg-white p-2 space-y-1">
      <p className="font-medium">{proof.kind}: {proof.name}</p>
      <p>Observed: {proof.observed_at}</p>
      <blockquote className="whitespace-pre-wrap">{proof.quotes.join("\n")}</blockquote>
      <p>{proof.relationship}</p>
      <p>{proof.contacts}</p>
      <a href={proof.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">Official proof page (new tab)</a>
      <details><summary className="cursor-pointer">Retained HTML lineage</summary>
        <p className="break-all">SHA-256: {proof.sha256}</p><p>{proof.bytes} bytes</p>
        <p className="break-all">{proof.repo_path}</p>
      </details>
    </div>)}
    {comparison.guideContact && <p>Guide physical page {comparison.guideContact.physical_page}: {comparison.guideContact.text}. {comparison.guideContact.boundary}</p>}
    {comparison.unresolved && <p className="font-medium">{comparison.unresolved}</p>}
  </section>;
}
