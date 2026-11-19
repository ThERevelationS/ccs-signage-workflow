import fs from "node:fs";

const eolOf = (s) => (s.includes("\r\n") ? "\r\n" : "\n");
const J = (lines, eol) => lines.join(eol);

function patch(path, edits) {
  let content = fs.readFileSync(path, "utf8");
  const eol = eolOf(content);
  for (const [oldLines, newLines] of edits) {
    const oldStr = J(oldLines, eol);
    const newStr = J(newLines, eol);
    const idx = content.indexOf(oldStr);
    if (idx === -1) {
      console.error(`MISS in ${path}:\n${oldStr.slice(0, 160)}`);
      process.exitCode = 1;
      continue;
    }
    if (content.indexOf(oldStr, idx + 1) !== -1) {
      console.error(`NON-UNIQUE in ${path}:\n${oldStr.slice(0, 160)}`);
      process.exitCode = 1;
      continue;
    }
    content = content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
    console.log(`OK ${path}: ${oldLines[0].trim().slice(0, 60)}`);
  }
  fs.writeFileSync(path, content);
}

// ---------- 1) workOrderPersistence.js ----------
patch("src/components/workflow/workOrderPersistence.js", [
  // #352: trim strings before compare — backend clean() trims string fields on
  // write, so a strict compare false-negatives a patch that actually landed.
  [
    [
      `function sameValue(a, b) {`,
      `  if (a !== null && a !== undefined && a !== "" && b !== null && b !== undefined && b !== "") {`,
      `    if (Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {`,
      `      return Math.abs(Number(a) - Number(b)) <= 0.000001;`,
      `    }`,
      `  }`,
      `  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));`,
      `}`,
    ],
    [
      `function sameValue(a, b) {`,
      `  if (a !== null && a !== undefined && a !== "" && b !== null && b !== undefined && b !== "") {`,
      `    if (Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {`,
      `      return Math.abs(Number(a) - Number(b)) <= 0.000001;`,
      `    }`,
      `  }`,
      `  // The backend trims most string fields on write, so a stored value won't`,
      `  // byte-match an untrimmed patch value. Compare top-level strings trimmed —`,
      `  // the same convention the idempotent-create payload matcher uses — or`,
      `  // post-save verification false-negatives a patch that actually landed.`,
      `  // Nested strings inside arrays/objects stay strict so CAS snapshots keep`,
      `  // their full-fidelity compare.`,
      `  if (typeof a === "string" && typeof b === "string") return a.trim() === b.trim();`,
      `  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));`,
      `}`,
    ],
  ],
  // #362: entity.filter caps at 500 rows/page, so "a full page" was being used
  // as a proxy for "too many same-title rows". The staffDataRead gateway
  // supports an exact count() — use it as the cheap preflight, then page the
  // same-title set in 500-row chunks up to a documented fail-closed cap.
  [
    [
      `  const readMatches = async () => {`,
      `    const rows = await entity.filter({ title }, "-created_date", 500);`,
      `    if (!Array.isArray(rows)) throw new Error(\`\${label} lookup did not return a Work Order list.\`);`,
      `    if (rows.length >= 500) throw new Error(\`\${label} has too many same-title Work Orders to verify creation safely. Review existing jobs before retrying.\`);`,
      `    return rows.filter((row) => workOrderPatchMatches(row, payload));`,
      `  };`,
    ],
    [
      `  // Create verification must scan the whole same-title set. entity.filter`,
      `  // pages at 500 rows, so an exact same-title count (staffDataRead gateway)`,
      `  // bounds the scan up front and the read then pages through the titles.`,
      `  // SAME_TITLE_VERIFY_MAX_ROWS is a fail-closed safety cap on that scan,`,
      `  // not a platform limit — beyond it, retry-safe verification is not`,
      `  // trustworthy (e.g. high-volume same-title jobs like walk-in sales).`,
      `  const SAME_TITLE_PAGE_SIZE = 500; // entity.filter page cap`,
      `  const SAME_TITLE_VERIFY_MAX_ROWS = 5000;`,
      `  const readMatches = async () => {`,
      `    if (typeof entity.count === "function") {`,
      `      const total = await entity.count({ title }).catch(() => null);`,
      `      if (typeof total === "number" && total > SAME_TITLE_VERIFY_MAX_ROWS) {`,
      `        throw new Error(\`\${label} has too many same-title Work Orders to verify creation safely. Review existing jobs before retrying.\`);`,
      `      }`,
      `    }`,
      `    const matches = [];`,
      `    const seen = new Set();`,
      `    for (let skip = 0; skip < SAME_TITLE_VERIFY_MAX_ROWS; skip += SAME_TITLE_PAGE_SIZE) {`,
      `      const page = await entity.filter({ title }, "-created_date", SAME_TITLE_PAGE_SIZE, skip);`,
      `      if (!Array.isArray(page)) throw new Error(\`\${label} lookup did not return a Work Order list.\`);`,
      `      for (let index = 0; index < page.length; index += 1) {`,
      `        const row = page[index];`,
      `        // Newest-first pages shift under concurrent inserts, so dedupe by id`,
      `        // the same way loadAllEntityRows does.`,
      `        const key = String(row?.id || "").trim() || \`__row_\${skip + index}\`;`,
      `        if (seen.has(key)) continue;`,
      `        seen.add(key);`,
      `        if (workOrderPatchMatches(row, payload)) matches.push(row);`,
      `      }`,
      `      if (page.length < SAME_TITLE_PAGE_SIZE) return matches;`,
      `    }`,
      `    throw new Error(\`\${label} has too many same-title Work Orders to verify creation safely. Review existing jobs before retrying.\`);`,
      `  };`,
    ],
  ],
]);

