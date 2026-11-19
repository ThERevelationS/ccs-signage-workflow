// FaceRecognition + the real faceScanRuntime session loop in isolated Chromium.
// face-api.js is aliased to a controllable stub so the shared session pipeline
// (cadence, quality gate, brightness gate, voter, recognized callback) runs for
// real without camera hardware or model downloads. Synthetic data only.
import assert from "node:assert/strict";
import { mkdtemp, writeFile, symlink, copyFile, readdir } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const root = process.cwd();
const { pathToFileURL } = await import("node:url");
const { chromium } = await import(process.env.TIMECLOCK_PLAYWRIGHT_PATH ||
  pathToFileURL(path.join(tmpdir(), "timeclock-browser-check/node_modules/playwright/index.mjs")).href);
const scratch = realpathSync(await mkdtemp(path.join(tmpdir(), "face-scan-browser-")));
const failures = [];
let vite, browser, passed = 0;
const test = async (name, fn) => {
  try { await fn(); passed += 1; console.log("PASS " + name); }
  catch (err) { failures.push({ name, err }); console.log("FAIL " + name + " :: " + err.message); }
};

// face-api stub: one strong detection per frame; identity descriptor of zeros
// matches the enrolled template (distance 0) so the voter can confirm.
const FACE_STUB = `
let detectionMode = "face";
export function __setMode(m) { detectionMode = m; }
export class TinyFaceDetectorOptions { constructor(opts) { this.opts = opts; } }
let counter = 0;
const result = () => {
  if (detectionMode !== "face") return null;
  counter += 1;
  const descriptor = new Float32Array(128);
  descriptor[counter % 128] = 0.3; // rotating pose: 0.3 from enrolled zeros, ~0.42 apart
  return { detection: { score: 0.92, box: { x: 120, y: 60, width: 160, height: 160 } }, descriptor };
};
export function detectSingleFace() {
  return {
    withFaceLandmarks() { return this; },
    withFaceDescriptor() { return Promise.resolve(result()); },
  };
}
export const euclideanDistance = (a, b) => Math.hypot(...Array.from(a).map((v, i) => v - b[i]));
const net = { loadFromUri: () => Promise.resolve() };
export const nets = { tinyFaceDetector: net, faceLandmark68Net: net, faceRecognitionNet: net };
`;

const MAIN = `
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import FaceRecognition from "@/components/timeclock/FaceRecognition.jsx";

const enrolled = [{ id: "u-1", email: "ada@synthetic.invalid", full_name: "Ada Synthetic",
  role: "admin", face_descriptors: [new Array(128).fill(0)] }];

function App() {
  const [recognized, setRecognized] = useState("");
  const [enrolledCount, setEnrolledCount] = useState(0);
  return (
    <div>
      <FaceRecognition allUsers={enrolled}
        onRecognized={(user) => setRecognized(user.full_name)} />
      <FaceRecognition mode="enroll"
        onEnrollCapture={(d) => setEnrolledCount(d.length)} />
      <div id="recognized">{recognized}</div>
      <div id="enrolled">{enrolledCount}</div>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
`;

try {
  await symlink(path.join(root, "node_modules"), path.join(scratch, "node_modules"), "junction");
  const assets = await readdir(path.join(root, "dist/assets"));
  const css = assets.find((name) => name.endsWith(".css"));
  assert.ok(css, "Run npm run build first");
  await copyFile(path.join(root, "dist/assets", css), path.join(scratch, "styles.css"));
  await writeFile(path.join(scratch, "face-api-stub.js"), FACE_STUB);
  await writeFile(path.join(scratch, "index.html"),
    '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div>' +
    '<script type="module" src="/main.jsx"></script></body></html>');
  await writeFile(path.join(scratch, "main.jsx"), MAIN);

  vite = await createServer({
    root: scratch,
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.join(root, "src"),
        "face-api.js": path.join(scratch, "face-api-stub.js"),
      },
    },
    server: { fs: { strict: false, allow: [root, scratch] } },
    logLevel: "silent",
  });
  await vite.listen();
  const url = `http://localhost:${vite.config.server.port}`;

  browser = await chromium.launch({ args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
  ] });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));
  await page.goto(url, { waitUntil: "networkidle" });

  await test("both face surfaces mount and begin scanning without console errors", async () => {
    await page.waitForSelector("text=Face Recognition", { timeout: 10000 });
    await page.waitForSelector("text=Face Enrollment", { timeout: 10000 });
    await page.waitForSelector("text=Starting camera", { timeout: 10000 }).catch(() => {});
    const videos = await page.$$("video");
    assert.equal(videos.length, 2, "recognition + enrollment videos mounted");
    const benign = (t) => t.includes("favicon") || t.includes("Autofocus");
    const bad = consoleErrors.filter((t) => !benign(t));
    assert.deepEqual(bad, [], "no console errors: " + bad.join(" | "));
  });

  await test("shared session confirms the identity through the voter and fires onRecognized", async () => {
    await page.waitForSelector("#recognized:not(:empty)", { timeout: 15000 });
    assert.equal(await page.textContent("#recognized"), "Ada Synthetic");
    await page.waitForSelector("text=Recognized: Ada Synthetic", { timeout: 5000 });
  });

  await test("enrollment continuous capture collects deduped descriptors", async () => {
    const btn = page.getByRole("button", { name: "Start Auto-Capture" });
    await btn.waitFor({ timeout: 10000 });
    await btn.click();
    await page.waitForTimeout(500);
    try {
      await page.waitForFunction(() => {
        const el = document.getElementById("enrolled");
        return el && Number(el.textContent) >= 10;
      }, { timeout: 20000 });
    } catch (e) {
      const statuses = await page.$$eval("p", (ps) => ps.map((p) => p.textContent));
      const enrolled = await page.textContent("#enrolled");
      throw new Error(`timeout; enrolled=${enrolled}; statuses=${JSON.stringify(statuses)}; errors=${consoleErrors.join("|")}; orig=${e.message}`);
    }
    assert.equal(await page.textContent("#enrolled"), "10");
    const bad = consoleErrors.filter((t) => !t.includes("favicon") && !t.includes("Autofocus"));
    assert.deepEqual(bad, [], "no console errors during enrollment");
  });
} catch (err) {
  failures.push({ name: "harness", err });
} finally {
  if (browser) await browser.close();
  if (vite) await vite.close();
}
console.log(`\nFACE SCAN BROWSER: ${passed} pass, ${failures.length} fail`);
if (failures.length) process.exit(1);
console.log(`PASS ${passed}/${passed} face-scan browser checks`);
