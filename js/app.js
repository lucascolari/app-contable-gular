// ============================================================
//  Contable Gular — lógica principal
// ============================================================
import { supabase, configurado } from "./db.js";
import { sesionActual, entrar, salir, perfilActual, alCambiarSesion } from "./auth.js";

// -------- Registrar el Service Worker (PWA / carga instantánea) --------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

// -------- Estado en memoria --------
const estado = {
  uid: null,
  perfil: null,
  movimientos: [],
  categorias: [],
  proyectos: [],
  perfiles: [],
  inversiones: [],
  mesRef: primerDiaDelMes(new Date()),
  monedaResumen: "ARS",
  editandoId: null,
  comprobanteViejo: null,
  editandoInvId: null,
  tabActual: "resumen",
};

// -------- Atajos --------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ============================================================
//  Arranque
// ============================================================
(async function init() {
  if (!configurado) {
    mostrarVista("setup");
    return;
  }

  // Dejamos los botones/formularios enganchados desde el arranque.
  conectarEventos();

  // Evita abrir la app dos veces (chequeo inicial + evento INITIAL_SESSION).
  let arrancado = false;
  const arrancar = async (session) => {
    if (session) {
      if (!arrancado) { arrancado = true; await abrirApp(session); }
    } else {
      arrancado = false;
      mostrarVista("login");
    }
  };

  // Reacciona a login / logout en vivo.
  alCambiarSesion((session) => { arrancar(session); });

  // Chequeo inicial de sesión. Con límite de tiempo: si la red se cuelga,
  // mostramos el login en vez de quedarnos en la pantalla de carga.
  try {
    const sesion = await conTimeout(sesionActual(), 8000);
    await arrancar(sesion);
  } catch (e) {
    mostrarVista("login");
    mostrarError($("#login-error"), traducirError(e));
  }
})();

// Al volver a la app (cambiar de app y volver), refrescamos datos
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && estado.uid) cargarTodo().then(render).catch(() => {});
});

// ============================================================
//  Vistas (splash / setup / login / app)
// ============================================================
function mostrarVista(cual) {
  $("#splash").classList.add("oculto");
  $("#vista-setup").classList.toggle("oculto", cual !== "setup");
  $("#vista-login").classList.toggle("oculto", cual !== "login");
  $("#app").classList.toggle("oculto", cual !== "app");
}

async function abrirApp(session) {
  try {
    // El uid lo sacamos de la sesión (sin llamada de red extra).
    estado.uid = session.user.id;
    const perfil = await conTimeout(perfilActual(estado.uid), 10000);
    if (!perfil) {
      // Autenticado pero NO es miembro de Gular -> no tiene acceso
      await salir();
      mostrarVista("login");
      mostrarError($("#login-error"), "Tu usuario no tiene acceso a Gular. Pedile al admin que te dé de alta.");
      return;
    }
    estado.perfil = perfil;
    $("#quien").textContent = perfil.nombre;
    mostrarVista("app");
    // Datos: si tardan, mostramos la app igual y avisamos.
    try {
      await conTimeout(cargarTodo(), 12000);
      render();
    } catch (e2) {
      toast("No se pudieron cargar los datos. Tocá recargar.");
    }
  } catch (e) {
    mostrarVista("login");
    mostrarError($("#login-error"), traducirError(e));
  }
}

