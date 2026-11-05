/**
 * Marcado que se arma con los datos del panel: tarjetas de proyectos, el
 * buscador, la página de cada proyecto y la galería de Familias.
 *
 * Reproduce exactamente el HTML que tenía la web escrito a mano, para que el
 * diseño no cambie: solo cambia de dónde salen los textos y las fotos.
 */

const FLECHA = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14" stroke="currentColor" stroke-width="1.6"/></svg>';
const CHEQUE = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke="currentColor" stroke-width="1.7"/></svg>';
const PIN = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5"/></svg>';
const SIGUIENTE = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 5 7 7-7 7" stroke="currentColor" stroke-width="1.6"/></svg>';
const PAUSA = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 5v14M15 5v14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

/** Texto plano dentro de HTML. */
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Texto con formato mínimo: solo saltos de línea, negrita y cursiva. Todo lo
 * demás se escapa, para que un texto pegado no rompa el diseño ni meta código.
 */
export function textoRico(v) {
  return esc(v)
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
    .replace(/&lt;(\/?)(strong|em|b|i)&gt;/gi, '<$1$2>')
    .replace(/\n/g, '<br>');
}

/** JSON dentro de un <script>: que nunca pueda cerrar la etiqueta. */
const jsonSeguro = v => JSON.stringify(v).replace(/</g, '\\u003c');

/** Proporción de un video para el reproductor (1920x1080 → 16/9). */
function proporcion(w, h) {
  if (!w || !h) return '16/9';
  const mcd = (a, b) => (b ? mcd(b, a % b) : a);
  const d = mcd(w, h);
  return `${w / d}/${h / d}`;
}

export const visibles = datos => (datos.proyectos || []).filter(p => p.visible !== false);

/* ── Tarjetas (Inicio y Proyectos) ───────────────────────────── */

export function tarjetas(datos) {
  return visibles(datos).map(p => `<article class="project-card" data-reveal><a href="${esc(p.rutaOriginal === p.slug ? p.slug + '.html' : '/' + p.slug)}" class="project-card-link"><div class="project-card-image project-image--${esc(p.key)}"><img src="${esc(p.cover)}" alt="Render referencial de ${esc(p.name)}" loading="lazy" width="1672" height="941"><span class="location-label">${PIN}${esc(p.city)}</span><span class="image-note">Render referencial</span></div><div class="project-card-copy"><div><h3>${esc(p.name)}</h3><p>${esc(p.tagline)}</p></div>${p.logo ? `<img class="project-logo" src="${esc(p.logo)}" alt="Logotipo de ${esc(p.name)}" loading="lazy">` : ''}</div><div class="project-card-foot"><span>${esc(p.resumen)}</span><span class="project-card-cta">Conocer el proyecto ${FLECHA}</span></div></a></article>`).join('');
}

/* ── Buscador "¿Dónde imaginas tu próximo paso?" ─────────────── */

export function opcionesBuscador(datos) {
  return visibles(datos).map(p => `<button class="finder-choice" data-finder="${esc(p.key)}"><span class="finder-choice-photo"><img src="${esc(p.cover)}" alt="" loading="lazy"></span><span><small>${esc(p.city)}</small><strong>${esc(p.name)}</strong></span>${FLECHA}</button>`).join('')
    + `<button class="finder-help" data-finder="help">Todavía no lo sé. Quiero asesoría ${FLECHA}</button>`;
}

/** Los datos que lee redesign.js (buscador). */
export function datosProyectos(datos) {
  return jsonSeguro(visibles(datos).map(p => ({
    key: p.key, slug: p.slug, name: p.name, city: p.city, region: p.region, logo: p.logo, cover: p.cover,
    tagline: p.tagline, desc: p.desc, facts: p.facts, benefits: p.benefits,
    photos: (p.photos || []).map(f => ({ src: f.src, alt: f.alt, caption: f.caption, event: !!f.event, render: !!f.render })),
  })));
}

/** Las opciones de "¿Qué proyecto te interesa?" en los formularios. */
export function opcionesFormulario(datos) {
  return '<option value="">Quiero ayuda para elegir</option>'
    + visibles(datos).map(p => `<option>${esc(p.opcionFormulario || p.name)}</option>`).join('');
}

/* ── Galerías ────────────────────────────────────────────────── */

