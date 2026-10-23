(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = motionPreference.matches;
  const projectData = JSON.parse($('#project-data')?.textContent || '[]');
  const arrow = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14" stroke="currentColor" stroke-width="1.6"/></svg>';
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // La presentación de marca se muestra en Inicio y siempre deja paso al contenido.
  const loader = $('#site-loader');
  let pageReady = !loader;
  if (loader) {
    let finishing = false;
    let finishTimer;
    let safetyTimer;
    const finishLoader = () => {
      if (finishing) return;
      finishing = true;
      clearTimeout(finishTimer);
      clearTimeout(safetyTimer);
      loader.classList.add('done');
      loader.setAttribute('aria-hidden', 'true');
      setTimeout(() => {
        loader.remove();
        pageReady = true;
        document.dispatchEvent(new Event('cg:page-ready'));
      }, motionPreference.matches ? 0 : 900);
    };
    const loaded = () => {
      if (finishing) return;
      finishTimer = setTimeout(finishLoader, Math.max(0, (motionPreference.matches ? 0 : 2950) - performance.now()));
    };
    if (document.readyState === 'complete') loaded();
    else addEventListener('load', loaded, { once: true });
    safetyTimer = setTimeout(finishLoader, Math.max(0, (reduced ? 1500 : 4200) - performance.now()));
    motionPreference.addEventListener('change', event => {
      if (event.matches) finishLoader();
    });
  }

  // Revelado tipográfico por líneas y palabras. Al terminar se restaura el texto
  // original para conservar su composición, selección y lectura habitual.
  if (!reduced && 'IntersectionObserver' in window) {
    const titles = $$('main h1, main h2, main h3').filter(element => !element.classList.contains('visually-hidden'));
    const reveals = $$('[data-reveal]').filter(element => !element.matches('h1,h2,h3') && !element.querySelector('h1,h2,h3'));
    const targets = [...reveals, ...titles];
    const titleWords = new Map();
    const titleTimers = new Map();
    const settleTitle = element => {
      clearTimeout(titleTimers.get(element));
      titleTimers.delete(element);
      (titleWords.get(element) || []).forEach(word => word.replaceWith(document.createTextNode(word.textContent)));
      titleWords.delete(element);
      element.normalize();
      element.classList.add('is-settled');
    };
    const prepareTitle = element => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
        acceptNode: node => node.nodeValue.trim() && !node.parentElement.closest('svg,[aria-hidden="true"],.visually-hidden') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
      });
      const nodes = [];
      const words = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(node => {
        const fragment = document.createDocumentFragment();
        node.nodeValue.split(/(\s+)/).forEach(part => {
          if (!part.trim()) { fragment.append(document.createTextNode(part)); return; }
          const mask = document.createElement('span');
          const ink = document.createElement('span');
          mask.className = 'title-word';
          ink.className = 'title-word-ink';
          ink.textContent = part;
          mask.append(ink);
          fragment.append(mask);
          words.push(mask);
        });
        node.replaceWith(fragment);
      });
      titleWords.set(element, words);
      element.classList.add('title-reveal');
    };
    const revealTitle = element => {
      const words = titleWords.get(element);
      if (!words?.length) return;
      const tops = words.map(word => word.getBoundingClientRect().top);
      const compact = innerWidth <= 640;
      const wordStep = compact ? 38 : element.tagName === 'H3' ? 45 : 65;
      const lineStep = compact ? 130 : 180;
      let previousTop = tops[0], line = 0, position = 0, lastDelay = 0;
      words.forEach((word, index) => {
        if (Math.abs(tops[index] - previousTop) > 3) { line++; position = 0; previousTop = tops[index]; }
        const delay = Math.min(line * lineStep + position++ * wordStep, 600);
        word.style.setProperty('--word-delay', delay + 'ms');
        lastDelay = Math.max(lastDelay, delay);
      });
      const duration = parseFloat(getComputedStyle(element).getPropertyValue('--title-duration')) || 1100;
      const delay = parseFloat(element.style.getPropertyValue('--title-delay')) || 0;
      titleTimers.set(element, setTimeout(() => settleTitle(element), duration + delay + lastDelay + 120));
    };
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        revealTitle(entry.target);
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: .12, rootMargin: '0px 0px -28px 0px' });
    reveals.forEach((element, index) => {
      element.classList.add('will-reveal');
      element.style.setProperty('--reveal-delay', (index % 3) * 65 + 'ms');
    });
    titles.forEach(element => {
      const group = element.closest('.project-cards,.experience-grid,.assurance-row,.values-grid');
      const position = group ? [...group.querySelectorAll('h1,h2,h3')].indexOf(element) : 0;
      prepareTitle(element);
      element.style.setProperty('--title-delay', (group ? position % 3 * 120 : 60) + 'ms');
    });
    const startReveals = () => targets.forEach(element => observer.observe(element));
    if (pageReady) startReveals();
    else document.addEventListener('cg:page-ready', startReveals, { once: true });
    motionPreference.addEventListener('change', event => {
      if (!event.matches) return;
      observer.disconnect();
      targets.forEach(element => {
        element.classList.add('is-visible');
        if (titleWords.has(element)) settleTitle(element);
      });
    });
  }

  const menu = $('.menu-toggle');
  const navigation = $('#main-nav');
  const closeMenu = () => {
    menu?.setAttribute('aria-expanded', 'false');
    menu?.setAttribute('aria-label', 'Abrir menú');
    navigation?.classList.remove('is-open');
  };
  menu?.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') !== 'true';
    menu.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    navigation.classList.toggle('is-open', open);
  });
  $$('#main-nav a').forEach(link => link.addEventListener('click', closeMenu));
  document.addEventListener('click', event => {
    if (menu && !event.target.closest('.site-header')) closeMenu();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
  matchMedia('(min-width: 901px)').addEventListener('change', closeMenu);

  let scrollFrame = 0;
  const scrollLine = $('.scroll-line');
  addEventListener('scroll', () => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      const available = document.documentElement.scrollHeight - innerHeight;
      if (scrollLine) scrollLine.style.width = (available > 0 ? Math.min(100, scrollY / available * 100) : 0) + '%';
      scrollFrame = 0;
    });
  }, { passive: true });

  const whatsappChat = $('[data-wa-chat]');
  if (whatsappChat) {
    const panel = $('#whatsapp-chat', whatsappChat);
    const launcher = $('[data-wa-chat-toggle]', whatsappChat);
    const close = $('[data-wa-chat-close]', whatsappChat);
    const form = $('[data-wa-chat-form]', whatsappChat);
    const input = $('input[name="consulta"]', form);
    const reopenDelay = 45_000;
    const storageKey = 'cg-whatsapp-reopen-at';
    let reopenTimer;
    const readDeadline = () => {
      try { return Number(sessionStorage.getItem(storageKey)) || 0; }
      catch { return 0; }
    };
    const saveDeadline = value => {
      try {
        if (value) sessionStorage.setItem(storageKey, String(value));
        else sessionStorage.removeItem(storageKey);
      } catch { /* El chat sigue funcionando si el almacenamiento no está disponible. */ }
    };
    function showChat(focus = false) {
      clearTimeout(reopenTimer);
      saveDeadline(0);
      panel.hidden = false;
      launcher.setAttribute('aria-expanded', 'true');
      if (focus) input.focus({preventScroll:true});
    }
    function closeChat() {
      clearTimeout(reopenTimer);
      const restoreFocus = panel.contains(document.activeElement);
      panel.hidden = true;
      launcher.setAttribute('aria-expanded', 'false');
      saveDeadline(Date.now() + reopenDelay);
      reopenTimer = setTimeout(showChat, reopenDelay);
      if (restoreFocus) launcher.focus({preventScroll:true});
    }
    close.addEventListener('click', closeChat);
    launcher.addEventListener('click', () => panel.hidden ? showChat(true) : closeChat());
    whatsappChat.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !panel.hidden) {
        event.preventDefault();
        closeChat();
      }
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      const message = input.value.trim();
      if (!message) { input.focus(); return; }
      window.open('https://wa.me/51986498284?text=' + encodeURIComponent(message), '_blank', 'noopener,noreferrer');
    });
    // Solo se programa una reapertura al cerrar; abierto permanece visible.
    const remaining = Math.min(reopenDelay, readDeadline() - Date.now());
    if (remaining > 0) reopenTimer = setTimeout(showChat, remaining);
    else showChat();
  }

  $$('[data-close-dialog]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  $$('dialog').forEach(dialog => dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  }));
  const contactDialog = $('#contact-dialog');
  function openContact(name, purpose = '') {
    closeMenu();
    if (name) {
      const select = $('select[name="proyecto"]', contactDialog);
      const option = [...select.options].find(item => item.value.startsWith(name));
      if (option) select.value = option.value;
    }
    if (purpose) $('select[name="motivo"]', contactDialog).value = purpose;
    $('.form-fields', contactDialog).hidden = false;
    $('.form-review', contactDialog).hidden = true;
    contactDialog.showModal();
  }
  $$('[data-contact]').forEach(button => button.addEventListener('click', event => {
    event.preventDefault();
    openContact(button.dataset.selectedProject || '', /visita|conocer el proyecto/i.test(button.textContent) ? 'Coordinar una visita' : '');
  }));
  $$('[data-consult-form]').forEach(form => {
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const data = new FormData(form);
      const name = String(data.get('nombre') || '').trim();
      const phone = String(data.get('celular') || '').trim();
      const project = String(data.get('proyecto') || '').trim() || 'Quiero asesoría para elegir un proyecto';
      const purpose = String(data.get('motivo') || '').trim();
      const message = 'Hola, Casa Grande. Soy ' + name + '.\nProyecto: ' + project + '.\nMe gustaría: ' + purpose + '.\nMi celular de contacto es ' + phone + '.';
      $('[data-review-summary]', form).textContent = name + '\n' + project + '\n' + purpose + '\nCelular: ' + phone;
      $('[data-review-link]', form).href = 'https://wa.me/51986498284?text=' + encodeURIComponent(message);
      $('.form-fields', form).hidden = true;
      $('.form-review', form).hidden = false;
      $('[data-review-link]', form).focus({ preventScroll: true });
    });
    $('[data-edit-consult]', form).addEventListener('click', () => {
      $('.form-review', form).hidden = true;
      $('.form-fields', form).hidden = false;
      $('input[name="nombre"]', form).focus({ preventScroll: true });
    });
  });

  const finder = $('#finder-dialog');
  $$('[data-open-finder]').forEach(button => button.addEventListener('click', () => {
    $('[data-finder-choices]', finder).hidden = false;
    $('[data-finder-result]', finder).hidden = true;
    finder.showModal();
  }));
  $$('[data-finder]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.finder === 'help') {
      finder.close();
      openContact('');
      return;
    }
    const data = projectData.find(item => item.key === button.dataset.finder);
    if (!data) return;
    const result = $('[data-finder-result]', finder);
    result.innerHTML = '<img class="finder-result-image" src="img/' + escape(data.cover) + '" alt="Render referencial de ' + escape(data.name) + '"><span class="eyebrow">' + escape(data.city) + ' · LAMBAYEQUE</span><h3>' + escape(data.name) + '</h3><p>' + escape(data.desc) + '</p><a class="button button-blue" href="' + escape(data.slug) + '.html">Conocer el proyecto ' + arrow + '</a><button class="finder-result-contact" type="button">Quiero coordinar una visita ↗</button><button class="text-button finder-back" type="button">← Ver las dos opciones</button>';
    $('[data-finder-choices]', finder).hidden = true;
    result.hidden = false;
    $('.finder-back', result).addEventListener('click', () => {
      result.hidden = true;
      $('[data-finder-choices]', finder).hidden = false;
      $('[data-finder]', finder).focus({ preventScroll: true });
    });
    $('.finder-result-contact', result).addEventListener('click', () => {
      finder.close();
      openContact(data.name, 'Coordinar una visita');
    });
    $('a', result).focus({ preventScroll: true });
  }));

  const photoDialog = $('#photo-dialog');
  let currentAlbum = [], currentPhoto = 0;
  function updatePhoto() {
    const photo = currentAlbum[currentPhoto];
    if (!photo) return;
    const image = $('[data-photo-full]');
    image.src = photo.src;
    image.alt = photo.alt;
    $('[data-photo-caption]').textContent = photo.caption;
    $('[data-photo-count]').textContent = String(currentPhoto + 1).padStart(2, '0') + ' / ' + String(currentAlbum.length).padStart(2, '0');
    $('[data-photo-prev]').disabled = currentPhoto === 0;
    $('[data-photo-next]').disabled = currentPhoto === currentAlbum.length - 1;
  }
  function openPhoto(album, index) {
    currentAlbum = album;
    currentPhoto = index;
    updatePhoto();
    photoDialog.showModal();
  }
  function movePhoto(change) {
    currentPhoto = Math.max(0, Math.min(currentAlbum.length - 1, currentPhoto + change));
    updatePhoto();
  }
  $('[data-photo-prev]')?.addEventListener('click', () => movePhoto(-1));
  $('[data-photo-next]')?.addEventListener('click', () => movePhoto(1));
  photoDialog?.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      movePhoto(event.key === 'ArrowLeft' ? -1 : 1);
    }
  });
  $$('[data-single-photo]').forEach(button => button.addEventListener('click', () => {
    const alt = button.dataset.photoAlt || $('img', button)?.alt || 'Fotografía del proyecto';
    openPhoto([{ src: button.dataset.singlePhoto, alt, caption: alt }], 0);
  }));

  $$('[data-gallery]').forEach(gallery => {
    const data = JSON.parse($('.gallery-data', gallery).textContent);
    const previous = $('[data-gallery-prev]', gallery);
    const next = $('[data-gallery-next]', gallery);
    const open = $('[data-gallery-open]', gallery);
    const image = $('.carousel-image img', gallery);
    const viewport = $('.carousel-image', gallery);
    const thumbs = $$('[data-gallery-go]', gallery);
    const caption = $('[data-gallery-caption]', gallery);
    const count = $('[data-gallery-count]', gallery);
    const autoplayDelay = Number(gallery.dataset.galleryInterval) || 0;
    const autoplayControl = $('[data-gallery-autoplay]', gallery);
    let autoplayPaused = reduced;
    let galleryInView = !('IntersectionObserver' in window);
    let autoplayTimer;
    let index = 0;
    function render(target) {
      index = Math.max(0, Math.min(data.length - 1, target));
      const photo = data[index];
      image.src = photo.src;
      image.alt = photo.alt;
      viewport.classList.toggle('is-event', Boolean(photo.event));
      viewport.classList.toggle('is-render', Boolean(photo.render));
      if (caption) caption.textContent = photo.caption;
      if (count) count.textContent = String(index + 1).padStart(2, '0');
      open.setAttribute('aria-label', 'Ampliar fotografía: ' + photo.caption);
      previous.disabled = index === 0;
      next.disabled = index === data.length - 1;
      thumbs.forEach((thumb, i) => thumb.setAttribute('aria-current', String(i === index)));
      const thumb = thumbs[index], row = $('.gallery-thumbs', gallery);
      if (thumb && row) {
        const left = thumb.offsetLeft - row.offsetLeft;
        if (left < row.scrollLeft) row.scrollTo({left, behavior:'auto'});
        else if (left + thumb.offsetWidth > row.scrollLeft + row.clientWidth) row.scrollTo({left:left + thumb.offsetWidth - row.clientWidth, behavior:'auto'});
      }
    }
    function restartAutoplay() {
      clearInterval(autoplayTimer);
      if (!autoplayDelay || autoplayPaused || !galleryInView || document.hidden || data.length < 2) return;
      autoplayTimer = setInterval(() => {
        if (!$('dialog[open]')) render((index + 1) % data.length);
      }, autoplayDelay);
    }
    function changePhoto(target) {
      render(target);
      restartAutoplay();
    }
    function updateAutoplayControl() {
      if (!autoplayControl) return;
      autoplayControl.setAttribute('aria-pressed', String(autoplayPaused));
      autoplayControl.setAttribute('aria-label', autoplayPaused ? 'Reanudar carrusel' : 'Pausar carrusel');
      autoplayControl.innerHTML = autoplayPaused
        ? '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 5v14M15 5v14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
      $('[role="status"]', gallery)?.setAttribute('aria-live', autoplayPaused ? 'polite' : 'off');
    }
    previous.addEventListener('click', () => changePhoto(index - 1));
    next.addEventListener('click', () => changePhoto(index + 1));
    thumbs.forEach((thumb, i) => thumb.addEventListener('click', () => changePhoto(i)));
    let swiped = false, startX = 0, startY = 0;
    open.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'touch') return;
      startX = event.clientX; startY = event.clientY; swiped = false;
    });
    open.addEventListener('pointerup', event => {
      if (event.pointerType !== 'touch') return;
      const change = event.clientX - startX;
      if (Math.abs(change) > 45 && Math.abs(event.clientY - startY) < 60) {
        swiped = true; changePhoto(index + (change < 0 ? 1 : -1));
      }
    });
    open.addEventListener('click', event => {
      if (swiped) { event.preventDefault(); swiped = false; return; }
      openPhoto(data, index);
    });
    gallery.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault(); changePhoto(index + (event.key === 'ArrowLeft' ? -1 : 1));
      } else if (event.key === 'Home') { event.preventDefault(); changePhoto(0); }
      else if (event.key === 'End') { event.preventDefault(); changePhoto(data.length - 1); }
    });
    render(0);
    if (autoplayDelay) {
      updateAutoplayControl();
      autoplayControl?.addEventListener('click', () => {
        autoplayPaused = !autoplayPaused;
        updateAutoplayControl();
        restartAutoplay();
      });
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(entries => {
          galleryInView = entries[0].isIntersecting;
          restartAutoplay();
        }, {threshold:.15}).observe(gallery);
      }
      document.addEventListener('visibilitychange', restartAutoplay);
      restartAutoplay();
    }
  });

  $$('[data-project-video-player]').forEach(player => {
    const video = $('video', player);
    const choices = $$('[data-project-video-src]', player);
    let videoInView = !('IntersectionObserver' in window);
    function autoplayVideo() {
      video.muted = true;
      const playback = video.play();
      if (playback) playback.catch(() => {});
    }
    video.autoplay = true;
    video.defaultMuted = true;
    video.muted = true;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => {
        videoInView = entries[0].isIntersecting && entries[0].intersectionRatio >= .2;
        if (videoInView && !document.hidden) autoplayVideo();
        else video.pause();
      }, {threshold:.2}).observe(video);
    } else autoplayVideo();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) video.pause();
      else if (videoInView) autoplayVideo();
    });
    choices.forEach(button => button.addEventListener('click', () => {
      if (button.getAttribute('aria-pressed') === 'true') return;
      const width = Number(button.dataset.videoWidth);
      const height = Number(button.dataset.videoHeight);
      video.pause();
      video.src = button.dataset.projectVideoSrc;
      video.width = width;
      video.height = height;
      video.muted = true;
      video.setAttribute('aria-label', button.dataset.videoLabel);
      if (button.dataset.videoPoster) video.poster = button.dataset.videoPoster;
      else video.removeAttribute('poster');
      player.style.setProperty('--project-video-ratio', width + '/' + height);
      player.classList.toggle('is-portrait', height > width);
      choices.forEach(choice => choice.setAttribute('aria-pressed', String(choice === button)));
      video.load();
      if (videoInView && !document.hidden) autoplayVideo();
      else video.pause();
    }));
  });

  const projectTabs = $$('[data-tab]');
  function activateTab(key, focus = false, alignTabs = false) {
    if (!projectTabs.some(button => button.dataset.tab === key)) return;
    const workspace = $('.project-workspace');
    const headerHeight = $('.site-header')?.getBoundingClientRect().height || 0;
    const workspaceTop = workspace ? workspace.getBoundingClientRect().top + window.scrollY : 0;
    projectTabs.forEach(button => {
      const selected = button.dataset.tab === key;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      const panel = document.getElementById(button.getAttribute('aria-controls'));
      if (panel) panel.hidden = !selected;
      if (selected && focus) button.focus({preventScroll:true});
    });
    if (workspace && alignTabs) {
      window.scrollTo({top:Math.max(0, workspaceTop - headerHeight), behavior:'instant'});
    }
  }
  projectTabs.forEach((button, i) => {
    button.addEventListener('click', () => activateTab(button.dataset.tab, false, true));
    button.addEventListener('keydown', event => {
      let index = i;
      if (event.key === 'ArrowRight') index = (i + 1) % projectTabs.length;
      else if (event.key === 'ArrowLeft') index = (i - 1 + projectTabs.length) % projectTabs.length;
      else if (event.key === 'Home') index = 0;
      else if (event.key === 'End') index = projectTabs.length - 1;
      else return;
      event.preventDefault(); activateTab(projectTabs[index].dataset.tab, true, true);
    });
  });
  $$('[data-activate-tab]').forEach(button => button.addEventListener('click', () => {
    activateTab(button.dataset.activateTab, true, true);
  }));
  $$('[data-purpose]').forEach((button, i, buttons) => {
    const activate = target => buttons.forEach(item => {
      const selected = item === target;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
    });
    button.addEventListener('click', () => activate(button));
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const target = event.key === 'Home' ? buttons[0] : event.key === 'End' ? buttons[buttons.length - 1] : buttons[(i + (event.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length];
      activate(target); target.focus();
    });
  });
  if (location.hash === '#galeria') activateTab('gallery');
  if (location.hash === '#ubicacion') activateTab('location');
  if (location.hash === '#contacto') openContact('');
  if (document.body.dataset.page === 'index' && ['#familias','#nosotros'].includes(location.hash)) {
    location.replace(location.hash === '#familias' ? 'familias.html' : 'somos.html');
  }
})();
