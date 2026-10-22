/**
 * main.js — Multiverse AR Entry Point.
 *
 * Loop:
 *   Always shows raw webcam.
 *   Runs HandLandmarker every frame.
 *   If both hands visible → extract left-index-tip + right-thumb-tip
 *                         → clip active WebGL Multiverse filter to that rectangle.
 *   FaceLandmarker runs when portal box is active or when Spider-Sense is enabled.
 */

import { TrackerManager }  from './tracker.js';
import { WebGLRenderer }   from './shaders.js';
import { OverlayRenderer, UNIVERSE_THEMES } from './renderer.js';
import { TwoPointSelector, PinchDetector } from './gesture.js';
import { mosaicWaves }      from './mosaicWaves.js';

// ─── Device Profile ─────────────────────────────────────────────────────────
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;

// ─── DOM ────────────────────────────────────────────────────────────────────
const landingPage      = document.getElementById('landing-page');
const mosaicCanvas     = document.getElementById('mosaic-canvas');
const loadingScreen    = document.getElementById('loading-screen');
const arSection        = document.getElementById('ar-section');
const enterBtn         = document.getElementById('open-portal-btn') || document.getElementById('enter-btn');
const progressBar      = document.getElementById('progress-bar');
const loadingStatus    = document.getElementById('loading-status');
const video            = document.getElementById('webcam-video');
const outputCanvas     = document.getElementById('output-canvas');
const glCanvas         = document.getElementById('gl-canvas');
const permDenied       = document.getElementById('permission-denied');

const screenshotBtn    = document.getElementById('screenshot-btn');
const exitBtn          = document.getElementById('exit-btn');
const modeLabel        = document.getElementById('mode-label');
const faceIndicator    = document.getElementById('face-indicator');
const poseIndicator    = document.getElementById('pose-indicator');
const cycleFilterBtn   = document.getElementById('cycle-filter-btn');
const currentFilterName = document.getElementById('current-filter-name');
const toggleMaskBtn    = document.getElementById('toggle-mask-btn');
const maskStatusText   = document.getElementById('mask-status-text');
const consentBanner    = document.getElementById('consent-banner');
const acceptConsentBtn = document.getElementById('accept-consent-btn');

// Initialize Cookie & Privacy Banner
if (consentBanner && !localStorage.getItem('spiderverse_consent')) {
  consentBanner.classList?.remove('hidden');
}

acceptConsentBtn?.addEventListener('click', () => {
  localStorage.setItem('spiderverse_consent', 'true');
  consentBanner?.classList?.add('hidden');
  trackEvent('consent_accepted');
});

// ─── State ────────────────────────────────────────────────────────────────
let tracker           = null;
let glRender          = null;
let overlay           = null;
let selector          = null;
let pinchDetector     = null;
let rafId             = null;
let isRunning         = false;
let startTime         = 0;

let currentFilter     = 'miles';
const FILTERS         = ['miles', 'gwen', 'noir', 'anime', 'ham', 'classic'];
let glitchUntil       = 0;
let maskEnabled       = false;

// Throttled inference cache
let lastHandTime      = 0;
let lastFaceTime      = 0;
let cachedHandResult  = null;
let cachedFaceResult  = null;
let cachedPoints      = null;

const handInterval    = isMobile ? 36 : 28; // ms (~28-35 FPS inference)
const faceInterval    = isMobile ? 44 : 32; // ms

// ─── Analytics Hook ────────────────────────────────────────────────────────
export function trackEvent(name, params = {}) {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('event', name, params);
  }
  console.debug(`[Analytics] ${name}`, params);
}

// ─── Universe Switching ──────────────────────────────────────────────────
function setFilter(filterId) {
  if (!FILTERS.includes(filterId)) return;
  currentFilter = filterId;

  // Trigger brief interdimensional tear glitch
  glitchUntil = performance.now() + 320;

  if (currentFilterName) {
    currentFilterName.textContent = filterId.toUpperCase();
  }

  const theme = UNIVERSE_THEMES[filterId] || UNIVERSE_THEMES.miles;
  if (modeLabel && isRunning) {
    modeLabel.textContent = `UNIVERSE: ${theme.tag} ●`;
  }

  trackEvent('filter_switched', { universe: filterId });
}

