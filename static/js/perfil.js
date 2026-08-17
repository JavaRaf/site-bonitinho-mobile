const AVATAR_DEFAULT = "/static/svg/default-avatar.svg";
const COLOR_OPTIONS = ["#f43f5e", "#ef4444", "#6366f1", "#3b82f6", "#10b981", "#22c55e", "#f59e0b", "#f97316", "#8b5cf6", "#a855f7", "#0ea5e9", "#06b6d4", "#ec4899", "#d946ef", "#84cc16", "#14b8a6", "#eab308", "#64748b"];
let selectedColor = "";

async function loadProfile() {
    try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        if (!data.user) { window.location.href = "/login"; return; }
        document.getElementById("perfilUsername").value = data.user.username;
        setAvatarSrc(data.user.avatar);
        selectedColor = data.user.color || "";
        buildColorPicker();
    } catch { /* ignore */ }
}

function setAvatarSrc(avatar) {
    const img = document.getElementById("perfilAvatarImg");
    if (!avatar || avatar === "default-avatar.svg") {
        img.src = AVATAR_DEFAULT;
        return;
    }
    img.src = `/avatars/${avatar}`;
    img.onerror = () => { img.src = AVATAR_DEFAULT; };
}

const avatarMenu = document.getElementById("perfilAvatarMenu");
const avatarMenuBtn = document.getElementById("perfilAvatarMenuBtn");

avatarMenuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    avatarMenu.hidden = !avatarMenu.hidden;
});

document.addEventListener("click", (e) => {
    if (!avatarMenu.hidden && !avatarMenu.contains(e.target) && !avatarMenuBtn.contains(e.target)) {
        avatarMenu.hidden = true;
    }
});

document.getElementById("perfilAvatarUpload").addEventListener("click", () => {
    avatarMenu.hidden = true;
    document.getElementById("perfilAvatarInput").click();
});

document.getElementById("perfilAvatarInput").addEventListener("change", async () => {
    const input = document.getElementById("perfilAvatarInput");
    const file = input.files[0];
    if (!file) return;
    const errEl = document.getElementById("perfilError");
    errEl.textContent = "";
    const form = new FormData();
    form.append("avatar", file);
    try {
        const res = await fetch("/api/auth/avatar", { method: "POST", body: form });
        const data = await res.json();
        if (data.avatar) {
            setAvatarSrc(data.avatar);
        } else {
            errEl.textContent = data.error || "Erro ao enviar avatar";
        }
    } catch {
        errEl.textContent = "Erro ao enviar avatar";
    } finally {
        input.value = "";
    }
});

document.getElementById("perfilAvatarRemove").addEventListener("click", async () => {
    const errEl = document.getElementById("perfilError");
    errEl.textContent = "";
    avatarMenu.hidden = true;
    try {
        const res = await fetch("/api/auth/avatar", { method: "DELETE" });
        const data = await res.json();
        if (data.avatar) setAvatarSrc(data.avatar);
    } catch {
        errEl.textContent = "Erro ao remover avatar";
    }
});

function buildColorPicker() {
    const container = document.getElementById("perfilColorList");
    if (!container) return;
    container.innerHTML = COLOR_OPTIONS.map(c =>
        `<div class="perfil-color-option${c === selectedColor ? " selected" : ""}" data-color="${c}" style="background:${c}"></div>`
    ).join("");
    container.querySelectorAll(".perfil-color-option").forEach(opt => {
        opt.addEventListener("click", () => {
            selectedColor = opt.dataset.color;
            container.querySelectorAll(".perfil-color-option").forEach(o => o.classList.remove("selected"));
            opt.classList.add("selected");
        });
    });
    if (selectedColor) {
        container.closest('.perfil-section').classList.add('open');
    }
}

const colorToggle = document.getElementById("perfilColorToggle");
if (colorToggle) {
    colorToggle.addEventListener("click", () => {
        colorToggle.closest('.perfil-section').classList.toggle('open');
    });
}

document.getElementById("perfilSave").addEventListener("click", async () => {
    const username = document.getElementById("perfilUsername").value.trim();
    const errEl = document.getElementById("perfilError");
    const okEl = document.getElementById("perfilOk");
    errEl.textContent = "";
    okEl.textContent = "";

    if (username.length < 3) {
        errEl.textContent = "Nome deve ter no mínimo 3 caracteres";
        return;
    }

    const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, color: selectedColor })
    });
    const data = await res.json();

    if (data.username) {
        window.location.href = "/";
    } else {
        errEl.textContent = data.error || "Erro ao salvar";
    }
});

loadProfile();
