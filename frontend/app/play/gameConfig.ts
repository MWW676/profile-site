export const PALETTE = {
  mint: '#4FBF95',
  mintBright: '#B9F0DA',
  space: '#05050a',
  cardHidden: 'rgba(79, 191, 149, 0.12)',
  cardBlankRevealed: 'rgba(243, 239, 230, 0.15)',
  cardBingo: '#F0997B',
  dwellRing: '#B9F0DA',
  countdownRing: '#F0997B',
} as const;

export const SMOOTHING = 0.5;
export const STARFIELD = { count: 150 } as const;
export const DWELL_MS = 600;
export const LEVEL_TRANSITION_MS = 2000;

export const GRID = {
  margin: 0.09,
  gap: 0.01,
} as const;

export function getLevelConfig(level: number) {
  const cols = Math.min(3 + Math.floor((level - 1) / 2), 6);
  const rows = Math.min(2 + Math.floor((level - 1) / 3), 5);
  const totalCards = cols * rows;
  const bingoCount = Math.min(1 + Math.floor((level - 1) / 2), Math.floor(totalCards / 3));
  const flipBackMs = level <= 3 ? Infinity : Math.max(800, 4000 - (level - 3) * 300);
  return { cols, rows, totalCards, bingoCount, flipBackMs };
}

export const EFFICIENCY_THRESHOLDS = { threeStars: 0.7, twoStars: 0.4 } as const;
