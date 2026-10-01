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

export function detectDetailedFace(video) {
  if (!video || video.readyState < 2 || !video.videoWidth) return Promise.resolve(null);
  // Tiny detector stays lightweight; 224 gives a better face box for landmarks.
  return faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.3 }))
    .withFaceLandmarks().withFaceDescriptor();
}