(function () {
    const KEY = "theme";

    function apply(theme) {
        document.documentElement.setAttribute("data-theme", theme);
    }

    let theme = localStorage.getItem(KEY);
    if (!theme && window.matchMedia) {
        theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    theme = theme === "dark" ? "dark" : "light";
    apply(theme);

    document.addEventListener("DOMContentLoaded", () => {
        apply(theme);
        document.getElementById("menuDarkToggle")?.addEventListener("click", () => {
            theme = theme === "dark" ? "light" : "dark";
            localStorage.setItem(KEY, theme);
            apply(theme);
        });
    });
})();
