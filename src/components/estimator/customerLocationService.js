// Records an estimate's site address as a reusable CustomerLocation for the
// estimate's customer, so permitting/install flows can link to it by location_id.
import { base44 } from "@/api/base44Client";
// The caller passes the staff-gated CustomerLocation entity (create + updateMany
// are the only operations that gateway allows), so this never touches RLS
// directly. Re-using the same site address never creates a duplicate location.

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeAddress(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// "123 Main St, Cincinnati, OH 45202" -> street / city / state / postal.
function parseAddress(siteAddress) {
  const parts = clean(siteAddress).split(",").map(clean).filter(Boolean);
  const street = parts[0] || clean(siteAddress);
  let city = "";
  let state = "";
  let postalCode = "";
  if (parts.length >= 2) {
    if (parts.length >= 3) {
      city = parts[1];
      const tail = parts[parts.length - 1].split(/\s+/).filter(Boolean);
      state = tail[0] || "";
      postalCode = tail.slice(1).join(" ");
    } else {
      // "123 Main St, Cincinnati OH 45202" — city, state and zip share one part.
      const tokens = parts[1].split(/\s+/).filter(Boolean);
      const zipIndex = tokens.findIndex((token) => /^\d{5}(-\d{4})?$/.test(token));
      const stateIndex = zipIndex > 0 ? zipIndex - 1 : tokens.length - 1;
      city = tokens.slice(0, Math.max(stateIndex, 0)).join(" ");
      state = tokens[stateIndex] || "";
      postalCode = zipIndex >= 0 ? tokens[zipIndex] : "";
    }
  }
  return { street, city, state, postalCode };
}

function locationAddress(location) {
  return normalizeAddress(
    [location?.address_line_1, location?.address_line_2, location?.city, location?.state, location?.postal_code]
      .filter(Boolean)
      .join(" ")
  );
}

export async function ensureEstimateCustomerLocation({
  entity,
  customerId,
  siteAddress,
  estimateId,
  sessionToken,
} = {}) {
  const id = clean(customerId);
  const address = clean(siteAddress);
  if (!id || !address) return null;
  if (typeof entity?.filter !== "function" || typeof entity?.create !== "function") {
    throw new Error("Customer locations are not available to this session.");
  }

  const wanted = normalizeAddress(address);
  const existing = await entity.filter({ customer_id: id }).catch(() => []);
  const rows = Array.isArray(existing) ? existing : [];
  const match = rows.find(
    (location) => normalizeAddress(location?.label) === wanted || locationAddress(location) === wanted
      || (normalizeAddress(location?.address_line_1) === normalizeAddress(address))
  );
  const location = match || null;

  const parsed = parseAddress(address);
  const created = location || await entity.create({
    customer_id: id,
    label: address,
    address_line_1: parsed.street,
    city: parsed.city,
    state: parsed.state,
    postal_code: parsed.postalCode,
    country: "US",
    site_type: "install",
    is_primary_site: rows.length === 0,
    creation_request_key: `estimate_location:${clean(estimateId) || id}:${wanted}`,
    source_summary: {
      promoted_from: "AllInOneEstimate",
      estimate_id: clean(estimateId),
      captured_address: address,
      captured_at: new Date().toISOString(),
    },
  });

  // MP-8.2 — auto-attach resolved permitting jurisdiction + offices to the
  // location. Advisory: a lookup miss never blocks the estimate save, and an
  // already-linked location is left untouched.
  const target = created;
  if (target?.id && !clean(target.jurisdiction_profile_id) && sessionToken) {
    try {
      const r = await base44.functions.invoke("findLocalityByAddress", { address, session_token: sessionToken });
      const data = r?.data || r;
      const loc = data?.suggested_locality;
      if (data?.apply_allowed === true && clean(loc?.jurisdiction_profile_id)) {
        const offices = (loc?.offices || []).map((o) => ({
          id: clean(o?.id), name: clean(o?.name), roles: Array.isArray(o?.authority_roles) ? o.authority_roles : [],
          verified: o?.authority_verification_status === "staff_verified",
          phone: clean(o?.contact_phone), email: clean(o?.contact_email),
        })).filter((o) => o.name);
        await entity.updateMany({ id: target.id, updated_date: target.updated_date }, {
          $set: {
            jurisdiction_profile_id: clean(loc.jurisdiction_profile_id),
            jurisdiction_name: clean(loc?.name),
            source_summary: {
              ...(target.source_summary || {}),
              resolved_via: "findLocalityByAddress",
              resolved_at: new Date().toISOString(),
              match_confidence: clean(data?.match_confidence),
              permit_offices: offices,
            },
          },
        });
      }
    } catch { /* advisory — lookup outage never blocks a save */ }
  }
  return created;
}