'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { ARCANE_CONFIG } from './arcaneConfig';

export default function ArcaneSigilCinemaV12() {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState('Arcane Engine Online');

  useEffect(() => {
    let animationId: number;
    let stream: MediaStream | null = null;
    let landmarker: HandLandmarker | null = null;

    const { particles, sigil, physics, colors, view } = ARCANE_CONFIG;

    const smoothedHand = new THREE.Vector3();
    const handVelocity = new THREE.Vector3();
    const frozenHand = new THREE.Vector3();

    let handActive = false;
    let isFist = false;
    let wasFist = false;
    let isFrozen = false;
    let lastHandMoveTime = Date.now();

    let sigilGeom: { type: 'circle' | 'line', p1?: THREE.Vector3, p2?: THREE.Vector3, r?: number }[] = [];
    const colorFlow = new THREE.Color(colors.flow);
    let currentMagicColor = new THREE.Color(colors.magic[0]);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 150);
    camera.position.z = view.cameraZ;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);

    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 64, 64);
    const particleTex = new THREE.CanvasTexture(canvas);

    const geo = new THREE.BufferGeometry();
    const posArr = new Float32Array(particles.count * 3);
    const velArr = new Float32Array(particles.count * 3);
    const colArr = new Float32Array(particles.count * 3);
    const stateArr = new Uint8Array(particles.count);
    const targetIDArr = new Uint16Array(particles.count);

    for (let i = 0; i < particles.count; i++) {
      const i3 = i * 3;
      posArr[i3] = (Math.random() - 0.5) * particles.spawnWidth;
      posArr[i3+1] = (Math.random() - 0.5) * particles.spawnHeight;
      posArr[i3+2] = Math.random() * (particles.nearZ - particles.farZ) + particles.farZ;
      colArr[i3] = colorFlow.r; colArr[i3+1] = colorFlow.g; colArr[i3+2] = colorFlow.b;
      targetIDArr[i] = i % 20;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: particles.size, map: particleTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    scene.add(points);

    const generateSigil = () => {
      sigilGeom = [];
      const style = Math.floor(Math.random() * 5);
      currentMagicColor.setHex(colors.magic[Math.floor(Math.random() * colors.magic.length)]);

      [0.98, 0.96, 0.88, 0.86].forEach(r => sigilGeom.push({ type: 'circle', r: sigil.radius * r }));

      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        sigilGeom.push({
          type: 'line',
          p1: new THREE.Vector3(Math.cos(a), Math.sin(a), 0).multiplyScalar(sigil.radius * 0.88),
          p2: new THREE.Vector3(Math.cos(a), Math.sin(a), 0).multiplyScalar(sigil.radius * 0.96)
        });
      }

      if (style === 0) { // THE SOLOMONIC HEX
        [0.8, 0.55].forEach((r) => {
          for (let i = 0; i < 6; i++) {
            const a1 = (i / 6) * Math.PI * 2, a2 = ((i + 1) / 6) * Math.PI * 2;
            sigilGeom.push({ type: 'line', p1: new THREE.Vector3(Math.cos(a1), Math.sin(a1), 0).multiplyScalar(sigil.radius * r), p2: new THREE.Vector3(Math.cos(a2), Math.sin(a2), 0).multiplyScalar(sigil.radius * r) });
            sigilGeom.push({ type: 'line', p1: new THREE.Vector3(0,0,0), p2: new THREE.Vector3(Math.cos(a1), Math.sin(a1), 0).multiplyScalar(sigil.radius * r) });
          }
        });
        sigilGeom.push({ type: 'circle', r: sigil.radius * 0.25 });
      }
      else if (style === 1) { // THE CHRONOS GEAR
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const outer = new THREE.Vector3(Math.cos(a), Math.sin(a), 0).multiplyScalar(sigil.radius * 0.82);
          sigilGeom.push({ type: 'line', p1: new THREE.Vector3(0,0,0), p2: outer });
          sigilGeom.push({ type: 'circle', r: 0.8, p1: outer }, { type: 'circle', r: 0.3, p1: outer });
        }
        sigilGeom.push({ type: 'circle', r: sigil.radius * 0.35 });
      }
      else if (style === 2) { // THE CELESTIAL MATRIX
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const tip = new THREE.Vector3(Math.cos(a), Math.sin(a), 0).multiplyScalar(sigil.radius * 0.85);
          const b1 = new THREE.Vector3(Math.cos(a-0.3), Math.sin(a-0.3), 0).multiplyScalar(sigil.radius * 0.5);
          const b2 = new THREE.Vector3(Math.cos(a+0.3), Math.sin(a+0.3), 0).multiplyScalar(sigil.radius * 0.5);
          sigilGeom.push({ type: 'line', p1: tip, p2: b1 }, { type: 'line', p1: tip, p2: b2 });
          sigilGeom.push({ type: 'line', p1: new THREE.Vector3(0,0,0), p2: tip });
        }
        sigilGeom.push({ type: 'circle', r: sigil.radius * 0.5 }, { type: 'circle', r: sigil.radius * 0.1 });
      }
      else if (style === 3) { // THE ENNEAGRAM / NONAGRAM (REPLACED SQUARES)
        const n = 9;
        const r = sigil.radius * 0.8;
        for (let i = 0; i < n; i++) {
          const a1 = (i / n) * Math.PI * 2;
          const p1 = new THREE.Vector3(Math.cos(a1), Math.sin(a1), 0).multiplyScalar(r);

          // Pattern 1: {9/2} Star
          const a2 = ((i + 2) / n) * Math.PI * 2;
          sigilGeom.push({ type: 'line', p1, p2: new THREE.Vector3(Math.cos(a2), Math.sin(a2), 0).multiplyScalar(r) });

          // Pattern 2: {9/4} Star (Sharp)
          const a3 = ((i + 4) / n) * Math.PI * 2;
          sigilGeom.push({ type: 'line', p1, p2: new THREE.Vector3(Math.cos(a3), Math.sin(a3), 0).multiplyScalar(r) });

          // Pattern 3: Radial Spokes (Ensures center is filled)
          sigilGeom.push({ type: 'line', p1: new THREE.Vector3(0,0,0), p2: p1 });
        }
        // Core Rings
        [0.15, 0.4].forEach(ir => sigilGeom.push({ type: 'circle', r: sigil.radius * ir }));
      }
      else { // THE SUN GATE
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          const r1 = sigil.radius * (i % 2 === 0 ? 0.3 : 0.5);
          sigilGeom.push({ type: 'line', p1: new THREE.Vector3(Math.cos(a), Math.sin(a), 0).multiplyScalar(r1), p2: new THREE.Vector3(Math.cos(a), Math.sin(a), 0).multiplyScalar(sigil.radius * 0.85) });
          sigilGeom.push({ type: 'line', p1: new THREE.Vector3(0,0,0), p2: new THREE.Vector3(Math.cos(a), Math.sin(a), 0).multiplyScalar(r1) });
        }
        [0.1, 0.25, 0.45, 0.72].forEach(r => sigilGeom.push({ type: 'circle', r: sigil.radius * r }));
      }
    };

    const initAI = async () => {
      const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
      landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task", delegate: "GPU" },
        runningMode: "VIDEO", numHands: 1
      });
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          handleResize();
          containerRef.current?.appendChild(renderer.domElement);
          animate();
        };
      }
    };

    const animate = () => {
      const video = videoRef.current;
      const now = Date.now();
      const time = performance.now() * 0.001;

      if (video && landmarker && video.readyState >= 2) {
        const results = landmarker.detectForVideo(video, performance.now());
        if (results.landmarks?.length > 0) {
          handActive = true;
          const hand = results.landmarks[0];
          const tx = (0.5 - hand[9].x) * view.handScaleX;
          const ty = (0.5 - hand[9].y) * view.handScaleY;
          const tz = -hand[9].z * view.handScaleZ;
          const targetPos = new THREE.Vector3(tx, ty, tz);

          if (targetPos.distanceTo(frozenHand) > sigil.stabilityThreshold) {
            lastHandMoveTime = now;
            isFrozen = false;
          } else if (now - lastHandMoveTime > sigil.freezeDelay && isFist) {
            isFrozen = true;
          }

          if (!isFrozen) {
            const force = targetPos.clone().sub(smoothedHand).multiplyScalar(physics.springStrength);
            handVelocity.add(force);
            handVelocity.multiplyScalar(physics.damping);
            smoothedHand.add(handVelocity);
          }

          const driftX = Math.sin(time * physics.floatSpeed) * physics.floatAmplitude;
          const driftY = Math.cos(time * physics.floatSpeed * 0.8) * physics.floatAmplitude;
          frozenHand.copy(smoothedHand).add(new THREE.Vector3(driftX, driftY, 0));

          const fistSize = Math.hypot(hand[4].x - hand[20].x, hand[4].y - hand[20].y);
          isFist = fistSize < 0.14;
          if (isFist && (!wasFist || (now % 2000 < 20 && !isFrozen))) generateSigil();
        } else { handActive = false; isFist = false; isFrozen = false; }
      }

      const burst = wasFist && !isFist;
      wasFist = isFist;

      const pArr = points.geometry.attributes.position.array as Float32Array;
      const cArr = points.geometry.attributes.color.array as Float32Array;

      for (let i = 0; i < particles.count; i++) {
        const i3 = i * 3;
        const isCapt = stateArr[i] === 1;

        const activeColor = (handActive && !isFrozen) ? currentMagicColor : colorFlow;
        const targetColor = isCapt ? activeColor : colorFlow;
        const pulse = isCapt ? (1 + Math.sin(time * 15 + i) * 0.2) : 1;

        cArr[i3] += (targetColor.r * pulse - cArr[i3]) * 0.1;
        cArr[i3+1] += (targetColor.g * pulse - cArr[i3+1]) * 0.1;
        cArr[i3+2] += (targetColor.b * pulse - cArr[i3+2]) * 0.1;

        if (!isCapt) {
          pArr[i3+2] += particles.flowSpeed;
          if (pArr[i3+2] > particles.nearZ) {
            pArr[i3+2] = particles.farZ;
            pArr[i3] = (Math.random() - 0.5) * particles.spawnWidth;
            pArr[i3+1] = (Math.random() - 0.5) * particles.spawnHeight;
          }
        }

        const dist = Math.sqrt(Math.pow(pArr[i3]-frozenHand.x,2)+Math.pow(pArr[i3+1]-frozenHand.y,2)+Math.pow(pArr[i3+2]-frozenHand.z,2));

        if (isFist || (isCapt && !handActive)) {
            if (dist < sigil.captureDistance || isCapt) {
                stateArr[i] = 1;
                let tx = 0, ty = 0;
                const id = targetIDArr[i];

                if (id < sigil.ringAllocationRatio * 20) {
                    const r = sigil.radius * (0.85 + (id % 4) * 0.03);
                    const angle = (i / 40) + time * (id % 2 === 0 ? 0.35 : -0.35);
                    tx = frozenHand.x + Math.cos(angle) * r;
                    ty = frozenHand.y + Math.sin(angle) * r;
                } else {
                    const shape = sigilGeom[i % sigilGeom.length] || sigilGeom[0];
                    if (shape.type === 'circle') {
                        const angle = (i / 20) + time * 0.3;
                        const ox = shape.p1 ? shape.p1.x : 0;
                        const oy = shape.p1 ? shape.p1.y : 0;
                        tx = frozenHand.x + ox + Math.cos(angle) * (shape.r || 1);
                        ty = frozenHand.y + oy + Math.sin(angle) * (shape.r || 1);
                    } else {
                        const t = ((i * 19.99) % 1000) / 1000;
                        const lx = THREE.MathUtils.lerp(shape.p1!.x, shape.p2!.x, t);
                        const ly = THREE.MathUtils.lerp(shape.p1!.y, shape.p2!.y, t);
                        const thick = (Math.random() - 0.5) * sigil.lineThickness;
                        tx = frozenHand.x + lx + thick;
                        ty = frozenHand.y + ly + thick;
                    }
                }

                const jitter = (Math.random() - 0.5) * sigil.jitter;
                pArr[i3] += (tx + jitter - pArr[i3]) * sigil.lerpSpeed;
                pArr[i3+1] += (ty + jitter - pArr[i3+1]) * sigil.lerpSpeed;
                pArr[i3+2] += (frozenHand.z - pArr[i3+2]) * 0.15;
            }
        } else if (burst && isCapt) {
          stateArr[i] = 0;
          velArr[i3] = (pArr[i3]-frozenHand.x)/dist * sigil.burstStrength;
          velArr[i3+1] = (pArr[i3+1]-frozenHand.y)/dist * sigil.burstStrength;
        } else {
          stateArr[i] = 0;
          if (handActive && dist < sigil.repelDistance) {
            velArr[i3] += (pArr[i3]-frozenHand.x)/dist * 0.05;
          }
        }

        pArr[i3] += velArr[i3]; pArr[i3+1] += velArr[i3+1]; pArr[i3+2] += velArr[i3+2];
        velArr[i3] *= 0.92; velArr[i3+1] *= 0.92; velArr[i3+2] *= 0.92;
      }

      points.geometry.attributes.position.needsUpdate = true;
      points.geometry.attributes.color.needsUpdate = true;
      renderer.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    };

    initAI();

    const handleResize = () => {
      if (!containerRef.current) return;
      const w = window.innerWidth * (view.viewportWidth / 100);
      const h = window.innerHeight * (view.viewportHeight / 100);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
      stream?.getTracks().forEach(t => t.stop());
      renderer.dispose();
      landmarker?.close();
    };
  }, []);

  return (
    <div className="flex items-center justify-center w-screen h-screen bg-[#010101] overflow-hidden">
      <div
        ref={containerRef}
        className="relative border-y border-white/5 bg-black overflow-hidden"
        style={{ width: `${ARCANE_CONFIG.view.viewportWidth}vw`, height: `${ARCANE_CONFIG.view.viewportHeight}vh` }}
      >
        <video ref={videoRef} className="hidden" muted playsInline />
        <div className="absolute top-10 left-12 z-10 select-none">
          <h1 className="text-white text-4xl font-black tracking-tighter opacity-80">
            ARCANE<span className="text-[#ffaa00]">SIGIL</span>.V12
          </h1>
          <p className="text-cyan-400/40 font-mono text-[9px] mt-2 tracking-[0.4em] uppercase">M1 Cinema View Core</p>
        </div>
      </div>
    </div>
  );
}