// ============================================================
//  Carga de datos
// ============================================================
async function cargarTodo() {
  const [mov, cat, proy, perf] = await Promise.all([
    supabase.from("movimientos").select(`
      id, tipo, monto, moneda, fecha, descripcion, comprobante_path,
      categoria_id, proyecto_id, inversion_id, created_by,
      categorias ( nombre, color ),
      proyectos ( nombre ),
      profiles ( nombre )
    `).order("fecha", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("categorias").select("*").order("nombre"),
    supabase.from("proyectos").select("*").order("nombre"),
    supabase.from("profiles").select("id, nombre").order("nombre"),
  ]);

  for (const r of [mov, cat, proy, perf]) if (r.error) throw r.error;

  estado.movimientos = mov.data || [];
  estado.categorias = cat.data || [];
  estado.proyectos = proy.data || [];
  estado.perfiles = perf.data || [];

  // Inversiones: tolerante. Si todavía no se corrió la migración (la tabla
  // no existe), la app sigue funcionando y el panel queda vacío.
  try {
    const inv = await supabase.from("inversiones")
      .select(`*, profiles ( nombre )`).order("fecha", { ascending: false });
    estado.inversiones = inv.error ? [] : (inv.data || []);
  } catch {
    estado.inversiones = [];
  }
}

// ============================================================
//  Render general
// ============================================================
function render() {
  renderSaldos();
  renderResumen();
  renderFiltrosOpciones();
  renderMovimientos();
  renderInversiones();
  renderConfig();
}

// -------- Saldo total (todo el histórico), por moneda --------
function renderSaldos() {
  const s = { ARS: 0, USD: 0 };
  for (const m of estado.movimientos) {
    s[m.moneda] += m.tipo === "ingreso" ? Number(m.monto) : -Number(m.monto);
  }
  $("#saldo-ars").textContent = fmt(s.ARS, "ARS");
  $("#saldo-usd").textContent = fmt(s.USD, "USD");
}

// -------- Resumen del mes seleccionado --------
function renderResumen() {
  $("#mes-titulo").textContent = nombreMes(estado.mesRef);

  // Toggle de moneda (se inyecta una sola vez)
  asegurarToggleMoneda();

  const mon = estado.monedaResumen;
  const delMes = estado.movimientos.filter((m) =>
    mismoMes(m.fecha, estado.mesRef) && m.moneda === mon);

  let ingresos = 0, egresos = 0;
  const porCat = {};
  for (const m of delMes) {
    if (m.tipo === "ingreso") ingresos += Number(m.monto);
    else {
      egresos += Number(m.monto);
      const nombre = m.categorias?.nombre || "Sin categoría";
      const color = m.categorias?.color || "#64748b";
      porCat[nombre] = porCat[nombre] || { total: 0, color };
      porCat[nombre].total += Number(m.monto);
    }
  }

  $("#res-ingresos").textContent = fmt(ingresos, mon);
  $("#res-egresos").textContent = fmt(egresos, mon);
  const neto = ingresos - egresos;
  $("#res-neto").textContent = fmt(neto, mon);
  $("#res-neto").style.color = neto >= 0 ? "var(--ingreso)" : "var(--egreso)";

  // Desglose de egresos por categoría (barras)
  const cont = $("#desglose-categorias");
  const filas = Object.entries(porCat).sort((a, b) => b[1].total - a[1].total);
  if (!filas.length) {
    cont.innerHTML = `<p class="vacio">Sin egresos este mes.</p>`;
    return;
  }
  cont.innerHTML = filas.map(([nombre, d]) => {
    const pct = egresos ? Math.round((d.total / egresos) * 100) : 0;
    return `<div class="desglose-fila">
      <div class="desglose-top"><span>${esc(nombre)} · ${pct}%</span><strong>${fmt(d.total, mon)}</strong></div>
      <div class="barra"><i style="width:${pct}%;background:${esc(d.color)}"></i></div>
    </div>`;
  }).join("");
}

function asegurarToggleMoneda() {
  if ($("#toggle-moneda")) return;
  const panel = $('[data-panel="resumen"]');
  const div = document.createElement("div");
  div.id = "toggle-moneda";
  div.className = "seg";
  div.style.margin = "0 0 14px";
  div.innerHTML = `
    <label class="seg-op"><input type="radio" name="monres" value="ARS" checked><span>Pesos (ARS)</span></label>
    <label class="seg-op"><input type="radio" name="monres" value="USD"><span>Dólares (USD)</span></label>`;
  panel.insertBefore(div, panel.firstChild);
  div.addEventListener("change", (e) => {
    if (e.target.name === "monres") { estado.monedaResumen = e.target.value; renderResumen(); }
  });
}

// -------- Opciones de los filtros y del modal --------
function renderFiltrosOpciones() {
  opcionesCategorias($("#f-categoria"), true);
  opcionesCategorias($("#m-categoria"), false);
  opcionesProyectos($("#f-proyecto"), true);
  opcionesProyectos($("#m-proyecto"), true);

  const fc = $("#f-creador");
  fc.innerHTML = `<option value="">Cualquiera</option>` +
    estado.perfiles.map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join("");
}

function opcionesCategorias(sel, conTodas) {
  const val = sel.value;
  const base = conTodas ? `<option value="">Toda categoría</option>` : "";
  sel.innerHTML = base + estado.categorias
    .map((c) => `<option value="${c.id}">${esc(c.nombre)} (${c.tipo})</option>`).join("");
  sel.value = val;
}
function opcionesProyectos(sel, conVacio) {
  const val = sel.value;
  const base = conVacio ? `<option value="">${sel.id === "m-proyecto" ? "—" : "Todo proyecto"}</option>` : "";
  sel.innerHTML = base + estado.proyectos
    .map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join("");
  sel.value = val;
}

// -------- Lista de movimientos (con filtros) --------
function renderMovimientos() {
  const texto = ($("#f-texto").value || "").toLowerCase().trim();
  const tipo = $("#f-tipo").value;
  const cat = $("#f-categoria").value;
  const proy = $("#f-proyecto").value;
  const creador = $("#f-creador").value;
  const mes = $("#f-mes").value; // "YYYY-MM"

  const lista = estado.movimientos.filter((m) => {
    if (texto && !m.descripcion.toLowerCase().includes(texto)) return false;
    if (tipo && m.tipo !== tipo) return false;
    if (cat && m.categoria_id !== cat) return false;
    if (proy && m.proyecto_id !== proy) return false;
    if (creador && m.created_by !== creador) return false;
    if (mes && !m.fecha.startsWith(mes)) return false;
    return true;
  });

  const cont = $("#lista-movimientos");
  if (!lista.length) { cont.innerHTML = `<p class="vacio">No hay movimientos con esos filtros.</p>`; return; }

  cont.innerHTML = lista.map((m) => {
    const signo = m.tipo === "ingreso" ? "+" : "−";
    const esInv = !!m.inversion_id;
    const meta = [
      m.categorias?.nombre,
      m.proyectos?.nombre,
      fechaCorta(m.fecha),
      m.profiles?.nombre
    ].filter(Boolean).join(" · ");
    return `<button class="mov${esInv ? " mov-inv" : ""}" data-id="${m.id}" data-inv="${esInv ? 1 : ""}">
      <span class="mov-ico ${m.tipo}">${esInv ? "📈" : (m.tipo === "ingreso" ? "↓" : "↑")}</span>
      <span class="mov-info">
        <span class="mov-desc">${esc(m.descripcion)} ${m.comprobante_path ? '<span class="mov-clip">📎</span>' : ""}</span>
        <span class="mov-meta">${esc(meta)}</span>
      </span>
      <span class="mov-monto ${m.tipo}">${signo}${fmt(Number(m.monto), m.moneda)}</span>
    </button>`;
  }).join("");

  $$("#lista-movimientos .mov").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.inv) { toast("Este movimiento se gestiona desde Inversiones."); return; }
      abrirModal(b.dataset.id);
    }));
}

