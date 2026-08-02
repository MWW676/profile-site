'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { ARCANE_CONFIG } from './arcaneConfig'; // Ensure this path matches

export default function ArcaneSigilV7() {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState('Arcane Engine Online');

  useEffect(() => {
    let animationId: number;
    let stream: MediaStream | null = null;
    let landmarker: HandLandmarker | null = null;

    const { particles, sigil, colors, ai, view } = ARCANE_CONFIG;

    // --- State Management ---
    const smoothedHand = new THREE.Vector3();
    const frozenHand = new THREE.Vector3();
    let handActive = false;
    let isFist = false;
    let wasFist = false;
    let lastHandMoveTime = Date.now();
    let isFrozen = false;

    let satelliteNodes: { angle: number; radius: number }[] = [];
    let sigilGeom: { type: 'circle' | 'line', p1?: THREE.Vector3, p2?: THREE.Vector3, r?: number }[] = [];

    // --- Three.js Setup ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
    camera.position.z = view.cameraZ;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);

    // Glowing Texture - Static as per confirmed combo
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

    const colorFlow = new THREE.Color(colors.flow);
    const colorMagic = new THREE.Color(colors.magic);

    for (let i = 0; i < particles.count; i++) {
      const i3 = i * 3;
      posArr[i3] = (Math.random() - 0.5) * 45;
      posArr[i3+1] = (Math.random() - 0.5) * 35;
      posArr[i3+2] = Math.random() * (particles.nearZ - particles.farZ) + particles.farZ;
      colArr[i3] = colorFlow.r; colArr[i3+1] = colorFlow.g; colArr[i3+2] = colorFlow.b;
      targetIDArr[i] = i % 30;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));

    const points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: particles.size,
      map: particleTex,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }));
    scene.add(points);

    const generateDetailedSigil = () => {
      sigilGeom = [];
      satelliteNodes = [];
      for(let i=0; i<8; i++) satelliteNodes.push({ angle: (i/8)*Math.PI*2, radius: 1.0 });

      sigilGeom.push({ type: 'circle', r: sigil.radius * 0.90 });
      sigilGeom.push({ type: 'circle', r: sigil.radius * 0.86 });

      const sides = 6;
      for(let i=0; i<sides; i++){
        const a1 = (i/sides) * Math.PI * 2;
        const a2 = ((i+2)/sides) * Math.PI * 2;
        sigilGeom.push({
          type: 'line',
          p1: new THREE.Vector3(Math.cos(a1), Math.sin(a1), 0).multiplyScalar(sigil.radius*0.8),
          p2: new THREE.Vector3(Math.cos(a2), Math.sin(a2), 0).multiplyScalar(sigil.radius*0.8)
        });
        sigilGeom.push({
            type: 'line',
            p1: new THREE.Vector3(0,0,0),
            p2: new THREE.Vector3(Math.cos(a1), Math.sin(a1), 0).multiplyScalar(sigil.radius*0.5)
        });
      }
      sigilGeom.push({ type: 'circle', r: sigil.radius * 0.2 });
    };

    const initAI = async () => {
      const vision = await FilesetResolver.forVisionTasks(ai.wasmPath);
      landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: ai.modelAssetPath,
          delegate: ai.delegate
        },
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

      if (video && landmarker && video.readyState >= 2) {
        const results = landmarker.detectForVideo(video, performance.now());
        if (results.landmarks?.length > 0) {
          handActive = true;
          const hand = results.landmarks[0];
          const tx = (0.5 - hand[9].x) * view.handScaleX;
          const ty = (0.5 - hand[9].y) * view.handScaleY;
          const tz = -hand[9].z * view.handScaleZ;
          const newPos = new THREE.Vector3(tx, ty, tz);

          if (newPos.distanceTo(smoothedHand) > sigil.stabilityThreshold) {
            lastHandMoveTime = now;
            isFrozen = false;
          } else if (now - lastHandMoveTime > sigil.freezeDelay && isFist) {
            isFrozen = true;
          }

          if (!isFrozen) smoothedHand.lerp(newPos, sigil.lerpSpeed);
          frozenHand.copy(smoothedHand);

          const fistSize = Math.hypot(hand[4].x - hand[20].x, hand[4].y - hand[20].y);
          isFist = fistSize < 0.14;
          if (isFist && !wasFist) generateDetailedSigil();
        } else {
          handActive = false;
          isFist = false;
          isFrozen = false;
        }
      }

      const burst = wasFist && !isFist;
      wasFist = isFist;

      const pArr = points.geometry.attributes.position.array as Float32Array;
      const cArr = points.geometry.attributes.color.array as Float32Array;
      const time = performance.now() * 0.001;

      for (let i = 0; i < particles.count; i++) {
        const i3 = i * 3;
        const isCapt = stateArr[i] === 1;

        const activeColor = (handActive && !isFrozen) ? colorMagic : colorFlow;
        const targetColor = isCapt ? activeColor : colorFlow;
        const pulse = isCapt ? (1 + Math.sin(time * 15 + i) * 0.2) : 1;

        cArr[i3] += (targetColor.r * pulse - cArr[i3]) * 0.1;
        cArr[i3+1] += (targetColor.g * pulse - cArr[i3+1]) * 0.1;
        cArr[i3+2] += (targetColor.b * pulse - cArr[i3+2]) * 0.1;

        if (!isCapt) {
          pArr[i3+2] += particles.flowSpeed;
          if (pArr[i3+2] > particles.nearZ) {
            pArr[i3+2] = particles.farZ;
            pArr[i3] = (Math.random() - 0.5) * 45; pArr[i3+1] = (Math.random() - 0.5) * 35;
          }
        }

        const dist = Math.sqrt(Math.pow(pArr[i3]-frozenHand.x,2)+Math.pow(pArr[i3+1]-frozenHand.y,2)+Math.pow(pArr[i3+2]-frozenHand.z,2));

        if (isFist || (isCapt && !handActive)) {
            if (dist < sigil.captureDistance || isCapt) {
                stateArr[i] = 1;
                let tx = 0, ty = 0;
                const id = targetIDArr[i];

                if (id < 10) {
                    const r = sigil.radius * (0.85 + (id % 4) * 0.02);
                    const angle = (i / 50) + time * (id % 2 === 0 ? 0.5 : -0.5);
                    tx = frozenHand.x + Math.cos(angle) * r;
                    ty = frozenHand.y + Math.sin(angle) * r;
                } else if (id < 14) {
                    const node = satelliteNodes[i % (satelliteNodes.length || 1)];
                    const nx = frozenHand.x + Math.cos(node.angle + time*0.2) * sigil.radius;
                    const ny = frozenHand.y + Math.sin(node.angle + time*0.2) * sigil.radius;
                    const spin = (i/5) + time * 2;
                    tx = nx + Math.cos(spin) * (node.radius + (id % 2) * 0.08);
                    ty = ny + Math.sin(spin) * (node.radius + (id % 2) * 0.08);
                } else {
                    const shape = sigilGeom[i % sigilGeom.length];
                    if (shape.type === 'circle') {
                        const angle = (i/40) + time * 0.3;
                        tx = frozenHand.x + Math.cos(angle) * (shape.r || 1);
                        ty = frozenHand.y + Math.sin(angle) * (shape.r || 1);
                    } else {
                        const t = (i % 80) / 80;
                        const lx = THREE.MathUtils.lerp(shape.p1!.x, shape.p2!.x, t);
                        const ly = THREE.MathUtils.lerp(shape.p1!.y, shape.p2!.y, t);
                        const thicknessOffset = (Math.random() - 0.5) * sigil.lineThickness;
                        tx = frozenHand.x + lx + thicknessOffset;
                        ty = frozenHand.y + ly + thicknessOffset;
                    }
                }

                const jitter = (Math.random() - 0.5) * sigil.jitter;
                pArr[i3] += (tx + jitter - pArr[i3]) * sigil.lerpSpeed;
                pArr[i3+1] += (ty + jitter - pArr[i3+1]) * sigil.lerpSpeed;
                pArr[i3+2] += (frozenHand.z - pArr[i3+2]) * 0.15;
            }
        } else if (burst && isCapt) {
          stateArr[i] = 0;
          velArr[i3] = (pArr[i3]-frozenHand.x)/dist * 2; velArr[i3+1] = (pArr[i3+1]-frozenHand.y)/dist * 2;
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
      const w = window.innerWidth * view.viewportScale;
      const h = window.innerHeight * view.viewportScale;
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
        className="relative border border-cyan-900/40 bg-black rounded-[50px] shadow-[0_0_120px_rgba(0,0,0,1)] overflow-hidden"
        style={{ width: `${ARCANE_CONFIG.view.viewportScale * 100}vw`, height: `${ARCANE_CONFIG.view.viewportScale * 100}vh` }}
      >
        <video ref={videoRef} className="hidden" muted playsInline />
        <div className="absolute top-12 left-12 z-10 select-none">
          <h1 className="text-white text-4xl font-black tracking-tighter opacity-80">
            ARCANE<span className="text-[#ffaa00]">SIGIL</span>.V7
          </h1>
          <p className="text-cyan-400/40 font-mono text-[9px] mt-2 tracking-[0.4em] uppercase">
            M1 Hardware Optimized
          </p>
        </div>
      </div>
    </div>
  );
}