// face-api.js (TFJS + detector runtime, ~1MB) is lazy — it must never sit in
// the page chunk. The first real face scan pulls the library chunk and the
// model weights together inside loadFaceModelsOnce; badge/PIN/QR flows and
// page load never download it. Descriptor math below runs on a local
// euclidean helper so matching also needs no library import.
let faceapiPromise;
function faceApi() {
  if (!faceapiPromise) faceapiPromise = import('face-api.js');
  return faceapiPromise;
}

// Matches face-api's euclideanDistance exactly (L2 distance on equal-length
// vectors) — kept local so matcher construction and distance checks work
// before (and without) the recognition library.
function euclideanDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = Number(a[i]) - Number(b[i]);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model';
let modelPromise;
export function loadFaceModelsOnce() {
  if (!modelPromise) {
    modelPromise = faceApi().then((faceapi) => Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]).then(async () => {
      // Warm the WebGL pipeline once so the first real scan does not pay the
      // shader-compile stall (often 1-3s of dead time on the first frame).
      try {
        const warm = document.createElement("canvas");
        warm.width = 64; warm.height = 64;
        await faceapi.detectSingleFace(warm, new faceapi.TinyFaceDetectorOptions({ inputSize: 64, scoreThreshold: 0.1 }))
          .withFaceLandmarks().withFaceDescriptor();
      } catch { /* warmup is best-effort */ }
    })).catch(error => { modelPromise = null; throw error; });
  }
  return modelPromise;
}

export const FACE_QUALITY = { minScore: 0.5, minBoxWidth: 32, minBrightness: 45 };

// Shared scan cadence. The loop self-schedules: the next frame is captured this
// many ms after the previous detection finishes, so fast devices scan faster
// and slow devices never pile up overlapping inferences.
// captureFrames: in capture mode (no matchFace - server-side matching) this
// many good post-liveness frames are collected before "captured" emits.
export const FACE_SCAN = { intervalMs: 120, requiredVotes: 3, voteWindow: 6, captureFrames: 3 };

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
  // Escape hatch: sustained real-face presence for timeoutMs counts as proved
  // (fronto-parallel still faces that never blink). Time-based, not frame-count
  // based - a slow inference loop must not stretch 4.5s into a minute. A >2.5s
  // gap between landmarked frames resets the streak.
  const nowMs = Date.now();
  if (!state.streakStartMs || nowMs - (state.lastFrameMs || 0) > 2500) state.streakStartMs = nowMs;
  state.lastFrameMs = nowMs;
  state.frames += 1;
  if (nowMs - state.streakStartMs >= LIVENESS.timeoutMs) state.proved = true;
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

// Landmark + descriptor passes are optional: while liveness is still unproved
// the matcher never runs, so paying for the recognition net on those frames
// just slows the cadence that liveness sampling depends on.
async function detectAt(video, inputSize, scoreThreshold, withDescriptor = true) {
  const faceapi = await faceApi();
  const task = faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold }))
    .withFaceLandmarks();
  return withDescriptor ? task.withFaceDescriptor() : task;
}

// Marginal-face escalations are capped to every 3rd tick - a borderline 320
// detection otherwise pays the deep 512 pass on every single frame.
let marginalEscalationTick = 0;

export function detectDetailedFace(video, withDescriptor = true) {
  if (!video || video.readyState < 2 || !video.videoWidth) return Promise.resolve(null);
  // First pass stays cheap at normal distances. The deeper 512 pass runs when
  // the first pass misses - and every 3rd tick on a marginal face (a low-score
  // or small-box detection at 320 often resolves into a far stronger detection
  // at the higher input size, which is what makes distant or low-resolution
  // cameras work).
  return detectAt(video, 320, 0.4, withDescriptor).then((first) => {
    const strong = first && first.detection.score >= 0.6 && first.detection.box.width >= 48;
    if (strong) return first;
    if (first && (marginalEscalationTick++ % 3) !== 0) return first;
    return detectAt(video, 512, 0.3, withDescriptor).then((second) => second || first || null);
  });
}

