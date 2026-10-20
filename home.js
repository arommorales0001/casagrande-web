/* Interacciones del inicio y de Somos. Sin envíos automáticos. */
(() => {
  const openLegacyCompanyLink = () => {
    if (!document.body.classList.contains('about-page') && location.hash === '#nosotros') {
      location.replace('somos.html');
    }
  };
  openLegacyCompanyLink();
  addEventListener('hashchange', openLegacyCompanyLink);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const drawer = document.getElementById('drawer');
  const menuButton = document.getElementById('burger');
  const syncMenu = () => {
    const open = document.body.classList.contains('open');
    drawer.inert = !open;
    drawer.setAttribute('aria-hidden',String(!open));
    document.querySelector('main').inert = open;
    document.querySelector('.home-footer').inert = open;
  };
  menuButton.addEventListener('click',syncMenu);
  drawer.querySelectorAll('a').forEach(link => link.addEventListener('click',syncMenu));
  document.querySelectorAll('.header__brand,.header__cta').forEach(link => link.addEventListener('click',() => {
    if (!document.body.classList.contains('open')) return;
    document.body.classList.remove('open'); document.body.style.overflow = '';
    menuButton.setAttribute('aria-expanded','false'); menuButton.setAttribute('aria-label','Abrir menú'); syncMenu();
  }));
  document.addEventListener('keydown',event => {
    if (event.key === 'Escape' && document.body.classList.contains('open')) {
      menuButton.click(); menuButton.focus();
    }
  });
  syncMenu();
  const optionalButton = document.getElementById('masDatos');
  const optionalFields = document.getElementById('extra');
  const syncOptional = () => {
    const open = optionalButton.getAttribute('aria-expanded') === 'true';
    optionalFields.inert = !open; optionalFields.setAttribute('aria-hidden',String(!open));
  };
  optionalButton.setAttribute('aria-controls','extra');
  optionalButton.addEventListener('click',syncOptional); syncOptional();
  const questionButtons = [...document.querySelectorAll('.fq__q')];
  const syncQuestions = () => questionButtons.forEach(button => {
    document.getElementById(button.getAttribute('aria-controls')).setAttribute('aria-hidden',String(button.getAttribute('aria-expanded') !== 'true'));
  });
  questionButtons.forEach(button => button.addEventListener('click',syncQuestions)); syncQuestions();
  const journeySteps = [
    {title:'Elige tu proyecto', copy:'Conoce Alameda Real y Las Gaviotas de Reque. Elige cuál quieres visitar.', link:'Ver proyectos', href:'#proyectos'},
    {title:'Resuelve tus dudas', copy:'Consulta la documentación, disponibilidad y condiciones de pago con nuestro equipo.', link:'Hacer una consulta', href:'#contacto'},
    {title:'Conoce el lugar en persona', copy:'Coordina una visita para conocer el proyecto y su entorno antes de decidir.', link:'Agendar visita', href:'#contacto'}
  ];
  const stepButtons = [...document.querySelectorAll('[data-journey-step]')];
  const previousStep = document.querySelector('[data-journey-prev]');
  const nextStep = document.querySelector('[data-journey-next]');
  let currentStep = 0;
  function showStep(index) {
    currentStep = Math.max(0,Math.min(journeySteps.length - 1,index));
    const step = journeySteps[currentStep];
    stepButtons.forEach(item => item.setAttribute('aria-pressed', String(Number(item.dataset.journeyStep) === currentStep)));
    previousStep.disabled = currentStep === 0;
    nextStep.disabled = currentStep === journeySteps.length - 1;
    document.querySelector('[data-journey-label]').textContent = 'Paso ' + (currentStep + 1) + ' de 3';
    document.querySelector('[data-journey-title]').textContent = step.title;
    document.querySelector('[data-journey-copy]').textContent = step.copy;
    const link = document.querySelector('[data-journey-link]');
    link.href = step.href;
    link.replaceChildren(document.createTextNode(step.link + ' '));
    const arrow = document.createElement('span');
    arrow.setAttribute('aria-hidden','true'); arrow.textContent = '↗'; link.append(arrow);
  }
  stepButtons.forEach(button => button.addEventListener('click', () => showStep(Number(button.dataset.journeyStep))));
  previousStep?.addEventListener('click', () => showStep(currentStep - 1));
  nextStep?.addEventListener('click', () => showStep(currentStep + 1));
  if (stepButtons.length) showStep(0);

  const carousel = document.querySelector('[data-family-carousel]');
  if (!carousel) return;
  const track = carousel.querySelector('[data-family-track]');
  const slides = [...track.querySelectorAll('[data-family-slide]')];
  const dots = [...carousel.querySelectorAll('[data-family-go]')];
  const counter = carousel.querySelector('[data-family-current]');
  const phrases = slides.map(slide => slide.querySelector('[data-family-phrase]').textContent);
  // Los textos son mensajes de Casa Grande. Se elige su orden una vez por carga.
  for (let i = phrases.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [phrases[i],phrases[j]] = [phrases[j],phrases[i]];
  }
  slides.forEach((slide,i) => { slide.querySelector('[data-family-phrase]').textContent = phrases[i]; });
  let current = 0, scrollFrame = 0, resizeFrame = 0;
  function update() {
    current = Math.max(0,Math.min(slides.length - 1,Math.round(track.scrollLeft / (track.clientWidth || 1))));
    counter.textContent = String(current + 1).padStart(2,'0');
    slides.forEach((slide,i) => {
      slide.setAttribute('aria-hidden',String(i !== current));
      slide.inert = i !== current;
      slide.querySelector('[data-lb]').tabIndex = i === current ? 0 : -1;
    });
    dots.forEach((dot,i) => dot.setAttribute('aria-current',String(i === current)));
  }
  function go(index, instant = false) {
    const target = (index + slides.length) % slides.length;
    const wraps = Math.abs(target - current) > 1;
    // Restituir el foco desde el visor también debe poder activar otra fotografía.
    slides[target].inert = false;
    track.scrollTo({left:target * track.clientWidth,behavior:instant || wraps || reduced ? 'instant' : 'smooth'});
  }
  carousel.querySelector('[data-family-prev]').addEventListener('click',() => go(current - 1));
  carousel.querySelector('[data-family-next]').addEventListener('click',() => go(current + 1));
  dots.forEach((dot,i) => dot.addEventListener('click',() => go(i)));
  track.addEventListener('scroll',() => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => { scrollFrame = 0; update(); });
  },{passive:true});
  track.addEventListener('keydown',event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(slides.length - 1);
    else go(current + (event.key === 'ArrowRight' ? 1 : -1));
  });
  track.addEventListener('focusin',event => {
    const slide = event.target.closest('[data-family-slide]');
    if (slide && slides.indexOf(slide) !== current) go(slides.indexOf(slide),true);
  });
  // El visor compartido puede avanzar a una foto fuera de la diapositiva activa.
  const lightbox = document.getElementById('lightbox');
  if (lightbox) new MutationObserver(() => {
    if (!lightbox.classList.contains('on')) return;
    const image = document.getElementById('lbImg');
    const index = slides.findIndex(slide => slide.querySelector('img').src === image.src);
    if (index >= 0 && index !== current) go(index,true);
  }).observe(document.getElementById('lbImg'),{attributes:true,attributeFilter:['src']});
  new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => go(current,true));
  }).observe(track);
  update();
})();
