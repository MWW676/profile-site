'use client';

import { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import {
  PALETTE,
  PINCH,
  HOVER,
  SMOOTHING,
  STARFIELD,
  BURST,
  DEPTH,
  HAND_CONNECTIONS,
  PALM_TRIANGLES,
  FINGERTIPS,
} from '../lib/gestureConfig';

type Point = { x: number; y: number; z: number };
type Star = { xPct: number; yPct: number; depth: number; phase: number };
type Particle = { x: number; y: number; vx: number; vy: number; bornAt: number };

function makeStars(): Star[] {
  return Array.from({ length: STARFIELD.count }, () => ({
    xPct: Math.random(),
    yPct: Math.random(),
    depth: Math.random(),
    phase: Math.random() * Math.PI * 2,
  }));
}

function drawStars(ctx: CanvasRenderingContext2D, stars: Star[], w: number, h: number, now: number, dt: number) {
  ctx.fillStyle = PALETTE.space;
  ctx.fillRect(0, 0, w, h);
  stars.forEach((s) => {
    s.xPct += s.depth * STARFIELD.driftPerMs * dt;
    if (s.xPct > 1) s.xPct -= 1;
    const twinkle = 0.4 + 0.3 * Math.sin(now * 0.002 + s.phase);
    const radius = 0.3 + s.depth * 1.5;
    ctx.beginPath();
    ctx.arc(s.xPct * w, s.yPct * h, radius, 0, 2 * Math.PI);
    ctx.fillStyle = `rgba(255,255,255,${Math.max(0, Math.min(1, twinkle)) * (0.4 + s.depth * 0.6)})`;
    ctx.fill();
  });
}

function spawnBurst(xPct: number, yPct: number, now: number): Particle[] {
  return Array.from({ length: BURST.particleCount }, () => {
    const angle = Math.random() * Math.PI * 2;
    return {
      x: xPct,
      y: yPct,
      vx: Math.cos(angle) * BURST.speedPerMs,
      vy: Math.sin(angle) * BURST.speedPerMs,
      bornAt: now,
    };
  });
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[], w: number, h: number, now: number, dt: number) {
  particles.forEach((p) => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const age = now - p.bornAt;
    const life = 1 - age / BURST.lifetimeMs;
    if (life <= 0) return;
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, 3 * life, 0, 2 * Math.PI);
    ctx.fillStyle = `rgba(185, 240, 218, ${life})`;
    ctx.fill();
  });
}

function depthScale(z: number, wristZ: number): number {
  const rel = wristZ - z;
  const scale = 1 + rel * DEPTH.zToScale;
  return Math.max(DEPTH.minScale, Math.min(DEPTH.maxScale, scale));
}

function drawHandMesh(ctx: CanvasRenderingContext2D, hand: Point[], w: number, h: number) {
  const px = (i: number) => hand[i].x * w;
  const py = (i: number) => hand[i].y * h;
  const wristZ = hand[0].z;

  ctx.fillStyle = PALETTE.palmFill;
  PALM_TRIANGLES.forEach(([a, b, c]) => {
    ctx.beginPath();
    ctx.moveTo(px(a), py(a));
    ctx.lineTo(px(b), py(b));
    ctx.lineTo(px(c), py(c));
    ctx.closePath();
    ctx.fill();
  });

  ctx.shadowColor = PALETTE.mint;
  HAND_CONNECTIONS.forEach(([a, b]) => {
    const avgScale = (depthScale(hand[a].z, wristZ) + depthScale(hand[b].z, wristZ)) / 2;
    ctx.shadowBlur = 6 * avgScale;
    ctx.strokeStyle = PALETTE.mint;
    ctx.lineWidth = 1.2 * avgScale;
    ctx.beginPath();
    ctx.moveTo(px(a), py(a));
    ctx.lineTo(px(b), py(b));
    ctx.stroke();
  });

  hand.forEach((p, i) => {
    const isTip = FINGERTIPS.has(i);
    const scale = depthScale(p.z, wristZ);
    ctx.shadowBlur = 8 * scale;
    ctx.beginPath();
    ctx.arc(px(i), py(i), (isTip ? 5 : 3) * scale, 0, 2 * Math.PI);
    ctx.fillStyle = isTip ? PALETTE.mintBright : PALETTE.mint;
    ctx.fill();
  });
  ctx.shadowBlur = 0;
}

function smoothHand(prev: Point[] | undefined, raw: Point[]): Point[] {
  if (!prev) return raw.map((p) => ({ ...p }));
  return raw.map((p, i) => ({
    x: prev[i].x * SMOOTHING + p.x * (1 - SMOOTHING),
    y: prev[i].y * SMOOTHING + p.y * (1 - SMOOTHING),
    z: prev[i].z * SMOOTHING + p.z * (1 - SMOOTHING),
  }));
}

function usePinchTrigger() {
  const wasClosed = useRef(false);
  const lastHit = useRef(0);
  return (isClosedNow: boolean, now: number): boolean => {
    let hit = false;
    if (isClosedNow && !wasClosed.current && now - lastHit.current > PINCH.cooldownMs) {
      hit = true;
      lastHit.current = now;
    }
    wasClosed.current = isClosedNow;
    return hit;
  };
}

