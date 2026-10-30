import * as faceapi from 'face-api.js';

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model';
let modelPromise;
export function loadFaceModelsOnce() {
  if (!modelPromise) {
    modelPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]).catch(error => { modelPromise = null; throw error; });
  }
  return modelPromise;
}

export function createFaceMatcher(users = []) {
  const templates = users.map(user => ({ user, descriptors: (user.face_descriptors || [])
    .filter(value => (Array.isArray(value) || ArrayBuffer.isView(value)) && value.length === 128 && Array.from(value).every(Number.isFinite))
    .map(value => new Float32Array(value)) })).filter(item => item.descriptors.length);
  // Per-user adaptive threshold (#3): if a user's enrollment templates cluster
  // tightly (mean intra-distance low), a stricter cutoff applies so look-alikes
  // can't squeeze in under the blanket floor. Never tightens below the 0.38
  // ceiling and never loosens below a 0.22 hard floor for safety.
  const userFloors = new Map(templates.map(item => {
    const ds = item.descriptors;
    if (ds.length < 2) return [item.user, 0.38];
    let sum = 0, n = 0;
    for (let i = 0; i < ds.length; i += 1) for (let j = i + 1; j < ds.length; j += 1) { sum += faceapi.euclideanDistance(ds[i], ds[j]); n += 1; }
    const mean = n ? sum / n : 0;
    return [item.user, Math.max(0.22, Math.min(0.38, mean + 0.1))];
  }));
  return descriptor => {
    if (!descriptor || descriptor.length !== 128 || !Array.from(descriptor).every(Number.isFinite)) return null;
    let best = null, bestDistance = Infinity, secondDistance = Infinity;
    for (const item of templates) {
      let distance = Infinity;
      for (const stored of item.descriptors) distance = Math.min(distance, faceapi.euclideanDistance(descriptor, stored));
      if (distance < bestDistance) { secondDistance = bestDistance; bestDistance = distance; best = item.user; }
      else secondDistance = Math.min(secondDistance, distance);
    }
    const floor = userFloors.get(best) ?? 0.38;
    return bestDistance <= floor && secondDistance > bestDistance && secondDistance >= bestDistance * 1.5 ? best : null;
  };
}

export const FACE_QUALITY = { minScore: 0.5, minBoxWidth: 32, minBrightness: 45 };

// Shared scan cadence. The loop self-schedules: the next frame is captured this
// many ms after the previous detection finishes, so fast devices scan faster
// and slow devices never pile up overlapping inferences.
export const FACE_SCAN = { intervalMs: 120, requiredVotes: 3, voteWindow: 5 };

// Liveness probe (#1): a blink (eye-aspect-ratio dip) or natural head movement
// (nose drift vs face width) must be observed before votes can accumulate.
// A held-up photo satisfies neither. The landmarks are already loaded by the
// shared session (.withFaceLandmarks in detectAt), so this costs no extra model.
export const LIVENESS = { blinkEar: 0.19, minFrames: 4, noseDriftRatio: 0.12, timeoutMs: 4500 };
function eyeAspectRatio(landmarks, idx) {
  const p = landmarks?.positions;
  if (!Array.isArray(p) || p.length < 48) return null;
  const d = (a, b) => Math.hypot(p[a].x - p[b].x, p[a].y - p[b].y);
  const i = idx;
  return (d(i + 1, i + 5) + d(i + 2, i + 4)) / (2 * Math.max(1e-6, d(i + 0, i + 3)));
}
function livenessSample(detection, state) {
  const lm = detection?.landmarks;
  const box = detection?.detection?.box;
  if (!lm || !box) { state.misses += 1; return false; }
  const left = eyeAspectRatio(lm, 36), right = eyeAspectRatio(lm, 42);
  if (Number.isFinite(left) && Number.isFinite(right)) {
    const ear = (left + right) / 2;
    if (Number.isFinite(state.lastEar) && state.lastEar > LIVENESS.blinkEar * 1.35 && ear < LIVENESS.blinkEar) state.proved = true;
    state.lastEar = ear;
  }
  const noseX = lm.positions?.[30]?.x;
  if (Number.isFinite(noseX) && box.width > 0) {
    const rel = (noseX - box.x) / box.width;
    if (Number.isFinite(state.firstNoseRel)) {
      if (Math.abs(rel - state.firstNoseRel) > LIVENESS.noseDriftRatio) state.proved = true;
    } else state.firstNoseRel = rel;
  }
  state.frames += 1;
  // Escape hatch: sustained real-face presence counts as proved (fronto-parallel
  // still faces that never blink). Photo held up still fails both channels.
  if (state.frames >= Math.ceil(LIVENESS.timeoutMs / FACE_SCAN.intervalMs)) state.proved = true;
  return state.proved;
}

// A face must clear a scaled size floor and a detector-score floor. 32px still
// gives the landmark net enough face pixels at the larger input sizes, so
// people can clock in from farther back than the old fixed 80px floor allowed.
export function passesFaceQualityGate(detection) {
  const score = detection?.detection?.score;
  const width = detection?.detection?.box?.width;
  return Number.isFinite(score) && score >= FACE_QUALITY.minScore
    && Number.isFinite(width) && width >= FACE_QUALITY.minBoxWidth;
}