// -------- Config: categorías y proyectos --------
function renderConfig() {
  const lc = $("#lista-categorias");
  lc.innerHTML = estado.categorias.map((c) => `
    <div class="chip-config">
      <span><i class="punto" style="background:${esc(c.color)}"></i>${esc(c.nombre)} <span class="tenue">(${c.tipo})</span></span>
      <button data-del-cat="${c.id}" title="Borrar">×</button>
    </div>`).join("") || `<p class="vacio">Sin categorías.</p>`;

  const lp = $("#lista-proyectos");
  lp.innerHTML = estado.proyectos.map((p) => `
    <div class="chip-config">
      <span>${esc(p.nombre)}</span>
      <button data-del-proy="${p.id}" title="Borrar">×</button>
    </div>`).join("") || `<p class="vacio">Sin proyectos.</p>`;

  $$("[data-del-cat]").forEach((b) => b.addEventListener("click", () => borrarCategoria(b.dataset.delCat)));
  $$("[data-del-proy]").forEach((b) => b.addEventListener("click", () => borrarProyecto(b.dataset.delProy)));
}

// ============================================================
//  Inversiones (cripto, acciones, oro, otras)
// ------------------------------------------------------------
//  Al invertir, la plata SALE de la caja (se crea un egreso).
//  Al retirar, VUELVE con su valor actual (se crea un ingreso).
//  El valor actual se actualiza a mano; la ganancia/pérdida es
//  "en papel" hasta que se retira.
// ============================================================
const TIPO_INV = { cripto: "Cripto", acciones: "Acciones", oro: "Oro", otras: "Otras" };
const ICONO_INV = { cripto: "₿", acciones: "📊", oro: "🥇", otras: "💼" };

