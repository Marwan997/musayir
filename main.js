import { initHeroScene } from './scene.js';

// Where contact-form submissions go. Replace with the real inbox.
const CONTACT_EMAIL = 'info@musayir.sa';

// ---- 3D hero ----
const canvas = document.getElementById('hero-canvas');
if (canvas) initHeroScene(canvas);

// ---- Header: background on scroll, mobile menu, active link ----
const root = document.documentElement;
const header = document.querySelector('.site-header');
const toggle = document.getElementById('nav-toggle');
const navLinks = document.querySelectorAll('.nav-links a');

const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 20);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

function setMenu(open) {
  root.classList.toggle('nav-open', open);
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'إغلاق القائمة' : 'فتح القائمة');
}
toggle.addEventListener('click', () => setMenu(!root.classList.contains('nav-open')));
navLinks.forEach((a) => a.addEventListener('click', () => setMenu(false)));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

const sections = [...navLinks].map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
const activeObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    navLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${entry.target.id}`));
  });
}, { rootMargin: '-45% 0px -50% 0px' });
sections.forEach((s) => activeObserver.observe(s));

// ---- Reveal on scroll ----
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('in');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

// ---- Contact form ----
// No backend yet: validates, then opens the visitor's mail app with the message pre-filled.
// Swap sendLead() for a real endpoint (e.g. Salesforce Web-to-Lead or your own API) when ready.
const form = document.getElementById('contact-form');
const status = document.getElementById('form-status');

function sendLead(data) {
  const body = [
    `الاسم: ${data.name}`,
    data.company ? `الشركة: ${data.company}` : null,
    `البريد: ${data.email}`,
    data.phone ? `الجوال: ${data.phone}` : null,
    `الخدمة: ${data.service}`,
    '',
    data.message,
  ].filter((line) => line !== null).join('\n');
  const subject = `طلب جديد: ${data.service}`;
  window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  let firstInvalid = null;
  form.querySelectorAll('input, select, textarea').forEach((el) => {
    const bad = !el.checkValidity();
    el.closest('.field').classList.toggle('invalid', bad);
    if (bad && !firstInvalid) firstInvalid = el;
  });
  if (firstInvalid) {
    status.textContent = 'يرجى تعبئة الحقول المطلوبة بشكل صحيح.';
    status.classList.add('error');
    firstInvalid.focus();
    return;
  }
  status.classList.remove('error');
  sendLead(Object.fromEntries(new FormData(form)));
  status.textContent = 'شكراً لك! سيُفتح بريدك لإرسال الرسالة إلى فريقنا.';
  form.reset();
});

form.addEventListener('input', (e) => {
  const field = e.target.closest('.field');
  if (field?.classList.contains('invalid') && e.target.checkValidity()) field.classList.remove('invalid');
});

document.querySelectorAll('[data-contact-email]').forEach((a) => {
  a.href = `mailto:${CONTACT_EMAIL}`;
  a.textContent = CONTACT_EMAIL;
});
document.getElementById('year').textContent = new Date().getFullYear();
