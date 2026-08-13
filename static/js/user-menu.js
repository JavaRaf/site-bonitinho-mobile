const avatarEl = document.getElementById("user-avatar");
const avatarImg = avatarEl.querySelector("img");
const menu = document.getElementById("userMenu");

async function loadProfile() {
    try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        if (data.user) {
            const avatar = data.user.avatar;
            if (!avatar || avatar === "default-avatar.svg") {
                avatarImg.src = "/static/svg/default-avatar.svg";
            } else {
                avatarImg.src = `/avatars/${avatar}`;
                avatarImg.onerror = () => { avatarImg.src = "/static/svg/default-avatar.svg"; };
            }
        } else {
            window.location.href = "/login";
        }
    } catch { /* ignore */ }
}

avatarEl.addEventListener("click", () => menu.classList.toggle("open"));

document.addEventListener("click", e => {
    if (!e.target.closest(".user")) menu.classList.remove("open");
});

// Admin
document.getElementById("menuAdmin").addEventListener("click", () => {
    menu.classList.remove("open");
    window.location.href = "/admin";
});

// Perfil
document.getElementById("menuPerfil").addEventListener("click", () => {
    menu.classList.remove("open");
    window.location.href = "/perfil";
});

// Votos
document.getElementById("menuVotos").addEventListener("click", () => {
    menu.classList.remove("open");
    window.location.href = "/votos";
});

// Upload
document.getElementById("menuUpload").addEventListener("click", () => {
    menu.classList.remove("open");
    document.getElementById("uploadInput").click();
});

document.getElementById("uploadInput").addEventListener("change", async () => {
    const files = document.getElementById("uploadInput").files;
    if (!files.length) return;
    const form = new FormData();
    for (const f of files) form.append("images", f);
    try {
        const res = await fetch("/api/upload", { method: "POST", body: form });
        if (res.ok) {
            document.getElementById("uploadInput").value = "";
            location.reload();
        } else if (res.status === 401) {
            window.location.href = "/login";
        }
    } catch { /* ignore */ }
});

// Logout
document.getElementById("menuLogout").addEventListener("click", async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
});

loadProfile();

