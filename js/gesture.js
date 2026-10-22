/**
 * gesture.js — Hand Gestures & Multi-Point Selectors.
 *
 * 1. TwoPointSelector:
 *    • Left hand index tip (landmark 8) + Right hand thumb tip (landmark 4)
 *    • Defines the bounds of the Spider-Verse portal box.
 *
 * 2. PinchDetector:
 *    • Index tip (8) + Thumb tip (4) of the SAME hand brought together
 *    • Triggers filter switching with hysteresis debounce.
 */

export class TwoPointSelector {
  /**
   * Extract the two corner points from a HandLandmarker result.
   * Returns null if both hands aren't visible.
   *
   * @param {HandLandmarkerResult} result
   * @returns {{ a: object, b: object } | null}
   */
  getPoints(result) {
    const hands = result?.landmarks ?? [];
    if (hands.length < 2) return null;

    // In mirrored camera feed, mirrored screen X = 1 - rawX.
    // Sort hands from left-to-right on the user's mirrored screen:
    const sorted = [...hands].sort((h1, h2) => (1 - h1[0].x) - (1 - h2[0].x));

    const leftHand  = sorted[0]; // Hand on user's left side of screen
    const rightHand = sorted[1]; // Hand on user's right side of screen

    if (!leftHand || !rightHand) return null;

    return {
      a: leftHand[8],  // Left pointer/index finger tip
      b: rightHand[4], // Right thumb tip
    };
  }
}

export class PinchDetector {
  /**
   * @param {object} options
   */
  constructor({
    pinchThreshold = 0.05,
    releaseThreshold = 0.08,
    cooldownMs = 600,
  } = {}) {
    this.pinchThreshold   = pinchThreshold;
    this.releaseThreshold = releaseThreshold;
    this.cooldownMs       = cooldownMs;

    this.isPinching       = false;
    this.lastTriggerTime  = 0;
  }

  /**
   * Check if the thumb and index finger of the SAME hand are pinched together.
   * @param {HandLandmarkerResult} result
   * @param {number} timestamp
   * @returns {{ triggered: boolean, pinchPoint: { x: number, y: number } | null }}
   */
  detect(result, timestamp) {
    const hands = result?.landmarks ?? [];
    if (!hands.length) {
      this.isPinching = false;
      return { triggered: false, pinchPoint: null };
    }

    let minDistance = Infinity;
    let closestPoint = null;

    // Evaluate each hand independently (same-hand thumb + index)
    for (const hand of hands) {
      const thumbTip = hand[4];
      const indexTip = hand[8];
      if (!thumbTip || !indexTip) continue;

      const d = Math.hypot(
        thumbTip.x - indexTip.x,
        thumbTip.y - indexTip.y,
        (thumbTip.z || 0) - (indexTip.z || 0)
      );

      if (d < minDistance) {
        minDistance = d;
        closestPoint = {
          x: (thumbTip.x + indexTip.x) / 2,
          y: (thumbTip.y + indexTip.y) / 2,
        };
      }
    }

    // Trigger state machine with debounce & release hysteresis
    if (minDistance < this.pinchThreshold) {
      if (!this.isPinching && (timestamp - this.lastTriggerTime >= this.cooldownMs)) {
        this.isPinching = true;
        this.lastTriggerTime = timestamp;
        return { triggered: true, pinchPoint: closestPoint };
      }
    } else if (minDistance > this.releaseThreshold) {
      this.isPinching = false;
    }

    return { triggered: false, pinchPoint: closestPoint };
  }
}

