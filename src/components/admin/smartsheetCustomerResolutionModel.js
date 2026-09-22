const LEGAL_SUFFIXES = new Set([
  "llc", "pllc", "inc", "incorporated", "corp", "corporation",
  "co", "company", "ltd", "limited",
]);

export const SMARTSHEET_CUSTOMER_RESOLUTION_POLICY = Object.freeze([
  Object.freeze({
    key: "exact_company",
    label: "Exact company name",
    outcome: "Exact candidate",
    behavior: "Recommend the existing Base44 Customer. No new Customer is created.",
  }),
  Object.freeze({
    key: "exact_alias",
    label: "Exact approved alias",
    outcome: "Exact candidate",
    behavior: "Use legacy_client_names as the approved translation without renaming either system.",
  }),
  Object.freeze({
    key: "strong_evidence",
    label: "Close name + matching contact evidence",
    outcome: "Strong review",
    behavior: "Show the proposed Customer and the matching evidence before linking.",
  }),
  Object.freeze({
    key: "close_name",
    label: "Close normalized company name",
    outcome: "Review",
    behavior: "Suggest the possible match but never link from fuzzy name similarity alone.",
  }),
  Object.freeze({
    key: "ambiguous",
    label: "Multiple plausible Customers",
    outcome: "Ambiguous",
    behavior: "Stop customer resolution and require an explicit selection.",
  }),
  Object.freeze({
    key: "new_customer",
    label: "No plausible Customer",
    outcome: "New-client proposal",
    behavior: "Offer to create a prospect Customer; do not create one silently.",
  }),
]);