export default function GestureTest() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const smoothedRef = useRef<Map<string, Point[]>>(new Map());
  const starsRef = useRef<Star[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const dwellStartRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);

  const [pinchHit, setPinchHit] = useState(false);
  const [pinchRatio, setPinchRatio] = useState(0);
  const [hoverHit, setHoverHit] = useState(false);
  const [dwellProgress, setDwellProgress] = useState(0);

  const pinchTrigger = usePinchTrigger();

  useEffect(() => {
    starsRef.current = makeStars();
    let cancelled = false;
    let animationId: number;
    let localStream: MediaStream | null = null;

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
        const dt = lastFrameRef.current ? now - lastFrameRef.current : 16;
        lastFrameRef.current = now;

        const result = handLandmarker.detectForVideo(video, now);
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          drawStars(ctx, starsRef.current, canvas.width, canvas.height, now, dt);

          const seenLabels = new Set<string>();
          const smoothedHands: Point[][] = [];
          let primaryHand: Point[] | null = null;

          result.landmarks.forEach((rawHand, i) => {
            const label = result.handedness[i]?.[0]?.categoryName ?? `hand-${i}`;
            seenLabels.add(label);
            const smoothed = smoothHand(smoothedRef.current.get(label), rawHand as Point[]);
            smoothedRef.current.set(label, smoothed);
            smoothedHands.push(smoothed);
            drawHandMesh(ctx, smoothed, canvas.width, canvas.height);
            if (label === 'Right' || (!primaryHand && i === 0)) {
              primaryHand = smoothed;
            }
          });
          Array.from(smoothedRef.current.keys())
            .filter((label) => !seenLabels.has(label))
            .forEach((label) => smoothedRef.current.delete(label));

          const boxX = HOVER.box.x0 * canvas.width;
          const boxY = HOVER.box.y0 * canvas.height;
          const boxW = (HOVER.box.x1 - HOVER.box.x0) * canvas.width;
          const boxH = (HOVER.box.y1 - HOVER.box.y0) * canvas.height;
          ctx.strokeStyle = PALETTE.hoverBox;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(boxX, boxY, boxW, boxH);

          const anyIndexInBox = smoothedHands.some((hand) => {
            const tip = hand[8];
            return (
              tip.x >= HOVER.box.x0 &&
              tip.x <= HOVER.box.x1 &&
              tip.y >= HOVER.box.y0 &&
              tip.y <= HOVER.box.y1
            );
          });

          if (anyIndexInBox) {
            if (dwellStartRef.current === null) dwellStartRef.current = now;
            const elapsed = now - dwellStartRef.current;
            setDwellProgress(Math.min(1, elapsed / HOVER.dwellMs));
            if (elapsed >= HOVER.dwellMs) {
              setHoverHit(true);
              dwellStartRef.current = now;
              particlesRef.current.push(
                ...spawnBurst((HOVER.box.x0 + HOVER.box.x1) / 2, (HOVER.box.y0 + HOVER.box.y1) / 2, now)
              );
              setTimeout(() => setHoverHit(false), 400);
            }
          } else {
            dwellStartRef.current = null;
            setDwellProgress(0);
          }

          particlesRef.current = particlesRef.current.filter((p) => now - p.bornAt < BURST.lifetimeMs);
          drawParticles(ctx, particlesRef.current, canvas.width, canvas.height, now, dt);

          if (primaryHand) {
            const hand: Point[] = primaryHand;
            const thumb = hand[4];
            const index = hand[8];
            const wrist = hand[0];
            const midMcp = hand[9];
            const pinchDist = Math.hypot(thumb.x - index.x, thumb.y - index.y);
            const scale = Math.hypot(wrist.x - midMcp.x, wrist.y - midMcp.y);
            const r = pinchDist / scale;
            setPinchRatio(r);

            const isClosed = r < PINCH.closeThreshold;
            const isOpen = r > PINCH.openThreshold;
            if ((isClosed || isOpen) && pinchTrigger(isClosed, now)) {
              setPinchHit(true);
              setTimeout(() => setPinchHit(false), 400);
            }
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
      <h1 className="font-display text-3xl font-semibold mb-2">Gesture test</h1>
      <p className="text-sage mb-8">
        Either hand can trigger the hover box. Pinch stays single-hand.
      </p>

      <div className="relative w-full max-w-xl aspect-video rounded-lg overflow-hidden">
        <video ref={videoRef} className="hidden" muted playsInline />
        <canvas ref={canvasRef} className="w-full h-full -scale-x-100" />
      </div>

      <div className="grid grid-cols-2 gap-4 mt-6 font-mono text-sm">
        <div className={`p-4 rounded-lg border ${pinchHit ? 'bg-mint-soft border-mint' : 'border-hairline'}`}>
          <p className="font-semibold mb-1">Pinch</p>
          <p>{pinchHit ? 'Hit!' : '—'}</p>
          <p className="text-xs text-sage mt-2">ratio: {pinchRatio.toFixed(2)}</p>
        </div>
        <div className={`p-4 rounded-lg border ${hoverHit ? 'bg-mint-soft border-mint' : 'border-hairline'}`}>
          <p className="font-semibold mb-1">Hover-dwell</p>
          <p>{hoverHit ? 'Hit!' : '—'}</p>
          <p className="text-xs text-sage mt-2">progress: {(dwellProgress * 100).toFixed(0)}%</p>
        </div>
      </div>
    </div>
  );
}