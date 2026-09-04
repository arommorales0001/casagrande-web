/* ═══════════════════════════════════════════════════════════
   INMOBILIARIA CASA GRANDE — interacciones
   JavaScript puro, sin librerías.
   ═══════════════════════════════════════════════════════════ */

/* NÚMERO DE WHATSAPP
   Es el que abren todos los botones de WhatsApp y el formulario de cotizar.
   Para cambiarlo, edita solo esta línea: formato internacional, sin +, sin
   espacios. Perú = 51.                                                       */
const WHATSAPP = '51986498284';

const MENSAJE_BASE =
  '¡Hola! 👋 Estoy interesado(a) en conocer los proyectos de Inmobiliaria Casa Grande. ' +
  'Me gustaría recibir información sobre los lotes disponibles, precios, formas de ' +
  'financiamiento y agendar una asesoría personalizada. ¡Quedo atento(a)!';

const enlaceWA = (texto) => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`;

// Todos los botones marcados con data-wa abren WhatsApp con el mensaje base
document.querySelectorAll('[data-wa]').forEach(el => {
  el.setAttribute('href', enlaceWA(MENSAJE_BASE));
  el.setAttribute('target', '_blank');
  el.setAttribute('rel', 'noopener');
});

const menosMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Alto de la ventana. Algunos navegadores incrustados devuelven 0 en
   window.innerHeight; por eso probamos tres fuentes antes de rendirnos. */
const alto = () =>
  window.innerHeight ||
  document.documentElement.clientHeight ||
  800;

/* ───────────────────────────────────────────────
   1. EFECTO DE ENTRADA: partir el título en palabras
   Cada palabra queda dentro de <span class="w"><i>palabra</i></span>
   para poder deslizarla desde el costado.
─────────────────────────────────────────────── */
function partirEnPalabras(elemento) {
  // Recorremos los nodos hijos para no perder el <em> dorado
  [...elemento.childNodes].forEach(nodo => {
    if (nodo.nodeType === Node.TEXT_NODE) {
      const palabras = nodo.textContent.split(/\s+/).filter(Boolean);
      if (!palabras.length) { nodo.remove(); return; }
      const frag = document.createDocumentFragment();
      palabras.forEach(pal => {
        const caja = document.createElement('span');
        caja.className = 'w';
        const inner = document.createElement('i');
        inner.textContent = pal;
        caja.appendChild(inner);
        frag.appendChild(caja);
        frag.appendChild(document.createTextNode(' '));
      });
      nodo.replaceWith(frag);
    } else if (nodo.nodeType === Node.ELEMENT_NODE) {
      partirEnPalabras(nodo);            // entra al <em>
    }
  });
}

document.querySelectorAll('[data-slide]').forEach(titulo => {
  partirEnPalabras(titulo);
  // Cada palabra entra 70 ms después de la anterior
  titulo.querySelectorAll('.w > i').forEach((i, n) => {
    i.style.transitionDelay = (n * 0.07) + 's';
  });
});

/* ───────────────────────────────────────────────
   2. PANTALLA DE CARGA
─────────────────────────────────────────────── */
const loader = document.getElementById('loader');
const barraCarga = loader.querySelector('.loader__bar span');
requestAnimationFrame(() => { barraCarga.style.width = '100%'; });

let cargaTerminada = false;
function terminarCarga() {
  if (cargaTerminada) return;
  cargaTerminada = true;
  loader.classList.add('done');
  setTimeout(() => { loader.style.display = 'none'; }, 1100);
  // El título de la portada arranca su animación al desaparecer el cargador
  const heroTitulo = document.querySelector('.hero [data-slide]');
  if (heroTitulo) heroTitulo.classList.add('is-in');
  document.querySelectorAll('.hero .fade').forEach(el => {
    el.style.transitionDelay = (parseFloat(el.dataset.delay || 0)) + 's';
    el.classList.add('is-in');
  });
}
// Se espera a que el logo termine de dibujarse (unos 1,9 s desde que abre)
addEventListener('load', () => {
  const falta = Math.max(500, 1950 - performance.now());
  setTimeout(terminarCarga, falta);
});
setTimeout(terminarCarga, 3200);   // tope de seguridad

/* ───────────────────────────────────────────────
   3. APARICIONES AL DESLIZAR
   Comprobamos posiciones en cada cuadro de scroll en lugar de usar
   IntersectionObserver: funciona igual en todos los navegadores y nunca
   deja un bloque invisible si algo falla.
─────────────────────────────────────────────── */
const SELECTOR_ANIM = '.fade, [data-slide], .framed';

function revelar() {
  const limite = alto() * 0.92;          // se activa al entrar 8 % en pantalla
  document.querySelectorAll(SELECTOR_ANIM).forEach(el => {
    if (el.classList.contains('is-in')) return;
    if (el.closest('.hero')) return;          // la portada la controla el cargador
    const r = el.getBoundingClientRect();
    if (r.height === 0 && r.width === 0) return;   // oculto (proyecto no activo)
    if (r.top < limite && r.bottom > 0) {
      const retraso = parseFloat(el.dataset.delay || 0);
      if (retraso) el.style.transitionDelay = retraso + 's';
      el.classList.add('is-in');
    }
  });
  contarVisibles();
}

// Repasamos unos segundos por si cambian las fuentes o el alto de la página
let repasos = 0;
const repaso = setInterval(() => {
  revelar();
  if (++repasos > 24) clearInterval(repaso);   // 12 segundos
}, 500);
addEventListener('load', revelar);

/* ───────────────────────────────────────────────
   4. PARALLAX SUAVE
─────────────────────────────────────────────── */
const capas = [...document.querySelectorAll('[data-par]')];
function moverParallax() {
  if (menosMovimiento) return;
  capas.forEach(img => {
    const r = img.parentElement.getBoundingClientRect();
    if (r.bottom < -150 || r.top > alto() + 150) return;
    const centro = r.top + r.height / 2 - alto() / 2;
    img.style.transform = `translate3d(0, ${(centro * -parseFloat(img.dataset.par)).toFixed(1)}px, 0)`;
  });
}

/* ───────────────────────────────────────────────
   5. CABECERA Y BARRA DE PROGRESO
─────────────────────────────────────────────── */
const header = document.getElementById('header');
const progreso = document.getElementById('progress');
let ultimoY = 0;

function alDeslizar() {
  const y = scrollY;
  header.classList.toggle('solid', y > 80);
  const bajando = y > ultimoY && y > alto() * 0.6;
  header.classList.toggle('up', bajando && !document.body.classList.contains('open'));
  ultimoY = y;
  const total = document.body.scrollHeight - alto();
  progreso.style.width = (total > 0 ? (y / total) * 100 : 0) + '%';

  marcarSeccion();
  botonArriba.classList.toggle('on', y > alto() * 1.2);
}

let enCola = false;
addEventListener('scroll', () => {
  if (enCola) return;
  enCola = true;
  requestAnimationFrame(() => { alDeslizar(); moverParallax(); revelar(); enCola = false; });
}, { passive: true });
addEventListener('resize', () => { moverParallax(); colocarTinta(); revelar(); });
moverParallax(); revelar();
// alDeslizar() se llama al final del archivo, cuando ya existen
// las constantes de navegación y del botón de volver arriba.

/* ───────────────────────────────────────────────
   5b. LIQUID GLASS: reflejo que sigue al puntero
   Guardamos la posición del cursor dentro de cada pieza de vidrio
   en las variables --mx y --my, y el CSS dibuja ahí el brillo.
─────────────────────────────────────────────── */
function activarVidrio(raiz = document) {
  raiz.querySelectorAll('.glass').forEach(el => {
    if (el.dataset.vidrio) return;          // no repetir si ya está activo
    el.dataset.vidrio = '1';

    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      el.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    }, { passive: true });

    // Al salir, el reflejo vuelve arriba al centro
    el.addEventListener('pointerleave', () => {
      el.style.setProperty('--mx', '50%');
      el.style.setProperty('--my', '0%');
    }, { passive: true });
  });
}
activarVidrio();

/* ───────────────────────────────────────────────
   6. CURSOR DORADO
─────────────────────────────────────────────── */
const cursor = document.getElementById('cursor');
const punteroFino = matchMedia('(hover: hover) and (pointer: fine)').matches;

if (punteroFino && !menosMovimiento) {
  let ratonX = innerWidth / 2, ratonY = innerHeight / 2, x = ratonX, y = ratonY;
  addEventListener('mousemove', e => { ratonX = e.clientX; ratonY = e.clientY; });
  (function seguir() {
    x += (ratonX - x) * 0.18;
    y += (ratonY - y) * 0.18;
    cursor.style.transform = `translate(${x - 13}px, ${y - 13}px)`;
    requestAnimationFrame(seguir);
  })();
  // Crece sobre cualquier cosa que se pueda pulsar
  document.querySelectorAll('a, button, .switch__b, .fq__q').forEach(el => {
    el.addEventListener('mouseenter', () => cursor.classList.add('big'));
    el.addEventListener('mouseleave', () => cursor.classList.remove('big'));
  });

  // Sobre las fotos se convierte en un disco dorado que dice "Ver"
  const etiqueta = document.getElementById('cursorLab');
  function cursorConEtiqueta(raiz = document) {
    raiz.querySelectorAll('.shot, .famcard').forEach(el => {
      if (el.dataset.cur) return;
      el.dataset.cur = '1';
      el.addEventListener('mouseenter', () => {
        etiqueta.textContent = 'Ver';
        cursor.classList.add('lab');
      });
      el.addEventListener('mouseleave', () => cursor.classList.remove('lab'));
    });
  }
  cursorConEtiqueta();
  window.cursorConEtiqueta = cursorConEtiqueta;
} else {
  cursor.style.display = 'none';
}

/* ───────────────────────────────────────────────
   6b. BOTONES MAGNÉTICOS
   El botón se acerca ligeramente al puntero cuando pasa cerca.
─────────────────────────────────────────────── */
if (punteroFino && !menosMovimiento) {
  document.querySelectorAll('.btn, .wafloat, .totop').forEach(btn => {
    btn.addEventListener('pointermove', e => {
      const r = btn.getBoundingClientRect();
      const dx = e.clientX - r.left - r.width / 2;
      const dy = e.clientY - r.top - r.height / 2;
      // Imán suave: se nota al usarlo, no salta a la vista
      btn.style.transform = `translate(${(dx * .09).toFixed(1)}px, ${(dy * .12).toFixed(1)}px)`;
    }, { passive: true });
    btn.addEventListener('pointerleave', () => { btn.style.transform = ''; });
  });
}

/* ───────────────────────────────────────────────
   6c. INCLINACIÓN 3D DE LAS TARJETAS
   Se inclinan hacia donde está el puntero, muy poco: 6 grados.
─────────────────────────────────────────────── */
function activarInclinacion(raiz = document) {
  if (!punteroFino || menosMovimiento) return;
  raiz.querySelectorAll('.spec, .shot').forEach(card => {
    if (card.dataset.tilt) return;
    card.dataset.tilt = '1';
    card.addEventListener('pointermove', e => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - .5;
      const py = (e.clientY - r.top) / r.height - .5;
      card.style.transform =
        `rotateY(${(px * 6).toFixed(2)}deg) rotateX(${(-py * 6).toFixed(2)}deg) translateY(-5px)`;
    }, { passive: true });
    card.addEventListener('pointerleave', () => { card.style.transform = ''; });
  });
}
activarInclinacion();

/* ───────────────────────────────────────────────
   6d. NAVEGACIÓN: marcar la sección en la que estás
─────────────────────────────────────────────── */
const enlacesNav = [...document.querySelectorAll('.nav__a')];
const secciones = enlacesNav
  .map(a => document.querySelector(a.getAttribute('href')))
  .filter(Boolean);

function marcarSeccion() {
  const linea = scrollY + alto() * 0.35;      // línea imaginaria a un tercio de pantalla
  let actual = -1;
  secciones.forEach((sec, i) => { if (sec.offsetTop <= linea) actual = i; });
  enlacesNav.forEach((a, i) => a.classList.toggle('activo', i === actual));
}

/* ───────────────────────────────────────────────
   6e. VOLVER ARRIBA
─────────────────────────────────────────────── */
const botonArriba = document.getElementById('toTop');
botonArriba.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));

/* ───────────────────────────────────────────────
   7. MENÚ MÓVIL
─────────────────────────────────────────────── */
const burger = document.getElementById('burger');
burger.addEventListener('click', () => {
  const abierto = document.body.classList.toggle('open');
  document.body.style.overflow = abierto ? 'hidden' : '';
  burger.setAttribute('aria-label', abierto ? 'Cerrar menú' : 'Abrir menú');
});
document.querySelectorAll('.drawer a').forEach(a => {
  a.addEventListener('click', () => {
    document.body.classList.remove('open');
    document.body.style.overflow = '';
  });
});

/* ───────────────────────────────────────────────
   8. CONTADORES
   Se disparan cuando la cifra entra en pantalla (mismo método que arriba).
─────────────────────────────────────────────── */
function contarVisibles() {
  document.querySelectorAll('[data-num]:not([data-listo])').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.top > alto() * 0.9 || r.bottom < 0) return;
    el.setAttribute('data-listo', '1');

    const meta = parseInt(el.dataset.num, 10);
    const sufijo = el.dataset.suf || '';
    const esAnio = meta > 1900 && meta < 2100;   // los años van sin separador de miles
    const inicio = performance.now(), duracion = 1500;

    (function paso(ahora) {
      const t = Math.min((ahora - inicio) / duracion, 1);
      const suave = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      const valor = Math.round(meta * suave);
      el.textContent = (esAnio ? String(valor) : valor.toLocaleString('es-PE')) + sufijo;
      if (t < 1) requestAnimationFrame(paso);
    })(performance.now());
  });
}

/* ───────────────────────────────────────────────
   9. SELECTOR DE PROYECTOS
─────────────────────────────────────────────── */
const botonesProy = [...document.querySelectorAll('.switch__b')];
const tinta = document.getElementById('switchInk');

function colocarTinta() {
  const activo = document.querySelector('.switch__b.is-on');
  if (!activo || !tinta) return;
  // Se mide contra la caja del propio contenedor: así no importa cuánto
  // borde o relleno tenga .switch, la píldora cae siempre bajo el botón.
  const contenedor = tinta.parentElement;
  const caja = contenedor.getBoundingClientRect();
  const est = getComputedStyle(contenedor);
  // La píldora se posiciona desde la caja de relleno, no desde el borde
  const bx = parseFloat(est.borderLeftWidth) || 0;
  const by = parseFloat(est.borderTopWidth) || 0;
  const r = activo.getBoundingClientRect();
  tinta.style.width = r.width + 'px';
  tinta.style.top = (r.top - caja.top - by) + 'px';
  tinta.style.bottom = 'auto';
  tinta.style.height = r.height + 'px';
  tinta.style.transform = `translateX(${r.left - caja.left - bx}px)`;
  tinta.classList.toggle('green', activo.dataset.proj === 'alameda');
}
addEventListener('resize', colocarTinta);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(colocarTinta);

botonesProy.forEach(btn => {
  btn.addEventListener('click', () => {
    botonesProy.forEach(b => b.classList.remove('is-on'));
    btn.classList.add('is-on');
    colocarTinta();

    document.querySelectorAll('.proj').forEach(p => p.classList.remove('is-on'));
    const activo = document.getElementById('p-' + btn.dataset.proj);
    activo.classList.add('is-on');

    // Animamos lo que acaba de aparecer
    activo.querySelectorAll('[data-slide]').forEach(t => t.classList.add('is-in'));
    revelar();
    recogerImagenes();
    activarVidrio(activo);
    activarInclinacion(activo);
    if (window.cursorConEtiqueta) window.cursorConEtiqueta(activo);
  });
});
addEventListener('load', colocarTinta);
setTimeout(colocarTinta, 300);

/* ───────────────────────────────────────────────
   10. VISOR DE IMÁGENES (lightbox)
─────────────────────────────────────────────── */
const lb = document.getElementById('lightbox');
const lbImg = document.getElementById('lbImg');
const lbCap = document.getElementById('lbCap');
let galeria = [], indice = 0;

function recogerImagenes() {
  galeria = [...document.querySelectorAll('[data-lb]')].filter(f => f.offsetParent !== null);
  galeria.forEach((fig, i) => {
    fig.onclick = () => abrirVisor(i);
  });
}
recogerImagenes();

const lbCount = document.getElementById('lbCount');

function abrirVisor(i) {
  indice = (i + galeria.length) % galeria.length;
  const fig = galeria[indice];
  const img = fig.querySelector('img');
  lbImg.src = img.src;
  lbImg.alt = img.alt;
  const cap = fig.querySelector('figcaption');
  lbCap.textContent = cap ? cap.textContent : (img.alt || '');
  lbCount.textContent = (indice + 1) + ' / ' + galeria.length;
  lb.classList.add('on');
  document.body.style.overflow = 'hidden';
}
function cerrarVisor() {
  lb.classList.remove('on');
  document.body.style.overflow = '';
}

document.getElementById('lbClose').onclick = cerrarVisor;
document.getElementById('lbPrev').onclick = e => { e.stopPropagation(); abrirVisor(indice - 1); };
document.getElementById('lbNext').onclick = e => { e.stopPropagation(); abrirVisor(indice + 1); };
lb.addEventListener('click', e => { if (e.target === lb || e.target === lbImg) cerrarVisor(); });
addEventListener('keydown', e => {
  if (!lb.classList.contains('on')) return;
  if (e.key === 'Escape') cerrarVisor();
  if (e.key === 'ArrowLeft') abrirVisor(indice - 1);
  if (e.key === 'ArrowRight') abrirVisor(indice + 1);
});

// Deslizar con el dedo en el móvil
let tocoX = 0;
lb.addEventListener('touchstart', e => { tocoX = e.changedTouches[0].clientX; }, { passive: true });
lb.addEventListener('touchend', e => {
  const dif = e.changedTouches[0].clientX - tocoX;
  if (Math.abs(dif) > 55) abrirVisor(indice + (dif < 0 ? 1 : -1));
}, { passive: true });

/* ───────────────────────────────────────────────
   10b. PREGUNTAS FRECUENTES
   Solo una abierta a la vez, con apertura suave.
─────────────────────────────────────────────── */
document.querySelectorAll('.fq__q').forEach(boton => {
  boton.addEventListener('click', () => {
    const bloque = boton.parentElement;
    const abierto = bloque.classList.contains('on');

    document.querySelectorAll('.fq').forEach(f => {
      f.classList.remove('on');
      f.querySelector('.fq__q').setAttribute('aria-expanded', 'false');
    });

    if (!abierto) {
      bloque.classList.add('on');
      boton.setAttribute('aria-expanded', 'true');
    }
  });
});

/* ───────────────────────────────────────────────
   11. FORMULARIO → WHATSAPP
   No hay servidor: el formulario arma un mensaje ordenado
   y lo abre en WhatsApp con todos los datos ya escritos.
─────────────────────────────────────────────── */
const form = document.getElementById('form');
const aviso = document.getElementById('formNote');

form.addEventListener('submit', e => {
  e.preventDefault();

  const v = id => document.getElementById(id).value.trim();
  const obligatorios = ['nombre', 'celular'];   // solo dos: cada campo de más cuesta contactos
  let ok = true;

  obligatorios.forEach(id => {
    const campo = document.getElementById(id);
    const vacio = !campo.value.trim();
    campo.parentElement.classList.toggle('err', vacio);
    if (vacio) ok = false;
  });

  const acepta = document.getElementById('acepta');
  acepta.closest('.check').classList.toggle('err', !acepta.checked);
  if (!acepta.checked) ok = false;

  aviso.classList.add('on');
  if (!ok) {
    aviso.textContent = 'Completa los campos marcados con * y acepta la política de privacidad.';
    return;
  }

  // Solo mandamos lo que la persona realmente llenó
  const mensaje =
    `¡Hola! Quiero información sobre sus proyectos.\n\n` +
    `• Nombre: ${v('nombre')}\n` +
    `• Celular: ${v('celular')}\n` +
    `• Proyecto de interés: ${v('proyecto')}\n` +
    (v('correo')      ? `• Correo: ${v('correo')}\n` : '') +
    (v('ciudad')      ? `• Ciudad: ${v('ciudad')}\n` : '') +
    (v('modo')        ? `• Forma de compra: ${v('modo')}\n` : '') +
    (v('presupuesto') ? `• Presupuesto: ${v('presupuesto')}` : '');

  medir('form_envio', { proyecto: v('proyecto') });
  window.open(enlaceWA(mensaje), '_blank', 'noopener');
  aviso.textContent = 'Abrimos WhatsApp con tus datos. Si no se abrió, escríbenos al 986 498 284.';
  form.reset();
});

form.querySelectorAll('input').forEach(campo => {
  campo.addEventListener('input', () => campo.parentElement.classList.remove('err'));
});
document.getElementById('acepta').addEventListener('change', function () {
  this.closest('.check').classList.toggle('err', !this.checked);
});

/* ───────────────────────────────────────────────
   12. ARRANQUE
   Se llama al final, cuando ya existe todo lo anterior.
─────────────────────────────────────────────── */
alDeslizar();

/* ═══════════════════════════════════════════════════════════
   14. MEDICIÓN
   La inmobiliaria vive de la publicidad: sin esto se paga a ciegas.
   Pega los identificadores cuando los tengas y todo empieza a medirse
   solo. Mientras estén vacíos, no se carga nada ni se rastrea a nadie.
   ═══════════════════════════════════════════════════════════ */
const GA_ID = '';        // Google Analytics 4, formato G-XXXXXXX
const META_PIXEL = '';   // Píxel de Meta, solo números

(function cargarMedicion(){
  if (GA_ID) {
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function(){ dataLayer.push(arguments); };
    gtag('js', new Date());
    gtag('config', GA_ID);
  }
  if (META_PIXEL) {
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
    (window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', META_PIXEL); fbq('track', 'PageView');
  }
})();

/* Un solo lugar por donde pasan todas las conversiones */
function medir(evento, datos = {}) {
  if (window.gtag) gtag('event', evento, datos);
  if (window.fbq && evento.startsWith('wa')) fbq('track', 'Contact', datos);
  if (window.fbq && evento === 'form_envio') fbq('track', 'Lead', datos);
}

// Cada clic hacia WhatsApp queda registrado con su origen
document.querySelectorAll('[data-ev]').forEach(el => {
  el.addEventListener('click', () => medir(el.dataset.ev, { origen: el.dataset.ev }));
});

/* ═══════════════════════════════════════════════════════════
   15. LOTES DISPONIBLES
   Poner el número real crea urgencia honesta. Mientras sea null
   no se muestra nada: nunca inventamos escasez.
   ═══════════════════════════════════════════════════════════ */
const DISPONIBLES = {
  gaviotas: null,   // ej. 12
  alameda:  null,   // ej. 8
};

document.querySelectorAll('[data-quedan]').forEach(el => {
  const n = DISPONIBLES[el.dataset.quedan];
  if (typeof n === 'number' && n > 0) {
    el.textContent = n === 1 ? 'Queda 1 lote disponible' : `Quedan ${n} lotes disponibles`;
    el.classList.add('on');
  }
});

/* ═══════════════════════════════════════════════════════════
   16. CAMPOS OPCIONALES DEL FORMULARIO
   ═══════════════════════════════════════════════════════════ */
const masDatos = document.getElementById('masDatos');
const extra = document.getElementById('extra');
if (masDatos && extra) {
  masDatos.addEventListener('click', () => {
    const abierto = extra.classList.toggle('on');
    masDatos.setAttribute('aria-expanded', abierto ? 'true' : 'false');
    masDatos.firstChild.textContent = abierto ? 'Ocultar detalles ' : 'Añadir más detalles ';
  });
}

/* ═══════════════════════════════════════════════════════════
   17. CINTA DE VENTAJAS
   Duplica los cinco bloques para que el desplazamiento vuelva
   al inicio sin salto, y ajusta la duración al ancho real
   para que la velocidad se vea igual en cualquier pantalla.
   ═══════════════════════════════════════════════════════════ */
const cinta = document.getElementById('cintaVentajas');
if (cinta) {
  const originales = [...cinta.children];

  // La cinta ya tiene movimiento propio: los bloques no deben esperar a
  // la aparición por scroll, o entrarían invisibles por el borde derecho.
  originales.forEach(el => { el.classList.remove('fade'); el.classList.add('vis'); });

  const montar = () => {
    // quitar copias anteriores antes de volver a medir
    cinta.querySelectorAll('[data-copia]').forEach(c => c.remove());

    const anchoOriginal = cinta.scrollWidth;
    const visible = cinta.parentElement.clientWidth;

    // Cuántas veces hay que repetir los cinco para llenar lo que se ve.
    const juegos = Math.max(1, Math.ceil(visible / anchoOriginal));
    // La tira se monta con el doble de juegos: la animación recorre justo
    // la mitad, así que al terminar la imagen es idéntica y no se nota el corte.
    for (let r = 0; r < juegos * 2 - 1; r++) {
      originales.forEach(el => {
        const copia = el.cloneNode(true);
        copia.setAttribute('data-copia', '');
        copia.setAttribute('aria-hidden', 'true');
        copia.classList.remove('fade');
        copia.classList.add('vis');
        cinta.appendChild(copia);
      });
    }

    // el bucle recorre la mitad de la tira: velocidad constante, ~52 px/s
    const recorrido = cinta.scrollWidth / 2;
    cinta.style.setProperty('--cinta-seg', (recorrido / 32).toFixed(1) + 's');
    cinta.classList.add('cinta--lista');
  };

  montar();
  let temporizador;
  window.addEventListener('resize', () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(montar, 250);
  });
}
