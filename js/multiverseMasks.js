/**
 * multiverseMasks.js — Multiverse-Specific Masks & Expressive Eye Tracking.
 *
 * Provides custom procedural masks for all 6 universes with real-time
 * blinking, squinting, and winking driven by MediaPipe eyelid aperture tracking.
 */

import { FACE_IDX } from './tracker.js';

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Calculates normalized eyelid aperture (0.12 = closed blink, 1.0 = normal, 1.25 = wide open)
 * for left and right eyes independently (mapped to mirrored screen coordinates).
 */
export function getEyeApertures(landmarks) {
  if (!landmarks) return { left: 1, right: 1 };

  // Screen-Left Eye (Physical left eye: 386, 374, 362, 263)
  const slUpper = landmarks[FACE_IDX.rightEyeUpper]; // 386
  const slLower = landmarks[FACE_IDX.rightEyeLower]; // 374
  const slInner = landmarks[FACE_IDX.rightEyeInner]; // 362
  const slOuter = landmarks[FACE_IDX.rightEyeOuter]; // 263

  // Screen-Right Eye (Physical right eye: 159, 145, 133, 33)
  const srUpper = landmarks[FACE_IDX.leftEyeUpper];  // 159
  const srLower = landmarks[FACE_IDX.leftEyeLower];  // 145
  const srInner = landmarks[FACE_IDX.leftEyeInner];  // 133
  const srOuter = landmarks[FACE_IDX.leftEyeOuter];  // 33

  if (!slUpper || !slLower || !slInner || !slOuter || !srUpper || !srLower || !srInner || !srOuter) {
    return { left: 1, right: 1 };
  }

  const slVert  = dist(slUpper, slLower);
  const slHoriz = Math.max(0.001, dist(slInner, slOuter));
  const slRatio = slVert / slHoriz;

  const srVert  = dist(srUpper, srLower);
  const srHoriz = Math.max(0.001, dist(srInner, srOuter));
  const srRatio = srVert / srHoriz;

  const mapRatio = (r) => {
    // Normal eye open ratio is ~0.24 - 0.30; blink is < 0.12
    const norm = (r - 0.11) / (0.28 - 0.11);
    return Math.min(1.25, Math.max(0.12, norm));
  };

  return {
    left:  mapRatio(slRatio),  // Screen left eye
    right: mapRatio(srRatio),  // Screen right eye
  };
}

// ─── 1. Miles Morales Mask ──────────────────────────────────────────────────
function drawMilesMask(ctx, w, h, eyeL, eyeR) {
  // Crimson base
  ctx.fillStyle = '#E62B2B';
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.48, h * 0.48, 0, 0, Math.PI * 2);
  ctx.fill();

  // Web lines
  ctx.strokeStyle = '#0a0a0a';
  ctx.lineWidth   = 2.2;
  const webCenterY = h * 0.05;

  // Radial web spokes
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, webCenterY);
    ctx.lineTo(Math.cos(angle) * w * 0.48, Math.sin(angle) * h * 0.48 + webCenterY * 0.5);
    ctx.stroke();
  }

  // Concentric web ellipses
  for (let r = 0.15; r <= 0.45; r += 0.10) {
    ctx.beginPath();
    ctx.ellipse(0, webCenterY, w * r, h * r * 0.8, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Outer border
  ctx.lineWidth = 5;
  ctx.stroke();

  // Expressive Eyes
  drawComicSpiderEye(ctx, -w * 0.20, -h * 0.06, w * 0.23, h * 0.22, -0.22, eyeL);
  drawComicSpiderEye(ctx,  w * 0.20, -h * 0.06, w * 0.23, h * 0.22,  0.22, eyeR);
}

// ─── 2. Spider-Gwen Mask (Ghost-Spider) ──────────────────────────────────────
function drawGwenMask(ctx, w, h, eyeL, eyeR) {
  // White hood contour
  ctx.fillStyle = '#F5F5F7';
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.50, h * 0.50, 0, 0, Math.PI * 2);
  ctx.fill();

  // Inner hood magenta/cyan web lining
  ctx.strokeStyle = '#FF1493';
  ctx.lineWidth   = 2.5;
  ctx.beginPath();
  ctx.ellipse(0, -h * 0.02, w * 0.42, h * 0.42, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = '#00F0FF';
  ctx.lineWidth   = 1.5;
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI + Math.PI * 0.5;
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.1);
    ctx.lineTo(Math.cos(angle) * w * 0.44, Math.sin(angle) * h * 0.44);
    ctx.stroke();
  }

  // Black hood outer ink line
  ctx.strokeStyle = '#000000';
  ctx.lineWidth   = 4.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.50, h * 0.50, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Gwen's Sleek Cat-Eyes (Teal rim + white/pink lens)
  drawCatEye(ctx, -w * 0.20, -h * 0.07, w * 0.22, h * 0.20, -0.25, eyeL);
  drawCatEye(ctx,  w * 0.20, -h * 0.07, w * 0.22, h * 0.20,  0.25, eyeR);
}