function renderInversiones() {
  const activas = estado.inversiones.filter((i) => i.estado === "activa");

  // ----- Resumen por moneda (solo monedas con inversiones activas) -----
  const cont = $("#inv-resumen");
  const porMoneda = {};
  for (const i of activas) {
    const m = (porMoneda[i.moneda] = porMoneda[i.moneda] || { inv: 0, hoy: 0 });
    m.inv += Number(i.monto_invertido);
    m.hoy += Number(i.valor_actual);
  }
  const bloques = Object.entries(porMoneda).map(([mon, d]) => {
    const res = d.hoy - d.inv;
    const pct = d.inv ? (res / d.inv) * 100 : 0;
    const cls = res >= 0 ? "ingreso" : "egreso";
    const signo = res >= 0 ? "+" : "−";
    return `<div class="inv-tarjeta">
      <span class="inv-tarjeta-mon">Cartera en ${mon}</span>
      <div class="inv-tarjeta-fila"><span>Invertido</span><strong>${fmt(d.inv, mon)}</strong></div>
      <div class="inv-tarjeta-fila"><span>Vale hoy</span><strong>${fmt(d.hoy, mon)}</strong></div>
      <div class="inv-tarjeta-fila resultado ${cls}">
        <span>Resultado</span>
        <strong>${signo}${fmt(Math.abs(res), mon)} · ${signo}${Math.abs(pct).toFixed(1)}%</strong>
      </div>
    </div>`;
  }).join("");
  cont.innerHTML = bloques || `<p class="vacio">Todavía no hay inversiones activas. Cargá la primera 👇</p>`;

  // ----- Lista de inversiones -----
  const lista = $("#lista-inversiones");
  if (!estado.inversiones.length) { lista.innerHTML = ""; return; }

  lista.innerHTML = estado.inversiones.map((i) => {
    const res = Number(i.valor_actual) - Number(i.monto_invertido);
    const pct = Number(i.monto_invertido) ? (res / Number(i.monto_invertido)) * 100 : 0;
    const cls = res >= 0 ? "ingreso" : "egreso";
    const signo = res >= 0 ? "+" : "−";
    const cerrada = i.estado === "cerrada";
    const meta = [TIPO_INV[i.tipo] || i.tipo, fechaCorta(i.fecha), i.profiles?.nombre].filter(Boolean).join(" · ");
    return `<button class="inv-item${cerrada ? " cerrada" : ""}" data-inv-id="${i.id}">
      <span class="inv-ico">${ICONO_INV[i.tipo] || "💼"}</span>
      <span class="inv-info">
        <span class="inv-nombre">${esc(i.nombre)} ${cerrada ? '<span class="inv-badge">retirada</span>' : ""}</span>
        <span class="inv-meta">${esc(meta)}</span>
      </span>
      <span class="inv-cifras">
        <span class="inv-valor">${fmt(Number(i.valor_actual), i.moneda)}</span>
        <span class="inv-res ${cls}">${signo}${fmt(Math.abs(res), i.moneda)} (${signo}${Math.abs(pct).toFixed(1)}%)</span>
      </span>
    </button>`;
  }).join("");

  $$("#lista-inversiones .inv-item").forEach((b) =>
    b.addEventListener("click", () => abrirModalInv(b.dataset.invId)));
}

