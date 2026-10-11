/* Arranque (bloqueante, < 1 KB): aplica el tema antes de pintar, sin parpadeo. */
(function () {
  'use strict';
  var d = document.documentElement;
  d.classList.add('js');
  var t = null;
  try { t = window.localStorage.getItem('agora-theme'); } catch (e) { /* sin almacenamiento */ }
  if (!t && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) t = 'dark';
  d.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
})();
