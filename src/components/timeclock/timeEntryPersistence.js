import {
  deleteEntityIfUnchanged,
  expectedEntityFields,
  replaceEntityFieldsIfUnchanged,
} from "@/components/estimator/builder/builderEntityPersistence";

function canonicalActiveEntry(rows = []) {
  return [...rows].sort((a, b) => {
    const aClock = String(a?.clock_in || "");
    const bClock = String(b?.clock_in || "");
    if (aClock !== bClock) return aClock.localeCompare(bClock);
    const aCreated = String(a?.created_date || "");
    const bCreated = String(b?.created_date || "");
    if (aCreated !== bCreated) return aCreated.localeCompare(bCreated);
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  })[0] || null;
}

async function readActiveEntries(entity, userEmail, label) {
  if (typeof entity?.filter !== "function") {
    throw new Error(`${label} could not query active time entries.`);
  }
  const rows = await entity.filter({ user_email: userEmail, status: "clocked_in" });
  if (!Array.isArray(rows)) {
    throw new Error(`${label} active-entry lookup did not return a record list.`);
  }
  return rows;
}

export async function createActiveTimeEntryIfAbsent({
  entity,
  data,
  label = "Time clock entry",
  settleMs = 40,
} = {}) {
  const userEmail = String(data?.user_email || "").trim().toLowerCase();
  if (!userEmail || typeof entity?.create !== "function" || typeof entity?.get !== "function") {
    throw new Error(`${label} could not initialize its duplicate-safe clock-in.`);
  }

  const before = await readActiveEntries(entity, userEmail, label);
  if (before.length > 1) {
    throw new Error(`${label} found ${before.length} active entries for ${userEmail}. No new entry was created; an admin must review the duplicate active rows first.`);
  }
  if (before.length === 1) {
    return { record: before[0], status: "existing" };
  }

  let created = null;
  let createError = null;
  try {
    created = await entity.create({ ...data, user_email: userEmail, status: "clocked_in" });
  } catch (error) {
    createError = error;
  }

  const pause = Math.max(0, Math.min(500, Number(settleMs) || 0));
  const wait = () => pause ? new Promise(resolve => setTimeout(resolve, pause)) : Promise.resolve();

  let after = [];
  let verifyError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await wait();
    try {
      after = await readActiveEntries(entity, userEmail, label);
      verifyError = null;
      if (after.length) break;
    } catch (error) {
      verifyError = error;
    }
  }

  if (after.length === 1) {
    const record = after[0];
    if (created?.id && record.id === created.id) return { record, status: "created" };
    return { record, status: createError ? "verified_active" : "reused" };
  }

  if (after.length > 1) {
    const keep = canonicalActiveEntry(after);
    if (!keep?.id) {
      throw new Error(`${label} could not identify the canonical active row after concurrent clock-in attempts.`);
    }

    // Only clean up a losing row when this invocation has a confirmed create receipt
    // for that exact row. Never delete a pre-existing or ambiguous payroll record.
    if (created?.id && created.id !== keep.id) {
      const losing = after.find(row => row.id === created.id);
      if (losing?.id) {
        try {
          await deleteEntityIfUnchanged({
            entity,
            record: losing,
            guardFields: { user_email: userEmail, status: "clocked_in" },
            label: `${label} concurrent duplicate cleanup`,
          });
        } catch (cleanupError) {
          throw new Error(`${label} detected concurrent clock-ins but could not safely remove this session's losing duplicate. The payroll rows were left intact for admin review. ${cleanupError?.message || ""}`.trim());
        }
      }
    }

    // If this invocation owns the canonical row, give the competing invocation a
    // chance to remove only its own losing row. If convergence does not happen,
    // fail closed and preserve both payroll records for review.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await wait();
      const converged = await readActiveEntries(entity, userEmail, label);
      if (converged.length === 1) {
        return {
          record: converged[0],
          status: created?.id === converged[0].id ? "created" : "reused",
        };
      }
    }

    throw new Error(`${label} detected multiple concurrent active entries for ${userEmail}. No ambiguous payroll row was deleted; an admin must review them before another clock-in.`);
  }

  if (createError) throw createError;
  if (verifyError) throw verifyError;
  if (created?.id) {
    const direct = await entity.get(created.id).catch(() => null);
    if (direct?.id) {
      throw new Error(`${label} created an entry but the active-entry query could not verify it. Do not retry blindly; reload the time clock first.`);
    }
  }
  throw new Error(`${label} could not verify whether the clock-in was saved.`);
}

export async function clockOutTimeEntryIfUnchanged({
  entity,
  entry,
  clockOutData,
  label = "Time clock entry",
} = {}) {
  const nextFields = {
    clock_out: clockOutData?.clockOutTime,
    lunch_minutes: clockOutData?.lunchMinutes,
    total_hours: clockOutData?.totalHours,
    job_allocations: clockOutData?.jobAllocations,
    notes: clockOutData?.notes,
    status: "clocked_out",
  };

  if (String(entry?.status || "") !== "clocked_in") {
    throw new Error(`${label} is no longer clocked in. Reload before clocking out.`);
  }

  return replaceEntityFieldsIfUnchanged({
    entity,
    id: entry.id,
    expectedUpdatedAt: entry.updated_date || "",
    expectedFields: expectedEntityFields(entry, nextFields),
    nextFields,
    guardFields: { user_email: entry.user_email },
    label,
  });
}

export async function saveTimeEntryNotesIfUnchanged({
  entity,
  entry,
  notes,
  label = "Time entry notes",
} = {}) {
  const nextFields = { notes };
  return replaceEntityFieldsIfUnchanged({
    entity,
    id: entry?.id,
    expectedFields: expectedEntityFields(entry, nextFields),
    nextFields,
    guardFields: { user_email: entry?.user_email },
    label,
  });
}

export async function updateTimeEntryIfUnchanged({
  entity,
  entry,
  nextFields,
  label = "Time entry",
} = {}) {
  return replaceEntityFieldsIfUnchanged({
    entity,
    id: entry?.id,
    expectedUpdatedAt: entry?.updated_date || "",
    expectedFields: expectedEntityFields(entry, nextFields),
    nextFields,
    guardFields: { user_email: entry?.user_email },
    label,
  });
}

export async function deleteTimeEntryIfUnchanged({
  entity,
  entry,
  label = "Time entry",
} = {}) {
  return deleteEntityIfUnchanged({
    entity,
    record: entry,
    guardFields: { user_email: entry?.user_email },
    label,
  });
}
