/**
 * Servidor de la web de Casa Grande (Cloudflare Worker).
 *
 * La web sigue siendo la misma de archivos estáticos. Este servidor se pone
 * delante para que el panel administrativo pueda cambiarla sin tocar código:
 *
 *  · Guarda en Cloudflare KV lo que se edita en el panel (proyectos, textos,
 *    fotos, contacto) y lo aplica a cada página al servirla.
 *  · Arma la página de cada proyecto, también la de los proyectos nuevos.
 *  · Solo deja editar a los correos autorizados, que entran con Google.
 *
 * Si el panel nunca se usó, todo sale tal cual está en los archivos.
 */
import SEMILLA from './semilla.json';
import {
  esc, textoRico, visibles, tarjetas, opcionesBuscador, datosProyectos,
  opcionesFormulario, galeriaFamilias, paginaProyecto,
} from './marcado.js';

const CLAVE_CONTENIDO = 'contenido';
const MAX_HISTORIAL = 30;
const MAX_ARCHIVO = 25 * 1024 * 1024;        // límite de un valor en KV
const DURACION_SESION = 12 * 60 * 60;          // 12 horas
const VERSION_PANEL = '20261105-1';
/* Direcciones que no pueden usarse como nombre de un proyecto nuevo. */
const RESERVADAS = new Set(['', 'index', 'proyectos', 'familias', 'somos', 'contacto', 'terminos',
  'politica-privacidad', 'libro-reclamaciones', 'refiere', 'ruleta', 'ruleta-app', '404', 'admin',
  'api', 'media', 'img', 'worker', 'herramientas']);

/* ── Contenido ───────────────────────────────────────────────── */

let enMemoria = null, leidoEn = 0;

async function leerContenido(env) {
  if (enMemoria && Date.now() - leidoEn < 5000) return enMemoria;
  const guardado = env.CMS ? await env.CMS.get(CLAVE_CONTENIDO, 'json') : null;
  enMemoria = completar(guardado || structuredClone(SEMILLA));
  leidoEn = Date.now();
  return enMemoria;
}

/** Rellena lo que falte con lo de fábrica (por si se agregan campos nuevos). */
function completar(c) {
  c.proyectos ||= structuredClone(SEMILLA.proyectos);
  c.familias ||= structuredClone(SEMILLA.familias);
  c.contacto = { ...SEMILLA.contacto, ...(c.contacto || {}) };
  c.textos ||= {};
  c.imagenes ||= {};
  c.version ||= 1;
  return c;
}

/* ── Sesión ──────────────────────────────────────────────────── */

const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const desdeB64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

async function firma(env, texto) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(texto)));
}

async function crearSesion(env, email) {
  const datos = b64url(new TextEncoder().encode(JSON.stringify({ e: email, x: Math.floor(Date.now() / 1000) + DURACION_SESION })));
  return `${datos}.${await firma(env, datos)}`;
}

async function sesionDe(request, env) {
  if (!env.SESSION_SECRET) return null;
  const m = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)cg_sesion=([^;]+)/);
  if (!m) return null;
  const [datos, f] = m[1].split('.');
  if (!datos || !f || f !== await firma(env, datos)) return null;
  try {
    const s = JSON.parse(new TextDecoder().decode(desdeB64url(datos)));
    if (s.x < Date.now() / 1000 || !autorizados(env).includes(s.e)) return null;
    return { email: s.e };
  } catch { return null; }
}

const autorizados = env => String(env.ADMINS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

function cookiesSesion(valor, maxAge) {
  return [
    `cg_sesion=${valor}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`,
    // Esta la lee la página solo para saber que tiene que cargar la barra del panel.
    `cg_admin=${maxAge ? 1 : ''}; Path=/; Secure; SameSite=Lax; Max-Age=${maxAge}`,
  ];
}

/** Comprueba con Google el token de "Iniciar sesión con Google". */
async function verificarGoogle(env, credencial) {
  const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credencial));
  if (!r.ok) return null;
  const t = await r.json();
  const ok = t.aud === env.GOOGLE_CLIENT_ID
    && ['accounts.google.com', 'https://accounts.google.com'].includes(t.iss)
    && String(t.email_verified) === 'true'
    && Number(t.exp) > Date.now() / 1000;
  return ok ? String(t.email).toLowerCase() : null;
}