function galeria(p, compacta) {
  const fotos = (p.photos || []).map(f => ({ src: f.src, alt: f.alt, caption: f.caption, event: !!f.event, render: !!f.render }));
  const primera = fotos[0];
  if (!primera) return '';
  return `<section class="gallery-widget ${compacta ? 'gallery-widget--compact' : ''} " data-gallery data-gallery-interval="2000" aria-label="Fotografías de ${esc(p.name)}" aria-roledescription="carrusel"><script type="application/json" class="gallery-data">${jsonSeguro(fotos)}</script><div class="gallery-stage"><button class="gallery-open" data-gallery-open aria-label="Ampliar fotografía: ${esc(primera.caption)}"><span class="carousel-image ${primera.event ? 'is-event' : ''} ${primera.render ? 'is-render' : ''}"><img src="${esc(primera.src)}" alt="${esc(primera.alt)}" decoding="async" loading="lazy"></span><span class="gallery-zoom">${FLECHA}<span>Ampliar</span></span></button><button class="gallery-prev icon-button" data-gallery-prev aria-label="Imagen anterior" disabled>${SIGUIENTE}</button><button class="gallery-next icon-button" data-gallery-next aria-label="Imagen siguiente"${fotos.length < 2 ? ' disabled' : ''}>${SIGUIENTE}</button><button class="gallery-autoplay" type="button" data-gallery-autoplay aria-label="Pausar carrusel" aria-pressed="false">${PAUSA}</button></div><p class="image-disclaimer gallery-disclaimer">Los renders son visualizaciones referenciales. Consulta disponibilidad, documentación y condiciones vigentes con nuestro equipo.</p></section>`;
}

export function galeriaFamilias(fotos) {
  const lista = (fotos || []).map(f => ({ src: f.src, alt: f.alt, caption: f.caption || f.alt, event: false, render: false, crop: f.crop || { zoom: 1, x: 50, y: 50 } }));
  const primera = lista[0];
  if (!primera) return '';
  const c = primera.crop;
  return `<section class="gallery-widget  gallery-widget--family" data-gallery data-gallery-interval="2500" aria-label="Fotografías de Familias Casa Grande" aria-roledescription="carrusel"><script type="application/json" class="gallery-data">${jsonSeguro(lista)}</script><div class="gallery-stage"><button class="gallery-open" data-gallery-open aria-label="Ampliar fotografía: ${esc(primera.caption)}"><span class="carousel-image  "><img src="${esc(primera.src)}" alt="${esc(primera.alt)}" style="--family-zoom:${c.zoom ?? 1};--family-focus-x:${c.x ?? 50}%;--family-focus-y:${c.y ?? 50}%" decoding="async" loading="lazy"></span><span class="gallery-zoom">${FLECHA}<span>Ampliar</span></span></button><button class="gallery-prev icon-button" data-gallery-prev aria-label="Imagen anterior" disabled>${SIGUIENTE}</button><button class="gallery-next icon-button" data-gallery-next aria-label="Imagen siguiente">${SIGUIENTE}</button><button class="gallery-autoplay" type="button" data-gallery-autoplay aria-label="Pausar carrusel" aria-pressed="false">${PAUSA}</button></div><div class="gallery-thumbs gallery-thumbs--vertical" data-orientation="vertical" role="group" aria-label="Seleccionar fotografía de Familias">${lista.map((f, i) => `<button class="gallery-thumb" data-gallery-go="${i}" aria-label="Ver fotografía ${i + 1}: ${esc(f.caption)}" aria-current="${i === 0}"><img src="${esc(f.src)}" alt="" loading="lazy"></button>`).join('')}</div></section>`;
}

/* ── Página de un proyecto ───────────────────────────────────── */

function bloqueVideo(p) {
  const v = p.videos[0];
  return `<div class="project-video-player" data-project-video-player style="--project-video-ratio:${proporcion(v.width, v.height)}"><video class="project-video" controls autoplay muted playsinline preload="metadata" width="${v.width || 1920}" height="${v.height || 1080}" src="${esc(v.src)}"${v.poster ? ` poster="${esc(v.poster)}"` : ''} aria-label="${esc(v.label)}"></video>${p.videos.length > 1 ? `<div class="project-video-picker" role="group" aria-label="Elegir video de ${esc(p.name)}">${p.videos.map((x, i) => `<button type="button" data-project-video-src="${esc(x.src)}" data-video-width="${x.width || 1920}" data-video-height="${x.height || 1080}"${x.poster ? ` data-video-poster="${esc(x.poster)}"` : ''} data-video-label="${esc(x.label)}"${x.muted ? ' data-video-muted' : ''} aria-pressed="${i === 0}"><span>${String(i + 1).padStart(2, '0')}</span>${esc(x.boton)}</button>`).join('')}</div>` : ''}</div>`;
}

function imagenUbicacion(u) {
  return `<button class="location-image" data-single-photo="${esc(u.imagen)}" data-photo-alt="${esc(u.fotoAlt || u.imagenAlt)}" aria-label="${esc(u.aria || 'Ampliar imagen de ubicación')}"><img src="${esc(u.imagen)}" alt="${esc(u.imagenAlt)}"${u.ancho && u.alto ? ` width="${u.ancho}" height="${u.alto}"` : ''} loading="lazy"><span>${FLECHA} ${esc(u.boton || 'Ampliar imagen')}</span></button>`;
}

const enlaceMapa = u => u.mapa ? `<a class="text-link" href="${esc(u.mapa)}" target="_blank" rel="noopener">Abrir en Google Maps ${FLECHA}</a>` : '';

