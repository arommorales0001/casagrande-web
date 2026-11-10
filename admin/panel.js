/**
 * Panel administrativo de la web de Casa Grande.
 *
 * Se abre con Ctrl + E (Cmd + E en Mac). Pide iniciar sesión con Google y,
 * si la cuenta está autorizada, deja cambiar proyectos, textos, fotos y datos
 * de contacto sin tocar código. Al guardar, el cambio sale en la web al
 * instante; la versión anterior queda en el Historial por si hay que volver.
 */
(() => {
  'use strict';
  if (window.__cgPanel) return;

  /* ── Utilidades ──────────────────────────────────────────── */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  function h(tag, props = {}, ...hijos) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of hijos.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
    return el;
  }
  const clonar = o => JSON.parse(JSON.stringify(o));
  const slugDe = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

  async function llamar(ruta, opciones = {}) {
    const r = await fetch('/api/admin/' + ruta, {
      credentials: 'same-origin',
      ...opciones,
      headers: { 'X-CG-Admin': '1', ...(opciones.body && typeof opciones.body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...(opciones.headers || {}) },
    });
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(datos.error || `Error ${r.status}`), { status: r.status });
    return datos;
  }

  /* ── Estado ──────────────────────────────────────────────── */
  let config = { clientId: '', pruebas: false };
  let sesion = null;          // { email }
  let guardado = null;        // lo que está publicado
  let borrador = null;        // lo que se está editando
  let raiz, cajon, cuerpo, pie, aviso;
  let pestana = 'proyectos';
  let editandoProyecto = null; // índice en borrador.proyectos
  let modoPagina = false;

  const haySinGuardar = () => borrador && guardado && JSON.stringify(borrador) !== JSON.stringify(guardado);

  /**
   * Pregunta antes de algo que no se puede deshacer. Es una ventana del propio
   * panel: la ventana de confirmación del navegador algunos navegadores la
   * bloquean, y entonces el botón parecía no hacer nada.
   */
  function preguntar(texto, si = 'Sí, continuar', peligro = false) {
    return new Promise(ok => {
      const cerrar = v => { fondo.remove(); removeEventListener('keydown', tecla, true); ok(v); };
      const tecla = e => { if (e.key === 'Escape') { e.stopPropagation(); cerrar(false); } };
      const fondo = h('div', { class: 'cgp-raiz cgp-fondo cgp-pregunta', onclick: e => { if (e.target === fondo) cerrar(false); } },
        h('div', { class: 'cgp-tarjeta', role: 'alertdialog', 'aria-modal': 'true' },
          h('p', { class: 'cgp-pregunta-texto', text: texto }),
          h('div', { class: 'cgp-acciones cgp-acciones--fin' },
            h('button', { class: 'cgp-btn cgp-btn--claro', type: 'button', text: 'Cancelar', onclick: () => cerrar(false) }),
            h('button', { class: 'cgp-btn' + (peligro ? ' cgp-btn--rojo' : ''), type: 'button', text: si, onclick: () => cerrar(true) }))));
      document.body.append(fondo);
      addEventListener('keydown', tecla, true);
      $('.cgp-btn:last-child', fondo).focus();
    });
  }

  function avisar(texto, tipo = 'ok') {
    if (!aviso) return;
    aviso.textContent = texto;
    aviso.dataset.tipo = tipo;
    aviso.hidden = false;
    clearTimeout(avisar.t);
    avisar.t = setTimeout(() => { aviso.hidden = true; }, tipo === 'error' ? 7000 : 3500);
  }

  /* ── Inicio de sesión ────────────────────────────────────── */
  function cargarGoogle() {
    if (window.google?.accounts?.id) return Promise.resolve();
    return new Promise((ok, mal) => {
      const s = h('script', { src: 'https://accounts.google.com/gsi/client', async: true });
      s.onload = ok; s.onerror = () => mal(new Error('No se pudo cargar el inicio de sesión de Google.'));
      document.head.append(s);
    });
  }

  function ventanaEntrar() {
    if ($('.cgp-entrar')) return;
    const error = h('p', { class: 'cgp-error', hidden: true });
    const botonGoogle = h('div', { class: 'cgp-google' });
    const mostrarError = t => { error.textContent = t; error.hidden = false; };
    const entrar = async cuerpoLogin => {
      try {
        const r = await llamar('entrar', { method: 'POST', body: JSON.stringify(cuerpoLogin) });
        sesion = { email: r.email };
        fondo.remove();
        await iniciarPanel(true);
      } catch (e) { mostrarError(e.message); }
    };
    const pruebas = config.pruebas ? h('form', { class: 'cgp-pruebas', onsubmit: e => { e.preventDefault(); entrar({ email: $('input', e.target).value }); } },
      h('label', { text: 'Modo pruebas (solo en esta computadora)' }),
      h('input', { type: 'email', placeholder: 'correo autorizado', required: true }),
      h('button', { class: 'cgp-btn', type: 'submit', text: 'Entrar' })) : null;
    const fondo = h('div', { class: 'cgp-raiz cgp-fondo cgp-entrar', onclick: e => { if (e.target === fondo) fondo.remove(); } },
      h('div', { class: 'cgp-tarjeta', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Iniciar sesión en el panel' },
        h('button', { class: 'cgp-cerrar', 'aria-label': 'Cerrar', onclick: () => fondo.remove(), html: '&times;' }),
        h('img', { src: '/img/logo-completo.png', alt: 'Casa Grande', class: 'cgp-logo' }),
        h('h2', { text: 'Panel administrativo' }),
        h('p', { class: 'cgp-suave', text: 'Inicia sesión con tu cuenta de Google autorizada para editar la web.' }),
        botonGoogle, pruebas, error));
    document.body.append(fondo);
    addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { fondo.remove(); removeEventListener('keydown', esc); } });
    if (!config.clientId) {
      if (!config.pruebas) mostrarError('El inicio de sesión con Google todavía no está configurado.');
      return;
    }
    cargarGoogle().then(() => {
      google.accounts.id.initialize({ client_id: config.clientId, callback: r => entrar({ credencial: r.credential }), ux_mode: 'popup' });
      google.accounts.id.renderButton(botonGoogle, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', locale: 'es', width: 280 });
    }).catch(e => mostrarError(e.message));
  }

  async function salir() {
    if (haySinGuardar() && !await preguntar('Tienes cambios sin guardar. Si sales ahora se pierden. ¿Salir igual?', 'Salir sin guardar', true)) return;
    await llamar('salir', { method: 'POST' }).catch(() => {});
    location.reload();
  }

  /* ── Armazón del panel ───────────────────────────────────── */
  async function iniciarPanel(abrirCajon) {
    guardado = await llamar('contenido');
    borrador = clonar(guardado);
    if (!raiz) construir();
    if (abrirCajon) abrir(true);
  }

  function construir() {
    aviso = h('div', { class: 'cgp-aviso', role: 'status', hidden: true });
    const barra = h('div', { class: 'cgp-barra' },
      h('span', { class: 'cgp-punto' }),
      h('strong', { text: 'Panel Casa Grande' }),
      h('button', { class: 'cgp-btn cgp-btn--claro', text: 'Abrir panel', onclick: () => abrir(true) }),
      h('button', { class: 'cgp-btn cgp-btn--claro', text: 'Editar esta página', onclick: () => alternarModoPagina(true) }));
    cuerpo = h('div', { class: 'cgp-cuerpo' });
    pie = h('div', { class: 'cgp-pie' });
    const tabs = h('nav', { class: 'cgp-tabs', 'aria-label': 'Secciones del panel' },
      [['proyectos', 'Proyectos'], ['textos', 'Textos y fotos'], ['contacto', 'Contacto'], ['familias', 'Familias'], ['historial', 'Historial']]
        .map(([id, t]) => h('button', { 'data-tab': id, text: t, onclick: () => { pestana = id; editandoProyecto = null; pintar(); } })));
    cajon = h('aside', { class: 'cgp-cajon', 'aria-label': 'Panel administrativo', hidden: true },
      h('header', { class: 'cgp-cabeza' },
        h('div', {}, h('strong', { text: 'Panel administrativo' }), h('small', { text: sesion.email })),
        h('button', { class: 'cgp-btn cgp-btn--claro', text: 'Salir', onclick: salir }),
        h('button', { class: 'cgp-cerrar', 'aria-label': 'Cerrar panel', html: '&times;', onclick: () => abrir(false) })),
      tabs, cuerpo, pie);
    raiz = h('div', { class: 'cgp-raiz' }, barra, cajon, aviso);
    document.body.append(raiz);
    addEventListener('beforeunload', e => { if (haySinGuardar()) { e.preventDefault(); e.returnValue = ''; } });
    pintar();
  }

  function abrir(si) {
    if (!raiz) return;
    if (si === undefined) si = cajon.hidden;
    cajon.hidden = !si;
    raiz.classList.toggle('cgp-abierto', si);
    if (si && modoPagina) alternarModoPagina(false);
  }

  function pintarPie() {
    pie.replaceChildren(
      h('span', { class: 'cgp-estado', text: haySinGuardar() ? 'Tienes cambios sin guardar' : 'Todo guardado' }),
      h('button', { class: 'cgp-btn cgp-btn--claro', text: 'Descartar', disabled: !haySinGuardar(), onclick: async () => { if (await preguntar('¿Descartar todos los cambios sin guardar?', 'Descartar', true)) { borrador = clonar(guardado); location.reload(); } } }),
      h('button', { class: 'cgp-btn', text: 'Guardar y publicar', disabled: !haySinGuardar(), onclick: guardar }));
    $('.cgp-barra', raiz)?.classList.toggle('cgp-sucia', haySinGuardar());
    const contador = $('.cgp-modo-guardar', raiz);
    if (contador) contador.disabled = !haySinGuardar();
  }

  const cambio = () => pintarPie();

  async function guardar() {
    const problema = revisar(borrador);
    if (problema) { avisar(problema, 'error'); return; }
    try {
      avisar('Guardando…');
      await llamar('contenido', { method: 'PUT', body: JSON.stringify({ contenido: borrador, base: guardado.version }) });
      guardado = clonar(borrador);
      avisar('Listo: los cambios ya están en la web.');
      setTimeout(() => location.reload(), 700);
    } catch (e) { avisar(e.message, 'error'); }
  }

  function revisar(c) {
    const vistos = new Set();
    for (const p of c.proyectos) {
      if (!p.name.trim()) return 'Hay un proyecto sin nombre.';
      if (!p.slug) return `Falta la dirección web de "${p.name}".`;
      if (vistos.has(p.slug)) return `Dos proyectos usan la dirección "${p.slug}".`;
      vistos.add(p.slug);
      if (!p.cover) return `"${p.name}" necesita una foto de portada.`;
    }
    return null;
  }

  function pintar() {
    $$('.cgp-tabs button', cajon).forEach(b => b.setAttribute('aria-current', String(b.dataset.tab === pestana)));
    cuerpo.replaceChildren();
    ({ proyectos: pintarProyectos, textos: pintarTextos, contacto: pintarContacto, familias: pintarFamilias, historial: pintarHistorial })[pestana]();
    pintarPie();
    cuerpo.scrollTop = 0;
  }

  /* ── Campos reutilizables ────────────────────────────────── */
  function campo(etiqueta, valor, alCambiar, opc = {}) {
    const id = 'cgp-' + Math.random().toString(36).slice(2, 9);
    const control = opc.area
      ? h('textarea', { id, rows: opc.filas || 3, placeholder: opc.ayuda || '' })
      : h('input', { id, type: opc.tipo || 'text', placeholder: opc.ayuda || '', min: opc.min, max: opc.max, step: opc.paso });
    control.value = valor ?? '';
    control.addEventListener('input', () => { alCambiar(opc.tipo === 'number' || opc.tipo === 'range' ? Number(control.value) : control.value); cambio(); });
    return h('div', { class: 'cgp-campo' + (opc.ancho ? ' cgp-campo--' + opc.ancho : '') }, h('label', { for: id, text: etiqueta }), control, opc.nota ? h('small', { text: opc.nota }) : null);
  }

  function casilla(etiqueta, valor, alCambiar) {
    const c = h('input', { type: 'checkbox', checked: !!valor });
    c.addEventListener('change', () => { alCambiar(c.checked); cambio(); });
    return h('label', { class: 'cgp-casilla' }, c, h('span', { text: etiqueta }));
  }

  /* ── Subir archivos ──────────────────────────────────────── */
  function elegirArchivo(acepta, multiple = false) {
    return new Promise(ok => {
      const i = h('input', { type: 'file', accept: acepta, multiple });
      i.addEventListener('change', () => ok([...i.files]));
      i.click();
    });
  }

  async function achicar(archivo) {
    if (!/^image\/(jpeg|png|webp)$/.test(archivo.type)) return archivo;
    const bmp = await createImageBitmap(archivo).catch(() => null);
    if (!bmp) return archivo;
    const grande = Math.max(bmp.width, bmp.height) > 2400;
    // Los PNG livianos (logos) se dejan tal cual para no perder la transparencia.
    if (!grande && (archivo.type === 'image/png' ? archivo.size < 3e6 : archivo.size < 1.5e6)) return archivo;
    const f = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const lienzo = h('canvas', { width: Math.round(bmp.width * f), height: Math.round(bmp.height * f) });
    lienzo.getContext('2d').drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
    const tipo = archivo.type === 'image/png' ? 'image/png' : 'image/jpeg';
    return await new Promise(ok => lienzo.toBlob(b => ok(b || archivo), tipo, 0.86));
  }

  async function subir(archivo) {
    const listo = await achicar(archivo);
    if (listo.size > 25 * 1024 * 1024) throw new Error(`"${archivo.name}" pesa más de 25 MB.`);
    avisar(`Subiendo ${archivo.name}…`);
    const r = await llamar('subir', { method: 'POST', body: listo, headers: { 'Content-Type': listo.type || archivo.type, 'X-Nombre': encodeURIComponent(archivo.name) } });
    avisar('Archivo subido.');
    return r.url;
  }

  function medidasVideo(archivo) {
    return new Promise(ok => {
      const v = h('video', { preload: 'metadata', muted: true });
      v.onloadedmetadata = () => { ok({ width: v.videoWidth, height: v.videoHeight }); URL.revokeObjectURL(v.src); };
      v.onerror = () => ok({ width: 1920, height: 1080 });
      v.src = URL.createObjectURL(archivo);
    });
  }

  function selectorImagen(etiqueta, src, alCambiar, nota) {
    const vista = h('img', { src: src || '', alt: '', class: 'cgp-miniatura' + (src ? '' : ' cgp-vacia') });
    const boton = h('button', { class: 'cgp-btn cgp-btn--claro', type: 'button', text: src ? 'Cambiar' : 'Subir imagen', onclick: async () => {
      const [f] = await elegirArchivo('image/*');
      if (!f) return;
      try { const url = await subir(f); vista.src = url; vista.classList.remove('cgp-vacia'); boton.textContent = 'Cambiar'; alCambiar(url); cambio(); }
      catch (e) { avisar(e.message, 'error'); }
    } });
    return h('div', { class: 'cgp-campo cgp-imagen' }, h('label', { text: etiqueta }), h('div', { class: 'cgp-fila' }, vista, boton), nota ? h('small', { text: nota }) : null);
  }

  /** Lista de fotos con descripción, orden y quitar. */
  function listaFotos(fotos, opc = {}) {
    const caja = h('div', { class: 'cgp-fotos' });
    const repintar = () => {
      caja.replaceChildren(...fotos.map((f, i) => {
        const fila = h('div', { class: 'cgp-foto' },
          h('img', { src: f.src, alt: '', class: 'cgp-miniatura' }),
          h('div', { class: 'cgp-foto-datos' },
            campo('Descripción (para quien no ve la foto)', f.alt, v => { f.alt = v; if (!opc.familias) return; }),
            campo('Texto que acompaña la foto', f.caption, v => { f.caption = v; }),
            opc.familias ? h('div', { class: 'cgp-fila cgp-fila--3' },
              campo('Acercar', f.crop?.zoom ?? 1, v => { (f.crop ||= { zoom: 1, x: 50, y: 50 }).zoom = v; }, { tipo: 'number', min: 1, max: 3, paso: 0.05 }),
              campo('Horizontal %', f.crop?.x ?? 50, v => { (f.crop ||= { zoom: 1, x: 50, y: 50 }).x = v; }, { tipo: 'number', min: 0, max: 100 }),
              campo('Vertical %', f.crop?.y ?? 50, v => { (f.crop ||= { zoom: 1, x: 50, y: 50 }).y = v; }, { tipo: 'number', min: 0, max: 100 })) : null,
            opc.familias ? null : casilla('Es un render (se marca como "render referencial")', f.render, v => { f.render = v; })),
          h('div', { class: 'cgp-orden' },
            h('button', { type: 'button', title: 'Subir', text: '↑', disabled: i === 0, onclick: () => { [fotos[i - 1], fotos[i]] = [fotos[i], fotos[i - 1]]; repintar(); cambio(); } }),
            h('button', { type: 'button', title: 'Bajar', text: '↓', disabled: i === fotos.length - 1, onclick: () => { [fotos[i + 1], fotos[i]] = [fotos[i], fotos[i + 1]]; repintar(); cambio(); } }),
            h('button', { type: 'button', title: 'Quitar', text: '✕', class: 'cgp-peligro', onclick: async () => { if (await preguntar('¿Quitar esta foto?', 'Quitar', true)) { fotos.splice(i, 1); repintar(); cambio(); } } })));
        return fila;
      }));
    };
    repintar();
    const agregar = h('button', { class: 'cgp-btn cgp-btn--claro', type: 'button', text: '+ Agregar fotos', onclick: async () => {
      const archivos = await elegirArchivo('image/*', true);
      for (const a of archivos) {
        try {
          const src = await subir(a);
          const base = a.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
          fotos.push(opc.familias ? { src, alt: base, caption: base, crop: { zoom: 1, x: 50, y: 50 } } : { src, alt: base, caption: base, render: false, event: false });
          repintar(); cambio();
        } catch (e) { avisar(e.message, 'error'); }
      }
    } });
    return h('div', {}, caja, agregar);
  }

  /* ── Pestaña: Proyectos ──────────────────────────────────── */
  function pintarProyectos() {
    if (editandoProyecto != null) return pintarProyecto(borrador.proyectos[editandoProyecto]);
    const lista = borrador.proyectos;
    cuerpo.append(
      h('div', { class: 'cgp-intro' },
        h('p', { text: 'Estos son los proyectos que se muestran en la web, en este orden. Un proyecto oculto no aparece en ninguna parte.' }),
        h('button', { class: 'cgp-btn', text: '+ Nuevo proyecto', onclick: () => {
          const nuevo = {
            key: 'p' + Date.now().toString(36), slug: '', visible: false, name: 'Nuevo proyecto', city: '', region: 'Lambayeque', tipo: 'LOTES EN VENTA',
            tagline: '', desc: '', facts: [['', 'Lotes desde'], ['', ''], ['', '']], benefits: [], logo: '', cover: '', resumen: '', opcionFormulario: '',
            photos: [], videos: [], ubicacion: { eyebrow: '', titulo: 'Ubicación', subtitulo: '', imagen: '', imagenAlt: '', fotoAlt: '', aria: '', boton: 'Ampliar imagen', mapa: '', parrafos: [] },
          };
          lista.push(nuevo);
          editandoProyecto = lista.length - 1;
          pintar();
        } })),
      ...lista.map((p, i) => h('div', { class: 'cgp-proyecto' + (p.visible === false ? ' cgp-oculto' : '') },
        h('img', { src: p.cover || p.logo || '', alt: '', class: 'cgp-miniatura' }),
        h('div', { class: 'cgp-proyecto-datos' }, h('strong', { text: p.name }), h('small', { text: `${p.city || 'Sin ciudad'} · ${p.visible === false ? 'Oculto' : 'Visible'}` })),
        h('div', { class: 'cgp-orden' },
          h('button', { title: 'Subir', text: '↑', disabled: i === 0, onclick: () => { [lista[i - 1], lista[i]] = [lista[i], lista[i - 1]]; pintar(); } }),
          h('button', { title: 'Bajar', text: '↓', disabled: i === lista.length - 1, onclick: () => { [lista[i + 1], lista[i]] = [lista[i], lista[i + 1]]; pintar(); } })),
        h('button', { class: 'cgp-btn cgp-btn--claro', text: 'Editar', onclick: () => { editandoProyecto = i; pintar(); } }))));
  }

  function pintarProyecto(p) {
    const esNuevo = !p.rutaOriginal && !(guardado.proyectos || []).some(x => x.key === p.key);
    const direccion = h('small', { class: 'cgp-direccion', text: `inmobiliariacasagrande.com/${p.slug || '…'}` });
    const campoSlug = campo('Dirección web', p.slug, v => { p.slug = slugDe(v); direccion.textContent = `inmobiliariacasagrande.com/${p.slug || '…'}`; }, { nota: 'Solo minúsculas, números y guiones. Cambiarla rompe los enlaces que ya se compartieron.' });
    const videos = p.videos ||= [];
    const u = p.ubicacion ||= {};
    const cajaVideos = h('div', { class: 'cgp-fotos' });
    const pintarVideos = () => cajaVideos.replaceChildren(...videos.map((v, i) => h('div', { class: 'cgp-foto' },
      h('video', { src: v.src.split('#')[0], muted: true, preload: 'metadata', class: 'cgp-miniatura' }),
      h('div', { class: 'cgp-foto-datos' },
        campo('Nombre del botón', v.boton, x => { v.boton = x; }),
        campo('Descripción del video', v.label, x => { v.label = x; })),
      h('div', { class: 'cgp-orden' },
        h('button', { text: '↑', disabled: i === 0, onclick: () => { [videos[i - 1], videos[i]] = [videos[i], videos[i - 1]]; pintarVideos(); cambio(); } }),
        h('button', { text: '✕', class: 'cgp-peligro', onclick: async () => { if (await preguntar('¿Quitar este video?', 'Quitar', true)) { videos.splice(i, 1); pintarVideos(); cambio(); } } })))));
    pintarVideos();

    cuerpo.append(
      h('button', { class: 'cgp-volver', text: '← Volver a la lista', onclick: () => { editandoProyecto = null; pintar(); } }),
      h('h3', { class: 'cgp-titulo', text: p.name || 'Proyecto' }),
      casilla('Mostrar este proyecto en la web', p.visible !== false, v => { p.visible = v; }),

      h('fieldset', {}, h('legend', { text: 'Datos principales' }),
        campo('Nombre del proyecto', p.name, v => { p.name = v; if (esNuevo) { p.slug = slugDe(v); $('input', campoSlug).value = p.slug; direccion.textContent = `inmobiliariacasagrande.com/${p.slug}`; } }),
        h('div', { class: 'cgp-fila cgp-fila--2' }, campo('Ciudad', p.city, v => { p.city = v; }), campo('Región', p.region, v => { p.region = v; })),
        campo('Tipo (va junto a la ciudad)', p.tipo, v => { p.tipo = v; }, { ayuda: 'LOTES EN VENTA' }),
        campo('Frase corta (tarjeta)', p.tagline, v => { p.tagline = v; }, { ayuda: 'Cerca de todo lo que importa.' }),
        campo('Descripción', p.desc, v => { p.desc = v; }, { area: true }),
        campo('Texto al pie de la tarjeta', p.resumen, v => { p.resumen = v; }, { ayuda: 'Lotes desde 90 m²' }),
        campo('Nombre en el formulario de consulta', p.opcionFormulario, v => { p.opcionFormulario = v; }, { ayuda: p.name }),
        campoSlug, direccion),

      h('fieldset', {}, h('legend', { text: 'Datos destacados' }),
        ...(p.facts ||= []).map((f, i) => h('div', { class: 'cgp-fila cgp-fila--2' },
          campo(`Dato ${i + 1}`, f[0], v => { f[0] = v; }, { ayuda: '90 m²' }),
          campo('Qué significa', f[1], v => { f[1] = v; }, { ayuda: 'Lotes desde' })))),

      h('fieldset', {}, h('legend', { text: 'Beneficios' }),
        campo('Un beneficio por línea', (p.benefits || []).join('\n'), v => { p.benefits = v.split('\n').map(s => s.trim()).filter(Boolean); }, { area: true, filas: 5 })),

      h('fieldset', {}, h('legend', { text: 'Imágenes principales' }),
        selectorImagen('Portada (tarjeta y buscador)', p.cover, v => { p.cover = v; }, 'Horizontal, de preferencia 1672 × 941 px.'),
        selectorImagen('Logo del proyecto', p.logo, v => { p.logo = v; }, 'PNG con fondo transparente.')),

      h('fieldset', {}, h('legend', { text: 'Galería de fotos' }), listaFotos(p.photos ||= [])),

      h('fieldset', {}, h('legend', { text: 'Videos' }),
        h('p', { class: 'cgp-suave', text: 'Si el proyecto tiene video, aparece junto a los beneficios. Si no, ahí se muestra el mapa de ubicación. Máximo 25 MB por video.' }),
        cajaVideos,
        h('button', { class: 'cgp-btn cgp-btn--claro', type: 'button', text: '+ Agregar video', onclick: async () => {
          const [f] = await elegirArchivo('video/mp4,video/webm,video/quicktime');
          if (!f) return;
          try {
            const medidas = await medidasVideo(f);
            const src = await subir(f);
            videos.push({ src, ...medidas, label: `Video de ${p.name}`, boton: videos.length ? 'Recorrido' : 'Video principal', muted: true });
            pintarVideos(); cambio();
          } catch (e) { avisar(e.message, 'error'); }
        } })),

      h('fieldset', {}, h('legend', { text: 'Ubicación' }),
        campo('Etiqueta superior (opcional)', u.eyebrow, v => { u.eyebrow = v; }, { ayuda: 'PIMENTEL, LAMBAYEQUE' }),
        campo('Título', u.titulo, v => { u.titulo = v; }, { area: true, filas: 2, nota: 'Enter para pasar a la siguiente línea.' }),
        campo('Subtítulo (opcional)', u.subtitulo, v => { u.subtitulo = v; }),
        selectorImagen('Mapa o vista aérea', u.imagen, v => { u.imagen = v; u.ancho = 0; u.alto = 0; }),
        campo('Descripción de la imagen', u.imagenAlt, v => { u.imagenAlt = v; u.fotoAlt = v; }),
        campo('Enlace de Google Maps (opcional)', u.mapa, v => { u.mapa = v.trim(); }, { tipo: 'url', ayuda: 'https://maps.google.com/…' }),
        campo('Textos (deja una línea en blanco entre párrafos)', (u.parrafos || []).join('\n\n'), v => { u.parrafos = v.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean); }, { area: true, filas: 5 })),

      h('div', { class: 'cgp-acciones' },
        p.slug && p.visible !== false && !esNuevo ? h('a', { class: 'cgp-btn cgp-btn--claro', href: '/' + p.slug, target: '_blank', text: 'Ver página publicada ↗' }) : null,
        h('button', { class: 'cgp-btn cgp-btn--peligro', text: 'Eliminar proyecto', onclick: async () => {
          const otros = haySinGuardar();
          const ok = await preguntar(`¿Eliminar "${p.name}" de la web? Se quita al instante de todas las páginas.`
            + (otros ? ' Los otros cambios sin guardar también se publicarán.' : '')
            + ' Si solo quieres esconderlo, mejor desmarca "Mostrar este proyecto". Si te arrepientes, puedes recuperarlo desde Historial.', 'Sí, eliminar', true);
          if (!ok) return;
          borrador.proyectos.splice(editandoProyecto, 1); editandoProyecto = null; pintar();
          // Eliminar es una acción completa: se publica de una vez, no queda a medias.
          await guardar();
        } })));
  }

  /* ── Pestaña: Textos y fotos ─────────────────────────────── */
  function pintarTextos() {
    const claves = Object.keys(borrador.textos), fotos = Object.keys(borrador.imagenes);
    cuerpo.append(
      h('div', { class: 'cgp-intro' },
        h('p', { text: 'Para cambiar un texto o una foto, ve a la página donde está y pulsa "Editar esta página". Luego haz clic en el texto para escribir encima, o en la foto para reemplazarla.' }),
        h('button', { class: 'cgp-btn', text: 'Editar esta página', onclick: () => alternarModoPagina(true) })),
      h('h4', { class: 'cgp-subtitulo', text: `Textos cambiados (${claves.length})` }),
      claves.length ? null : h('p', { class: 'cgp-suave', text: 'Todavía no se cambió ningún texto.' }),
      ...claves.map(k => h('div', { class: 'cgp-cambio' },
        h('div', {}, h('small', { text: nombreClave(k) }), h('p', { html: limpiarVista(borrador.textos[k]) })),
        h('button', { class: 'cgp-btn cgp-btn--claro', text: 'Volver al original', onclick: () => { delete borrador.textos[k]; pintar(); } }))),
      h('h4', { class: 'cgp-subtitulo', text: `Fotos cambiadas (${fotos.length})` }),
      fotos.length ? null : h('p', { class: 'cgp-suave', text: 'Todavía no se cambió ninguna foto.' }),
      ...fotos.map(k => h('div', { class: 'cgp-cambio' },
        h('img', { src: borrador.imagenes[k].src, alt: '', class: 'cgp-miniatura' }),
        h('small', { text: nombreClave(k) }),
        h('button', { class: 'cgp-btn cgp-btn--claro', text: 'Volver a la original', onclick: () => { delete borrador.imagenes[k]; pintar(); } }))));
  }

  const PAGINAS = { index: 'Inicio', proyectos: 'Proyectos', familias: 'Familias', somos: 'Somos', contacto: 'Contacto', terminos: 'Términos', 'politica-privacidad': 'Privacidad', 'libro-reclamaciones': 'Libro de Reclamaciones' };
  const BLOQUES = { franja: 'Franja superior', pie: 'Pie de página', consulta: 'Ventana de consulta', buscador: 'Buscador de proyectos', cierre: 'Cierre "Todo empieza…"' };
  function nombreClave(k) {
    const c = k.replace(/^img-/, '');
    const g = c.match(/^g-([a-z]+)-/);
    if (g) return `En todas las páginas · ${BLOQUES[g[1]] || g[1]}`;
    const p = Object.keys(PAGINAS).sort((a, b) => b.length - a.length).find(x => c.startsWith(x + '-'));
    return p ? `Página ${PAGINAS[p]}` : c;
  }
  const limpiarVista = t => String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(/&lt;br&gt;/g, ' · ').replace(/&lt;\/?(strong|em|b|i|span)&gt;/g, '');

  /* ── Editar directamente sobre la página ─────────────────── */
  let originales = {};
  let insignia;

  /** El texto de un elemento editado, con solo saltos, negrita y cursiva. */
  function aTexto(nodo) {
    let s = '';
    nodo.childNodes.forEach(n => {
      if (n.nodeType === 3) s += n.nodeValue.replace(/ /g, ' ');
      else if (n.nodeType === 1) {
        const t = n.tagName;
        if (t === 'BR') s += '<br>';
        else if (t === 'STRONG' || t === 'B') s += `<strong>${aTexto(n)}</strong>`;
        else if (t === 'EM' || t === 'I') s += `<em>${aTexto(n)}</em>`;
        else if (t === 'SPAN' && !n.attributes.length) s += `<span>${aTexto(n)}</span>`;
        else if (t === 'DIV' || t === 'P') s += (s && !s.endsWith('<br>') ? '<br>' : '') + aTexto(n);
        else s += aTexto(n);
      }
    });
    return s.replace(/(<br>)+$/, '');
  }

  async function alternarModoPagina(si) {
    if (si === modoPagina) return;
    modoPagina = si;
    document.documentElement.classList.toggle('cgp-editando', si);
    if (si) {
      abrir(false);
      // El texto limpio sale de la página tal como la sirve el servidor: la
      // animación de los títulos parte las palabras y no hay que guardar eso.
      try {
        const html = await (await fetch(location.href, { cache: 'no-store', credentials: 'same-origin' })).text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        originales = {};
        $$('[data-cms]', doc).forEach(el => { originales[el.dataset.cms] = el.innerHTML; });
      } catch { originales = {}; }
      $$('[data-cms]').forEach(el => {
        if (originales[el.dataset.cms] != null) el.innerHTML = originales[el.dataset.cms];
        el.setAttribute('contenteditable', 'true');
        el.setAttribute('spellcheck', 'true');
      });
      if (!$$('[data-cms], [data-cms-img]').length) avisar('Esta página no tiene textos editables desde aquí. Los proyectos se editan en la pestaña Proyectos.', 'error');
      $('.cgp-barra', raiz).replaceChildren(
        h('span', { class: 'cgp-punto' }),
        h('strong', { text: 'Editando esta página' }),
        h('span', { class: 'cgp-suave', text: 'Clic en un texto para escribir · clic en una foto para cambiarla' }),
        h('button', { class: 'cgp-btn cgp-modo-guardar', text: 'Guardar y publicar', disabled: !haySinGuardar(), onclick: guardar }),
        h('button', { class: 'cgp-btn cgp-btn--claro', text: 'Terminar', onclick: () => alternarModoPagina(false) }));
      document.addEventListener('click', clicEditando, true);
      document.addEventListener('input', alEscribir, true);
      document.addEventListener('keydown', teclaEditando, true);
      document.addEventListener('paste', pegarPlano, true);
      document.addEventListener('mouseover', mostrarInsignia, true);
    } else {
      $$('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
      document.removeEventListener('click', clicEditando, true);
      document.removeEventListener('input', alEscribir, true);
      document.removeEventListener('keydown', teclaEditando, true);
      document.removeEventListener('paste', pegarPlano, true);
      document.removeEventListener('mouseover', mostrarInsignia, true);
      insignia?.remove(); insignia = null;
      $('.cgp-barra', raiz).replaceChildren(
        h('span', { class: 'cgp-punto' }),
        h('strong', { text: 'Panel Casa Grande' }),
        h('button', { class: 'cgp-btn cgp-btn--claro', text: 'Abrir panel', onclick: () => abrir(true) }),
        h('button', { class: 'cgp-btn cgp-btn--claro', text: 'Editar esta página', onclick: () => alternarModoPagina(true) }));
      pintarPie();
    }
  }

  function alEscribir(e) {
    const el = e.target.closest?.('[data-cms]');
    if (!el) return;
    const valor = aTexto(el);
    const original = originales[el.dataset.cms];
    const base = original != null ? aTexto(Object.assign(document.createElement('div'), { innerHTML: original })) : null;
    if (valor === base && guardado.textos[el.dataset.cms] == null) delete borrador.textos[el.dataset.cms];
    else borrador.textos[el.dataset.cms] = valor;
    // El mismo texto puede estar repetido en la página (p. ej. el pie).
    $$(`[data-cms="${el.dataset.cms}"]`).forEach(o => { if (o !== el) o.innerHTML = el.innerHTML; });
    pintarPie();
  }

  function teclaEditando(e) {
    if (!e.target.closest?.('[data-cms]')) return;
    if (e.key === 'Enter') { e.preventDefault(); document.execCommand('insertLineBreak'); }
    if (e.key === 'Escape') e.target.blur();
  }

  function pegarPlano(e) {
    if (!e.target.closest?.('[data-cms]')) return;
    e.preventDefault();
    document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain'));
  }

  function mostrarInsignia(e) {
    const img = e.target.closest?.('[data-cms-img]');
    if (!img) return;
    const r = img.getBoundingClientRect();
    insignia ||= h('div', { class: 'cgp-insignia', text: 'Cambiar foto' });
    if (!insignia.isConnected) raiz.append(insignia);
    insignia.style.top = Math.max(8, r.top + 12) + 'px';
    insignia.style.left = Math.max(8, r.left + 12) + 'px';
  }

  async function clicEditando(e) {
    if (e.target.closest('.cgp-raiz')) return;
    const img = e.target.closest('[data-cms-img]');
    if (img) {
      e.preventDefault(); e.stopPropagation();
      const [f] = await elegirArchivo('image/*');
      if (!f) return;
      try {
        const src = await subir(f);
        img.src = src; img.removeAttribute('srcset');
        borrador.imagenes[img.dataset.cmsImg] = { src };
        pintarPie();
      } catch (err) { avisar(err.message, 'error'); }
      return;
    }
    // Mientras se edita, los enlaces y botones no navegan ni abren ventanas.
    if (e.target.closest('a, button, [data-contact], summary, label')) { e.preventDefault(); e.stopPropagation(); }
  }

  /* ── Pestaña: Contacto ───────────────────────────────────── */
  function pintarContacto() {
    const c = borrador.contacto;
    cuerpo.append(
      h('p', { class: 'cgp-intro', text: 'Estos datos cambian en todas las páginas a la vez: cabecera, pie, formularios y botones de WhatsApp.' }),
      h('fieldset', {}, h('legend', { text: 'Atención' }),
        campo('Número de WhatsApp (con 51 adelante)', c.whatsapp, v => { c.whatsapp = v.replace(/\D/g, ''); }, { tipo: 'tel', ayuda: '51986498284' }),
        campo('Teléfono como se muestra', c.telefono, v => { c.telefono = v; }, { ayuda: '986 498 284' }),
        h('div', { class: 'cgp-fila cgp-fila--2' }, campo('Días de atención', c.dias, v => { c.dias = v; }), campo('Horario', c.horas, v => { c.horas = v; })),
        campo('Correo', c.correo, v => { c.correo = v; }, { tipo: 'email' }),
        campo('Dirección', c.direccion, v => { c.direccion = v; })),
      h('fieldset', {}, h('legend', { text: 'Redes sociales' }),
        campo('Facebook', c.facebook, v => { c.facebook = v; }, { tipo: 'url' }),
        campo('Instagram', c.instagram, v => { c.instagram = v; }, { tipo: 'url' }),
        campo('TikTok', c.tiktok, v => { c.tiktok = v; }, { tipo: 'url' })),
      h('fieldset', {}, h('legend', { text: 'Mensaje del chat de WhatsApp' }),
        campo('Mensaje de bienvenida', String(c.mensajeChat || '').replace(/<br>/g, '\n'), v => { c.mensajeChat = v.replace(/\n/g, '<br>'); }, { area: true, filas: 5, nota: 'Puedes usar <strong>texto</strong> para resaltar.' })));
  }

  /* ── Pestaña: Familias ───────────────────────────────────── */
  function pintarFamilias() {
    cuerpo.append(
      h('p', { class: 'cgp-intro', text: 'Las fotos de la galería de la página Familias, en este orden. "Acercar" y la posición sirven para encuadrar la foto vertical.' }),
      listaFotos(borrador.familias ||= [], { familias: true }));
  }

  /* ── Pestaña: Historial ──────────────────────────────────── */
  async function pintarHistorial() {
    cuerpo.append(h('p', { class: 'cgp-intro', text: 'Cada vez que se guarda, la versión anterior queda aquí. Restaurar una versión la vuelve a publicar tal como estaba (se guardan las últimas 30).' }));
    const caja = h('div', {}, h('p', { class: 'cgp-suave', text: 'Cargando…' }));
    cuerpo.append(caja);
    try {
      const lista = await llamar('historial');
      caja.replaceChildren(...(lista.length ? lista.map(v => h('div', { class: 'cgp-cambio' },
        h('div', {}, h('strong', { text: `Versión ${v.version}` }), h('small', { text: `${v.por}${v.el ? ' · ' + new Date(v.el).toLocaleString('es-PE') : ''}` })),
        h('button', { class: 'cgp-btn cgp-btn--claro', text: 'Restaurar', onclick: async () => {
          if (!await preguntar(`¿Volver a publicar la versión ${v.version}? Lo que está ahora queda guardado en el historial.`, 'Restaurar')) return;
          try { await llamar('restaurar', { method: 'POST', body: JSON.stringify({ id: v.id }) }); avisar('Versión restaurada.'); setTimeout(() => location.reload(), 600); }
          catch (e) { avisar(e.message, 'error'); }
        } }))) : [h('p', { class: 'cgp-suave', text: 'Todavía no hay versiones guardadas.' })]));
    } catch (e) { caja.replaceChildren(h('p', { class: 'cgp-error', text: e.message })); }
  }

  /* ── Arranque ────────────────────────────────────────────── */
  window.__cgPanel = {
    abrir(desdeTeclado) {
      if (sesion) { if (desdeTeclado) abrir(); return; }
      ventanaEntrar();
    },
  };

  (async () => {
    config = await llamar('config').catch(() => config);
    try { sesion = await llamar('sesion'); } catch { sesion = null; }
    if (sesion) await iniciarPanel(!!window.__cgAbrir).catch(e => console.error(e));
    else if (window.__cgAbrir) ventanaEntrar();
  })();
})();