/* ── Respuestas ──────────────────────────────────────────────── */

const json = (datos, status = 200, extra = {}) => {
  const h = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  return new Response(JSON.stringify(datos), { status, headers: h });
};

function conCookies(resp, cookies) {
  cookies.forEach(c => resp.headers.append('Set-Cookie', c));
  return resp;
}

/* ── API del panel ───────────────────────────────────────────── */

async function api(request, env, url) {
  const ruta = url.pathname.replace(/^\/api\/admin\/?/, '');
  const metodo = request.method;

  if (ruta === 'config' && metodo === 'GET') {
    return json({ clientId: env.GOOGLE_CLIENT_ID || '', pruebas: env.DEV_LOGIN === '1' });
  }

  // Todo lo que cambia algo exige esta cabecera: una página ajena no puede
  // mandarla sin permiso del navegador, así nadie actúa en nombre del admin.
  if (metodo !== 'GET' && request.headers.get('X-CG-Admin') !== '1') return json({ error: 'Solicitud no permitida' }, 403);

  if (ruta === 'entrar' && metodo === 'POST') {
    const { credencial, email: emailPrueba } = await request.json().catch(() => ({}));
    let email = null;
    if (env.DEV_LOGIN === '1' && emailPrueba) email = String(emailPrueba).toLowerCase();   // solo en la computadora de pruebas
    else if (credencial && env.GOOGLE_CLIENT_ID) email = await verificarGoogle(env, credencial);
    if (!email) return json({ error: 'No se pudo comprobar la cuenta de Google.' }, 401);
    if (!autorizados(env).includes(email)) return json({ error: `La cuenta ${email} no tiene permiso para editar la web.` }, 403);
    return conCookies(json({ ok: true, email }), cookiesSesion(await crearSesion(env, email), DURACION_SESION));
  }

  if (ruta === 'salir' && metodo === 'POST') return conCookies(json({ ok: true }), cookiesSesion('', 0));

  const sesion = await sesionDe(request, env);
  if (!sesion) return json({ error: 'Inicia sesión para continuar.' }, 401);

  if (ruta === 'sesion') return json({ email: sesion.email });

  if (ruta === 'contenido' && metodo === 'GET') {
    enMemoria = null;
    return json(await leerContenido(env));
  }

  if (ruta === 'contenido' && metodo === 'PUT') {
    const { contenido, base } = await request.json().catch(() => ({}));
    const actual = await leerContenido(env);
    if (Number(base) !== Number(actual.version)) {
      return json({ error: 'Alguien más guardó cambios mientras editabas. Recarga la página para ver la versión nueva.' }, 409);
    }
    const problema = validar(contenido);
    if (problema) return json({ error: problema }, 400);
    const nuevo = completar(contenido);
    nuevo.version = actual.version + 1;
    nuevo.guardadoPor = sesion.email;
    nuevo.guardadoEl = new Date().toISOString();
    // Antes de pisar, se guarda la versión anterior en el historial.
    await env.CMS.put(`historial:${String(Date.now()).padStart(15, '0')}`, JSON.stringify(actual), {
      metadata: { version: actual.version, por: actual.guardadoPor || 'versión original', el: actual.guardadoEl || '' },
    });
    await env.CMS.put(CLAVE_CONTENIDO, JSON.stringify(nuevo));
    enMemoria = nuevo; leidoEn = Date.now();
    await podarHistorial(env);
    return json({ ok: true, version: nuevo.version });
  }

  if (ruta === 'historial' && metodo === 'GET') {
    const lista = await env.CMS.list({ prefix: 'historial:' });
    return json(lista.keys.map(k => ({ id: k.name, ...k.metadata })).reverse());
  }

  if (ruta === 'restaurar' && metodo === 'POST') {
    const { id } = await request.json().catch(() => ({}));
    if (!String(id).startsWith('historial:')) return json({ error: 'Versión no válida' }, 400);
    const anterior = await env.CMS.get(id, 'json');
    if (!anterior) return json({ error: 'Esa versión ya no existe.' }, 404);
    const actual = await leerContenido(env);
    await env.CMS.put(`historial:${String(Date.now()).padStart(15, '0')}`, JSON.stringify(actual), {
      metadata: { version: actual.version, por: actual.guardadoPor || 'versión original', el: actual.guardadoEl || '' },
    });
    const nuevo = completar({ ...anterior, version: actual.version + 1, guardadoPor: sesion.email, guardadoEl: new Date().toISOString() });
    await env.CMS.put(CLAVE_CONTENIDO, JSON.stringify(nuevo));
    enMemoria = nuevo; leidoEn = Date.now();
    await podarHistorial(env);
    return json({ ok: true, version: nuevo.version });
  }

  if (ruta === 'subir' && metodo === 'POST') {
    const tipo = (request.headers.get('Content-Type') || '').split(';')[0];
    if (!/^(image\/(jpeg|png|webp|gif|svg\+xml)|video\/(mp4|webm|quicktime))$/.test(tipo)) {
      return json({ error: 'Solo se pueden subir fotos (JPG, PNG, WebP) o videos (MP4).' }, 400);
    }
    const cuerpo = await request.arrayBuffer();
    if (cuerpo.byteLength > MAX_ARCHIVO) return json({ error: 'El archivo pesa más de 25 MB. Comprime el video o súbelo a YouTube.' }, 413);
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' }[tipo];
    const id = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    await env.CMS.put(`media:${id}`, cuerpo, { metadata: { tipo, por: sesion.email, nombre: (request.headers.get('X-Nombre') || '').slice(0, 120) } });
    return json({ url: `/media/${id}` });
  }

  return json({ error: 'No encontrado' }, 404);
}

