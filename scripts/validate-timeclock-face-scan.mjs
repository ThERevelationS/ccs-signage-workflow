import assert from "node:assert/strict";// Synthetic coverage for the Tier-1 face scan hardening: scaled quality gate,
// two-pass detection fallback, brightness estimate, and the 3-of-5 match voter.
// No camera, models, or production data are involved.

import { readFileSync } from "node:fs";
import vm from "node:vm";

const runtimeSource = readFileSync("src/components/timeclock/faceScanRuntime.js", "utf8");
const componentSource = readFileSync("src/components/timeclock/FaceRecognition.jsx", "utf8");
let passed = 0;
const test = async (name, fn) => { await fn(); passed += 1; console.log("PASS " + name); };

function loadRuntime({ firstPass = null, secondPass = null } = {}) {
  const calls = [];
  const faceapi = {
    TinyFaceDetectorOptions: class {
      constructor(opts) { this.opts = opts; }
    },
    detectSingleFace(_video, opts) {
      calls.push(opts?.opts?.inputSize ?? opts?.inputSize);
      const value = calls.length === 1 ? firstPass : secondPass;
      return {
        withFaceLandmarks() { return this; },
        withFaceDescriptor() { return Promise.resolve(value); },
      };
    },
    euclideanDistance: (a, b) => Math.hypot(...a.map((v, i) => v - b[i])),
    nets: {},
  };
  const ctx = {
    faceapi, document: {}, Promise, Float32Array, Math, Number, console,
  };
  vm.createContext(ctx);
  vm.runInContext(
    runtimeSource
      .replace(/^import \* as faceapi.*$/m, "")
      .replace(/^export /gm, "")
      + "\nthis.__x = { FACE_QUALITY, createMatchVoter, createFaceMatcher, detectDetailedFace, estimateFaceBrightness, passesFaceQualityGate };",
    ctx,
  );
  return { x: ctx.__x, calls };
}

const det = (score, width) => ({ detection: { score, box: { width, height: width } } });

await test("quality gate enforces score floor and scaled 32px size floor", () => {
  const { x } = loadRuntime();
  assert.equal(x.FACE_QUALITY.minScore, 0.5);
  assert.equal(x.FACE_QUALITY.minBoxWidth, 32);
  assert.equal(x.passesFaceQualityGate(det(0.49, 200)), false);
  assert.equal(x.passesFaceQualityGate(det(0.5, 32)), true);
  assert.equal(x.passesFaceQualityGate(det(0.9, 31)), false, "31px box must fail");
  assert.equal(x.passesFaceQualityGate(det(0.9, 32)), true, "distant 32px face passes now");
  assert.equal(x.passesFaceQualityGate(null), false);
  assert.equal(x.passesFaceQualityGate({}), false);
});

await test("two-pass detection: cheap 320 pass wins when a face is found", async () => {
  const { x, calls } = loadRuntime({ firstPass: det(0.8, 120) });
  const video = { readyState: 4, videoWidth: 1280 };
  const result = await x.detectDetailedFace(video);
  assert.equal(result.detection.score, 0.8);
  assert.deepEqual(calls, [320], "no deep pass when the cheap pass detects");
});

await test("two-pass detection: 512 fallback finds smaller/distant faces", async () => {
  const { x, calls } = loadRuntime({ firstPass: null, secondPass: det(0.6, 40) });
  const video = { readyState: 4, videoWidth: 1280 };
  const result = await x.detectDetailedFace(video);
  assert.equal(result.detection.box.width, 40);
  assert.deepEqual(calls, [320, 512], "deep pass only runs after a miss");
});

await test("detectDetailedFace skips unready video without detector calls", async () => {
  const { x, calls } = loadRuntime();
  assert.equal(await x.detectDetailedFace(null), null);
  assert.equal(await x.detectDetailedFace({ readyState: 1, videoWidth: 1280 }), null);
  assert.deepEqual(calls, []);
});

await test("match voter requires 3-of-5 on the same identity", () => {
  const { x } = loadRuntime();
  const user = { id: "u1" };
  const vote = x.createMatchVoter({ required: 3, window: 5 });
  assert.equal(vote(user), null);
  assert.equal(vote(user), null);
  assert.equal(vote(user), user, "3 consecutive frames confirm");
});

await test("match voter tolerates a miss inside the window", () => {
  const { x } = loadRuntime();
  const user = { id: "u1" };
  const vote = x.createMatchVoter({ required: 3, window: 5 });
  vote(user);
  vote(null);          // missed frame counts against the window
  assert.equal(vote(user), null, "2-of-5 is not enough");
  assert.equal(vote(user), user, "3-of-5 with one miss confirms");
});

await test("match voter cannot confirm while latest frame is a different user or a miss", () => {
  const { x } = loadRuntime();
  const a = { id: "a" }, b = { id: "b" };
  const vote = x.createMatchVoter({ required: 3, window: 5 });
  vote(a); vote(a); vote(a);
  assert.equal(vote(b), null, "switching users breaks the run even inside the window");
  assert.equal(vote(a), a, "returning to the same user can still confirm");
  const vote2 = x.createMatchVoter({ required: 3, window: 5 });
  vote2(a); vote2(a); vote2(a); vote2(a); vote2(a);
  assert.equal(vote2(null), null, "a trailing miss cannot confirm a stale identity");
});

