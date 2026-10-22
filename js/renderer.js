/**
 * renderer.js — Multiverse Canvas Renderer.
 *
 * IDLE mode:   Pure mirrored webcam feed + hand tracking hints + optional Spider-Sense.
 * BOX mode:    Raw webcam background, with active Multiverse shader filter and
 *              Spider mask / Spider-Sense strictly inside the finger-tracking portal box.
 */

import { FACE_IDX } from './tracker.js';
import { loadSVGAsImage } from './assetLoader.js';
import { getEyeApertures, drawMultiverseMask } from './multiverseMasks.js';

// ─── Universe Themes ────────────────────────────────────────────────────────
export const UNIVERSE_THEMES = {
  miles: {
    id: 'miles',
    name: 'MILES // EARTH-1610',
    primary: '#E62B2B',
    accent: '#FFD600',
    tag: 'MILES // EARTH-1610',
    badgeBg: '#E62B2B',
    textColor: '#FFFFFF',
  },
  gwen: {
    id: 'gwen',
    name: 'GWEN // EARTH-65',
    primary: '#FF1493',
    accent: '#00FFFF',
    tag: 'GWEN // EARTH-65',
    badgeBg: '#FF1493',
    textColor: '#FFFFFF',
  },
  noir: {
    id: 'noir',
    name: 'SPIDER-NOIR // EARTH-90214',
    primary: '#FFFFFF',
    accent: '#888888',
    tag: 'NOIR // EARTH-90214',
    badgeBg: '#222222',
    textColor: '#FFFFFF',
  },
  anime: {
    id: 'anime',
    name: 'SP//DR // PENI PARKER',
    primary: '#FF69B4',
    accent: '#00BFFF',
    tag: 'SP//DR // PENI',
    badgeBg: '#FF69B4',
    textColor: '#FFFFFF',
  },
  ham: {
    id: 'ham',
    name: 'SPIDER-HAM // EARTH-8311',
    primary: '#FF2A7A',
    accent: '#FFD600',
    tag: 'SPIDER-HAM // PORKER',
    badgeBg: '#FF2A7A',
    textColor: '#FFFFFF',
  },
  classic: {
    id: 'classic',
    name: 'PETER B. // EARTH-616',
    primary: '#E62B2B',
    accent: '#1A3EFF',
    tag: 'PETER B. // EARTH-616',
    badgeBg: '#E62B2B',
    textColor: '#FFFFFF',
  },
};

// ─── Math helpers ──────────────────────────────────────────────────────────
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function midpoint(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }

/** Normalised landmark → canvas pixel (mirrored X coordinate). */
function lm2px(lm, W, H) {
  return { x: (1 - lm.x) * W, y: lm.y * H };
}

