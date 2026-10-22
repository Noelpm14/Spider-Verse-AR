/**
 * tracker.js — MediaPipe HandLandmarker + FaceLandmarker wrapper.
 *
 * HandLandmarker runs every frame (gesture detection).
 * FaceLandmarker only runs when the gesture is active (performance saving).
 */

const MEDIAPIPE_CDN    = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MEDIAPIPE_ESM    = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
const MEDIAPIPE_BACKUP = 'https://esm.sh/@mediapipe/tasks-vision@0.10.14';

// MediaPipe model URLs (hosted on Google's storage CDN)
const MODEL_BASE = 'https://storage.googleapis.com/mediapipe-models';
const HAND_MODEL = `${MODEL_BASE}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`;
const FACE_MODEL = `${MODEL_BASE}/face_landmarker/face_landmarker/float16/1/face_landmarker.task`;

// Pose connection pairs used by renderer
export const POSE_CONNECTIONS = [
  [11,12],[11,13],[13,15],[12,14],[14,16],
  [11,23],[12,24],[23,24],
  [23,25],[25,27],[24,26],[26,28],
];

// Key face landmark indices (MediaPipe 478-point model)
export const FACE_IDX = {
  noseTip:       1,
  leftEye:       33,
  rightEye:      263,
  leftCheek:     234,
  rightCheek:    454,
  chin:          152,
  forehead:      10,

  // Eyelid aperture & corners for expressive blinking/winking
  leftEyeUpper:  159,
  leftEyeLower:  145,
  leftEyeInner:  133,
  leftEyeOuter:  33,
  rightEyeUpper: 386,
  rightEyeLower: 374,
  rightEyeInner: 362,
  rightEyeOuter: 263,
};

// ─── TrackerManager ───────────────────────────────────────────────────────
export class TrackerManager {
  constructor() {
    this.handLandmarker = null;
    this.faceLandmarker = null;
    this.handReady      = false;
    this.faceReady      = false;
  }

  /**
   * Load both MediaPipe models.
   * @param {function} onProgress  — (pct: number, label: string) => void
   */
  async init(onProgress) {
    onProgress(10, 'Loading MediaPipe Vision runtime…');

    let visionModule;
    try {
      visionModule = await import(MEDIAPIPE_ESM);
    } catch (e1) {
      console.warn('Primary jsDelivr import failed, attempting backup from esm.sh…', e1);
      try {
        visionModule = await import(MEDIAPIPE_BACKUP);
      } catch (e2) {
        console.warn('Backup esm.sh import failed, attempting unpkg…', e2);
        visionModule = await import('https://unpkg.com/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
      }
    }

    const { FilesetResolver, HandLandmarker, FaceLandmarker } = visionModule;

    onProgress(25, 'Downloading WASM runtime…');

    let vision;
    try {
      vision = await FilesetResolver.forVisionTasks(`${MEDIAPIPE_CDN}/wasm`);
    } catch (wasmErr) {
      console.warn('Primary WASM CDN failed, trying esm.sh CDN…', wasmErr);
      try {
        vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm');
      } catch (wasmErr2) {
        console.warn('Latest WASM CDN failed, trying unpkg…', wasmErr2);
        vision = await FilesetResolver.forVisionTasks('https://unpkg.com/@mediapipe/tasks-vision@0.10.14/wasm');
      }
    }

    onProgress(50, 'Initializing Hand Landmarker…');

    try {
      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: HAND_MODEL,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
      });
    } catch (gpuErr) {
      console.warn('HandLandmarker GPU delegate failed, falling back to CPU:', gpuErr);
      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: HAND_MODEL,
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
      });
    }
    this.handReady = true;

    onProgress(75, 'Initializing Face Landmarker…');

    try {
      this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: FACE_MODEL,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
      });
    } catch (gpuErr) {
      console.warn('FaceLandmarker GPU delegate failed, falling back to CPU:', gpuErr);
      this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: FACE_MODEL,
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
      });
    }
    this.faceReady = true;

    onProgress(95, 'Compiling WebGL shaders…');
  }

  /**
   * Detect hands — always called every frame.
   * @param {HTMLVideoElement} video
   * @param {number} timestamp
   */
  detectHands(video, timestamp) {
    if (!this.handReady || video.readyState < 2) return null;
    try {
      return this.handLandmarker.detectForVideo(video, timestamp);
    } catch { return null; }
  }

  /**
   * Detect face — only called when gesture is active.
   * @param {HTMLVideoElement} video
   * @param {number} timestamp
   */
  detectFace(video, timestamp) {
    if (!this.faceReady || video.readyState < 2) return null;
    try {
      return this.faceLandmarker.detectForVideo(video, timestamp);
    } catch { return null; }
  }

  close() {
    this.handLandmarker?.close();
    this.faceLandmarker?.close();
    this.handReady = false;
    this.faceReady = false;
  }
}
