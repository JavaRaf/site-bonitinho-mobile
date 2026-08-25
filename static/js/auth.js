function showError(msg) {
    const el = document.getElementById("authError");
    if (el) el.textContent = msg;
}

async function submitAuth(endpoint, username, password, display_name) {
    try {
        const payload = { username, password };
        if (display_name !== undefined) payload.display_name = display_name;
        const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) {
            showError(data.error || "Erro desconhecido");
            return;
        }
        window.location.href = "/";
    } catch {
        showError("Erro de conexão");
    }
}

const loginForm = document.getElementById("loginForm");
if (loginForm) {
    loginForm.addEventListener("submit", e => {
        e.preventDefault();
        const u = document.getElementById("username").value.trim();
        const p = document.getElementById("password").value;
        submitAuth("/api/auth/login", u, p);
    });
}

const registerForm = document.getElementById("registerForm");
if (registerForm) {
    registerForm.addEventListener("submit", e => {
        e.preventDefault();
        const u = document.getElementById("username").value.trim();
        const p = document.getElementById("password").value;
        const d = document.getElementById("display_name") ? document.getElementById("display_name").value.trim() : undefined;
        submitAuth("/api/auth/register", u, p, d);
    });
}
