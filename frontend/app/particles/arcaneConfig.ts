/**
 * ARCANE ENGINE CONFIGURATION
 * Optimized for M1 2020 Hardware
 */
export const ARCANE_CONFIG = {
  particles: {
    count: 45000,
    size: 0.25,
    flowSpeed: 0.045,
    farZ: -35,
    nearZ: 12,
  },
  sigil: {
    radius: 5.8,
    lineThickness: 0.5, // The thickness of the internal polygon/spoke lines
    stabilityThreshold: 0.15,
    captureDistance: 10.0,
    repelDistance: 6.0,
    jitter: 0.15, // Subtle movement to make lines feel alive
    lerpSpeed: 0.25,
    freezeDelay: 3000, // 3 seconds
  },
  colors: {
    flow: 0x00d2ff,  // Glowing Light Blue
    magic: 0xffaa00, // Pulsing Orange-Yellow
  },
  ai: {
    modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
    wasmPath: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
    delegate: "GPU" as const,
  },
  view: {
    viewportScale: 0.75, // 75% of screen
    cameraZ: 20,
    handScaleX: 38,
    handScaleY: 28,
    handScaleZ: 50,
  }
};