'use client';


import { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import {
  PALETTE,
  SMOOTHING,
  STARFIELD,
  DWELL_MS,
  LEVEL_TRANSITION_MS,
  GRID,
  EFFICIENCY_THRESHOLDS,
  getLevelConfig,
} from './gameConfig';

type Point = { x: number; y: number; z: number };
type Star = { xPct: number; yPct: number; radius: number; baseOpacity: number; phase: number };
type CardState = 'hidden' | 'flipped' | 'matched';
type CardData = {
  id: number;
  isBingo: boolean;
  state: CardState;
  flipStartMs: number | null;
  neighborCount: number;
};
type LevelConfig = ReturnType<typeof getLevelConfig>;
type Transition = { active: boolean; endMs: number; clearedLevel: number; efficiency: number };

function makeStars(): Star[] {
  return Array.from({ length: STARFIELD.count }, () => ({
    xPct: Math.random(),
    yPct: Math.random(),
    radius: Math.random() * 1.4 + 0.3,
    baseOpacity: Math.random() * 0.5 + 0.3,
    phase: Math.random() * Math.PI * 2,
  }));
}

function drawStars(ctx: CanvasRenderingContext2D, stars: Star[], w: number, h: number, now: number) {
  ctx.fillStyle = PALETTE.space;
  ctx.fillRect(0, 0, w, h);
  stars.forEach((s) => {
    const twinkle = s.baseOpacity + 0.3 * Math.sin(now * 0.002 + s.phase);
    ctx.beginPath();
    ctx.arc(s.xPct * w, s.yPct * h, s.radius, 0, 2 * Math.PI);
    ctx.fillStyle = `rgba(255,255,255,${Math.max(0, Math.min(1, twinkle))})`;
    ctx.fill();
  });
}

function getNeighborIndices(index: number, cols: number, rows: number): number[] {
  const col = index % cols;
  const row = Math.floor(index / cols);
  const neighbors: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr, nc = col + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        neighbors.push(nr * cols + nc);
      }
    }
  }
  return neighbors;
}