function cycleFilter() {
  const nextIdx = (FILTERS.indexOf(currentFilter) + 1) % FILTERS.length;
  setFilter(FILTERS[nextIdx]);
}

function toggleMask() {
  maskEnabled = !maskEnabled;
  if (maskStatusText) {
    maskStatusText.textContent = maskEnabled ? 'ON' : 'OFF';
  }
  toggleMaskBtn?.classList?.toggle('off', !maskEnabled);
  overlay?.showBubble(maskEnabled ? 'MASK ON!' : 'MASK OFF!');
  trackEvent('mask_toggled', { enabled: maskEnabled });
}

// ─── Helpers ─────────────────────────────────────────────────────────────
function setProgress(pct, label) {
  const fill = document.getElementById('progress-fill') || progressBar;
  const val = document.getElementById('progress-val');
  const btnLabel = document.getElementById('btn-label');
  const btnIcon = document.getElementById('btn-icon');
  const mainBtn = document.getElementById('main-action-btn');

  if (fill) fill.style.width = `${pct}%`;
  if (val) val.textContent = `${pct}%`;
  if (loadingStatus) loadingStatus.textContent = label;

  if (pct >= 100) {
    if (btnLabel) btnLabel.textContent = "PORTAL READY // ENTERING NOW";
    if (btnIcon) btnIcon.textContent = "bolt";
    if (mainBtn) mainBtn.classList?.add("bg-white", "text-black");
  } else if (btnLabel) {
    btnLabel.textContent = label.toUpperCase();
  }
}
function showSection(el) {
  [landingPage, loadingScreen, arSection].forEach(s => s?.classList.add('hidden'));
  el?.classList.remove('hidden');
}

// Clamped canvas resolution for high performance on mobile / retina screens
function fitCanvas() {
  const maxDim = isMobile ? 960 : 1280;
  let W = window.innerWidth;
  let H = window.innerHeight;

  if (W > maxDim) {
    H = Math.round(H * (maxDim / W));
    W = maxDim;
  }

  outputCanvas.width  = W;
  outputCanvas.height = H;
  glRender?.resize(W, H);
}
window.addEventListener('resize', fitCanvas);

// Initialize high-performance Mosaic Waves background
mosaicWaves.init(mosaicCanvas);

// ─── Camera ──────────────────────────────────────────────────────────────
async function startCamera() {
  try {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: isMobile ? 640 : 1280 },
          height: { ideal: isMobile ? 480 : 720 },
          facingMode: 'user',
        },
      });
    } catch (e) {
      console.warn('Constrained camera getUserMedia failed, falling back to basic video:', e);
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
    }

    video.srcObject = stream;

    await new Promise((res) => {
      if (video.readyState >= 1 && video.videoWidth > 0) {
        res();
      } else {
        video.onloadedmetadata = () => res();
        setTimeout(res, 2500); // Safety timeout so camera initialization never hangs
      }
    });

    try {
      await video.play();
    } catch (playErr) {
      console.warn('video.play() warning:', playErr);
    }

    return stream;
  } catch (err) {
    permDenied?.classList.remove('hidden');
    throw err;
  }
}

