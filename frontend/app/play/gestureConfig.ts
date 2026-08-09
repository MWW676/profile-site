// Colors here should be kept in sync with tailwind.config.js theme.colors —
// duplicated because canvas drawing needs raw hex values, not CSS classes.
export const COLORS = {
  mint: '#4FBF95',
  mintBright: '#B9F0DA',
  deepSpace: '#05050a',
};

export const PINCH_CLOSE = 0.4;
export const PINCH_OPEN = 0.5;
export const PINCH_COOLDOWN_MS = 500;
export const SMOOTHING = 0.5;
export const STAR_COUNT = 150;
export const HOVER_DWELL_MS = 600;
export const HOVER_BOX = { x0: 0.4, y0: 0.4, x1: 0.6, y1: 0.6 };
