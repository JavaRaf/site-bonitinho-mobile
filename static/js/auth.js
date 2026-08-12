function showError(msg) {
    const el = document.getElementById("authError");
    if (el) el.textContent = msg;
}

async function submitAuth(endpoint, username, password) {
    try {
        const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
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
        submitAuth("/api/auth/register", u, p);
    });
}