// ─── Render loop ─────────────────────────────────────────────────────────
function loop(timestamp) {
  if (!isRunning) return;
  if (!video || video.readyState < 2 || video.videoWidth === 0) {
    rafId = requestAnimationFrame(loop);
    return;
  }

  const t = (timestamp - startTime) / 1000;

  // Throttled Hand Tracking Inference (smooth 60fps render with ~30fps ML workload)
  if (timestamp - lastHandTime >= handInterval) {
    cachedHandResult = tracker.detectHands(video, timestamp);
    cachedPoints = selector.getPoints(cachedHandResult);
    lastHandTime = timestamp;

    // Detect Pinch Gesture (Thumb + Index of same hand) to change filter
    if (cachedHandResult && pinchDetector) {
      const pinch = pinchDetector.detect(cachedHandResult, timestamp);
      if (pinch.triggered) {
        cycleFilter();
        overlay?.showBubble('SNAP!');
      }
    }
  }

  const boxActive = cachedPoints !== null;

  // Throttled Face Tracking Inference (runs continuously while camera is active)
  if (timestamp - lastFaceTime >= faceInterval) {
    cachedFaceResult = tracker.detectFace(video, timestamp);
    lastFaceTime = timestamp;
  }

  const faceDetected = (cachedFaceResult?.faceLandmarks?.length ?? 0) > 0;

  if (boxActive) {
    // Render chosen Multiverse shader
    glRender.renderFilter(currentFilter, video, { intensity: 0.94, dotSize: 5.0, time: t });

    // If switching universes, apply brief dimensional glitch burst
    if (timestamp < glitchUntil) {
      const glitchStrength = (glitchUntil - timestamp) / 320;
      glRender.renderGlitch({ strength: glitchStrength, time: t });
    }

    // Render 2D composite: raw camera base + clipped portal shader + mask
    overlay.drawWithBox(video, glCanvas, cachedFaceResult, cachedPoints, timestamp, currentFilter, maskEnabled);

    const theme = UNIVERSE_THEMES[currentFilter] || UNIVERSE_THEMES.miles;
    if (modeLabel) modeLabel.textContent = `UNIVERSE: ${theme.tag} ●`;
    poseIndicator?.classList.add('active');
  } else {
    // Raw webcam + hand skeleton guide + character mask
    overlay.drawIdle(video, cachedHandResult, timestamp, cachedFaceResult, currentFilter);
    poseIndicator?.classList.remove('active');
    if (modeLabel) modeLabel.textContent = 'MODE: STANDBY';
  }

  faceIndicator?.classList.toggle('active', faceDetected);

  rafId = requestAnimationFrame(loop);
}

// ─── Bootstrap ────────────────────────────────────────────────────
let isBootstrapping = false;

async function bootstrap(targetUniverse) {
  if (isBootstrapping || isRunning) {
    console.warn('Bootstrap already in progress or camera is running.');
    return;
  }
  isBootstrapping = true;

  if (targetUniverse && FILTERS.includes(targetUniverse)) {
    setFilter(targetUniverse);
  }

  const loadingBadge = document.getElementById('loading-badge');
  const dimReadout = document.getElementById('loading-dim-readout');
  const anomalyTag = document.getElementById('anomaly-tag');
  if (loadingBadge) {
    const theme = UNIVERSE_THEMES[currentFilter] || UNIVERSE_THEMES.miles;
    loadingBadge.textContent = `SUITING UP: ${theme.tag}`;
  }
  if (dimReadout) {
    const theme = UNIVERSE_THEMES[currentFilter] || UNIVERSE_THEMES.miles;
    dimReadout.textContent = `[ ${theme.tag} // QUANTUM SYNC ]`;
  }
  if (anomalyTag) {
    const numMap = { miles: '// 1610', gwen: '// 65', noir: '// 90214', anime: '// 14512', ham: '// 8311', classic: '// 616' };
    anomalyTag.textContent = numMap[currentFilter] || '// 1610';
  }

  document.body.classList.add('ar-active');

  // Immediately halt mosaic canvas animation to free 100% GPU for AR
  mosaicWaves.stop();

  showSection(loadingScreen);
  setProgress(10, 'INITIALIZING CAMERA HARDWARE…');

  try {
    const camPromise = startCamera();

    tracker = new TrackerManager();
    await tracker.init((pct, label) => {
      setProgress(Math.round(10 + pct * 0.7), label.toUpperCase());
    });

    setProgress(85, 'CALIBRATING CAMERA FEED…');
    await camPromise;
    fitCanvas();

    glRender = new WebGLRenderer(glCanvas, outputCanvas.width, outputCanvas.height);
    setProgress(92, 'COMPILING MULTIVERSE SHADERS…');

    overlay  = new OverlayRenderer(outputCanvas);
    selector = new TwoPointSelector();
    pinchDetector = new PinchDetector();
    await overlay.loadAssets();

    setProgress(98, 'SYNCHRONIZING TENSOR PIPELINE…');

    // Ensure camera has delivered at least one frame before switching
    if (video.readyState < 2 || video.videoWidth === 0) {
      await new Promise(resolve => {
        const onTime = () => {
          if (video.videoWidth > 0 && video.readyState >= 2) {
            video.removeEventListener('timeupdate', onTime);
            resolve();
          }
        };
        video.addEventListener('timeupdate', onTime);
        setTimeout(resolve, 1500);
      });
    }

    setProgress(100, 'PORTAL SYNCHRONIZED!');
    await new Promise(r => setTimeout(r, 400));

    isRunning = true;
    startTime = performance.now();
    if (maskStatusText) maskStatusText.textContent = maskEnabled ? 'ON' : 'OFF';
    toggleMaskBtn?.classList?.toggle('off', !maskEnabled);
    showSection(arSection);
    rafId = requestAnimationFrame(loop);
    trackEvent('experience_started');
  } catch (err) {
    console.error('Bootstrap failed:', err);
    setProgress(0, 'ERROR: ' + err.message);
    trackEvent('experience_error', { error: err.message });
    mosaicWaves.start();
  } finally {
    isBootstrapping = false;
  }
}