export function paginaProyecto(p) {
  const u = p.ubicacion || {};
  const lugar = `${p.city}, ${p.region || 'Lambayeque'}`;
  const conVideo = (p.videos || []).length > 0;
  const lado = conVideo
    ? `<aside class="project-side"><div class="location-heading"><h3>Conoce el proyecto</h3><p>${esc(lugar)}</p></div>${bloqueVideo(p)}<button class="text-link" data-activate-tab="location">Conocer la ubicación ${FLECHA}</button></aside>`
    : `<aside class="project-side"><div class="location-heading"><h3>Ubicación</h3><p>${esc(lugar)}</p></div>${u.imagen ? imagenUbicacion(u) : ''}${enlaceMapa(u)}</aside>`;
  const consulta = texto => `<button class="button button-blue" data-contact data-selected-project="${esc(p.name)}">${texto} ${FLECHA}</button>`;

  return `<main id="contenido"><section class="project-page-head section-tint"><div class="shell"><div class="breadcrumbs"><a href="index.html">Inicio</a><span>/</span><a href="proyectos.html">Proyectos</a><span>/</span><span>${esc(p.name)}</span></div><div class="project-head-main"><div><span class="eyebrow" data-reveal>${esc(String(p.city).toUpperCase())} · ${esc(p.tipo || 'LOTES EN VENTA')}</span><h1 data-reveal>${esc(p.name)}</h1><p data-reveal>${esc(p.desc)}</p></div>${p.logo ? `<img class="project-page-logo" src="${esc(p.logo)}" alt="Logotipo de ${esc(p.name)}">` : ''}</div><div class="project-facts" data-reveal>${(p.facts || []).map(([v, l]) => `<div><strong>${esc(v)}</strong><span>${esc(l)}</span></div>`).join('')}${consulta('Consultar proyecto')}</div></div></section>
 <section class="project-workspace"><div class="shell"><div class="project-tabs" role="tablist" aria-label="Información de ${esc(p.name)}"><button role="tab" id="tab-summary" aria-controls="panel-summary" aria-selected="true" tabindex="0" data-tab="summary">El proyecto</button><button role="tab" id="tab-gallery" aria-controls="panel-gallery" aria-selected="false" tabindex="-1" data-tab="gallery">Galería</button><button role="tab" id="tab-location" aria-controls="panel-location" aria-selected="false" tabindex="-1" data-tab="location">Ubicación</button><button role="tab" id="tab-visit" aria-controls="panel-visit" aria-selected="false" tabindex="-1" data-tab="visit">Tu visita</button></div><section class="project-tab-panel" id="panel-summary" role="tabpanel" aria-labelledby="tab-summary"><div class="project-overview"><div class="project-benefits"><h2 class="project-section-title">Beneficios</h2><ul class="benefit-list">${(p.benefits || []).map(b => `<li>${CHEQUE}<span>${esc(b)}</span></li>`).join('')}</ul>${galeria(p, true)}</div>${lado}</div></section>
 <section class="project-tab-panel" id="panel-gallery" role="tabpanel" aria-labelledby="tab-gallery" hidden><header class="panel-heading"><div><span class="eyebrow">MIRA MÁS DE CERCA</span><h2>Explora ${esc(p.name)}.</h2></div><p>Renders referenciales y fotografías del proyecto.<br>Selecciona una imagen para ampliarla.</p></header>${galeria(p, false)}</section>
 <section class="project-tab-panel" id="panel-location" role="tabpanel" aria-labelledby="tab-location" hidden><div class="location-panel"><div class="location-heading">${u.eyebrow ? `<span class="eyebrow">${esc(u.eyebrow)}</span>` : ''}<h3>${textoRico(u.titulo || 'Ubicación')}</h3>${u.subtitulo ? `<p>${esc(u.subtitulo)}</p>` : ''}</div>${u.imagen ? imagenUbicacion(u) : ''}${enlaceMapa(u)}<div class="location-facts">${(u.parrafos || []).map(t => `<p>${textoRico(t)}</p>`).join('')}</div>${consulta('Quiero conocer el proyecto')}</div></section>
 <section class="project-tab-panel" id="panel-visit" role="tabpanel" aria-labelledby="tab-visit" hidden><div class="visit-panel"><div><span class="eyebrow">CONÓCELO EN PERSONA</span><h2>El siguiente paso<br>es una visita.</h2><p>Te acompañamos para que conozcas el lugar, revises la información y resuelvas tus preguntas.</p>${consulta('Coordinar mi visita')}</div><ol><li><span>01</span><div><h3>Conversemos</h3><p>Cuéntanos qué te interesa y qué información necesitas.</p></div></li><li><span>02</span><div><h3>Coordinemos el recorrido</h3><p>Consulta con el equipo los horarios y la disponibilidad.</p></div></li><li><span>03</span><div><h3>Conoce el proyecto</h3><p>Recorre el lugar y revisa sus características.</p></div></li></ol></div></section>
 </div></section></main>`;
}