function abrirModalInv(id = null) {
  estado.editandoInvId = id;
  $("#inv-error").classList.add("oculto");

  if (id) {
    const i = estado.inversiones.find((x) => x.id === id);
    if (!i) return;
    const cerrada = i.estado === "cerrada";
    $("#modal-inv-titulo").textContent = cerrada ? "Inversión retirada" : "Editar inversión";
    $("#i-tipo").value = i.tipo;
    $("#i-nombre").value = i.nombre;
    $("#i-moneda").value = i.moneda;
    $("#i-monto").value = i.monto_invertido;
    $("#i-valor").value = i.valor_actual;
    $("#i-fecha").value = i.fecha;
    $("#i-notas").value = i.notas || "";
    $("#btn-borrar-inv").classList.remove("oculto");
    $("#btn-retirar-inv").classList.toggle("oculto", cerrada);
    // Una inversión retirada queda de solo lectura
    $("#btn-guardar-inv").classList.toggle("oculto", cerrada);
    setInvDisabled(cerrada);
  } else {
    $("#modal-inv-titulo").textContent = "Nueva inversión";
    $("#i-tipo").value = "cripto";
    $("#i-nombre").value = "";
    $("#i-moneda").value = "USD";
    $("#i-monto").value = "";
    $("#i-valor").value = "";
    $("#i-fecha").value = hoyISO();
    $("#i-notas").value = "";
    $("#btn-borrar-inv").classList.add("oculto");
    $("#btn-retirar-inv").classList.add("oculto");
    $("#btn-guardar-inv").classList.remove("oculto");
    setInvDisabled(false);
  }
  $("#modal-inv").classList.remove("oculto");
}

function setInvDisabled(v) {
  ["#i-tipo", "#i-nombre", "#i-moneda", "#i-monto", "#i-valor", "#i-fecha", "#i-notas"]
    .forEach((s) => ($(s).disabled = v));
}

function cerrarModalInv() { $("#modal-inv").classList.add("oculto"); }

function catInversionesId() {
  const c = estado.categorias.find((x) => x.nombre === "Inversiones");
  return c ? c.id : null;
}

async function guardarInversion(e) {
  e.preventDefault();
  const btn = $("#btn-guardar-inv");
  btn.disabled = true; btn.textContent = "Guardando…";
  try {
    const monto = parseFloat($("#i-monto").value);
    if (!(monto > 0)) throw new Error("El capital invertido tiene que ser mayor a cero.");
    const valorRaw = $("#i-valor").value;
    const valor = valorRaw === "" ? monto : parseFloat(valorRaw);
    if (!(valor >= 0)) throw new Error("El valor actual no puede ser negativo.");

    const datos = {
      tipo: $("#i-tipo").value,
      nombre: $("#i-nombre").value.trim(),
      monto_invertido: monto,
      valor_actual: valor,
      moneda: $("#i-moneda").value,
      fecha: $("#i-fecha").value,
      notas: $("#i-notas").value.trim() || null,
    };

    if (estado.editandoInvId) {
      // Editar: actualizamos la inversión y sincronizamos el egreso de compra
      const { error } = await supabase.from("inversiones").update(datos).eq("id", estado.editandoInvId);
      if (error) throw error;
      await supabase.from("movimientos")
        .update({ monto, moneda: datos.moneda, fecha: datos.fecha, descripcion: `Inversión: ${datos.nombre}` })
        .eq("inversion_id", estado.editandoInvId).eq("tipo", "egreso");
    } else {
      // Nueva: creamos la inversión y, atado, el egreso que saca la plata de la caja
      datos.created_by = estado.uid;
      datos.estado = "activa";
      const { data: inv, error } = await supabase.from("inversiones").insert(datos).select("id").single();
      if (error) throw error;
      const egreso = {
        tipo: "egreso", monto, moneda: datos.moneda, fecha: datos.fecha,
        descripcion: `Inversión: ${datos.nombre}`,
        categoria_id: catInversionesId(), inversion_id: inv.id, created_by: estado.uid,
      };
      const { error: eMov } = await supabase.from("movimientos").insert(egreso);
      if (eMov) {
        // Si falla el egreso, deshacemos la inversión para no dejar basura
        await supabase.from("inversiones").delete().eq("id", inv.id);
        throw eMov;
      }
    }

    cerrarModalInv();
    await cargarTodo();
    render();
    toast(estado.editandoInvId ? "Inversión actualizada" : "Inversión cargada");
  } catch (err) {
    mostrarError($("#inv-error"), traducirError(err));
  } finally {
    btn.disabled = false; btn.textContent = "Guardar";
  }
}

