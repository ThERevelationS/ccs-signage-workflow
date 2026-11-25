// Sizes recovered from customers' approved CoreBridge proofs (title-block
// "Size:" box + raw drawn dimensions). One JSON fetch per page load; a failed
// fetch resolves to {} and is retried on the next call.
let proofSizesPromise = null;
export function loadProofSizes() {
  if (!proofSizesPromise) {
    proofSizesPromise = fetch("/permitting/proof-sizes.json")
      .then((r) => {
        if (!r.ok) throw new Error(`proof sizes ${r.status}`);
        return r.json();
      })
      .then((j) => (j && typeof j === "object" && j.sizes && typeof j.sizes === "object" ? j.sizes : {}))
      .catch(() => {
        proofSizesPromise = null;
        return {};
      });
  }
  return proofSizesPromise;
}
