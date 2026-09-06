import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';

const ALLOWED_MODULES = new Set([
  'channel_letter_installation',
  'foundation',
  'brick_stone',
  'paint',
  'laser',
  'cnc',
  'metal_fabrication',
  'vinyl',
  'sign_maintenance',
]);

const PAGE_SIZE = 500;
const VERIFY_LIMIT = 50000;
const MAX_CAS_ATTEMPTS = 12;

const norm = (value: unknown) => String(value || '').trim().toLowerCase();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const summaryKeyFor = (normalizedName: string) => `customer_summary:v1:${normalizedName}`;
const projectLinkKey = (link: any) => `${String(link?.module || '')}::${String(link?.project_id || '')}`;

const canonicalRow = (rows: any[] = []) => rows.slice().sort((a, b) => {
  const aTime = Date.parse(a?.created_date || a?.updated_date || '') || 0;
  const bTime = Date.parse(b?.created_date || b?.updated_date || '') || 0;
  if (aTime !== bTime) return aTime - bTime;
  return String(a?.id || '').localeCompare(String(b?.id || ''));
})[0] || null;

function cleanLink(input: any) {
  const module = String(input?.module || '').trim();
  const projectId = String(input?.project_id || '').trim();
  if (!ALLOWED_MODULES.has(module) || !projectId) return null;
  return {
    module,
    project_id: projectId,
    project_name: String(input?.project_name || ''),
  };
}

function mergeLinks(base: any[] = [], additions: any[] = [], requested: any = null) {
  const map = new Map<string, any>();
  for (const raw of Array.isArray(base) ? base : []) {
    const link = cleanLink(raw);
    if (!link) continue;
    const key = projectLinkKey(link);
    if (!map.has(key)) map.set(key, link);
  }
  for (const raw of Array.isArray(additions) ? additions : []) {
    const link = cleanLink(raw);
    if (!link) continue;
    const key = projectLinkKey(link);
    if (!map.has(key)) map.set(key, link);
  }
  const requestedLink = cleanLink(requested);
  if (requestedLink) map.set(projectLinkKey(requestedLink), requestedLink);
  return [...map.values()];
}

function sameLinks(a: any[] = [], b: any[] = []) {
  if ((a || []).length !== (b || []).length) return false;
  return (a || []).every((link, index) => {
    const other = (b || [])[index];
    return link?.module === other?.module &&
      link?.project_id === other?.project_id &&
      String(link?.project_name || '') === String(other?.project_name || '');
  });
}

async function loadCandidates(Summary: any, normalizedName: string, summaryKey: string) {
  const matches: any[] = [];
  let skip = 0;
  while (skip < VERIFY_LIMIT) {
    const page = await Summary.list('created_date', PAGE_SIZE, skip);
    if (!Array.isArray(page)) {
      throw new Error('Customer Summary records could not be verified safely.');
    }
    for (const row of page) {
      if (norm(row?.client_name) === normalizedName || String(row?.summary_key || '') === summaryKey) {
        matches.push(row);
      }
    }
    if (page.length < PAGE_SIZE) return matches;
    skip += PAGE_SIZE;
  }
  throw new Error(`Customer Summary verification exceeded the ${VERIFY_LIMIT.toLocaleString()}-record safety limit.`);
}

async function getFresh(Summary: any, id: string) {
  try {
    return await Summary.get(id);
  } catch {
    return null;
  }
}

async function casSet(Summary: any, row: any, patch: any) {
  if (!row?.id || !row?.updated_date) {
    throw new Error('Customer Summary version metadata is incomplete; concurrent-safe update was blocked.');
  }
  const result = await Summary.updateMany(
    { id: row.id, updated_date: row.updated_date },
    { $set: patch },
  );
  if (!result || typeof result.updated !== 'number') {
    throw new Error('Customer Summary conditional-update result could not be verified.');
  }
  return result.updated === 1;
}

async function claimSummaryKey(Summary: any, row: any, summaryKey: string) {
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const current = attempt === 0 ? row : await getFresh(Summary, row.id);
    if (!current) throw new Error('Customer Summary disappeared while its concurrency key was being established.');
    const currentKey = String(current?.summary_key || '');
    if (currentKey === summaryKey) return current;
    if (currentKey && currentKey !== summaryKey) {
      throw new Error('Customer Summary is already associated with a different concurrency key.');
    }
    if (await casSet(Summary, current, { summary_key: summaryKey })) {
      return (await getFresh(Summary, current.id)) || { ...current, summary_key: summaryKey };
    }
  }
  throw new Error('Customer Summary concurrency key could not be established because the row kept changing.');
}

async function mergeIntoCanonical({
  Summary,
  canonicalId,
  summaryKey,
  requestedLink,
  additions = [],
  estimateNumber = '',
}: any) {
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const current = await getFresh(Summary, canonicalId);
    if (!current) throw new Error('Canonical Customer Summary disappeared during merge.');
    const currentKey = String(current?.summary_key || '');
    if (currentKey && currentKey !== summaryKey) {
      throw new Error('Canonical Customer Summary changed to a different concurrency key.');
    }

    const links = mergeLinks(current?.linked_projects || [], additions, requestedLink);
    const desiredEstimateNumber = String(estimateNumber || current?.estimate_number || '');
    const noChange = currentKey === summaryKey &&
      desiredEstimateNumber === String(current?.estimate_number || '') &&
      sameLinks(links, current?.linked_projects || []);
    if (noChange) return current;

    const won = await casSet(Summary, current, {
      summary_key: summaryKey,
      linked_projects: links,
      estimate_number: desiredEstimateNumber,
    });
    if (!won) continue;

    const verified = await getFresh(Summary, canonicalId);
    if (!verified) throw new Error('Customer Summary update succeeded but the row could not be re-read.');
    const requestedKey = projectLinkKey(requestedLink);
    const hasRequested = (verified?.linked_projects || []).some((link: any) =>
      projectLinkKey(link) === requestedKey &&
      String(link?.project_name || '') === String(requestedLink?.project_name || '')
    );
    if (hasRequested) return verified;
  }
  throw new Error('Customer Summary could not converge because another save kept changing it.');
}

