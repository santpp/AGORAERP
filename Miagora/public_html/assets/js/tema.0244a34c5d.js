/* Agora Digital App · arranque del tema (se carga en <head> para que no parpadee el color al abrir).
   Tema: "auto" (sigue al sistema, como en iPhone y Mac), "light" o "dark". Acento: color de marca para botones y selección. */
(function () {
  var get = function (k, d) { try { var v = localStorage.getItem('agora_fin_' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  var theme = get('theme', 'auto'), accent = get('accent', 'vino');
  var dark = theme === 'dark' || (theme === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  var r = document.documentElement;
  r.setAttribute('data-theme', dark ? 'dark' : 'light');
  r.setAttribute('data-accent', accent || 'vino');
  if (get('nav_v1', 'top') === 'side') r.classList.add('nav-side'); // menú arriba (predeterminado) o barra lateral (opcional)
  if (get('side_v1', 'open') === 'closed') r.classList.add('side-closed');
  if (/Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)) r.classList.add('is-apple');
  if (window.AgoraAndroid || /AgoraDigitalApp/.test(navigator.userAgent)) r.classList.add('is-android-app');
  try { if (window.matchMedia && (matchMedia('(display-mode: standalone)').matches || navigator.standalone)) r.classList.add('is-standalone'); } catch (e) {}
})();
