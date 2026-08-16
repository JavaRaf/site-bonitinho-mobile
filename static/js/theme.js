(function () {
    const KEY = "theme";
    const MOON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;
    const SUN = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`;

    function apply(theme) {
        document.documentElement.setAttribute("data-theme", theme);
        const btn = document.getElementById("darkToggle");
        if (btn) {
            btn.innerHTML = theme === "dark" ? SUN : MOON;
            btn.title = theme === "dark" ? "Modo claro" : "Modo escuro";
            btn.setAttribute("aria-label", btn.title);
        }
    }

    let theme = localStorage.getItem(KEY);
    if (!theme && window.matchMedia) {
        theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    theme = theme === "dark" ? "dark" : "light";
    apply(theme);

    document.addEventListener("DOMContentLoaded", () => {
        apply(theme);
        document.getElementById("darkToggle")?.addEventListener("click", () => {
            theme = theme === "dark" ? "light" : "dark";
            localStorage.setItem(KEY, theme);
            apply(theme);
        });
    });
})();
