/* ============================================================
   Intro / ceremonia de Gular (adaptada para la app contable)
   Secuencia sobre negro: "g" → "No hay solución" → "SINGULAR" → "g".
   Config elegida: aparece SOLO LA PRIMERA VEZ en el dispositivo
   (después nunca más). Con reduce-motion entra directo. Se puede
   saltar tocando la pantalla o el botón "Saltar".
   ============================================================ */

const root = document.documentElement;
const intro = document.getElementById("intro");
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let vista = false;
try { vista = localStorage.getItem("gular-contable-intro") === "1"; } catch {}

const timeouts = [];
function finish(instant) {
  for (const t of timeouts) clearTimeout(t);
  root.classList.add("intro-done");
  document.body.classList.remove("intro-lock");
  if (!intro) return;
  if (instant) { intro.remove(); return; }
  intro.classList.add("is-hidden");
  setTimeout(() => intro.remove(), 1100);
}

if (!intro || reduce || vista) {
  finish(true);
} else {
  try { localStorage.setItem("gular-contable-intro", "1"); } catch {}
  document.body.classList.add("intro-lock");
  window.scrollTo(0, 0);

  // Saltar (botón o tap en cualquier lado de la intro)
  const skip = () => finish(false);
  intro.addEventListener("click", skip);

  // [paso, ms desde el inicio]
  const timeline = [
    ["g1", 60],
    ["frase", 1700],
    ["singular", 3700],
    ["g2", 5700],
    ["__done", 6900],
  ];
  for (const [step, at] of timeline) {
    timeouts.push(setTimeout(() => {
      if (step === "__done") finish(false);
      else intro.dataset.step = step;
    }, at));
  }
}
