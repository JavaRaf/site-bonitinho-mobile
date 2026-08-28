(function () {
    const KEY = "theme";
    const NAV_KEY = "navState";

    function apply(theme) {
        document.documentElement.setAttribute("data-theme", theme);
    }

    function readNavState() {
        try {
            return JSON.parse(sessionStorage.getItem(NAV_KEY) || "null") || {};
        } catch {
            return {};
        }
    }

    function saveNavState(extra = {}) {
        const state = Object.assign({}, readNavState(), extra, {
            path: location.pathname,
            scrollX: window.scrollX,
            scrollY: window.scrollY,
            ts: Date.now(),
        });
        try {
            sessionStorage.setItem(NAV_KEY, JSON.stringify(state));
        } catch { /* ignore */ }
        return state;
    }

    function restoreNavState() {
        const state = readNavState();
        if (!state || state.path !== location.pathname) return false;
        requestAnimationFrame(() => {
            if (typeof state.scrollX === "number" || typeof state.scrollY === "number") {
                window.scrollTo(state.scrollX || 0, state.scrollY || 0);
            }
        });
        return true;
    }

    window.saveNavState = saveNavState;
    window.restoreNavState = restoreNavState;
    window.goToProfile = function (username) {
        if (!username) return;
        saveNavState();
        location.href = "/perfil/" + encodeURIComponent(username);
    };

    let theme = localStorage.getItem(KEY);
    if (!theme && window.matchMedia) {
        theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    theme = theme === "dark" ? "dark" : "light";
    apply(theme);

    window.addEventListener("pageshow", () => {
        restoreNavState();
    });

    document.addEventListener("click", e => {
        const link = e.target.closest('a[href^="/perfil/"]');
        if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const username = link.getAttribute("href").split("/").filter(Boolean)[1];
        if (!username) return;
        e.preventDefault();
        goToProfile(username);
    });

    document.addEventListener("DOMContentLoaded", () => {
        apply(theme);
        document.getElementById("menuDarkToggle")?.addEventListener("click", () => {
            theme = theme === "dark" ? "light" : "dark";
            localStorage.setItem(KEY, theme);
            apply(theme);
        });
    });
})();