export function normalizeCustomerText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeComparableCompanyName(value) {
  const parts = normalizeCustomerText(value).split(" ").filter(Boolean);
  while (parts.length > 1 && LEGAL_SUFFIXES.has(parts[parts.length - 1])) parts.pop();
  return parts.join(" ");
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizePhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

export function companyNameSimilarity(left, right) {
  const a = normalizeComparableCompanyName(left);
  const b = normalizeComparableCompanyName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const longest = Math.max(a.length, b.length);
  if (!longest) return 1;
  return Math.max(0, 1 - (levenshteinDistance(a, b) / longest));
}

function customerEmails(customer = {}) {
  return [
    customer.contact_email,
    customer.billing_contact_email,
    ...(Array.isArray(customer.additional_contacts)
      ? customer.additional_contacts.map((contact) => contact?.email)
      : []),
  ].map(normalizeEmail).filter(Boolean);
}

function customerPhones(customer = {}) {
  return [
    customer.company_phone,
    customer.additional_phone,
    customer.contact_office_phone,
    customer.contact_cell_phone,
    customer.contact_additional_phone,
    customer.billing_contact_phone,
    ...(Array.isArray(customer.additional_contacts)
      ? customer.additional_contacts.flatMap((contact) => [
        contact?.office_phone,
        contact?.cell_phone,
      ])
      : []),
  ].map(normalizePhone).filter((value) => value.length >= 7);
}

function evaluateOne(incoming = {}, customer = {}) {
  const incomingName = normalizeCustomerText(incoming.company_name || incoming.customer_name);
  const customerName = normalizeCustomerText(customer.company_name);
  const aliases = (Array.isArray(customer.legacy_client_names) ? customer.legacy_client_names : [])
    .map(normalizeCustomerText)
    .filter(Boolean);

  const exactCompany = Boolean(incomingName && customerName && incomingName === customerName);
  const exactAlias = Boolean(incomingName && aliases.includes(incomingName));
  const similarity = companyNameSimilarity(incoming.company_name || incoming.customer_name, customer.company_name);

  const incomingEmail = normalizeEmail(incoming.email || incoming.contact_email || incoming.requestor_email);
  const incomingPhone = normalizePhone(incoming.phone || incoming.company_phone || incoming.contact_phone);
  const emailMatch = Boolean(incomingEmail && customerEmails(customer).includes(incomingEmail));
  const phoneMatch = Boolean(incomingPhone.length >= 7 && customerPhones(customer).includes(incomingPhone));

  let score = 0;
  const reasons = [];
  if (exactCompany) {
    score = 100;
    reasons.push("exact company name");
  } else if (exactAlias) {
    score = 99;
    reasons.push("exact approved alias");
  } else {
    if (similarity === 1) {
      score += 82;
      reasons.push("same normalized company name");
    } else if (similarity >= 0.9) {
      score += 72;
      reasons.push("very similar company name");
    } else if (similarity >= 0.84) {
      score += 62;
      reasons.push("similar company name");
    }
    if (emailMatch) {
      score += 20;
      reasons.push("matching email");
    }
    if (phoneMatch) {
      score += 20;
      reasons.push("matching phone");
    }
  }

  return {
    customer,
    score: Math.min(100, score),
    similarity,
    exactCompany,
    exactAlias,
    emailMatch,
    phoneMatch,
    reasons,
  };
}

function addIndexValue(map, key, customer) {
  if (!key || !customer?.id) return;
  const bucket = map.get(key) || [];
  if (!bucket.some((item) => item.id === customer.id)) bucket.push(customer);
  map.set(key, bucket);
}

function uniqueCustomers(rows = []) {
  const byId = new Map();
  for (const row of rows) {
    if (row?.id) byId.set(row.id, row);
  }
  return [...byId.values()];
}

export function buildCustomerResolutionIndex(customers = []) {
  const index = {
    exactName: new Map(),
    exactAlias: new Map(),
    comparableName: new Map(),
    email: new Map(),
    phone: new Map(),
    prefix: new Map(),
    token: new Map(),
  };

  for (const customer of customers || []) {
    if (!customer?.id || !customer?.company_name) continue;
    const exactName = normalizeCustomerText(customer.company_name);
    const comparableName = normalizeComparableCompanyName(customer.company_name);
    addIndexValue(index.exactName, exactName, customer);
    addIndexValue(index.comparableName, comparableName, customer);

    for (const alias of Array.isArray(customer.legacy_client_names) ? customer.legacy_client_names : []) {
      addIndexValue(index.exactAlias, normalizeCustomerText(alias), customer);
      addIndexValue(index.comparableName, normalizeComparableCompanyName(alias), customer);
    }
    for (const email of customerEmails(customer)) addIndexValue(index.email, email, customer);
    for (const phone of customerPhones(customer)) addIndexValue(index.phone, phone, customer);

    const compact = comparableName.replace(/\s+/g, "");
    if (compact.length >= 3) addIndexValue(index.prefix, compact.slice(0, 3), customer);
    for (const token of comparableName.split(" ").filter((value) => value.length >= 3)) {
      addIndexValue(index.token, token, customer);
    }
  }

  return index;
}

export function resolveCustomerCandidatesIndexed(incoming = {}, index) {
  if (!index) return resolveCustomerCandidates(incoming, []);

  const incomingName = normalizeCustomerText(incoming.company_name || incoming.customer_name);
  if (!incomingName) {
    return {
      outcome: "needs_name",
      recommended: null,
      candidates: [],
      reason: "Incoming row has no usable customer name.",
    };
  }

  const exactRows = uniqueCustomers([
    ...(index.exactName.get(incomingName) || []),
    ...(index.exactAlias.get(incomingName) || []),
  ]);
  if (exactRows.length) return resolveCustomerCandidates(incoming, exactRows);

  const comparableName = normalizeComparableCompanyName(incoming.company_name || incoming.customer_name);
  const incomingEmail = normalizeEmail(incoming.email || incoming.contact_email || incoming.requestor_email);
  const incomingPhone = normalizePhone(incoming.phone || incoming.company_phone || incoming.contact_phone);
  const compact = comparableName.replace(/\s+/g, "");
  const candidateRows = [
    ...(index.comparableName.get(comparableName) || []),
    ...(incomingEmail ? (index.email.get(incomingEmail) || []) : []),
    ...(incomingPhone.length >= 7 ? (index.phone.get(incomingPhone) || []) : []),
    ...(compact.length >= 3 ? (index.prefix.get(compact.slice(0, 3)) || []) : []),
  ];
  for (const token of comparableName.split(" ").filter((value) => value.length >= 3)) {
    candidateRows.push(...(index.token.get(token) || []));
  }

  const candidates = uniqueCustomers(candidateRows);
  if (!candidates.length) {
    return {
      outcome: "new_customer",
      recommended: null,
      candidates: [],
      reason: "No plausible existing Base44 Customer was found.",
    };
  }

  return resolveCustomerCandidates(incoming, candidates);
}

export function resolveCustomerCandidates(incoming = {}, customers = []) {
  const incomingName = normalizeCustomerText(incoming.company_name || incoming.customer_name);
  if (!incomingName) {
    return {
      outcome: "needs_name",
      recommended: null,
      candidates: [],
      reason: "Incoming row has no usable customer name.",
    };
  }

  const evaluated = (customers || [])
    .filter((customer) => customer?.id && customer?.company_name)
    .map((customer) => evaluateOne(incoming, customer))
    .filter((candidate) => candidate.score >= 60)
    .sort((a, b) => b.score - a.score || String(a.customer.company_name).localeCompare(String(b.customer.company_name)));

  const exact = evaluated.filter((candidate) => candidate.exactCompany || candidate.exactAlias);
  if (exact.length > 1) {
    return {
      outcome: "ambiguous",
      recommended: null,
      candidates: exact,
      reason: "More than one Base44 Customer has the same exact company name or approved alias.",
    };
  }
  if (exact.length === 1) {
    return {
      outcome: exact[0].exactAlias ? "exact_alias" : "exact_company",
      recommended: exact[0],
      candidates: exact,
      reason: exact[0].reasons.join(", "),
    };
  }

  if (evaluated.length === 0) {
    return {
      outcome: "new_customer",
      recommended: null,
      candidates: [],
      reason: "No plausible existing Base44 Customer was found.",
    };
  }

  const top = evaluated[0];
  const second = evaluated[1];
  if (second && second.score >= top.score - 5) {
    return {
      outcome: "ambiguous",
      recommended: null,
      candidates: evaluated.slice(0, 5),
      reason: "Multiple Base44 Customers are similarly plausible.",
    };
  }

  const hasContactEvidence = top.emailMatch || top.phoneMatch;
  return {
    outcome: hasContactEvidence && top.score >= 82 ? "strong_review" : "close_review",
    recommended: top,
    candidates: evaluated.slice(0, 5),
    reason: top.reasons.join(", "),
  };
}
