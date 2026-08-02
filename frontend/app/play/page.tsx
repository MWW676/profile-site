'use client';

import { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker, HandLandmarkerResult } from '@mediapipe/tasks-vision';

export default function Play() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const [ready, setReady] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let animationId: number;
    let stream: MediaStream;

    async function setup() {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
      );
      landmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 1,
      });

      stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setReady(true);
      detectLoop();
    }

    function detectLoop() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const landmarker = landmarkerRef.current;
      if (video && canvas && landmarker && video.readyState >= 2) {
        const result: HandLandmarkerResult = landmarker.detectForVideo(video, performance.now());
        const ctx = canvas.getContext('2d');
        if (ctx) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          if (result.landmarks.length > 0) {
            const hand = result.landmarks[0];
            hand.forEach((point) => {
              ctx.beginPath();
              ctx.arc(point.x * canvas.width, point.y * canvas.height, 4, 0, 2 * Math.PI);
              ctx.fillStyle = '#4FBF95';
              ctx.fill();
            });
            const indexTip = hand[8];
            setCoords({ x: indexTip.x, y: indexTip.y });
          } else {
            setCoords(null);
          }
        }
      }
      animationId = requestAnimationFrame(detectLoop);
    }

    setup();

    return () => {
      cancelAnimationFrame(animationId);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold mb-2">Play</h1>
      <p className="text-sage mb-8">
        Hand-tracking prototype — move your index finger and watch the coordinates update.
      </p>
      <div className="relative w-full max-w-xl aspect-video bg-canvas border border-hairline rounded-lg overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover -scale-x-100"
          muted
          playsInline
        />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full -scale-x-100" />
      </div>
      <p className="mt-4 font-mono text-sm text-sage">
        {ready
          ? coords
            ? `Index fingertip: x=${coords.x.toFixed(3)}, y=${coords.y.toFixed(3)}`
            : 'No hand detected'
          : 'Loading model…'}
      </p>
    </div>
  );
}