// ─── 3. Spider-Punk Mask (Hobie Brown) ───────────────────────────────────────
function drawPunkMask(ctx, w, h, eyeL, eyeR) {
  // Mohawk Spikes along top curve of the head
  const spikeCount = 6;
  ctx.fillStyle   = '#DCDCE0';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth   = 2.5;

  for (let i = 0; i < spikeCount; i++) {
    const t = (i / (spikeCount - 1)) - 0.5;
    const sx = t * w * 0.65;
    const sy = -h * 0.44 + Math.abs(t) * h * 0.15;
    const spikeH = (32 - Math.abs(t) * 12) * (h / 300);

    ctx.beginPath();
    ctx.moveTo(sx - 7, sy);
    ctx.lineTo(sx, sy - spikeH);
    ctx.lineTo(sx + 7, sy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Acid yellow spike highlight
    ctx.fillStyle = '#FFE600';
    ctx.beginPath();
    ctx.moveTo(sx, sy - spikeH);
    ctx.lineTo(sx + 4, sy);
    ctx.lineTo(sx, sy);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#DCDCE0';
  }

  // Distressed Punk Red Base
  ctx.fillStyle = '#DC143C';
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.48, h * 0.48, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ripped asymmetric zine web lines
  ctx.strokeStyle = '#000';
  ctx.lineWidth   = 3;
  ctx.beginPath();
  ctx.moveTo(-w * 0.4, -h * 0.2); ctx.lineTo(w * 0.4, h * 0.3);
  ctx.moveTo(w * 0.35, -h * 0.3); ctx.lineTo(-w * 0.35, h * 0.35);
  ctx.moveTo(-w * 0.45, h * 0.1); ctx.lineTo(w * 0.45, -h * 0.1);
  ctx.stroke();

  // Black outer ink border
  ctx.lineWidth = 5.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.48, h * 0.48, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Hand-inked Punk Eyes
  drawComicSpiderEye(ctx, -w * 0.21, -h * 0.05, w * 0.24, h * 0.23, -0.20, eyeL, '#FFE600');
  drawComicSpiderEye(ctx,  w * 0.21, -h * 0.05, w * 0.24, h * 0.23,  0.20, eyeR, '#00F0FF');
}

// ─── 4. Spider-Man Noir Mask ────────────────────────────────────────────────
function drawNoirMask(ctx, w, h, eyeL, eyeR) {
  // Charcoal stitched leather base
  ctx.fillStyle = '#1A1A1E';
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.48, h * 0.48, 0, 0, Math.PI * 2);
  ctx.fill();

  // Fedora brim curving over forehead
  ctx.fillStyle   = '#0F0F12';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth   = 4;
  ctx.beginPath();
  ctx.ellipse(0, -h * 0.36, w * 0.54, h * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // White cross-stitch seam running down the nose bridge
  ctx.strokeStyle = '#E0E0E0';
  ctx.lineWidth   = 2;
  for (let y = -h * 0.2; y <= h * 0.35; y += 14) {
    ctx.beginPath();
    ctx.moveTo(-5, y - 4); ctx.lineTo(5, y + 4);
    ctx.moveTo(5, y - 4); ctx.lineTo(-5, y + 4);
    ctx.stroke();
  }

  // Outer border
  ctx.strokeStyle = '#000';
  ctx.lineWidth   = 5;
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.48, h * 0.48, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Aviator Goggles with mechanical shutter aperture
  drawGoggleEye(ctx, -w * 0.20, -h * 0.05, w * 0.16, h * 0.16, eyeL);
  drawGoggleEye(ctx,  w * 0.20, -h * 0.05, w * 0.16, h * 0.16, eyeR);
}

// ─── 5. Spider-Man 2099 Mask (Miguel O'Hara) ────────────────────────────────
function drawCyberMask(ctx, w, h, eyeL, eyeR) {
  // Deep obsidian navy base
  ctx.fillStyle = '#080C16';
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.48, h * 0.48, 0, 0, Math.PI * 2);
  ctx.fill();

  // Neon Crimson Skull-Spider Mandibles
  ctx.fillStyle   = '#FF0033';
  ctx.strokeStyle = '#00F0FF';
  ctx.lineWidth   = 1.5;

  // Forehead skull horns
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.35);
  ctx.lineTo(-w * 0.15, -h * 0.45);
  ctx.lineTo(-w * 0.06, -h * 0.20);
  ctx.lineTo(0, -h * 0.26);
  ctx.lineTo(w * 0.06, -h * 0.20);
  ctx.lineTo(w * 0.15, -h * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Cheek fangs
  ctx.beginPath();
  ctx.moveTo(-w * 0.35, 0); ctx.lineTo(-w * 0.20, h * 0.30); ctx.lineTo(-w * 0.10, h * 0.15);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(w * 0.35, 0); ctx.lineTo(w * 0.20, h * 0.30); ctx.lineTo(w * 0.10, h * 0.15);
  ctx.closePath();
  ctx.fill();

  // Outer border with neon glow
  ctx.strokeStyle = '#FF0033';
  ctx.lineWidth   = 4;
  ctx.shadowColor = '#FF0033';
  ctx.shadowBlur  = 12;
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.48, h * 0.48, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Razor-sharp geometric cyber visor slits
  drawCyberVisor(ctx, -w * 0.20, -h * 0.06, w * 0.22, h * 0.18, -0.28, eyeL);
  drawCyberVisor(ctx,  w * 0.20, -h * 0.06, w * 0.22, h * 0.18,  0.28, eyeR);
}

