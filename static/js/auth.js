function showError(msg) {
    const el = document.getElementById("authError");
    if (el) el.textContent = msg;
}

function setUsernameError(msg, isError) {
    const el = document.getElementById("usernameError");
    const input = document.getElementById("username");
    const btn = document.getElementById("registerBtn");
    if (el) el.textContent = msg || "";
    if (input) {
        input.classList.remove("input-error", "input-success");
        if (msg && isError) input.classList.add("input-error");
        else if (msg && !isError) input.classList.add("input-success");
        else if (!msg && input.value.trim().length >= 3 && !isError) {
            // no msg means available -> success handled elsewhere
        }
    }
    // also mirror to generic authError for screen readers when duplicate on submit
    if (isError && msg) {
        // keep field error primary, generic as fallback handled in submitAuth
    }
    // disable button only when definitely taken
    if (btn) {
        if (isError && msg === "nome de usuário já em uso") btn.disabled = true;
        else if (!msg || msg === "") {
            // re-enable if not taken - will be managed by check logic
        }
    }
}

function translateError(err) {
    const map = {
        "username already taken": "nome de usuário já em uso",
        "username and password required": "usuário e senha são obrigatórios",
        "username min 3 chars, password min 4": "usuário mínimo 3 caracteres, senha mínimo 4",
    };
    return map[err] || err;
}