function duplicateIsSafeToDelete(row: any, userId: string, summaryKey: string, normalizedName: string) {
  if (!row?.id || String(row?.summary_key || '') !== summaryKey) return false;
  if (norm(row?.client_name) !== normalizedName) return false;
  if (String(row?.created_by_id || '') !== userId) return false;
  if (String(row?.notes || '').trim()) return false;
  if (String(row?.customer_id || '').trim()) return false;
  if (Number(row?.tier_number ?? 1) !== 1) return false;
  return true;
}

async function deleteVerified(Summary: any, row: any) {
  try {
    await Summary.delete(row.id);
  } catch (error) {
    const stillThere = await getFresh(Summary, row.id);
    if (stillThere) throw error;
    return;
  }
  const stillThere = await getFresh(Summary, row.id);
  if (stillThere) throw new Error('Duplicate Customer Summary delete returned successfully but the row still exists.');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const clientName = String(body?.client_name || '').trim();
    const normalizedName = norm(clientName);
    const module = String(body?.module || '').trim();
    const projectId = String(body?.project_id || '').trim();
    const projectName = String(body?.project_name || '');
    const estimateNumber = String(body?.estimate_number || '').trim();

    if (!clientName || !normalizedName || !ALLOWED_MODULES.has(module) || !projectId) {
      return Response.json({ error: 'Client name, supported module, and project id are required.' }, { status: 400 });
    }

    const requestedLink = { module, project_id: projectId, project_name: projectName };
    const summaryKey = summaryKeyFor(normalizedName);
    const Summary = base44.entities.CustomerSummary;

    let candidates = await loadCandidates(Summary, normalizedName, summaryKey);
    const keyCollisions = candidates.filter((row: any) =>
      String(row?.summary_key || '') === summaryKey && norm(row?.client_name) !== normalizedName
    );
    if (keyCollisions.length) {
      return Response.json({ error: 'Customer Summary concurrency key is already associated with a different client.' }, { status: 409 });
    }

    let canonical = canonicalRow(candidates.filter((row: any) => norm(row?.client_name) === normalizedName));
    let createdByThisRequest: any = null;

    if (!canonical) {
      let createError: any = null;
      try {
        createdByThisRequest = await Summary.create({
          summary_name: clientName,
          client_name: clientName,
          summary_key: summaryKey,
          estimate_number: estimateNumber,
          tier_number: 1,
          linked_projects: [requestedLink],
        });
      } catch (error) {
        createError = error;
      }

      await sleep(50);
      candidates = await loadCandidates(Summary, normalizedName, summaryKey);
      canonical = canonicalRow(candidates.filter((row: any) => norm(row?.client_name) === normalizedName));
      if (!canonical) {
        if (createError) throw createError;
        canonical = createdByThisRequest;
      }
      if (!canonical?.id) throw new Error('Customer Summary create could not be verified.');
    }

    canonical = await claimSummaryKey(Summary, canonical, summaryKey);

    // Merge the requested project first. This is a real compare-and-swap because
    // updateMany only succeeds when updated_date still matches the snapshot used
    // to compute the new linked_projects array.
    canonical = await mergeIntoCanonical({
      Summary,
      canonicalId: canonical.id,
      summaryKey,
      requestedLink,
      estimateNumber,
    });

    // Re-read a few times so simultaneous first creates using the same deterministic
    // key can converge. Only function-keyed rows are considered duplicates; old
    // historical summaries without this key are never deleted automatically.
    for (let round = 0; round < 3; round += 1) {
      if (round > 0) await sleep(40);
      candidates = await loadCandidates(Summary, normalizedName, summaryKey);
      const keyedDuplicates = candidates.filter((row: any) =>
        row?.id !== canonical.id && String(row?.summary_key || '') === summaryKey
      );
      if (!keyedDuplicates.length) break;

      for (const duplicate of keyedDuplicates) {
        const freshDuplicate = await getFresh(Summary, duplicate.id);
        if (!freshDuplicate) continue;
        if (norm(freshDuplicate?.client_name) !== normalizedName) {
          throw new Error('Customer Summary duplicate changed client identity during convergence.');
        }

        canonical = await mergeIntoCanonical({
          Summary,
          canonicalId: canonical.id,
          summaryKey,
          requestedLink,
          additions: freshDuplicate?.linked_projects || [],
          estimateNumber,
        });

        if (!duplicateIsSafeToDelete(freshDuplicate, String(user.id), summaryKey, normalizedName)) {
          throw new Error('A duplicate Customer Summary contains protected user data and was not deleted automatically.');
        }
        await deleteVerified(Summary, freshDuplicate);
      }
    }

    const finalSummary = await mergeIntoCanonical({
      Summary,
      canonicalId: canonical.id,
      summaryKey,
      requestedLink,
      estimateNumber,
    });

    return Response.json({ summary: finalSummary, reused: !createdByThisRequest });
  } catch (error) {
    console.error('ensureCustomerSummary error:', error);
    return Response.json({ error: error?.message || 'Customer Summary could not be updated safely.' }, { status: 500 });
  }
});
