import { useEffect, useState } from "react";
import { staffEntities } from "@/components/staff/staffEntities";

// The job site is the install address: the work order's install fields, else
// the linked estimate's site_address. Never the client's billing or office
// address — that may match, but it is not the job site.

// Imported work orders sometimes carry a date in install_location (column
// drift) — never treat a date as an address part.
export const isAddressPart = (v) => {
  const s = String(v || "").trim();
  return Boolean(s) && !/^\d{4}-\d{2}-\d{2}(?:[T ].*)?$/.test(s) && !/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s);
};

export const workOrderSiteAddress = (wo) =>
  isAddressPart(wo?.install_location)
    ? [wo.install_location, wo.address_line_2, wo.township_city, wo.county, wo.state].filter(isAddressPart).join(", ")
    : "";

export const estimateIdsOf = (wo) =>
  [...new Set([wo?.estimate_id, ...(wo?.estimate_ids || [])].filter(Boolean))];

export async function loadEstimateSiteAddress(estimateIds) {
  for (const id of estimateIds) {
    const est = await staffEntities.AllInOneEstimate.get(id).catch(() => null);
    const site = String(est?.site_address || "").trim();
    if (isAddressPart(site)) return { address: site, estimateNumber: est.estimate_number || "" };
  }
  return null;
}

// { address, source: "work_order" | "estimate" | "", estimateNumber, loading }
export function useJobSiteAddress(wo, enabled = true) {
  const woSite = workOrderSiteAddress(wo);
  const idsKey = estimateIdsOf(wo).join(",");
  const needsEstimate = enabled && !woSite && Boolean(idsKey);
  const [found, setFound] = useState({ key: "", value: null });
  useEffect(() => {
    if (!needsEstimate || found.key === idsKey) return undefined;
    let alive = true;
    loadEstimateSiteAddress(idsKey.split(",")).then((value) => { if (alive) setFound({ key: idsKey, value }); });
    return () => { alive = false; };
  }, [needsEstimate, idsKey, found.key]);
  if (woSite) return { address: woSite, source: "work_order", estimateNumber: "", loading: false };
  if (!needsEstimate) return { address: "", source: "", estimateNumber: "", loading: false };
  if (found.key !== idsKey) return { address: "", source: "", estimateNumber: "", loading: true };
  const v = found.value;
  return v
    ? { address: v.address, source: "estimate", estimateNumber: v.estimateNumber, loading: false }
    : { address: "", source: "", estimateNumber: "", loading: false };
}
