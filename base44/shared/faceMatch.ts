// Face biometric matching — the single source of truth for descriptor
// validation, frame-to-template scoring, acceptance thresholds, and
// enrollment merges. staffDataRead strips face_descriptors for everyone, so
// ALL matching happens server-side inside the functions that import this;
// the client only ever ships captured probe frames up and gets an identity
// (or counts) back — never another user's templates.

export const FACE_MATCH = {
  // Acceptance: the best candidate's median frame distance must be <= this.
  maxDistance: 0.5,
  // ...AND the runner-up must be at least this much farther (multiplicative),
  separationRatio: 1.2,
  // ...or past this absolute distance to count as clearly separated.
  clearMargin: 0.6,
  // Probe frames accepted per identification request.
  maxFrames: 5,
  // Captures closer than this to an already-stored template are near-
  // duplicates of the same pose and are skipped on enrollment merge.
  mergeDistance: 0.10,
  // Stored template cap — oldest entries roll off first.
  templateMax: 40,
  // Enrollment batch cap.
  batchMax: 64,
};

const FACE_DIMENSIONS = 128;

// A descriptor is exactly 128 finite numbers in the sane capture range.
export function cleanDescriptor(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length !== FACE_DIMENSIONS) return null;
  const numbers = value.map(Number);
  if (numbers.some((n) => !Number.isFinite(n) || Math.abs(n) > 10)) return null;
  return numbers;
}

// Accepts one descriptor (number[128]) OR an array of descriptors; invalid
// entries are dropped and the result is capped at `max` valid frames.
export function cleanDescriptorBatch(value: unknown, max = FACE_MATCH.maxFrames): number[][] {
  const single = cleanDescriptor(value);
  const items: unknown[] = single ? [single] : (Array.isArray(value) ? value : []);
  const out: number[][] = [];
  for (const item of items) {
    const d = cleanDescriptor(item);
    if (!d) continue;
    out.push(d);
    if (out.length >= max) break;
  }
  return out;
}

// The valid stored templates on a user record (drops malformed entries).
export function storedTemplates(user: any): number[][] {
  const list = Array.isArray(user?.face_descriptors) ? user.face_descriptors : [];
  const out: number[][] = [];
  for (const item of list) {
    const d = cleanDescriptor(item);
    if (d) out.push(d);
  }
  return out;
}

export function faceDistance(a: number[], b: number[]): number {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function median(values: number[]): number {
  const sorted = [...values].sort((x, y) => x - y);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Scores every candidate against the captured frames: per frame the minimum
// distance over the candidate's stored templates, per candidate the MEDIAN
// over frames so one bad frame cannot sink a real match. The closest
// candidate is accepted only when it clears maxDistance AND is well
// separated from the runner-up — by ratio (>= best * separationRatio) or by
// an absolute clear margin — so near-identical look-alikes reject instead of
// guessing. A strict best < second is required too (exact ties reject).
export function matchFaceFrames(
  candidates: any[],
  frames: number[][],
): { user: any; distance: number; secondDistance: number } | null {
  const scored: Array<{ user: any; distance: number }> = [];
  for (const user of candidates || []) {
    const templates = storedTemplates(user);
    if (!templates.length) continue;
    const perFrame: number[] = [];
    for (const frame of frames) {
      let d = Infinity;
      for (const t of templates) d = Math.min(d, faceDistance(frame, t));
      perFrame.push(d);
    }
    scored.push({ user, distance: median(perFrame) });
  }
  scored.sort((x, y) => x.distance - y.distance);
  const best = scored[0] || null;
  if (!best || !(best.distance <= FACE_MATCH.maxDistance)) return null;
  const secondDistance = scored.length > 1 ? scored[1].distance : Infinity;
  const separated = secondDistance >= best.distance * FACE_MATCH.separationRatio
    || secondDistance > FACE_MATCH.clearMargin;
  if (!(secondDistance > best.distance) || !separated) return null;
  return { user: best.user, distance: best.distance, secondDistance };
}

// Merges a validated capture batch into the stored template set: captures
// within mergeDistance of an already-merged template are skipped, then the
// set is capped at templateMax by dropping the OLDEST entries. `stored` in
// the result is the valid pre-merge template count.
export function mergeFaceTemplates(
  stored: unknown,
  batch: number[][],
): { merged: number[][]; added: number; stored: number; dropped: number } {
  const merged = (Array.isArray(stored) ? stored : [])
    .map((v) => cleanDescriptor(v))
    .filter((d): d is number[] => d !== null);
  const storedCount = merged.length;
  let added = 0;
  for (const d of batch || []) {
    if (!merged.some((e) => faceDistance(e, d) < FACE_MATCH.mergeDistance)) {
      merged.push(d);
      added += 1;
    }
  }
  const dropped = Math.max(0, merged.length - FACE_MATCH.templateMax);
  return { merged: dropped ? merged.slice(dropped) : merged, added, stored: storedCount, dropped };
}
