// Eye toggle for password inputs (shared by auth pages)
(function () {
  const eyeOpenFallback = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  const eyeClosedFallback = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.53 9.53A3 3 0 0 0 12 15a3 3 0 0 0 2.47-1.47"/><path d="M1 1l22 22"/></svg>`;

  const eyeCache = {};
  async function loadEye(key, fallback) {
    if (eyeCache[key]) return eyeCache[key];
    try {
      const res = await fetch(`/static/svg/${key}.svg?v=2`);
      if (!res.ok) throw new Error("not ok");
      const raw = await res.text();
      const m = raw.match(/<svg[\s\S]*?<\/svg>/);
      if (!m) throw new Error("no svg");
      let svg = m[0]
        // drop fixed size so CSS controls dimensions
        .replace(/\s(width|height)="[^"]*"/g, "")
        // force currentColor so icons follow the theme
        .replace(/stroke="#000000"/g, 'stroke="currentColor"')
        .replace(/stroke='#000000'/g, "stroke='currentColor'");
      eyeCache[key] = svg;
      return svg;
    } catch {
      eyeCache[key] = fallback;
      return fallback;
    }
  }

  let iconsReady = null;
  function readyIcons() {
    if (!iconsReady) {
      iconsReady = Promise.all([
        loadEye("eye", eyeOpenFallback),
        loadEye("eye-close", eyeClosedFallback),
      ]);
    }
    return iconsReady;
  }

  async function init() {
    const [eyeOpen, eyeClosed] = await readyIcons();
    document.querySelectorAll('input[type="password"]').forEach((inp) => {
      if (inp.dataset.eyeInit) return;
      inp.dataset.eyeInit = "1";
      const wrapper = document.createElement("div");
      wrapper.className = "password-wrapper";
      inp.parentNode.insertBefore(wrapper, inp);
      wrapper.appendChild(inp);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "password-toggle";
      btn.setAttribute("aria-label", "Mostrar senha");
      btn.innerHTML = eyeOpen;
      let shown = false;
      btn.addEventListener("click", () => {
        shown = !shown;
        inp.type = shown ? "text" : "password";
        btn.innerHTML = shown ? eyeClosed : eyeOpen;
        btn.setAttribute("aria-label", shown ? "Ocultar senha" : "Mostrar senha");
      });
      wrapper.appendChild(btn);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  // observe dynamically created inputs (e.g. modals)
  new MutationObserver(init).observe(document.body, { childList: true, subtree: true });
})();
