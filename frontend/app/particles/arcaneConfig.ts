/**
 * ARCANE ENGINE CONFIGURATION V12
 * Optimized for M1 2020 Hardware & Cinema View
 */
export const ARCANE_CONFIG = {
  particles: {
    count: 65000,
    size: 0.22,
    flowSpeed: 0.045,
    farZ: -35,
    nearZ: 12,
    // Expanded spawn bounds to saturate 100vw/85vh view
    spawnWidth: 90,
    spawnHeight: 55,
  },
  sigil: {
    radius: 7.5,
    lineThickness: 0.45,
    ringAllocationRatio: 0.10, // 20% to rings, 80% to internal complexity
    stabilityThreshold: 0.15,
    captureDistance: 12.0,
    repelDistance: 7.0,
    repelStrength: 0.05,  // Extracted from hardcode
    burstStrength: 2.5,   // Extracted from hardcode
    jitter: 0.12,
    freezeDelay: 3000,
    lerpSpeed: 0.25,
  },
  physics: {
    inertia: 0.88,
    springStrength: 0.12,
    damping: 0.82,
    floatAmplitude: 0.15,
    floatSpeed: 1.5,
  },
  colors: {
    flow: 0x00d2ff,
    magic: [0xffaa00, 0xff00ff, 0x00ffcc, 0xa4ff1b, 0xd02d10],
  },
  view: {
    viewportWidth: 100,  // vw
    viewportHeight: 85, // vh
    cameraZ: 22,
    handScaleX: 42,
    handScaleY: 32,
    handScaleZ: 55,
  }
};