async function podarHistorial(env) {
  const lista = await env.CMS.list({ prefix: 'historial:' });
  const sobran = lista.keys.slice(0, Math.max(0, lista.keys.length - MAX_HISTORIAL));
  await Promise.all(sobran.map(k => env.CMS.delete(k.name)));
}

function validar(c) {
  if (!c || typeof c !== 'object') return 'Datos vacíos.';
  if (!Array.isArray(c.proyectos)) return 'Falta la lista de proyectos.';
  const slugs = new Set(), keys = new Set();
  for (const p of c.proyectos) {
    if (!p.name || !String(p.name).trim()) return 'Hay un proyecto sin nombre.';
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug || '')) return `La dirección de "${p.name}" solo puede tener letras minúsculas, números y guiones.`;
    if (RESERVADAS.has(p.slug)) return `La dirección "${p.slug}" ya la usa otra página de la web. Elige otra.`;
    if (slugs.has(p.slug)) return `Dos proyectos tienen la misma dirección: ${p.slug}.`;
    if (keys.has(p.key)) return 'Dos proyectos tienen la misma clave interna.';
    slugs.add(p.slug); keys.add(p.key);
  }
  if (JSON.stringify(c).length > 5 * 1024 * 1024) return 'El contenido es demasiado grande.';
  return null;
}

/* ── Archivos subidos ────────────────────────────────────────── */

async function servirMedia(request, env, id) {
  const { value, metadata } = await env.CMS.getWithMetadata(`media:${id}`, 'arrayBuffer');
  if (!value) return new Response('No encontrado', { status: 404 });
  const h = new Headers({
    'Content-Type': metadata?.tipo || 'application/octet-stream',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Accept-Ranges': 'bytes',
  });
  // Safari pide los videos por partes: sin esto no los reproduce.
  const rango = request.headers.get('Range')?.match(/bytes=(\d*)-(\d*)/);
  if (rango) {
    const total = value.byteLength;
    const ini = rango[1] ? Number(rango[1]) : total - Number(rango[2]);
    const fin = rango[1] && rango[2] ? Math.min(Number(rango[2]), total - 1) : total - 1;
    h.set('Content-Range', `bytes ${ini}-${fin}/${total}`);
    return new Response(value.slice(ini, fin + 1), { status: 206, headers: h });
  }
  return new Response(value, { headers: h });
}

/* ── Páginas ─────────────────────────────────────────────────── */

