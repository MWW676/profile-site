export const PALETTE = {
  mint: '#4FBF95',
  mintBright: '#B9F0DA',
  space: '#05050a',
  hoverBox: 'rgba(185, 240, 218, 0.6)',
  palmFill: 'rgba(79, 191, 149, 0.15)',
} as const;

export const PINCH = {
  closeThreshold: 0.4,
  openThreshold: 0.5,
  cooldownMs: 500,
} as const;

export const HOVER = {
  dwellMs: 600,
  box: { x0: 0.4, y0: 0.4, x1: 0.6, y1: 0.6 },
} as const;

export const SMOOTHING = 0.5;

export const STARFIELD = {
  count: 150,
  driftPerMs: 0.000015,
} as const;

export const BURST = {
  particleCount: 24,
  lifetimeMs: 500,
  speedPerMs: 0.00018,
} as const;

export const DEPTH = {
  zToScale: 6,
  minScale: 0.5,
  maxScale: 1.6,
} as const;

export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];
export const PALM_TRIANGLES: [number, number, number][] = [
  [0, 5, 9], [0, 9, 13], [0, 13, 17],
];
export const FINGERTIPS = new Set([4, 8, 12, 16, 20]);