async function submitAuth(endpoint, username, password, display_name, email) {
    try {
        const payload = { username, password };
        if (display_name !== undefined) payload.display_name = display_name;
        if (email !== undefined) payload.email = email;
        const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) {
            const msg = translateError(data.error || "Erro desconhecido");
            // if duplicate username, show inline field error too
            if (res.status === 409 && msg.includes("já em uso")) {
                setUsernameError(msg, true);
            }
            if (msg.includes("já em uso") || msg.includes("já cadastrado")) {
                // keep field error, also show generic
            }
            showError(msg);
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
    registerForm.addEventListener("submit", async e => {
        e.preventDefault();
        const u = document.getElementById("username").value.trim();
        const p = document.getElementById("password").value;
        const d = document.getElementById("display_name") ? document.getElementById("display_name").value.trim() : undefined;
        const em = document.getElementById("email") ? document.getElementById("email").value.trim() : undefined;

        // validação final antes de enviar: checa novamente se username está em uso
        if (u.length >= 3) {
            try {
                const chk = await fetch(`/api/auth/check-username?username=${encodeURIComponent(u)}`);
                const chkData = await chk.json();
                if (!chkData.available) {
                    setUsernameError(chkData.reason || "nome de usuário já em uso", true);
                    showError(chkData.reason || "nome de usuário já em uso");
                    return;
                }
            } catch {}
        }

        submitAuth("/api/auth/register", u, p, d, em);
    });

    // validação em tempo real do username
    const usernameInput = document.getElementById("username");
    const registerBtn = document.getElementById("registerBtn");
    let debounceTimer = null;
    let lastChecked = "";

    async function checkUsernameAvailability(value) {
        const v = value.trim();
        if (!v || v.length < 3) {
            setUsernameError("", false);
            if (registerBtn) registerBtn.disabled = false;
            if (v.length > 0 && v.length < 3) {
                setUsernameError("mínimo 3 caracteres", true);
            }
            return;
        }
        if (v === lastChecked) return;
        lastChecked = v;
        try {
            const res = await fetch(`/api/auth/check-username?username=${encodeURIComponent(v)}`);
            const data = await res.json();
            // evita race: só aplica se valor atual ainda é o mesmo
            if (usernameInput.value.trim() !== v) return;
            if (!data.available) {
                setUsernameError(data.reason || "nome de usuário já em uso", true);
                if (registerBtn) registerBtn.disabled = true;
            } else {
                const inp = document.getElementById("username");
                if (inp) {
                    inp.classList.remove("input-error");
                    inp.classList.add("input-success");
                }
                const errEl = document.getElementById("usernameError");
                if (errEl) errEl.textContent = "";
                if (registerBtn) registerBtn.disabled = false;
                // limpa erro genérico se era de username
                const authErr = document.getElementById("authError");
                if (authErr && authErr.textContent.includes("já em uso")) authErr.textContent = "";
            }
        } catch {
            // ignora erro de rede no typing
        }
    }

    usernameInput?.addEventListener("input", () => {
        clearTimeout(debounceTimer);
        // feedback imediato: limpa estado se ficou vazio
        if (!usernameInput.value.trim()) {
            setUsernameError("", false);
            if (registerBtn) registerBtn.disabled = false;
            const inp = document.getElementById("username");
            if (inp) inp.classList.remove("input-error", "input-success");
            return;
        }
        debounceTimer = setTimeout(() => checkUsernameAvailability(usernameInput.value), 350);
    });

    usernameInput?.addEventListener("blur", () => {
        clearTimeout(debounceTimer);
        checkUsernameAvailability(usernameInput.value);
    });
}

// Forgot password
function initForgot() {
const forgotLink = document.getElementById("forgotLink");
const forgotOverlay = document.getElementById("forgotOverlay");
const forgotCancel = document.getElementById("forgotCancel");
const forgotSubmit = document.getElementById("forgotSubmit");
if (!forgotLink || !forgotOverlay) return;
    forgotLink.addEventListener("click", (e) => {
        e.preventDefault();
        forgotOverlay.removeAttribute("hidden");
        forgotOverlay.style.display = "flex";
        const err = document.getElementById("forgotError");
        if (err) err.textContent = "";
        const ok = document.getElementById("forgotSuccess");
        if (ok) { ok.hidden = true; ok.textContent = ""; ok.style.display = "none"; }
        const inp = document.getElementById("forgotUsername");
        if (inp) { inp.value = document.getElementById("username")?.value.trim() || ""; setTimeout(()=>inp.focus(), 50); }
    });
    const closeForgot = () => { forgotOverlay.setAttribute("hidden",""); forgotOverlay.style.display = "none"; };
    forgotCancel?.addEventListener("click", closeForgot);
    forgotOverlay.addEventListener("click", (e) => { if (e.target === forgotOverlay) closeForgot(); });
    ["forgotUsername","forgotCode","forgotNewPass"].forEach(id=>{
        document.getElementById(id)?.addEventListener("keydown", (e)=>{ if(e.key==="Enter"){ e.preventDefault(); forgotSubmit?.click(); }});
    });
    forgotSubmit?.addEventListener("click", async () => {
        const u = document.getElementById("forgotUsername")?.value.trim();
        const code = document.getElementById("forgotCode")?.value.trim().toUpperCase();
        const np = document.getElementById("forgotNewPass")?.value;
        const errEl = document.getElementById("forgotError");
        const okEl = document.getElementById("forgotSuccess");
        if (!u) { errEl.textContent = "Digite seu usuário"; return; }
        if (!code) { errEl.textContent = "Digite o código"; return; }
        if (!np || np.length < 4) { errEl.textContent = "Nova senha mínimo 4 caracteres"; return; }
        errEl.textContent = "";
        if (okEl) { okEl.hidden = true; }
        forgotSubmit.disabled = true;
        try {
            const res = await fetch("/api/auth/recovery/reset", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: u, code, password: np })
            });
            const data = await res.json();
            if (!res.ok) { errEl.textContent = data.error || "Erro"; return; }
            okEl.textContent = "Senha redefinida! Faça login com a nova senha.";
            okEl.hidden = false;
            okEl.style.display = "block";
            setTimeout(()=>{ forgotOverlay.setAttribute("hidden",""); forgotOverlay.style.display="none"; }, 1500);
        } catch (err) {
            console.error(err);
            errEl.textContent = "Erro de conexão";
        } finally {
            forgotSubmit.disabled = false;
        }
    });
}
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initForgot);
} else {
    initForgot();
}