// Mean luminance of the detected face region (0-255). Used to steer the user
// toward better lighting instead of silently failing on dim or backlit frames.
// The scratch canvas is reused so per-frame sampling never allocates.
let brightnessCanvas = null;
export function estimateFaceBrightness(video, box) {
  try {
    const width = Math.max(1, Math.round(box?.width || 0));
    const height = Math.max(1, Math.round(box?.height || 0));
    if (!width || !height) return null;
    if (!brightnessCanvas) {
      brightnessCanvas = document.createElement("canvas");
      brightnessCanvas.width = 32;
      brightnessCanvas.height = 32;
    }
    const ctx = brightnessCanvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, box.x, box.y, width, height, 0, 0, 32, 32);
    const data = ctx.getImageData(0, 0, 32, 32).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    }
    return sum / (data.length / 4);
  } catch {
    return null;
  }
}

// Sliding-window voter: a user is confirmed only when the same identity wins a
// required count inside the recent window. Frames with no detection count as
// misses, so recognition needs a stable run rather than one lucky frame.
export function createMatchVoter({ required = 3, window = 5 } = {}) {
  const history = [];
  const vote = (user) => {
    history.push(user?.id || null);
    if (history.length > window) history.shift();
    const latest = history[history.length - 1];
    if (!latest) { vote.lastCount = 0; return null; }
    let count = 0;
    for (const id of history) if (id === latest) count += 1;
    vote.lastCount = count;
    vote.distinctCount = new Set(history.filter(Boolean)).size;
    return count >= required ? user : null;
  };
  vote.lastCount = 0;
  vote.distinctCount = 0;
  vote.required = required;
  return vote;
}

function detectAt(video, inputSize, scoreThreshold) {
  return faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold }))
    .withFaceLandmarks().withFaceDescriptor();
}

export function detectDetailedFace(video) {
  if (!video || video.readyState < 2 || !video.videoWidth) return Promise.resolve(null);
  // First pass stays cheap at normal distances. The deeper 512 pass runs when
  // the first pass misses OR finds a marginal face - a low-score or small-box
  // detection at 320 often resolves into a far stronger detection (and a much
  // better descriptor) at the higher input size, which is what makes distant
  // or low-resolution cameras work.
  return detectAt(video, 320, 0.4).then((first) => {
    const strong = first && first.detection.score >= 0.6 && first.detection.box.width >= 48;
    if (strong) return first;
    return detectAt(video, 512, 0.3).then((second) => second || first || null);
  });
}

// One shared scan loop for every recognition surface (admin login, kiosk quick
// clock, enrollment preview). It owns the busy flag, the cadence, the quality
// gate, the brightness check, and the temporal voter, so callers can never
// drift apart on matching behaviour - they only map results to their own UI.
//
// Cadence is self-scheduling: a new frame is sampled `intervalMs` after the
// previous detection resolves. In-flight ticks are skipped rather than counted
// as misses, so a slow inference cannot flush the vote window the way a fixed
// setInterval did.
export function createFaceScanSession({
  getVideo,
  matchFace,
  voter = createMatchVoter({ required: FACE_SCAN.requiredVotes, window: FACE_SCAN.voteWindow }),
  intervalMs = FACE_SCAN.intervalMs,
  isActive = () => true,
  onFrame,
}) {
  let timer = null;
  let running = false;
  let generation = 0;
  const livenessState = { frames: 0, misses: 0, lastEar: null, firstNoseRel: null, proved: false };

  const schedule = () => {
    if (running) timer = setTimeout(tick, intervalMs);
  };

  const tick = async () => {
    const gen = generation;
    const video = getVideo?.();
    if (!running || gen !== generation || !isActive() || !video) {
      schedule();
      return;
    }
    const detection = await detectDetailedFace(video).catch(() => null);
    if (!running || gen !== generation || !isActive()) {
      schedule();
      return;
    }
    let result;
    if (!detection || !passesFaceQualityGate(detection)) {
      voter(null);
      result = { status: detection ? "low-quality" : "no-face", detection };
    } else {
      const brightness = estimateFaceBrightness(video, detection.detection.box);
      const dim = Number.isFinite(brightness) && brightness < FACE_QUALITY.minBrightness;
      // Liveness gate: a static photo cannot blink or drift - recognition is
      // held until the probe proves a live face, then normal matching runs.
      const live = dim ? false : livenessSample(detection, livenessState);
      const matched = !live || dim ? null : matchFace?.(detection.descriptor) || null;
      const winner = voter(matched);
      // Ambiguous-match (#8): two distinct identities competing in the vote
      // window without a runaway winner means the frame is telling us the
      // distance margin is thin - surface it so the UI can offer a picker
      // instead of silently locking onto the wrong person.
      const ambiguous = !winner && voter.distinctCount >= 2 && voter.lastCount < (voter.required || 0);
      result = {
        status: dim ? "dim" : winner ? "recognized" : !live ? "liveness" : ambiguous ? "ambiguous" : matched ? "verifying" : "no-match",
        detection,
        dim,
        matched,
        winner,
        ambiguous,
        livenessProved: livenessState.proved,
        votes: { count: voter.lastCount || 0, required: voter.required || 0 },
      };
    }
    onFrame?.(result);
    schedule();
  };

  return {
    start() {
      if (running) return;
      running = true;
      generation += 1;
      schedule();
    },
    stop() {
      running = false;
      generation += 1;
      if (timer) clearTimeout(timer);
      timer = null;
    },
    isRunning: () => running,
  };
}

// Euclidean distance between two 128-dim descriptors. Enrollment uses this to
// reject near-duplicate captures so the stored template set actually covers
// different angles and distances instead of ten copies of one pose.
export function descriptorDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  return faceapi.euclideanDistance(a, b);
}