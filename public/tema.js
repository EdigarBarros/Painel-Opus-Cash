// Aplica o tema antes de o painel abrir (sem piscar claro/escuro). A escolha fica só neste navegador (src/lib/tema.ts).
(function () {
  var t = null
  try { t = localStorage.getItem('painel-tema') } catch { /* sem armazenamento */ }
  if (t !== 'claro' && t !== 'escuro') t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'claro' : 'escuro'
  document.documentElement.dataset.tema = t
})()