// ─── Controls ─────────────────────────────────────────────────────────────
screenshotBtn?.addEventListener('click', () => {
  if (!isRunning) return;
  const link = document.createElement('a');
  link.download = `spiderverse-${currentFilter}-${Date.now()}.png`;
  link.href = outputCanvas.toDataURL('image/png');
  link.click();
  overlay?.showBubble();
  trackEvent('screenshot_taken', { universe: currentFilter });
});

function resetSuitUpBtn() {
  const btn = document.getElementById('open-portal-btn');
  if (btn) {
    btn.innerHTML = `<span class="relative z-10 flex items-center gap-space-sm drop-shadow-[2px_2px_0_#000000]"><span class="material-symbols-outlined text-3xl">view_in_ar</span>SUIT UP NOW</span><div class="absolute inset-0 bg-tertiary opacity-0 group-hover:opacity-30 transition-opacity pointer-events-none"></div>`;
  }
}

exitBtn?.addEventListener('click', () => {
  isRunning = false;
  cancelAnimationFrame(rafId);
  tracker?.close();
  video.srcObject?.getTracks().forEach(t => t.stop());
  video.srcObject = null;
  document.body.classList.remove('ar-active');
  resetSuitUpBtn();
  showSection(landingPage);

  // Resume landing background animation
  mosaicWaves.start();
  trackEvent('experience_exited');
});

const cancelLoadingBtn = document.getElementById('cancel-loading-btn');
cancelLoadingBtn?.addEventListener('click', () => {
  isBootstrapping = false;
  video.srcObject?.getTracks().forEach(t => t.stop());
  video.srcObject = null;
  document.body.classList.remove('ar-active');
  resetSuitUpBtn();
  showSection(landingPage);
  mosaicWaves.start();
});

// Expose global methods for landing page integration
window.startSpiderAR = function(universe) {
  bootstrap(universe);
};

window.setSpiderUniverse = function(universe) {
  if (universe && FILTERS.includes(universe)) {
    setFilter(universe);
  }
};

// Single button to cycle filter (mirrors Tab key)
cycleFilterBtn?.addEventListener('click', cycleFilter);

// Mask toggle button
toggleMaskBtn?.addEventListener('click', toggleMask);

// Keyboard shortcuts — Tab for filter cycling, M for mask toggle
document.addEventListener('keydown', e => {
  if (!isRunning) return;

  if (e.key === 'Tab') {
    e.preventDefault();
    cycleFilter();
  }

  if (e.key.toLowerCase() === 'm') {
    e.preventDefault();
    toggleMask();
  }

  if (e.key.toLowerCase() === 's') screenshotBtn?.click();
  if (e.key === 'Escape') exitBtn?.click();
});

// ─── Power & Battery Optimization: Pause loop when tab is hidden ────────────
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (isRunning && rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  } else {
    if (isRunning && !rafId) {
      lastHandTime = performance.now();
      lastFaceTime = performance.now();
      startTime = performance.now();
      rafId = requestAnimationFrame(loop);
    }
  }
});