await test("match voter evicts votes older than the window", () => {
  const { x } = loadRuntime();
  const a = { id: "a" };
  const vote = x.createMatchVoter({ required: 3, window: 5 });
  vote(a); vote(null); vote(null); vote(null); vote(null); // window now all misses
  assert.equal(vote(a), null, "the aged-out first vote no longer counts");
  assert.equal(vote(a), null);
  assert.equal(vote(a), a);
});

await test("brightness estimator guards malformed boxes", () => {
  const { x } = loadRuntime();
  assert.equal(x.estimateFaceBrightness({}, null), null);
  assert.equal(x.estimateFaceBrightness({}, { width: 0, height: 10 }), null);
});

await test("component requests higher-resolution video and uses the voter", () => {
  assert.match(componentSource, /width: \{ ideal: 1280 \}, height: \{ ideal: 720 \}/);
  assert.match(componentSource, /createMatchVoter\(\{ required: 3, window: 5 \}\)/);
  assert.match(componentSource, /voter\(null\)/, "misses must enter the window");
  assert.match(componentSource, /onRecognized\?\.\(winner/, "only the voter's confirmed winner triggers recognition");
  assert.doesNotMatch(componentSource, /box\.width < 80/, "fixed 80px floor must be gone");
});

await test("component dims out instead of matching under poor light", () => {
  assert.match(componentSource, /const user = dim \? null : findMatchingUser/);
  assert.match(componentSource, /Lighting is dim\. Move to better light/);
  assert.match(componentSource, /Lighting is too dim to enroll well/, "enrollment rejects dim captures");
  assert.match(componentSource, /estimateFaceBrightness\(videoRef\.current, detection\.detection\.box\)/);
});

await test("scan reticle is a pointer-events-none overlay keyed to scan state", () => {
  assert.match(componentSource, /scan-reticle scan-tone-\$\{scanTone\}/);
  assert.match(componentSource, /aria-hidden="true"/);
  assert.match(componentSource, /isScanning && !recognizedUser/);
  for (const cls of ["scan-bracket", "scan-oval", "scan-line"]) {
    assert.ok(componentSource.includes(cls), "reticle must render " + cls);
  }
  assert.doesNotMatch(componentSource, /border-4 border-purple-500 animate-pulse/, "old pulsing border must be gone");
});

await test("reticle tone derives from recognition state", () => {
  assert.match(componentSource, /recognizedUser \? "success"/);
  assert.match(componentSource, /includes\("verifying"\) \? "verifying"/);
  assert.match(componentSource, /includes\("dim"\) \? "dim"/);
});

await test("success overlay draws the check and bursts the ring", () => {
  assert.match(componentSource, /success-burst/);
  assert.match(componentSource, /check-draw/);
});

await test("scan CSS provides all tones and reduced-motion fallbacks", () => {
  const cssSource = readFileSync("src/index.css", "utf8");
  for (const cls of ["scanSweep", "scanBreath", "successRing", "drawCheck", "scan-reticle", "scan-tone-scanning", "scan-tone-verifying", "scan-tone-dim", "scan-tone-success", "success-burst", "check-draw"]) {
    assert.ok(cssSource.includes(cls), "index.css must define " + cls);
  }
  const rmBlock = cssSource.slice(cssSource.lastIndexOf("prefers-reduced-motion"));
  assert.match(rmBlock, /\.scan-line, \.scan-oval, \.success-burst, \.check-draw \{ animation: none !important; \}/);
});

await test("QuickClockSection inline face scan uses the same reticle", () => {
  const qc = readFileSync("src/components/timeclock/QuickClockSection.jsx", "utf8");
  assert.match(qc, /scan-reticle scan-tone-scanning/);
  assert.doesNotMatch(qc, /border-4 border-purple-500[^]*animate-pulse/, "old pulsing border must be gone from the kiosk scan too");
  for (const cls of ["scan-bracket", "scan-oval", "scan-line"]) {
    assert.ok(qc.includes(cls), "kiosk reticle must render " + cls);
  }
});

await test("clock-in notification draws its check/x and bursts", () => {
  const qc = readFileSync("src/components/timeclock/QuickClockSection.jsx", "utf8");
  const notif = qc.slice(qc.indexOf("{notification && ("), qc.indexOf("clay-card p-6"));
  assert.match(notif, /success-burst/);
  assert.match(notif, /check-draw" d="M4 12\.5l5 5L20 6\.5"/);
  assert.match(notif, /check-draw" d="M6 6l12 12M18 6L6 18"/);
});

await test("punch button has press feedback and focus ring", () => {
  const qc = readFileSync("src/components/timeclock/QuickClockSection.jsx", "utf8");
  assert.match(qc, /motion-safe:active:scale-95/);
  assert.match(qc, /focus-visible:ring-purple-400\/60/);
});

await test("TimeClock page has the ambient backdrop", () => {
  const page = readFileSync("src/pages/TimeClock.jsx", "utf8");
  assert.match(page, /min-h-screen p-4 sm:p-6 ambient-mesh/);
});

console.log(`\nFACE SCAN VALIDATOR: ${passed} scenarios PASS`);
