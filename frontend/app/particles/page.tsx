'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

export default function ParticlePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState('Initializing AI...');

  useEffect(() => {
    let animationId: number;
    let stream: MediaStream | null = null;
    let handLandmarker: HandLandmarker | null = null;

    // --- 1. THREE.JS INITIALIZATION ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });

    const PARTICLE_COUNT = 15000;
    const posArray = new Float32Array(PARTICLE_COUNT * 3);
    const velArray = new Float32Array(PARTICLE_COUNT * 3);
    const target = new THREE.Vector3(0, 0, 0);
    let handActive = false;
    let isPalmOpen = false;

    const pointsGeometry = new THREE.BufferGeometry();
    for (let i = 0; i < PARTICLE_COUNT * 3; i++) {
      posArray[i] = (Math.random() - 0.5) * 15;
      velArray[i] = 0;
    }
    pointsGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    const pointsMaterial = new THREE.PointsMaterial({
      color: 0x00f2ff,
      size: 0.03,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const pointsObj = new THREE.Points(pointsGeometry, pointsMaterial);
    scene.add(pointsObj);

    const initThree = () => {
      if (!containerRef.current) return;
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      containerRef.current.appendChild(renderer.domElement);
      camera.position.z = 5;
    };

    // --- 2. MEDIAPIPE INITIALIZATION ---
    const initApp = async () => {
      try {
        // Use version 0.10.14 specifically to avoid API Key "unregistered caller" errors
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );

        handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "CPU", // CPU is safer for macOS 11 hardware bugs
          },
          runningMode: "VIDEO",
          numHands: 1,
        });

        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 }
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;

          // Wait for the video to actually have dimensions before calling detect
          videoRef.current.onloadedmetadata = async () => {
            try {
              await videoRef.current?.play();
              initThree();
              setStatus('Ready: Pinch to Cluster, Open Palm to Explode');
              animate();
            } catch (playErr) {
              console.error("Video play interrupted:", playErr);
            }
          };
        }
      } catch (err) {
        console.error("AI Init Error:", err);
        setStatus('Failed to load AI. Try refreshing.');
      }
    };

    // --- 3. PHYSICS & LOOP ---
    const animate = () => {
      const video = videoRef.current;

      // CRITICAL FIX: Ensure ROI > 0 by checking videoWidth
      if (video && handLandmarker && video.readyState >= 2 && video.videoWidth > 0) {
        try {
          const results = handLandmarker.detectForVideo(video, performance.now());

          if (results.landmarks && results.landmarks.length > 0) {
            handActive = true;
            const hand = results.landmarks[0];

            // Mirroring: (1 - x)
            target.x = ((1 - hand[9].x) - 0.5) * 12;
            target.y = (-(hand[9].y - 0.5)) * 10;

            const dist = Math.hypot(hand[4].x - hand[20].x, hand[4].y - hand[20].y);
            isPalmOpen = dist > 0.35;
          } else {
            handActive = false;
          }
        } catch (detectionErr) {
          // Suppress ROI errors if they happen mid-stream
          console.warn("Detection skipped for one frame");
        }
      }

      const positions = pointsObj.geometry.attributes.position.array as Float32Array;

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const i3 = i * 3;
        if (handActive) {
          if (isPalmOpen) {
            // EXPLODE
            const dx = positions[i3] - target.x;
            const dy = positions[i3+1] - target.y;
            const force = 0.6 / (Math.sqrt(dx*dx + dy*dy) + 0.5);
            velArray[i3] += dx * force * 0.15;
            velArray[i3+1] += dy * force * 0.15;
          } else {
            // CLUSTER (Gravity)
            velArray[i3] += (target.x - positions[i3]) * 0.003;
            velArray[i3+1] += (target.y - positions[i3+1]) * 0.003;
            velArray[i3+2] += (0 - positions[i3+2]) * 0.003;
          }
        } else {
          // GENTLE SWIRL
          velArray[i3] += Math.sin(Date.now() * 0.001 + i) * 0.0001;
          velArray[i3+1] += Math.cos(Date.now() * 0.001 + i) * 0.0001;
        }

        positions[i3] += velArray[i3];
        positions[i3+1] += velArray[i3+1];
        positions[i3+2] += velArray[i3+2];

        velArray[i3] *= 0.94;
        velArray[i3+1] *= 0.94;
        velArray[i3+2] *= 0.94;
      }

      pointsObj.geometry.attributes.position.needsUpdate = true;
      renderer.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    };

    initApp();

    return () => {
      cancelAnimationFrame(animationId);
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (handLandmarker) handLandmarker.close();
      renderer.dispose();
    };
  }, []);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" />

      {/* UI Overlay */}
      <div className="absolute top-8 left-8 z-20 pointer-events-none">
        <h1 className="text-white text-xl font-bold tracking-widest uppercase opacity-50">Kinetic Swarm</h1>
        <p className="text-cyan-400 font-mono text-xs mt-1">{status}</p>
      </div>

      {/* Debug Video Mirror */}
      <video
        ref={videoRef}
        className="absolute bottom-4 right-4 w-40 h-30 border border-white/10 rounded-lg -scale-x-100 opacity-50"
        muted
        playsInline
      />
    </div>
  );
}