async function retirarInversion() {
  if (!estado.editandoInvId) return;
  const i = estado.inversiones.find((x) => x.id === estado.editandoInvId);
  if (!i) return;
  const valor = parseFloat($("#i-valor").value) || Number(i.valor_actual);
  if (!confirm(`¿Retirar "${i.nombre}"? Vuelven ${fmt(valor, i.moneda)} a la caja y la inversión queda cerrada.`)) return;

  const btn = $("#btn-retirar-inv");
  btn.disabled = true; btn.textContent = "Retirando…";
  try {
    // 1) Entra la plata a la caja (ingreso atado a la inversión)
    const ingreso = {
      tipo: "ingreso", monto: valor, moneda: i.moneda, fecha: hoyISO(),
      descripcion: `Retiro inversión: ${i.nombre}`,
      categoria_id: catInversionesId(), inversion_id: i.id, created_by: estado.uid,
    };
    const { error: eMov } = await supabase.from("movimientos").insert(ingreso);
    if (eMov) throw eMov;
    // 2) La inversión queda cerrada con su valor final
    const { error } = await supabase.from("inversiones")
      .update({ estado: "cerrada", valor_actual: valor }).eq("id", i.id);
    if (error) throw error;

    cerrarModalInv();
    await cargarTodo();
    render();
    toast("Inversión retirada");
  } catch (err) {
    mostrarError($("#inv-error"), traducirError(err));
  } finally {
    btn.disabled = false; btn.textContent = "Retirar";
  }
}

async function borrarInversion() {
  if (!estado.editandoInvId) return;
  if (!confirm("¿Borrar esta inversión? Se borran también sus movimientos de caja asociados. No se puede deshacer.")) return;
  const { error } = await supabase.from("inversiones").delete().eq("id", estado.editandoInvId);
  if (error) { mostrarError($("#inv-error"), traducirError(error)); return; }
  cerrarModalInv();
  await cargarTodo();
  render();
  toast("Inversión borrada");
}

// ============================================================
//  Modal: nuevo / editar movimiento
// ============================================================
function abrirModal(id = null) {
  estado.editandoId = id;
  estado.comprobanteViejo = null;
  $("#mov-error").classList.add("oculto");
  $("#m-archivo").value = "";
  $("#m-archivo-actual").classList.add("oculto");

  if (id) {
    const m = estado.movimientos.find((x) => x.id === id);
    if (!m) return;
    $("#modal-titulo").textContent = "Editar movimiento";
    $(`input[name="tipo"][value="${m.tipo}"]`).checked = true;
    $("#m-moneda").value = m.moneda;
    $("#m-monto").value = m.monto;
    $("#m-desc").value = m.descripcion;
    $("#m-fecha").value = m.fecha;
    $("#m-categoria").value = m.categoria_id || "";
    $("#m-proyecto").value = m.proyecto_id || "";
    $("#btn-borrar").classList.remove("oculto");
    estado.comprobanteViejo = m.comprobante_path;
    if (m.comprobante_path) {
      const cont = $("#m-archivo-actual");
      cont.classList.remove("oculto");
      cont.innerHTML = `Comprobante cargado · <a href="#" id="ver-comprobante">ver</a>`;
      $("#ver-comprobante").addEventListener("click", (e) => { e.preventDefault(); verComprobante(m.comprobante_path); });
    }
  } else {
    $("#modal-titulo").textContent = "Nuevo movimiento";
    $(`input[name="tipo"][value="egreso"]`).checked = true;
    $("#m-moneda").value = "ARS";
    $("#m-monto").value = "";
    $("#m-desc").value = "";
    $("#m-fecha").value = hoyISO();
    $("#m-categoria").value = "";
    $("#m-proyecto").value = "";
    $("#btn-borrar").classList.add("oculto");
  }
  $("#modal").classList.remove("oculto");
}

function cerrarModal() { $("#modal").classList.add("oculto"); }