// ---------- 2) loadAllEntityRows.js ----------
patch("src/components/estimator/loadAllEntityRows.js", [
  // #358: document the ascending-default sort. The annotation claimed the
  // default was "-created_date" descending; the code deliberately defaults to
  // ascending "created_date" because appends land at the END of the set,
  // keeping earlier skip/limit pages stable mid-scan (newest-first ordering
  // would shift every page on each concurrent insert). Callers' sort strings
  // are forwarded to list/filter on every page — never ignored.
  [
    [
      ` * This helper is intentionally read-only. It pages the existing entity client`,
      ` * using the SDK's list/filter(sort, limit, skip) contract, fails closed on an`,
      ` * unreadable page, and de-duplicates by entity id so callers never silently`,
      ` * estimate from a partial catalog.`,
      ` */`,
    ],
    [
      ` * This helper is intentionally read-only. It pages the existing entity client`,
      ` * using the SDK's list/filter(sort, limit, skip) contract, fails closed on an`,
      ` * unreadable page, and de-duplicates by entity id so callers never silently`,
      ` * estimate from a partial catalog.`,
      ` *`,
      ` * Paging order defaults to ASCENDING "created_date" (not "-created_date").`,
      ` * That is deliberate: new rows append to the end of the set, so earlier`,
      ` * skip/limit pages stay stable while a full scan is in flight — a`,
      ` * newest-first order would shift every page on each concurrent insert.`,
      ` * Callers may pass any SDK sort string; it is forwarded to list/filter on`,
      ` * every page (an empty/falsy sort falls back to the SDK's own default).`,
      ` */`,
    ],
  ],
]);

// ---------- 3) idempotentEntityCreate.js ----------
patch("src/components/estimator/idempotentEntityCreate.js", [
  // #363a: sleep helper + delayed verify constant
  [
    [
      `import { deleteEntityIfUnchanged } from "@/components/estimator/builder/builderEntityPersistence";`,
      ``,
    ],
    [
      `import { deleteEntityIfUnchanged } from "@/components/estimator/builder/builderEntityPersistence";`,
      ``,
      `const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));`,
      ``,
      `// Read-after-write grace for the post-create verify read: a create whose`,
      `// response was lost can still have landed, and an immediate empty verify`,
      `// read is not conclusive.`,
      `const VERIFY_RETRY_DELAY_MS = 700;`,
      ``,
    ],
  ],
  // #363b: re-read once after a short delay when the first post-create verify
  // is inconclusive (empty or failed) and the create outcome is uncertain, so
  // a retry resolves the existing row instead of creating a duplicate.
  [
    [
      `  let afterCreate;`,
      `  try {`,
      `    afterCreate = await load();`,
      `  } catch (verifyError) {`,
      `    if (created?.id && matchesPayload(created, payload)) return created;`,
      `    throw new Error(\`\${label} create outcome could not be verified. Do not retry blindly; reload first. \${verifyError?.message || "Recovery lookup failed."}\`);`,
      `  }`,
      ``,
    ],
    [
      `  let afterCreate = null;`,
      `  let verifyError = null;`,
      `  try {`,
      `    afterCreate = await load();`,
      `  } catch (error) {`,
      `    verifyError = error;`,
      `  }`,
      `  // Read-after-write lag: a create that failed at the response layer can`,
      `  // still have landed, so an immediate empty/failed verify is not conclusive.`,
      `  // Give the write a moment and re-read once before declaring the outcome`,
      `  // unknown — a retry must resolve the existing row, never create a dup.`,
      `  if ((!Array.isArray(afterCreate) || afterCreate.length === 0) && (createError || !created?.id)) {`,
      `    await sleep(VERIFY_RETRY_DELAY_MS);`,
      `    try {`,
      `      const retryRows = await load();`,
      `      if (Array.isArray(retryRows)) afterCreate = retryRows;`,
      `    } catch (error) {`,
      `      verifyError = verifyError || error;`,
      `    }`,
      `  }`,
      `  if (!Array.isArray(afterCreate)) {`,
      `    if (created?.id && matchesPayload(created, payload)) return created;`,
      `    throw new Error(\`\${label} create outcome could not be verified. Do not retry blindly; reload first. \${verifyError?.message || "Recovery lookup failed."}\`);`,
      `  }`,
      ``,
    ],
  ],
]);

console.log("PATCH DONE");