// ─── 6. Peni Parker / SP//dr Anime Mask ─────────────────────────────────────
function drawAnimeMask(ctx, w, h, eyeL, eyeR) {
  // White & soft violet pilot cowl
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.47, h * 0.47, 0, 0, Math.PI * 2);
  ctx.fill();

  // Mecha ear communication modules
  ctx.fillStyle   = '#FF2A7A';
  ctx.strokeStyle = '#000';
  ctx.lineWidth   = 3;
  ctx.fillRect(-w * 0.52, -h * 0.12, w * 0.08, h * 0.24);
  ctx.strokeRect(-w * 0.52, -h * 0.12, w * 0.08, h * 0.24);
  ctx.fillRect( w * 0.44, -h * 0.12, w * 0.08, h * 0.24);
  ctx.strokeRect( w * 0.44, -h * 0.12, w * 0.08, h * 0.24);

  // Forehead pilot sensor bar
  ctx.fillStyle = '#00BFFF';
  ctx.fillRect(-w * 0.20, -h * 0.40, w * 0.40, h * 0.08);
  ctx.strokeRect(-w * 0.20, -h * 0.40, w * 0.40, h * 0.08);

  // Outer border
  ctx.strokeStyle = '#000';
  ctx.lineWidth   = 4.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.47, h * 0.47, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Sparkling anime eyes
  drawAnimeEye(ctx, -w * 0.20, -h * 0.05, w * 0.20, h * 0.24, eyeL);
  drawAnimeEye(ctx,  w * 0.20, -h * 0.05, w * 0.20, h * 0.24, eyeR);
}

// ═════════════════════════════════════════════════════════════════════════════
//  EYE HELPER RENDERERS (With Dynamic Aperture Scaling)
// ═════════════════════════════════════════════════════════════════════════════

// Classic Spider-Man Lens (Scales vertically into squint slits)
function drawComicSpiderEye(ctx, cx, cy, w, h, angle, scaleY, tintColor = '#FFFFFF') {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.scale(1, Math.max(0.12, scaleY));

  // Lens path
  ctx.beginPath();
  ctx.moveTo(-w * 0.5, 0);
  ctx.quadraticCurveTo(0, -h * 0.6, w * 0.5, -h * 0.1);
  ctx.quadraticCurveTo(w * 0.2, h * 0.55, -w * 0.5, 0);
  ctx.closePath();

  ctx.fillStyle   = tintColor;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth   = 6 / Math.max(0.3, scaleY);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

// Cat-Eye for Spider-Gwen (Teal outer glow + white lens)
function drawCatEye(ctx, cx, cy, w, h, angle, scaleY) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.scale(1, Math.max(0.12, scaleY));

  // Outer teal frame
  ctx.beginPath();
  ctx.moveTo(-w * 0.55, 0);
  ctx.quadraticCurveTo(0, -h * 0.65, w * 0.55, -h * 0.2);
  ctx.quadraticCurveTo(w * 0.3, h * 0.6, -w * 0.55, 0);
  ctx.closePath();

  ctx.fillStyle   = '#00F0FF';
  ctx.strokeStyle = '#FF1493';
  ctx.lineWidth   = 3;
  ctx.fill();
  ctx.stroke();

  // Inner lens
  ctx.beginPath();
  ctx.moveTo(-w * 0.45, 0);
  ctx.quadraticCurveTo(0, -h * 0.52, w * 0.45, -h * 0.15);
  ctx.quadraticCurveTo(w * 0.22, h * 0.48, -w * 0.45, 0);
  ctx.closePath();
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();

  ctx.restore();
}