async function guardarMovimiento(e) {
  e.preventDefault();
  const btn = $("#btn-guardar");
  btn.disabled = true; btn.textContent = "Guardando…";
  try {
    const tipo = $('input[name="tipo"]:checked').value;
    const monto = parseFloat($("#m-monto").value);
    if (!(monto > 0)) throw new Error("El monto tiene que ser mayor a cero.");

    const datos = {
      tipo,
      monto,
      moneda: $("#m-moneda").value,
      fecha: $("#m-fecha").value,
      descripcion: $("#m-desc").value.trim(),
      categoria_id: $("#m-categoria").value || null,
      proyecto_id: $("#m-proyecto").value || null,
    };

    // Subir comprobante si se eligió uno nuevo
    const file = $("#m-archivo").files[0];
    if (file) {
      datos.comprobante_path = await subirComprobante(file);
      if (estado.comprobanteViejo) await borrarArchivo(estado.comprobanteViejo);
    }

    if (estado.editandoId) {
      const { error } = await supabase.from("movimientos").update(datos).eq("id", estado.editandoId);
      if (error) throw error;
    } else {
      datos.created_by = estado.uid;
      const { error } = await supabase.from("movimientos").insert(datos);
      if (error) throw error;
    }

    cerrarModal();
    await cargarTodo();
    render();
    toast(estado.editandoId ? "Movimiento actualizado" : "Movimiento guardado");
  } catch (err) {
    mostrarError($("#mov-error"), traducirError(err));
  } finally {
    btn.disabled = false; btn.textContent = "Guardar";
  }
}

async function borrarMovimiento() {
  if (!estado.editandoId) return;
  if (!confirm("¿Borrar este movimiento? No se puede deshacer.")) return;
  const m = estado.movimientos.find((x) => x.id === estado.editandoId);
  const { error } = await supabase.from("movimientos").delete().eq("id", estado.editandoId);
  if (error) { mostrarError($("#mov-error"), traducirError(error)); return; }
  if (m?.comprobante_path) await borrarArchivo(m.comprobante_path);
  cerrarModal();
  await cargarTodo();
  render();
  toast("Movimiento borrado");
}