/** El script que abre el panel con Ctrl + E. No carga nada más hasta entonces. */
const CARGADOR = `<script>(()=>{const v='${VERSION_PANEL}';const abrir=a=>{window.__cgAbrir=a||window.__cgAbrir;if(window.__cgPanel)return window.__cgPanel.abrir(a);if(document.getElementById('cg-panel-js'))return;const l=document.createElement('link');l.rel='stylesheet';l.href='/admin/panel.css?v='+v;document.head.appendChild(l);const s=document.createElement('script');s.id='cg-panel-js';s.src='/admin/panel.js?v='+v;document.head.appendChild(s)};addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==='e'){e.preventDefault();abrir(true)}});if(/(^|;\\s*)cg_admin=1/.test(document.cookie))abrir(false)})();</script>`;

function reemplazosContacto(c) {
  const d = SEMILLA.contacto, pares = [];
  const par = (a, b) => { if (a && b && a !== b) pares.push([a, b]); };
  par(d.whatsapp, String(c.whatsapp || '').replace(/\D/g, ''));
  par(d.telefono, c.telefono);
  par(d.correo, c.correo);
  par(d.facebook, c.facebook); par(d.instagram, c.instagram); par(d.tiktok, c.tiktok);
  par(d.dias, c.dias); par(d.horas, c.horas);
  par(d.direccion, c.direccion);
  par('Av.+Nicol%C3%A1s+de+Pi%C3%A9rola+690+Chiclayo', encodeURIComponent(`${c.direccion} ${String(c.ciudad || '').split(',')[0]}`).replace(/%20/g, '+'));
  return pares;
}

const aplicarReemplazos = (texto, pares) => pares.reduce((t, [a, b]) => t.split(a).join(b), texto);

function reescribir(resp, datos, proyecto) {
  const nProyectos = visibles(datos).length;
  let r = new HTMLRewriter()
    .on('[data-cms]', { element(el) { const v = datos.textos[el.getAttribute('data-cms')]; if (v != null) el.setInnerContent(textoRico(v), { html: true }); } })
    .on('[data-cms-img]', { element(el) { const v = datos.imagenes[el.getAttribute('data-cms-img')]; if (v?.src) { el.setAttribute('src', v.src); el.removeAttribute('srcset'); if (v.alt) el.setAttribute('alt', v.alt); } } })
    .on('[data-cms-cuenta="proyectos"]', { element(el) { el.setInnerContent(String(nProyectos).padStart(2, '0')); } })
    .on('.project-cards', { element(el) {
      el.setInnerContent(tarjetas(datos), { html: true });
      // Con tres o más proyectos, van de tres en tres por fila (ver redesign.css).
      if (nProyectos >= 3) el.setAttribute('class', el.getAttribute('class') + ' project-cards--tres');
    } })
    .on('[data-finder-choices]', { element(el) { el.setInnerContent(opcionesBuscador(datos), { html: true }); } })
    .on('script#project-data', { element(el) { el.setInnerContent(datosProyectos(datos), { html: true }); } })
    .on('form[data-consult-form] select[name="proyecto"]', { element(el) { el.setInnerContent(opcionesFormulario(datos), { html: true }); } })
    // El Libro de Reclamaciones tiene su propia lista (empieza en "No corresponde").
    .on('select#proyecto', { element(el) { el.setInnerContent('<option value="">No corresponde</option>' + visibles(datos).map(p => `<option value="${esc(p.opcionFormulario || p.name)}">${esc(p.opcionFormulario || p.name)}</option>`).join(''), { html: true }); } })
    .on('.wa-chat__message', { element(el) { el.setInnerContent(textoRico(datos.contacto.mensajeChat), { html: true }); } })
    .on('.gallery-widget--family', { element(el) { if (datos.familias?.length) el.replace(galeriaFamilias(datos.familias), { html: true }); } })
    .on('body', { element(el) { el.append(CARGADOR, { html: true }); } });

  if (proyecto) {
    const titulo = `${proyecto.name} | Casa Grande Inmobiliaria`;
    const direccion = `https://inmobiliariacasagrande.com/${proyecto.slug}`;
    r = r
      .on('title', { element(el) { el.setInnerContent(titulo); } })
      .on('meta[name="description"], meta[property="og:description"]', { element(el) { el.setAttribute('content', proyecto.desc || ''); } })
      .on('meta[property="og:title"]', { element(el) { el.setAttribute('content', titulo); } })
      .on('meta[property="og:url"]', { element(el) { el.setAttribute('content', direccion); } })
      .on('link[rel="canonical"]', { element(el) { el.setAttribute('href', direccion); } })
      .on('body', { element(el) { el.setAttribute('data-page', proyecto.slug); el.setAttribute('data-plantilla', 'proyecto'); } })
      .on('main', { element(el) { el.replace(paginaProyecto(proyecto), { html: true }); } });
  }
  return r.transform(resp);
}

