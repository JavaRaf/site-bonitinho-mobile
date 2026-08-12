const avatarList = ["red.svg", "indigo.svg", "green.svg", "amber.svg", "purple.svg"];
let selectedAvatar = "red.svg";

async function loadProfile() {
    try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        if (!data.user) { window.location.href = "/login"; return; }
        selectedAvatar = data.user.avatar || "red.svg";
        document.getElementById("perfilUsername").value = data.user.username;
        document.getElementById("perfilAvatarImg").src = `/avatars/${selectedAvatar}`;
        buildAvatarPicker();
    } catch { /* ignore */ }
}

function buildAvatarPicker() {
    const container = document.getElementById("perfilAvatarList");
    container.innerHTML = avatarList.map(a => {
        const sel = a === selectedAvatar ? " selected" : "";
        return `<div class="perfil-avatar-option${sel}" data-avatar="${a}">
            <img src="/avatars/${a}" alt="${a}">
        </div>`;
    }).join("");

    container.querySelectorAll(".perfil-avatar-option").forEach(opt => {
        opt.addEventListener("click", () => {
            selectedAvatar = opt.dataset.avatar;
            document.getElementById("perfilAvatarImg").src = `/avatars/${selectedAvatar}`;
            container.querySelectorAll(".perfil-avatar-option").forEach(o => o.classList.remove("selected"));
            opt.classList.add("selected");
        });
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
        body: JSON.stringify({ username, avatar: selectedAvatar })
    });
    const data = await res.json();

    if (data.username) {
        window.location.href = "/";
    } else {
        errEl.textContent = data.error || "Erro ao salvar";
    }
});

loadProfile();