// ============================================================
//  Comprobantes (Supabase Storage, bucket privado)
// ============================================================
async function subirComprobante(file) {
  const limpio = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${estado.uid}/${Date.now()}_${limpio}`;
  const { error } = await supabase.storage.from("comprobantes").upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}
async function borrarArchivo(path) {
  try { await supabase.storage.from("comprobantes").remove([path]); } catch {}
}
async function verComprobante(path) {
  const { data, error } = await supabase.storage.from("comprobantes").createSignedUrl(path, 3600);
  if (error) { toast("No se pudo abrir el comprobante"); return; }
  window.open(data.signedUrl, "_blank");
}

// ============================================================
//  Config: alta/baja de categorías y proyectos
// ============================================================
async function agregarCategoria(e) {
  e.preventDefault();
  const nombre = $("#cat-nombre").value.trim();
  const tipo = $("#cat-tipo").value;
  if (!nombre) return;
  const color = tipo === "ingreso" ? "#16a34a" : "#dc2626";
  const { error } = await supabase.from("categorias").insert({ nombre, tipo, color });
  if (error) { toast(traducirError(error)); return; }
  $("#cat-nombre").value = "";
  await cargarTodo(); render(); toast("Categoría agregada");
}
async function borrarCategoria(id) {
  if (!confirm("¿Borrar la categoría? Los movimientos que la usaban quedan sin categoría.")) return;
  const { error } = await supabase.from("categorias").delete().eq("id", id);
  if (error) { toast(traducirError(error)); return; }
  await cargarTodo(); render(); toast("Categoría borrada");
}
async function agregarProyecto(e) {
  e.preventDefault();
  const nombre = $("#proy-nombre").value.trim();
  if (!nombre) return;
  const { error } = await supabase.from("proyectos").insert({ nombre });
  if (error) { toast(traducirError(error)); return; }
  $("#proy-nombre").value = "";
  await cargarTodo(); render(); toast("Proyecto agregado");
}
async function borrarProyecto(id) {
  if (!confirm("¿Borrar el proyecto? Los movimientos que lo usaban quedan sin proyecto.")) return;
  const { error } = await supabase.from("proyectos").delete().eq("id", id);
  if (error) { toast(traducirError(error)); return; }
  await cargarTodo(); render(); toast("Proyecto borrado");
}

// ============================================================
//  Eventos de la interfaz
// ============================================================
function conectarEventos() {
  // Login
  $("#form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#login-btn");
    btn.disabled = true; btn.textContent = "Entrando…";
    $("#login-error").classList.add("oculto");
    try {
      await entrar($("#login-email").value, $("#login-pass").value);
      // onAuthStateChange abre la app
    } catch (err) {
      mostrarError($("#login-error"), traducirError(err));
    } finally {
      btn.disabled = false; btn.textContent = "Entrar";
    }
  });

  $("#btn-salir").addEventListener("click", async () => { await salir(); });

  // Tabs
  $$(".tab").forEach((t) => t.addEventListener("click", () => cambiarTab(t.dataset.tab)));

  // Resumen: navegación de meses
  $("#mes-prev").addEventListener("click", () => { estado.mesRef = sumarMes(estado.mesRef, -1); renderResumen(); });
  $("#mes-next").addEventListener("click", () => { estado.mesRef = sumarMes(estado.mesRef, 1); renderResumen(); });

  // Filtros
  ["#f-texto", "#f-tipo", "#f-categoria", "#f-proyecto", "#f-creador", "#f-mes"].forEach((s) =>
    $(s).addEventListener("input", renderMovimientos));
  $("#f-limpiar").addEventListener("click", () => {
    ["#f-texto", "#f-tipo", "#f-categoria", "#f-proyecto", "#f-creador", "#f-mes"].forEach((s) => ($(s).value = ""));
    renderMovimientos();
  });

  // Modal
  $("#btn-agregar").addEventListener("click", () => abrirModal());
  $("#modal-cerrar").addEventListener("click", cerrarModal);
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") cerrarModal(); });
  $("#form-mov").addEventListener("submit", guardarMovimiento);
  $("#btn-borrar").addEventListener("click", borrarMovimiento);

  // Config
  $("#form-categoria").addEventListener("submit", agregarCategoria);
  $("#form-proyecto").addEventListener("submit", agregarProyecto);

  // Inversiones
  $("#btn-nueva-inv").addEventListener("click", () => abrirModalInv());
  $("#modal-inv-cerrar").addEventListener("click", cerrarModalInv);
  $("#modal-inv").addEventListener("click", (e) => { if (e.target.id === "modal-inv") cerrarModalInv(); });
  $("#form-inv").addEventListener("submit", guardarInversion);
  $("#btn-retirar-inv").addEventListener("click", retirarInversion);
  $("#btn-borrar-inv").addEventListener("click", borrarInversion);
}

function cambiarTab(nombre) {
  estado.tabActual = nombre;
  $$(".tab").forEach((t) => t.classList.toggle("activa", t.dataset.tab === nombre));
  $$(".panel").forEach((p) => p.classList.toggle("oculto", p.dataset.panel !== nombre));
  // El botón flotante (+) agrega movimientos; en Inversiones usamos su propio botón.
  $("#btn-agregar").classList.toggle("oculto", nombre === "inversiones");
}

// ============================================================
//  Utilidades
// ============================================================
function fmt(monto, moneda) {
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency", currency: moneda, maximumFractionDigits: 2
    }).format(monto || 0);
  } catch {
    return (moneda === "USD" ? "US$" : "$") + (monto || 0).toFixed(2);
  }
}
function primerDiaDelMes(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function sumarMes(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function nombreMes(d) { return d.toLocaleDateString("es-AR", { month: "long", year: "numeric" }); }
function mismoMes(fechaISO, ref) {
  const [a, m] = fechaISO.split("-").map(Number);
  return a === ref.getFullYear() && m === ref.getMonth() + 1;
}
function hoyISO() {
  const d = new Date(); const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
function fechaCorta(iso) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a.slice(2)}`;
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function mostrarError(el, msg) { el.textContent = msg; el.classList.remove("oculto"); }
// Corre una promesa con límite de tiempo: si tarda de más, falla en vez
// de dejar la app colgada esperando para siempre.
function conTimeout(promesa, ms) {
  return Promise.race([
    promesa,
    new Promise((_, rej) => setTimeout(
      () => rej(new Error("El servidor tardó demasiado en responder. Revisá tu conexión y reintentá.")), ms))
  ]);
}
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.classList.remove("oculto");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("oculto"), 2600);
}
function traducirError(e) {
  const msg = (e && e.message) ? e.message : String(e);
  if (/Invalid login credentials/i.test(msg)) return "Email o contraseña incorrectos.";
  if (/Email not confirmed/i.test(msg)) return "Falta confirmar el email de esta cuenta.";
  if (/Failed to fetch|NetworkError/i.test(msg)) return "Sin conexión. Revisá internet e intentá de nuevo.";
  if (/row-level security|violates row-level/i.test(msg)) return "No tenés permiso para esta acción.";
  return msg;
}