async function pagina(request, env, url) {
  const datos = await leerContenido(env);
  const nombre = decodeURIComponent(url.pathname).replace(/^\/+|\/+$/g, '').replace(/\.html$/, '');
  let proyecto = (datos.proyectos || []).find(p => p.slug === nombre && p.visible !== false) || null;

  // La dirección vieja de un proyecto al que se le cambió el nombre.
  if (!proyecto) {
    const viejo = (datos.proyectos || []).find(p => p.rutaOriginal === nombre);
    if (viejo && viejo.visible !== false && viejo.slug !== nombre) return Response.redirect(`${url.origin}/${viejo.slug}`, 301);
    if (viejo && viejo.visible === false) return noEncontrada(request, env, datos);
    // Un proyecto oculto no se ve aunque alguien tenga el enlace.
    if ((datos.proyectos || []).some(p => p.slug === nombre)) return noEncontrada(request, env, datos);
  }

  let resp;
  if (proyecto) {
    // Todas las páginas de proyecto salen de la misma plantilla.
    resp = await env.ASSETS.fetch(new Request(`${url.origin}/alameda-real`, request));
  } else {
    resp = await env.ASSETS.fetch(request);
  }
  if (resp.status === 404) return noEncontrada(request, env, datos);
  if (!(resp.headers.get('Content-Type') || '').includes('text/html')) return resp;

  const transformada = reescribir(new Response(resp.body, resp), datos, proyecto);
  let html = await transformada.text();
  const pares = reemplazosContacto(datos.contacto);
  if (pares.length) html = aplicarReemplazos(html, pares);
  const h = new Headers(resp.headers);
  h.set('Cache-Control', 'public, max-age=0, must-revalidate');
  h.delete('ETag'); h.delete('Content-Length');
  return new Response(html, { status: resp.status, headers: h });
}

async function noEncontrada(request, env, datos) {
  const r = await env.ASSETS.fetch(new Request(new URL('/404.html', request.url), { method: 'GET' }));
  return new Response(r.body, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

/* ── Entrada ─────────────────────────────────────────────────── */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ruta = url.pathname;

    if (ruta.startsWith('/api/admin/')) {
      try { return await api(request, env, url); }
      catch (e) { return json({ error: 'Error del servidor: ' + (e?.message || e) }, 500); }
    }
    if (ruta.startsWith('/media/')) return servirMedia(request, env, ruta.slice(7));

    // El código del servidor y las herramientas no se publican.
    if (/^\/(worker|herramientas)(\/|$)/.test(ruta) || /^\/(wrangler\.toml|\.assetsignore|\.dev\.vars)$/.test(ruta)) {
      return noEncontrada(request, env, null);
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') return env.ASSETS.fetch(request);

    // Los scripts con el número de WhatsApp también se ajustan al de Contacto.
    if (ruta === '/redesign.js') {
      const resp = await env.ASSETS.fetch(request);
      const pares = reemplazosContacto((await leerContenido(env)).contacto);
      if (!pares.length || !resp.ok) return resp;
      const h = new Headers(resp.headers); h.delete('ETag'); h.delete('Content-Length');
      return new Response(aplicarReemplazos(await resp.text(), pares), { status: resp.status, headers: h });
    }

    const ext = ruta.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
    if (ext && ext !== 'html') return env.ASSETS.fetch(request);
    return pagina(request, env, url);
  },
};