// 1930s Aviator Goggle (Circular brass with diaphragm squint)
function drawGoggleEye(ctx, cx, cy, w, h, scaleY) {
  ctx.save();
  ctx.translate(cx, cy);

  const radius = w * 0.5;

  // Outer brass rim
  ctx.fillStyle   = '#3A3A42';
  ctx.strokeStyle = '#C29B38';
  ctx.lineWidth   = 4;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Glass lens tinted amber with reflection
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.85, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = '#111318';
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2);

  // Aperture diaphragm that closes when squinting
  const squashedH = radius * 0.85 * Math.max(0.15, scaleY);
  ctx.fillStyle   = '#E8C547';
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 0.75, squashedH, 0, 0, Math.PI * 2);
  ctx.fill();

  // Diagonal reflection line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth   = 3;
  ctx.beginPath();
  ctx.moveTo(-radius * 0.5, radius * 0.5);
  ctx.lineTo(radius * 0.5, -radius * 0.5);
  ctx.stroke();

  ctx.restore();
  ctx.restore();
}

// Cyberpunk Laser Visor (Sharp angular polygon)
function drawCyberVisor(ctx, cx, cy, w, h, angle, scaleY) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.scale(1, Math.max(0.12, scaleY));

  ctx.beginPath();
  ctx.moveTo(-w * 0.55, -h * 0.1);
  ctx.lineTo(w * 0.45, -h * 0.55);
  ctx.lineTo(w * 0.55, h * 0.1);
  ctx.lineTo(-w * 0.25, h * 0.55);
  ctx.closePath();

  ctx.fillStyle   = '#FF0033';
  ctx.strokeStyle = '#00F0FF';
  ctx.lineWidth   = 3;
  ctx.shadowColor = '#FF0033';
  ctx.shadowBlur  = 12;
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

// Anime Eye (Sparkling iris or cute squint arc)
function drawAnimeEye(ctx, cx, cy, w, h, scaleY) {
  ctx.save();
  ctx.translate(cx, cy);

  if (scaleY < 0.32) {
    // Classic anime happy closed eye arc (^ ^)
    ctx.strokeStyle = '#000000';
    ctx.lineWidth   = 5;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, w * 0.4, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.scale(1, Math.max(0.2, scaleY));

  // Big anime eye socket
  ctx.fillStyle   = '#FFFFFF';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth   = 4;
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.48, h * 0.48, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Multi-color iris (Magenta to Sky Blue)
  const grad = ctx.createLinearGradient(0, -h * 0.4, 0, h * 0.4);
  grad.addColorStop(0, '#10002B');
  grad.addColorStop(0.5, '#7B2CBF');
  grad.addColorStop(1, '#00BFFF');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(0, h * 0.02, w * 0.35, h * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();

  // Big sparkle highlights
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(-w * 0.12, -h * 0.14, w * 0.12, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(w * 0.12, h * 0.16, w * 0.06, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ─── Multiverse Mask Dispatcher ─────────────────────────────────────────────
export function drawMultiverseMask(ctx, universeId, w, h, eyeL, eyeR) {
  switch (universeId) {
    case 'gwen':  return drawGwenMask(ctx, w, h, eyeL, eyeR);
    case 'punk':  return drawPunkMask(ctx, w, h, eyeL, eyeR);
    case 'noir':  return drawNoirMask(ctx, w, h, eyeL, eyeR);
    case 'cyber': return drawCyberMask(ctx, w, h, eyeL, eyeR);
    case 'anime': return drawAnimeMask(ctx, w, h, eyeL, eyeR);
    case 'miles':
    default:
      return drawMilesMask(ctx, w, h, eyeL, eyeR);
  }
}
