/* ============================================================
   Fondo de partículas (Three.js) — BLANCO / partículas NEGRAS
   Starfield de puntos negros sobre blanco, parallax con el mouse,
   deriva suave, viaje por scroll y titileo. Optimizado: menos
   partículas en móvil, pixelRatio acotado, pausa oculto, y respeto
   por prefers-reduced-motion. (Adaptado del sitio de Gular.)
   ============================================================ */
import * as THREE from "three";

const root = document.documentElement;
const canvas = document.getElementById("space");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function disableWebGL() {
  root.setAttribute("data-webgl", "off");
  if (canvas) canvas.remove();
}

if (reduceMotion || !canvas) disableWebGL();
else init();

function init() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (e) { disableWebGL(); return; }
  if (!renderer.getContext()) { disableWebGL(); return; }

  const isMobile = window.matchMedia("(max-width: 860px)").matches;
  const maxDPR = isMobile ? 1.5 : 2;
  const dpr = Math.min(window.devicePixelRatio || 1, maxDPR);
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0); // transparente: el blanco lo pone el body
  renderer.autoClear = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 400);
  camera.position.z = 1;

  // Un poco menos de partículas que el sitio (es una app, no una landing)
  const STAR_COUNT = isMobile ? 1800 : 4000;
  const pos = new Float32Array(STAR_COUNT * 3);
  const siz = new Float32Array(STAR_COUNT);
  const pha = new Float32Array(STAR_COUNT);
  const SPREAD = 90;
  for (let i = 0; i < STAR_COUNT; i++) {
    pos[i*3+0] = (Math.random() - 0.5) * SPREAD;
    pos[i*3+1] = (Math.random() - 0.5) * SPREAD;
    pos[i*3+2] = -Math.random() * 260;
    siz[i] = (Math.random() ** 3) * 2.2 + 0.5;
    pha[i] = Math.random() * Math.PI * 2;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  starGeo.setAttribute("aSize", new THREE.BufferAttribute(siz, 1));
  starGeo.setAttribute("aPhase", new THREE.BufferAttribute(pha, 1));

  const starMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.NormalBlending,
    uniforms: { uTime: { value: 0 }, uDpr: { value: dpr }, uH: { value: window.innerHeight } },
    vertexShader: `
      attribute float aSize; attribute float aPhase;
      uniform float uTime, uDpr, uH;
      varying float vTw;
      void main(){
        vTw = 0.55 + 0.45 * sin(uTime * 1.6 + aPhase);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uDpr * (uH * 0.08) / max(-mv.z, 0.001);
      }
    `,
    fragmentShader: `
      precision mediump float;
      varying float vTw;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float core = smoothstep(0.5, 0.0, d);
        float a = core * vTw;
        if (a < 0.015) discard;
        gl_FragColor = vec4(0.03, 0.03, 0.03, a * 0.8);
      }
    `,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  scene.add(stars);

  let scrollP = 0, tX = 0, tY = 0, cX = 0, cY = 0;
  function onScroll(){
    const max = document.documentElement.scrollHeight - window.innerHeight;
    scrollP = max > 0 ? window.scrollY / max : 0;
  }
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("pointermove", (e) => {
    tX = (e.clientX / window.innerWidth - 0.5) * 2;
    tY = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    starMat.uniforms.uH.value = window.innerHeight;
  }, { passive: true });

  const clock = new THREE.Clock();
  let running = true;
  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
    if (running) { clock.start(); loop(); }
  });

  function loop(){
    if (!running) return;
    const t = clock.getElapsedTime();
    cX += (tX - cX) * 0.04; cY += (tY - cY) * 0.04;
    camera.position.x = cX * 1.4;
    camera.position.y = -cY * 1.0;
    camera.position.z = 1 - scrollP * 150;
    stars.rotation.z = t * 0.008;
    camera.lookAt(0, 0, camera.position.z - 10);
    starMat.uniforms.uTime.value = t;
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  loop();
}
