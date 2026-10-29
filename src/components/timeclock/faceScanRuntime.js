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
  return descriptor => {
    if (!descriptor || descriptor.length !== 128 || !Array.from(descriptor).every(Number.isFinite)) return null;
    let best = null, bestDistance = Infinity, secondDistance = Infinity;
    for (const item of templates) {
      let distance = Infinity;
      for (const stored of item.descriptors) distance = Math.min(distance, faceapi.euclideanDistance(descriptor, stored));
      if (distance < bestDistance) { secondDistance = bestDistance; bestDistance = distance; best = item.user; }
      else secondDistance = Math.min(secondDistance, distance);
    }
    // Keep the existing identity threshold and runner-up separation unchanged.
    return bestDistance <= 0.38 && secondDistance > bestDistance && secondDistance >= bestDistance * 1.5 ? best : null;
  };
}

export const FACE_QUALITY = { minScore: 0.5, minBoxWidth: 32, minBrightness: 45 };

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
export function estimateFaceBrightness(video, box) {
  try {
    const width = Math.max(1, Math.round(box?.width || 0));
    const height = Math.max(1, Math.round(box?.height || 0));
    if (!width || !height) return null;
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
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
  return (user) => {
    history.push(user?.id || null);
    if (history.length > window) history.shift();
    const latest = history[history.length - 1];
    if (!latest) return null;
    let count = 0;
    for (const id of history) if (id === latest) count += 1;
    return count >= required ? user : null;
  };
}

export function detectDetailedFace(video) {
  if (!video || video.readyState < 2 || !video.videoWidth) return Promise.resolve(null);
  // First pass stays cheap at normal distances; the deeper second pass catches
  // faces that are smaller because the person is farther away or the camera is
  // low-resolution.
  return faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 }))
    .withFaceLandmarks().withFaceDescriptor()
    .then((first) => first || faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.3 }))
      .withFaceLandmarks().withFaceDescriptor());
}