// ─── OverlayRenderer ──────────────────────────────────────────────────────
export class OverlayRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');

    this.maskImages = {};

    // Real-time smoothed eye aperture factors
    this._smoothedEyeL = 1.0;
    this._smoothedEyeR = 1.0;

    // FPS tracking
    this._frameTimes = [];

    // Speech bubble
    this._bubbleWords  = ['THWIP!', 'POW!', 'WHAM!', 'SNAP!', 'ZOOM!', 'ZAP!', 'ANARCHY!', 'BZZZT!'];
    this._bubbleEl     = document.getElementById('speech-bubble');
    this._bubbleTextEl = document.getElementById('bubble-text');
    this._bubbleTimer  = null;
  }

  async loadAssets() {
    const list = [
      { key: 'miles',   path: 'assets/masks/miles.png' },
      { key: 'gwen',    path: 'assets/masks/gwen.png' },
      { key: 'noir',    path: 'assets/masks/noir.png' },
      { key: 'anime',   path: 'assets/masks/peni.png' },
      { key: 'ham',     path: 'assets/masks/spider_ham.png' },
      { key: 'classic', path: 'assets/masks/classic.png' },
    ];

    await Promise.all(
      list.map(({ key, path }) => {
        return new Promise((res) => {
          const img = new Image();
          img.onload = () => {
            this.maskImages[key] = img;
            res();
          };
          img.onerror = () => {
            console.warn('Failed to load mask image:', path);
            res();
          };
          img.src = path;
        });
      })
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  IDLE MODE — raw webcam feed with hand guide (no mask)
  // ══════════════════════════════════════════════════════════════════════════
  drawIdle(video, handResult, timestamp, faceResult = null, currentFilter = 'miles') {
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // Mirror the raw webcam
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -W, 0, W, H);
    ctx.restore();

    // Draw hand skeleton so user can see hand tracking
    if (handResult?.landmarks?.length) {
      this._drawHandGuide(ctx, handResult, W, H);
    }

    // Gesture instruction text
    this._drawGestureHint(ctx, W, H, handResult);

    this._updateFps(timestamp);
  }

  // ── Hand skeleton guide in idle mode ───────────────────────────────────────
  _drawHandGuide(ctx, handResult, W, H) {
    const CONNECTIONS = [
      [0,1],[1,2],[2,3],[3,4],        // thumb
      [0,5],[5,6],[6,7],[7,8],        // index
      [5,9],[9,10],[10,11],[11,12],   // middle
      [9,13],[13,14],[14,15],[15,16], // ring
      [13,17],[17,18],[18,19],[19,20],[0,17], // pinky + palm
    ];

    const hands = handResult.landmarks;
    const sorted = [...hands].sort((h1, h2) => (1 - h1[0].x) - (1 - h2[0].x));

    for (let i = 0; i < sorted.length; i++) {
      const lms = sorted[i];
      const isLeft = (i === 0);

      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth   = 1.5;

      for (const [a, b] of CONNECTIONS) {
        const pa = lm2px(lms[a], W, H);
        const pb = lm2px(lms[b], W, H);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  // ── Hint overlay ──────────────────────────────────────────────────────────
  _drawGestureHint(ctx, W, H, handResult) {
    const handsCount = handResult?.landmarks?.length ?? 0;
    ctx.save();
    ctx.font      = 'bold 15px monospace';
    ctx.textAlign = 'center';

    const t     = Date.now() / 800;
    const pulse = 0.5 + 0.5 * Math.sin(t);
    const alpha = handsCount > 0 ? 0.6 + 0.4 * pulse : 0.35;

    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    const msg = handsCount === 1
      ? 'BRING SECOND HAND INTO VIEW'
      : 'RAISE BOTH HANDS TO OPEN PORTAL';

    ctx.fillText(msg, W / 2, H - 24);
    ctx.restore();
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  BOX MODE — WebGL Multiverse filter + Spider mask strictly inside box
  // ══════════════════════════════════════════════════════════════════════════
  drawWithBox(video, glCanvas, faceResult, points, timestamp, filterName = 'miles', maskEnabled = true) {
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;
    const theme = UNIVERSE_THEMES[filterName] || UNIVERSE_THEMES.miles;

    ctx.clearRect(0, 0, W, H);

    // ── 1. Full-screen raw mirrored video (always visible as base) ────────
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -W, 0, W, H);
    ctx.restore();

    if (!points?.a || !points?.b) {
      this._updateFps(timestamp);
      return;
    }

    // Convert normalised landmarks -> mirrored canvas pixels
    const pa = lm2px(points.a, W, H); // Left pointer finger tip
    const pb = lm2px(points.b, W, H); // Right thumb tip

    const x1 = Math.min(pa.x, pb.x);
    const y1 = Math.min(pa.y, pb.y);
    const x2 = Math.max(pa.x, pb.x);
    const y2 = Math.max(pa.y, pb.y);
    const boxW = Math.max(12, x2 - x1);
    const boxH = Math.max(12, y2 - y1);

    const landmarks = faceResult?.faceLandmarks?.[0];

    // ── 2. WebGL Multiverse effect & Mask CLIPPED strictly to finger box ──
    ctx.save();
    ctx.beginPath();
    ctx.rect(x1, y1, boxW, boxH);
    ctx.clip();

    // Draw WebGL comic frame (mirrored)
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(glCanvas, -W, 0, W, H);
    ctx.restore();

    // Speed lines inside the box
    const boxCx = x1 + boxW / 2;
    const boxCy = y1 + boxH / 2;
    this._drawSpeedLinesCentered(ctx, W, H, boxCx, boxCy, timestamp, theme.accent);

    // Multiverse Character Mask strictly inside the portal box
    if (maskEnabled && landmarks) {
      this._drawMask(ctx, landmarks, W, H, theme);
    }

    ctx.restore(); // Removes box clip

    // ── 3. Stylized universe portal border and fingertip reticles ─────────
    this._drawTwoPointBox(ctx, x1, y1, boxW, boxH, pa, pb, timestamp, theme);

    // ── 4. Speech bubble ──────────────────────────────────────────────────
    if (landmarks && Math.random() < 0.002) this.showBubble();

    this._updateFps(timestamp);
  }

  // Backward compatibility alias
  drawActive(video, glCanvas, faceResult, handResult, frameCorners, timestamp) {
    this.drawWithBox(video, glCanvas, faceResult, frameCorners, timestamp);
  }

  // ── Two-point box styling & reticles ──────────────────────────────────────
  _drawTwoPointBox(ctx, x1, y1, w, h, pa, pb, timestamp, theme) {
    const pulse = 0.7 + 0.3 * Math.sin(timestamp / 180);

    ctx.save();

    // Black drop-shadow outline
    ctx.strokeStyle = '#000000';
    ctx.lineWidth   = 5;
    ctx.strokeRect(x1 - 1, y1 - 1, w + 2, h + 2);

    // Universe primary border
    ctx.strokeStyle = theme.primary;
    ctx.lineWidth   = 3;
    ctx.shadowColor = theme.primary;
    ctx.shadowBlur  = 14;
    ctx.strokeRect(x1, y1, w, h);

    // Corner brackets
    const bsz = Math.min(22, Math.min(w, h) * 0.3);
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth   = 3;

    // Top-left
    ctx.beginPath(); ctx.moveTo(x1, y1 + bsz); ctx.lineTo(x1, y1); ctx.lineTo(x1 + bsz, y1); ctx.stroke();
    // Top-right
    ctx.beginPath(); ctx.moveTo(x1 + w - bsz, y1); ctx.lineTo(x1 + w, y1); ctx.lineTo(x1 + w, y1 + bsz); ctx.stroke();
    // Bottom-left
    ctx.beginPath(); ctx.moveTo(x1, y1 + h - bsz); ctx.lineTo(x1, y1 + h); ctx.lineTo(x1 + bsz, y1 + h); ctx.stroke();
    // Bottom-right
    ctx.beginPath(); ctx.moveTo(x1 + w - bsz, y1 + h); ctx.lineTo(x1 + w, y1 + h); ctx.lineTo(x1 + w, y1 + h - bsz); ctx.stroke();

    // Universe Banner tag
    const bannerW = Math.min(180, w * 0.85);
    ctx.fillStyle = theme.badgeBg;
    ctx.fillRect(x1 + 6, y1 - 20, bannerW, 20);
    ctx.fillStyle = '#000';
    ctx.strokeRect(x1 + 6, y1 - 20, bannerW, 20);
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = theme.textColor;
    ctx.fillText(theme.tag, x1 + 12, y1 - 6);

    // Reticle on Point A
    this._drawReticle(ctx, pa, theme.accent, pulse);

    // Reticle on Point B
    this._drawReticle(ctx, pb, theme.primary, pulse);

    ctx.restore();
  }

  _drawReticle(ctx, pt, color, pulse) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 8 * pulse, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ── Multiverse Expressive Mask ───────────────────────────────────────────
  _drawMask(ctx, landmarks, W, H, theme) {
    const px = lm => lm2px(lm, W, H);

    const noseTip          = px(landmarks[FACE_IDX.noseTip]);
    const screenLeftEye    = px(landmarks[FACE_IDX.rightEye]);   // landmark 263 -> screen X ≈ 400
    const screenRightEye   = px(landmarks[FACE_IDX.leftEye]);    // landmark 33  -> screen X ≈ 600
    const chin             = px(landmarks[FACE_IDX.chin]);
    const forehead         = px(landmarks[FACE_IDX.forehead]);
    const screenLeftCheek  = px(landmarks[FACE_IDX.rightCheek]); // landmark 454 -> screen X ≈ 350
    const screenRightCheek = px(landmarks[FACE_IDX.leftCheek]);  // landmark 234 -> screen X ≈ 650

    const faceW = dist(screenLeftCheek, screenRightCheek) * 1.35;
    const faceH = dist(forehead, chin) * 1.15;

    // Angle of head tilt from screen-left eye to screen-right eye
    const dx = screenRightEye.x - screenLeftEye.x;
    const dy = screenRightEye.y - screenLeftEye.y;
    const angle = Math.atan2(dy, dx);

    const maskCx = (screenLeftEye.x + screenRightEye.x) / 2;
    const maskCy = (forehead.y + chin.y) / 2;

    // Measure real-time eyelid aperture and smooth transitions (blinking & winking)
    const rawEyes = getEyeApertures(landmarks);
    this._smoothedEyeL += (rawEyes.left - this._smoothedEyeL) * 0.42;
    this._smoothedEyeR += (rawEyes.right - this._smoothedEyeR) * 0.42;

    ctx.save();
    ctx.translate(maskCx, maskCy);
    ctx.rotate(angle);

    const universeId = theme?.id || 'miles';
    const maskImg = this.maskImages[universeId];

    if (maskImg && maskImg.complete && maskImg.naturalWidth > 0) {
      // Authentic extracted Spider-Verse reference mask
      let scaleW = 1.35;
      let offsetY = 0;

      if (universeId === 'noir') {
        scaleW = 1.50;
        offsetY = -faceH * 0.12; // Fedora hat sits atop the head
      } else if (universeId === 'ham') {
        scaleW = 1.45;
        offsetY = -faceH * 0.08; // Pig ears rise above forehead
      } else if (universeId === 'gwen') {
        scaleW = 1.45;
        offsetY = -faceH * 0.04; // Gwen hood
      } else if (universeId === 'anime') {
        scaleW = 1.38;
        offsetY = -faceH * 0.02;
      } else if (universeId === 'classic') {
        scaleW = 1.34;
        offsetY = 0;
      } else {
        // miles
        scaleW = 1.35;
        offsetY = 0;
      }

      const mw = faceW * scaleW;
      const mh = mw * (maskImg.naturalHeight / maskImg.naturalWidth);
      ctx.drawImage(maskImg, -mw / 2, -mh / 2 + offsetY, mw, mh);
    } else {
      // Fallback procedural vector mask with expressive eye tracking
      drawMultiverseMask(ctx, universeId, faceW, faceH, this._smoothedEyeL, this._smoothedEyeR);
    }

    ctx.restore();
  }

  // ── Speed lines ──────────────────────────────────────────────────────────
  _drawSpeedLinesCentered(ctx, W, H, cx, cy, t, lineColor = '#fff') {
    ctx.save();
    ctx.globalAlpha = 0.10 + 0.05 * Math.sin(t / 300);
    ctx.strokeStyle = lineColor;
    const r1 = Math.min(W, H) * 0.08;
    const r2 = Math.min(W, H) * 0.55;
    for (let i = 0; i < 22; i++) {
      const angle = (i / 22) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
      ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2);
      ctx.lineWidth = 1.2 + Math.random() * 2.2;
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── FPS ───────────────────────────────────────────────────────────────────
  _updateFps(now) {
    this._frameTimes.push(now);
    if (this._frameTimes.length > 60) this._frameTimes.shift();
    if (this._frameTimes.length > 1) {
      const fps = Math.round(
        (this._frameTimes.length - 1) /
        ((now - this._frameTimes[0]) / 1000)
      );
      const el = document.getElementById('fps-counter');
      if (el) el.textContent = `● ${fps} FPS`;
    }
  }

  // ── Speech bubble ─────────────────────────────────────────────────────────
  showBubble(customWord = null) {
    const word = customWord || this._bubbleWords[Math.floor(Math.random() * this._bubbleWords.length)];
    if (this._bubbleTextEl) this._bubbleTextEl.textContent = word;
    if (this._bubbleEl) {
      this._bubbleEl?.classList?.add('visible');
      clearTimeout(this._bubbleTimer);
      this._bubbleTimer = setTimeout(
        () => this._bubbleEl?.classList.remove('visible'), 1000
      );
    }
  }
}