// One shared scan loop for every recognition surface (admin login, kiosk quick
// clock, enrollment preview). It owns the busy flag, the cadence, the quality
// gate, and the brightness check, so callers can never drift apart on
// behaviour - they only map results to their own UI.
//
// Cadence is self-scheduling: a new frame is sampled `intervalMs` after the
// previous detection resolves. In-flight ticks are skipped rather than counted
// as misses, so a slow inference cannot flush the vote window the way a fixed
// setInterval did.
//
// Two modes:
//  - matchFace provided (legacy): the temporal voter confirms a client-side
//    identity.
//  - matchFace omitted (capture mode): matching lives server-side, so after
//    liveness proves the session collects FACE_SCAN.captureFrames good
//    descriptors, emits { status: "captured", descriptors, detection }, and
//    stops itself. The caller ships the frames to the backend and restarts a
//    fresh session to retry.
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
  const captureMode = typeof matchFace !== "function";
  const captured = [];
  const livenessState = { frames: 0, misses: 0, lastEar: null, firstNoseRel: null, streakStartMs: 0, lastFrameMs: 0, proved: false };

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
    // Descriptor compute is deferred until liveness proves - before that the
    // matcher never runs, so the recognition net would be pure waste per frame.
    const detection = await detectDetailedFace(video, livenessState.proved).catch(() => null);
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
      // Descriptor compute is deferred until liveness is proved, so the very
      // frame that first proves liveness was detected without one. Treat that
      // frame as verifying instead of reading a missing descriptor.
      const hasDescriptor = !!detection.descriptor && detection.descriptor.length > 0;
      if (captureMode) {
        if (live && !dim && hasDescriptor) {
          // Good live frame - bank the descriptor (JSON-safe array) toward the
          // probe batch the caller ships to the backend matcher.
          captured.push(Array.from(detection.descriptor));
          if (captured.length >= FACE_SCAN.captureFrames) {
            running = false;
            onFrame?.({ status: "captured", descriptors: captured.slice(), detection, livenessProved: true });
            return;
          }
          result = {
            status: "verifying",
            detection,
            livenessProved: true,
            votes: { count: captured.length, required: FACE_SCAN.captureFrames },
          };
        } else {
          result = {
            status: dim ? "dim" : !live ? "liveness" : "verifying",
            detection,
            dim,
            livenessProved: livenessState.proved,
            votes: { count: captured.length, required: FACE_SCAN.captureFrames },
          };
        }
      } else {
        const matched = !live || dim || !hasDescriptor ? null : matchFace?.(detection.descriptor) || null;
        const winner = voter(matched);
        // Ambiguous-match (#8): two distinct identities competing in the vote
        // window without a runaway winner means the frame is telling us the
        // distance margin is thin - surface it so the UI can offer a picker
        // instead of silently locking onto the wrong person.
        const ambiguous = !winner && voter.distinctCount >= 2 && voter.lastCount < (voter.required || 0);
        result = {
          status: dim ? "dim" : winner ? "recognized" : !live ? "liveness" : !hasDescriptor ? "verifying" : ambiguous ? "ambiguous" : matched ? "verifying" : "no-match",
          detection,
          dim,
          matched,
          winner,
          ambiguous,
          livenessProved: livenessState.proved,
          votes: { count: voter.lastCount || 0, required: voter.required || 0 },
        };
      }
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
  return euclideanDistance(a, b);
}

// Cached one-shot capability probe - some browsers expose BarcodeDetector
// with a constructor that throws (or no qr_code support), so
// "BarcodeDetector" in window alone is not a safe capability check and can
// crash callers that construct it unguarded.
let _inlineQrSupported;
export function supportsInlineQrDetection() {
  if (_inlineQrSupported === undefined) {
    try {
      _inlineQrSupported = typeof window !== "undefined"
        && typeof window.BarcodeDetector === "function"
        && !!new window.BarcodeDetector({ formats: ["qr_code"] });
    } catch {
      _inlineQrSupported = false;
    }
  }
  return _inlineQrSupported;
}