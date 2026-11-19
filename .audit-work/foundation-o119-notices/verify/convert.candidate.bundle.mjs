// stub:@/components/staff/staffEntities
var staffEntities = { BrickStoneProject: {} };

// stub:@/components/estimator/idempotentEntityCreate
var __n = 0;
var newCreationRequestKey = (k) => "k-" + (k || "x") + "-" + ++__n;
var ensureIdempotentEntityCreate = async (a) => {
  if (globalThis.__ensureIdempotent) return globalThis.__ensureIdempotent(a);
  return { id: "created-1", ...a.data };
};

// .audit-work/foundation-o119-notices/candidates/src/components/estimator/foundation/foundationPreliminaryNotice.js
import { createElement, useState } from "react";
var PRELIMINARY_NOTICE_TEXT = "Preliminary estimating only - final engineering required";
function hasPreliminaryNotice(text) {
  return typeof text === "string" && text.includes(PRELIMINARY_NOTICE_TEXT);
}
function ensurePreliminaryNotice(notes) {
  if (notes === null || notes === void 0) return PRELIMINARY_NOTICE_TEXT;
  if (typeof notes !== "string") {
    throw new Error("Preliminary notice can only be applied to string notes.");
  }
  if (notes.trim() === "") return PRELIMINARY_NOTICE_TEXT;
  if (hasPreliminaryNotice(notes)) return notes;
  return `${PRELIMINARY_NOTICE_TEXT}

${notes}`;
}

// .audit-work/foundation-o119-notices/candidates/src/components/estimator/foundation/convertToBrickStone.js
async function convertFoundationToBrickStone({ project, attemptRef } = {}) {
  if (!project?.id) throw new Error("Save the Foundation project before converting.");
  const sourceName = String(project.project_name || "Foundation").trim();
  const payload = {
    project_name: `${sourceName} (Brick & Stone)`,
    client_name: String(project.client_name || "").trim(),
    customer_id: String(project.customer_id || "").trim() || void 0,
    estimate_number: String(project.estimate_number || "").trim() || void 0,
    hyperlink: String(project.hyperlink || "").trim() || void 0,
    status: "draft",
    notes: ensurePreliminaryNotice(`Converted from Foundation project "${sourceName}" (${project.id}). Re-enter masonry dimensions to calculate.`)
  };
  const signature = JSON.stringify(payload);
  if (attemptRef && attemptRef.current?.signature !== signature) {
    attemptRef.current = { signature, key: newCreationRequestKey("foundation_to_brick_stone") };
  }
  const key = attemptRef?.current?.key || newCreationRequestKey("foundation_to_brick_stone");
  const created = await ensureIdempotentEntityCreate({
    entity: staffEntities.BrickStoneProject,
    keyField: "creation_request_key",
    key,
    data: payload,
    label: "Brick & Stone draft"
  });
  if (!created?.id) throw new Error("Brick & Stone draft could not be verified.");
  return created;
}
export {
  convertFoundationToBrickStone
};