function generateLevel(level: number): { cards: CardData[]; config: LevelConfig } {
  const config = getLevelConfig(level);
  const indices = Array.from({ length: config.totalCards }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const bingoSet = new Set(indices.slice(0, config.bingoCount));
  const cards: CardData[] = Array.from({ length: config.totalCards }, (_, i) => {
    const isBingo = bingoSet.has(i);
    const neighborCount = isBingo
      ? 0
      : getNeighborIndices(i, config.cols, config.rows).filter((n) => bingoSet.has(n)).length;
    return { id: i, isBingo, state: 'hidden', flipStartMs: null, neighborCount };
  });
  return { cards, config };
}

function computeEfficiency(flipsUsed: number, config: LevelConfig): number {
  const range = Math.max(1, config.totalCards - config.bingoCount);
  const raw = 1 - (flipsUsed - config.bingoCount) / range;
  return Math.max(0, Math.min(1, raw));
}

function starsForEfficiency(eff: number): number {
  if (eff >= EFFICIENCY_THRESHOLDS.threeStars) return 3;
  if (eff >= EFFICIENCY_THRESHOLDS.twoStars) return 2;
  return 1;
}

function getHoveredCellIndex(point: Point, config: LevelConfig): number | null {
  const { margin } = GRID;
  const gx0 = margin, gy0 = margin, gx1 = 1 - margin, gy1 = 1 - margin;
  if (point.x < gx0 || point.x > gx1 || point.y < gy0 || point.y > gy1) return null;
  const col = Math.floor(((point.x - gx0) / (gx1 - gx0)) * config.cols);
  const row = Math.floor(((point.y - gy0) / (gy1 - gy0)) * config.rows);
  if (col < 0 || col >= config.cols || row < 0 || row >= config.rows) return null;
  return row * config.cols + col;
}

function drawMirroredText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  color: string
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(-1, 1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  cards: CardData[],
  config: LevelConfig,
  w: number,
  h: number,
  now: number,
  hoveredIndex: number | null,
  dwellProgress: number
) {
  const { margin, gap: gapPct } = GRID;
  const gx0 = margin * w, gy0 = margin * h, gx1 = (1 - margin) * w, gy1 = (1 - margin) * h;
  const gap = gapPct * w;
  const cellW = (gx1 - gx0 - gap * (config.cols - 1)) / config.cols;
  const cellH = (gy1 - gy0 - gap * (config.rows - 1)) / config.rows;

  cards.forEach((card, i) => {
    const col = i % config.cols;
    const row = Math.floor(i / config.cols);
    const x = gx0 + col * (cellW + gap);
    const y = gy0 + row * (cellH + gap);
    const cx = x + cellW / 2;
    const cy = y + cellH / 2;
    const radius = Math.min(cellW, cellH) * 0.12;

    ctx.beginPath();
    ctx.roundRect(x, y, cellW, cellH, radius);

    if (card.state === 'hidden') {
      ctx.fillStyle = PALETTE.cardHidden;
      ctx.fill();
      ctx.strokeStyle = PALETTE.mint;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (card.state === 'matched') {
      ctx.fillStyle = 'rgba(240, 153, 123, 0.2)';
      ctx.fill();
      ctx.shadowBlur = 10;
      ctx.shadowColor = PALETTE.cardBingo;
      ctx.strokeStyle = PALETTE.cardBingo;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(cellW, cellH) * 0.15, 0, 2 * Math.PI);
      ctx.fillStyle = PALETTE.cardBingo;
      ctx.fill();
    } else {
      ctx.fillStyle = PALETTE.cardBlankRevealed;
      ctx.fill();
      ctx.strokeStyle = 'rgba(243,239,230,0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (card.neighborCount > 0) {
        const fontSize = Math.floor(Math.min(cellW, cellH) * 0.4);
        drawMirroredText(
          ctx,
          String(card.neighborCount),
          cx,
          cy,
          `700 ${fontSize}px 'JetBrains Mono', monospace`,
          PALETTE.mintBright
        );
      }

      if (card.flipStartMs !== null && config.flipBackMs !== Infinity) {
        const fraction = 1 - Math.min(1, (now - card.flipStartMs) / config.flipBackMs);
        ctx.beginPath();
        ctx.arc(cx, cy, Math.min(cellW, cellH) * 0.42, -Math.PI / 2, -Math.PI / 2 + fraction * 2 * Math.PI);
        ctx.strokeStyle = PALETTE.countdownRing;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }

    if (i === hoveredIndex && card.state === 'hidden') {
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(cellW, cellH) * 0.32, -Math.PI / 2, -Math.PI / 2 + dwellProgress * 2 * Math.PI);
      ctx.strokeStyle = PALETTE.dwellRing;
      ctx.lineWidth = 4;
      ctx.stroke();
    }
  });
}

function drawFingertipCursor(ctx: CanvasRenderingContext2D, point: Point, w: number, h: number) {
  const x = point.x * w;
  const y = point.y * h;
  ctx.shadowBlur = 12;
  ctx.shadowColor = PALETTE.mint;
  ctx.beginPath();
  ctx.arc(x, y, 10, 0, 2 * Math.PI);
  ctx.strokeStyle = PALETTE.mint;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, 2 * Math.PI);
  ctx.fillStyle = PALETTE.mintBright;
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawLevelBanner(ctx: CanvasRenderingContext2D, w: number, h: number, clearedLevel: number, efficiency: number) {
  ctx.fillStyle = 'rgba(5, 5, 10, 0.6)';
  ctx.fillRect(0, 0, w, h);

  const stars = starsForEfficiency(efficiency);
  const starText = '★'.repeat(stars) + '☆'.repeat(3 - stars);

  ctx.shadowBlur = 10;
  ctx.shadowColor = PALETTE.cardBingo;
  drawMirroredText(ctx, `Level ${clearedLevel} cleared!`, w / 2, h / 2 - 30, "600 26px 'Space Grotesk', sans-serif", PALETTE.cardBingo);
  ctx.shadowBlur = 0;

  drawMirroredText(ctx, starText, w / 2, h / 2, '22px sans-serif', PALETTE.mintBright);
  drawMirroredText(ctx, `${Math.round(efficiency * 100)}% efficiency`, w / 2, h / 2 + 26, '13px monospace', PALETTE.mintBright);
  drawMirroredText(ctx, `Moving to level ${clearedLevel + 1}...`, w / 2, h / 2 + 48, '12px monospace', PALETTE.mint);
}

