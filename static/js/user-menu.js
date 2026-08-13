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
            document.getElementById("menuAdmin").style.display = data.user.is_admin ? "" : "none";
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

// Criar post
 document.getElementById("menuUpload").addEventListener("click", () => {
    menu.classList.remove("open");
    document.getElementById("composerModal").classList.add("open");
});

// Logout
document.getElementById("menuLogout").addEventListener("click", async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
});

loadProfile();

