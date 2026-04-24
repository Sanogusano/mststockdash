// Registro condicional del Service Worker.
// Evita registro en el preview de Lovable / iframes para no romper hot-reload.

const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

const host = window.location.hostname;
const isPreviewHost =
  host.includes('id-preview--') ||
  host.includes('lovableproject.com') ||
  host.includes('lovable.app') && host.startsWith('id-preview--') ||
  host === 'localhost' ||
  host === '127.0.0.1';

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  if (isInIframe || isPreviewHost) {
    // Limpiar SWs previos en contextos de preview/dev
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister());
    }).catch(() => {});
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
}
