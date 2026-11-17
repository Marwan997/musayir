// Ranna · رنّة landing page. Plain script, no build step.
(function () {
  'use strict';

  // Where contact-form submissions go. Replace with a real endpoint when ready.
  var CONTACT_EMAIL = 'info@ranna.sa';
  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Language ----------
  var META = {
    ar: {
      title: 'رنّة · Ranna | عميلك يتصل، والشخص الصح يرد',
      description: 'رنّة تخلّي كل مكالمة توصل للشخص الصح: ترحيب يليق بشركتك، فريقك يرد من جواله أو مكتبه، ولا مكالمة تضيع، وتعرف رأي عميلك بعد كل اتصال.',
      menuOpen: 'فتح القائمة', menuClose: 'إغلاق القائمة', pause: 'إيقاف مؤقت', play: 'تشغيل',
      invalid: 'يرجى تعبئة الحقول المطلوبة بشكل صحيح.',
      sent: 'جهّزنا رسالتك في تطبيق البريد. اضغط إرسال هناك، أو راسلنا مباشرة على ' + CONTACT_EMAIL,
      subject: 'طلب عرض تجريبي', labels: ['الاسم', 'الشركة', 'البريد', 'الجوال', 'عدد الموظفين']
    },
    en: {
      title: 'Ranna · رنّة | Your customer calls. The right person answers.',
      description: 'Ranna gets every call to the right person: a proper welcome, your team answering on mobile or desk, no lost callers, and customer feedback after every call.',
      menuOpen: 'Open menu', menuClose: 'Close menu', pause: 'Pause', play: 'Play',
      invalid: 'Please fill in the required fields correctly.',
      sent: 'Your message is ready in your email app. Press send there, or email us directly at ' + CONTACT_EMAIL,
      subject: 'Demo request', labels: ['Name', 'Company', 'Email', 'Mobile', 'Team size']
    }
  };
  function lang() { return root.lang === 'en' ? 'en' : 'ar'; }
  function t(key) { return META[lang()][key]; }

  function applyLang(l) {
    root.lang = l;
    root.dir = l === 'en' ? 'ltr' : 'rtl';
    document.title = META[l].title;
    var d = document.querySelector('meta[name="description"]');
    if (d) d.setAttribute('content', META[l].description);
    document.querySelectorAll('option[data-' + l + ']').forEach(function (o) { o.textContent = o.getAttribute('data-' + l); });
    var tg = document.getElementById('nav-toggle');
    if (tg) tg.setAttribute('aria-label', root.classList.contains('nav-open') ? t('menuClose') : t('menuOpen'));
    updatePP();
    try { localStorage.setItem('ranna-lang', l); } catch (e) {}
  }
  document.querySelectorAll('[data-lang-toggle]').forEach(function (b) {
    b.addEventListener('click', function () { applyLang(lang() === 'ar' ? 'en' : 'ar'); });
  });

  // ---------- Header ----------
  var header = document.querySelector('.site-header');
  var toggle = document.getElementById('nav-toggle');
  var navLinks = document.querySelectorAll('.nav-links a');
  function onScroll() { header.classList.toggle('scrolled', window.scrollY > 20); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  function setMenu(open) {
    root.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? t('menuClose') : t('menuOpen'));
  }
  toggle.addEventListener('click', function () { setMenu(!root.classList.contains('nav-open')); });
  navLinks.forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });

  if ('IntersectionObserver' in window) {
    var sections = [].map.call(navLinks, function (a) { return document.querySelector(a.getAttribute('href')); }).filter(Boolean);
    var active = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        navLinks.forEach(function (a) { a.classList.toggle('active', a.getAttribute('href') === '#' + en.target.id); });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(function (s) { active.observe(s); });
  }

  // ---------- Hero console: cycle steps and tick the timer ----------
  var steps = document.querySelectorAll('[data-steps] li');
  var timer = document.querySelector('[data-timer]');
  if (!reduceMotion && steps.length) {
    var si = 0, secs = 7;
    setInterval(function () {
      steps[si].classList.remove('on');
      si = (si + 1) % steps.length;
      steps[si].classList.add('on');
    }, 2400);
    setInterval(function () {
      secs = (secs + 1) % 3600;
      timer.textContent = ('0' + Math.floor(secs / 60)).slice(-2) + ':' + ('0' + (secs % 60)).slice(-2);
    }, 1000);
  }

  // ---------- 60-second demo player ----------
  var player = document.querySelector('[data-player]');
  var pp = document.querySelector('[data-pp]');
  var tabs = player ? player.querySelectorAll('[data-ch]') : [];
  var scenes = player ? player.querySelectorAll('.scene') : [];
  var DURS = [5000, 6000, 6000, 6500, 5500, 6000];
  var cur = 0, timerId = null, paused = reduceMotion, startedAt = 0, remaining = DURS[0], visible = false;

  function updatePP() {
    if (!pp) return;
    pp.setAttribute('aria-label', paused ? t('play') : t('pause'));
  }
  function show(i, restart) {
    cur = i;
    tabs.forEach(function (b, k) {
      b.setAttribute('aria-selected', String(k === i));
      b.style.setProperty('--dur', DURS[k] + 'ms');
      if (restart) { var bar = b.querySelector('.bar'); bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; }
    });
    scenes.forEach(function (s, k) { s.classList.toggle('is-on', k === i); });
    remaining = DURS[i];
    schedule();
  }
  function schedule() {
    clearTimeout(timerId);
    if (paused || !visible) return;
    startedAt = Date.now();
    timerId = setTimeout(function () { show((cur + 1) % scenes.length, true); }, remaining);
  }
  function halt() {
    if (timerId) { clearTimeout(timerId); timerId = null; remaining = Math.max(0, remaining - (Date.now() - startedAt)); }
  }
  if (player) {
    tabs.forEach(function (b, k) { b.addEventListener('click', function () { show(k, true); }); });
    pp.addEventListener('click', function () {
      paused = !paused;
      player.classList.toggle('paused', paused);
      updatePP();
      if (paused) halt(); else schedule();
    });
    player.classList.toggle('paused', paused);
    show(0, false);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        player.classList.toggle('offscreen', !visible);
        if (visible) schedule(); else halt();
        player.classList.toggle('paused', paused || !visible);
      }, { threshold: 0.35 }).observe(player);
    } else { visible = true; schedule(); }
  }

  // ---------- Reveal on scroll ----------
  var revealTargets = document.querySelectorAll('.section-head, .tile, .setup-steps li, .dash, .board-wrap, .saudi-cards article, .qa, .contact-form');
  if ('IntersectionObserver' in window && !reduceMotion) {
    var ro = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); ro.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealTargets.forEach(function (el) {
      // Only hide things that start below the fold, so nothing visible on load ever blinks.
      if (el.getBoundingClientRect().top > window.innerHeight) { el.classList.add('reveal'); ro.observe(el); }
    });
    var rep = document.querySelector('.reports');
    if (rep) new IntersectionObserver(function (e, o) { if (e[0].isIntersecting) { rep.classList.add('in'); o.disconnect(); } }, { threshold: 0.3 }).observe(rep);
  } else {
    root.classList.add('no-io');
  }

  // ---------- Contact form ----------
  // No backend yet: validates, then opens the visitor's mail app with the message filled in.
  var form = document.getElementById('contact-form');
  var status = document.getElementById('form-status');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var firstBad = null;
    form.querySelectorAll('input, select, textarea').forEach(function (el) {
      var bad = !el.checkValidity();
      el.closest('.field').classList.toggle('invalid', bad);
      if (bad && !firstBad) firstBad = el;
    });
    if (firstBad) {
      status.textContent = t('invalid');
      status.classList.add('error');
      firstBad.focus();
      return;
    }
    var f = form.elements, L = t('labels');
    var body = [
      L[0] + ': ' + f.name.value,
      f.company.value ? L[1] + ': ' + f.company.value : null,
      L[2] + ': ' + f.email.value,
      f.phone.value ? L[3] + ': ' + f.phone.value : null,
      L[4] + ': ' + f.team.value,
      '',
      f.message.value
    ].filter(function (x) { return x !== null; }).join('\n');
    var subject = t('subject') + (f.company.value ? ' · ' + f.company.value : '');
    status.classList.remove('error');
    status.textContent = t('sent');
    window.location.href = 'mailto:' + CONTACT_EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  });
  form.addEventListener('input', function (e) {
    var fld = e.target.closest('.field');
    if (fld && e.target.checkValidity()) fld.classList.remove('invalid');
  });

  var yr = document.querySelector('[data-year]');
  if (yr) yr.textContent = new Date().getFullYear();

  applyLang(lang());
})();