function smoothHand(prev: Point[] | undefined, raw: Point[]): Point[] {
  if (!prev) return raw.map((p) => ({ ...p }));
  return raw.map((p, i) => ({
    x: prev[i].x * SMOOTHING + p.x * (1 - SMOOTHING),
    y: prev[i].y * SMOOTHING + p.y * (1 - SMOOTHING),
    z: prev[i].z * SMOOTHING + p.z * (1 - SMOOTHING),
  }));
}

export default function Play() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const smoothedRef = useRef<Map<string, Point[]>>(new Map());
  const starsRef = useRef<Star[]>([]);
  const dwellRef = useRef<{ index: number | null; startMs: number | null }>({ index: null, startMs: null });
  const transitionRef = useRef<Transition | null>(null);
  const flipsUsedRef = useRef(0);
  const scoreRef = useRef(0);

  const initial = useRef(generateLevel(1));
  const cardsRef = useRef<CardData[]>(initial.current.cards);
  const configRef = useRef<LevelConfig>(initial.current.config);
  const levelRef = useRef(1);
  const foundRef = useRef(0);

  const [level, setLevel] = useState(1);
  const [found, setFound] = useState(0);
  const [score, setScore] = useState(0);

  useEffect(() => {
    starsRef.current = makeStars();
    let cancelled = false;
    let animationId: number;
    let localStream: MediaStream | null = null;

    function cascadeReveal(startIndex: number, now: number, config: LevelConfig) {
      const queue = [startIndex];
      const visited = new Set<number>([startIndex]);
      while (queue.length > 0) {
        const idx = queue.shift()!;
        const card = cardsRef.current[idx];
        if (!card || card.isBingo) continue;
        if (card.state === 'hidden') {
          card.state = 'flipped';
          card.flipStartMs = now;
        }
        if (card.neighborCount === 0) {
          getNeighborIndices(idx, config.cols, config.rows).forEach((n) => {
            if (visited.has(n)) return;
            visited.add(n);
            const neighborCard = cardsRef.current[n];
            if (neighborCard && !neighborCard.isBingo && neighborCard.state === 'hidden') {
              queue.push(n);
            }
          });
        }
      }
    }

    function selectCard(index: number, now: number) {
      const card = cardsRef.current[index];
      if (!card || card.state !== 'hidden') return;

      flipsUsedRef.current += 1;

      if (card.isBingo) {
        card.state = 'matched';
        foundRef.current += 1;
        setFound(foundRef.current);

        if (foundRef.current >= configRef.current.bingoCount) {
          const efficiency = computeEfficiency(flipsUsedRef.current, configRef.current);
          transitionRef.current = {
            active: true,
            endMs: now + LEVEL_TRANSITION_MS,
            clearedLevel: levelRef.current,
            efficiency,
          };
        }
      } else {
        cascadeReveal(index, now, configRef.current);
      }
    }

    async function setup() {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
      );
      if (cancelled) return;

      const handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
      });
      if (cancelled) {
        handLandmarker.close();
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      localStream = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      loop(handLandmarker);
    }

    function loop(handLandmarker: HandLandmarker) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2) {
        const now = performance.now();
        const result = handLandmarker.detectForVideo(video, now);
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          if (transitionRef.current?.active && now >= transitionRef.current.endMs) {
            const efficiency = transitionRef.current.efficiency;
            scoreRef.current += Math.round(efficiency * 100);
            setScore(scoreRef.current);

            const nextLevel = levelRef.current + 1;
            const next = generateLevel(nextLevel);
            cardsRef.current = next.cards;
            configRef.current = next.config;
            levelRef.current = nextLevel;
            foundRef.current = 0;
            flipsUsedRef.current = 0;
            setLevel(nextLevel);
            setFound(0);
            transitionRef.current = null;
          }

          drawStars(ctx, starsRef.current, canvas.width, canvas.height, now);

          if (!transitionRef.current?.active) {
            cardsRef.current.forEach((card) => {
              if (
                card.state === 'flipped' &&
                card.flipStartMs !== null &&
                configRef.current.flipBackMs !== Infinity &&
                now - card.flipStartMs >= configRef.current.flipBackMs
              ) {
                card.state = 'hidden';
                card.flipStartMs = null;
              }
            });
          }

          const seenLabels = new Set<string>();
          const trackedHands: Point[][] = [];
          result.landmarks.forEach((rawHand, i) => {
            const label = result.handedness[i]?.[0]?.categoryName ?? `hand-${i}`;
            seenLabels.add(label);
            const smoothed = smoothHand(smoothedRef.current.get(label), rawHand as Point[]);
            smoothedRef.current.set(label, smoothed);
            trackedHands.push(smoothed);
          });
          Array.from(smoothedRef.current.keys())
            .filter((l) => !seenLabels.has(l))
            .forEach((l) => smoothedRef.current.delete(l));

          const activeHand =
            trackedHands.find((hand) => getHoveredCellIndex(hand[8], configRef.current) !== null) ??
            trackedHands[0] ??
            null;

          let hoveredIndex: number | null = null;
          let dwellProgress = 0;

          if (!transitionRef.current?.active && activeHand) {
            hoveredIndex = getHoveredCellIndex(activeHand[8], configRef.current);
            if (hoveredIndex !== null && cardsRef.current[hoveredIndex]?.state === 'hidden') {
              if (dwellRef.current.index !== hoveredIndex) {
                dwellRef.current = { index: hoveredIndex, startMs: now };
              }
              const elapsed = now - (dwellRef.current.startMs ?? now);
              dwellProgress = Math.min(1, elapsed / DWELL_MS);
              if (elapsed >= DWELL_MS) {
                selectCard(hoveredIndex, now);
                dwellRef.current = { index: null, startMs: null };
              }
            } else {
              dwellRef.current = { index: null, startMs: null };
            }
          } else if (!activeHand) {
            dwellRef.current = { index: null, startMs: null };
          }

          drawGrid(ctx, cardsRef.current, configRef.current, canvas.width, canvas.height, now, hoveredIndex, dwellProgress);
          if (activeHand) drawFingertipCursor(ctx, activeHand[8], canvas.width, canvas.height);

          if (transitionRef.current?.active) {
            drawLevelBanner(ctx, canvas.width, canvas.height, transitionRef.current.clearedLevel, transitionRef.current.efficiency);
          }
        }
      }
      animationId = requestAnimationFrame(() => loop(handLandmarker));
    }

    setup();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animationId);
      localStream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold mb-2">Play</h1>
      <p className="text-sage mb-4">
        Hover to reveal. Numbers show nearby bingo cards — deduce, don&apos;t guess.
      </p>

      <div className="flex flex-wrap gap-3 mb-8 font-mono text-xs">
        <span className="bg-mint-soft text-ink px-3 py-1 rounded-full">Level {level}</span>
        <span className="bg-mint-soft text-ink px-3 py-1 rounded-full">
          {found}/{configRef.current.bingoCount} found
        </span>
        <span className="bg-mint-soft text-ink px-3 py-1 rounded-full">Score {score}</span>
      </div>

      <div className="relative left-1/2 -translate-x-1/2 w-screen flex justify-center">
        <div className="w-[85vw] max-w-5xl">
          <div className="relative w-full aspect-video rounded-lg overflow-hidden">
            <video ref={videoRef} className="hidden" muted playsInline />
            <canvas ref={canvasRef} className="w-full h-full -scale-x-100" />
          </div>
        </div>
      </div>
    </div>
  );
}
