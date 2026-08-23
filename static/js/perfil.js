const AVATAR_DEFAULT = "/static/svg/default-avatar.svg";
const COLORS = [
    "#f43f5e","#ef4444","#6366f1","#3b82f6","#10b981","#22c55e",
    "#f59e0b","#f97316","#8b5cf6","#a855f7","#0ea5e9","#06b6d4",
    "#ec4899","#d946ef","#84cc16","#14b8a6","#eab308","#64748b"
];

let profile = null;
let postsPage = 1;
let postsLoading = false;
let postsHasMore = true;
let activeTab = "all";
let selectedColor = "";

/* ── Helpers ──────────────────────────────────────────────── */

function getUsernameFromURL() {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && parts[0] === "perfil") {
        try {
            return decodeURIComponent(parts[1]);
        } catch {
            return parts[1];
        }
    }
    return null;
}

function setAvatar(img, avatar) {
    if (!avatar || avatar === "default-avatar.svg") {
        img.src = AVATAR_DEFAULT;
    } else {
        img.src = "/avatars/" + avatar;
        img.onerror = () => { img.src = AVATAR_DEFAULT; };
    }
}

function setCover(img, cover) {
    if (cover) {
        img.src = "/covers/" + cover;
        img.style.display = "";
    } else {
        img.removeAttribute("src");
        img.style.display = "none";
    }
}

function formatDate(dateStr) {
    if (!dateStr) return "";
    const normalized = /Z$|[+-]\d{2}:?\d{2}$/.test(dateStr) ? dateStr : dateStr + "Z";
    const d = new Date(normalized);
    const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    return months[d.getMonth()] + " " + d.getFullYear();
}

function esc(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
}

/* ── Load Profile ─────────────────────────────────────────── */

async function loadProfile() {
    const username = getUsernameFromURL();
    if (!username) {
        const me = await fetch("/api/auth/me").then(r => r.json()).catch(() => null);
        if (me?.user) {
            location.href = "/perfil/" + me.user.username;
        } else {
            location.href = "/login";
        }
        return;
    }

    const data = await fetch("/api/profile/" + encodeURIComponent(username)).then(r => r.json()).catch(() => null);
    if (!data || data.error) {
        const msg = data?.error === "profile not available"
            ? "Este perfil não está disponível"
            : "Perfil não encontrado";
        document.getElementById("profilePage").innerHTML =
            '<div style="text-align:center;padding:64px 24px;color:var(--text-muted)">' + msg + '</div>';
        return;
    }

    profile = data;
    document.title = data.username + " — MikanNet";

    setAvatar(document.getElementById("avatarImg"), data.avatar);
    setCover(document.getElementById("coverImg"), data.cover);

    const nameEl = document.getElementById("profileName");
    nameEl.textContent = data.username;
    if (data.color) nameEl.style.color = data.color;

    document.getElementById("topbarName").textContent = data.username;
    document.getElementById("topbarCount").textContent = data.posts_count + " posts";
    document.getElementById("profileHandle").textContent = "@" + data.username;

    renderStats(data);

    document.querySelectorAll(".stat-link").forEach(el => {
        el.style.cursor = "pointer";
        el.addEventListener("click", () => openUserList(el.dataset.list));
    });

    renderActions(data);
    renderDetails(data);
    updateBioDisplay();
    loadPosts(data.username);

    if (data.is_me) {
        document.getElementById("btnCoverEdit").hidden = false;
        document.getElementById("btnAvatarEdit").hidden = false;
        document.getElementById("tabBlocked").hidden = false;
    }
}

/* ── Stats ────────────────────────────────────────────────── */

function renderStats(data) {
    document.getElementById("profileStats").innerHTML =
        "<span class='stat-link' data-list='following'><strong>" + data.following_count + "</strong> Seguindo</span>" +
        "<span class='stat-link' data-list='followers'><strong>" + data.followers_count + "</strong> Seguidores</span>";
}

/* ── Bio ──────────────────────────────────────────────────── */

function updateBioDisplay() {
    const bioEl = document.getElementById("profileBio");
    if (profile.bio) {
        bioEl.textContent = profile.bio;
        bioEl.hidden = false;
        bioEl.classList.toggle("editable", !!profile.is_me);
    } else {
        bioEl.textContent = "";
        bioEl.hidden = true;
    }
}

document.getElementById("profileBio").addEventListener("click", () => {
    if (!profile || !profile.is_me) return;
    document.getElementById("bioOverlay").classList.add("open");
});

document.getElementById("bioClose").addEventListener("click", () => {
    document.getElementById("bioOverlay").classList.remove("open");
});

document.getElementById("bioOverlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove("open");
});

document.getElementById("bioEdit").addEventListener("click", () => {
    document.getElementById("bioOverlay").classList.remove("open");
    openEditModal();
});

document.getElementById("bioDelete").addEventListener("click", async () => {
    document.getElementById("bioOverlay").classList.remove("open");
    const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio: "" }),
    });
    const data = await res.json();
    if (data.error) return alert(data.error);
    profile.bio = "";
    updateBioDisplay();
});

/* ── Actions ──────────────────────────────────────────────── */

async function openUserList(type) {
    if (!profile) return;
    const overlay = document.getElementById("listOverlay");
    const title = document.getElementById("listTitle");
    const body = document.getElementById("listBody");

    title.textContent = type === "followers" ? "Seguidores" : type === "following" ? "Seguindo" : "Bloqueados";
    body.innerHTML = '<div class="list-empty">Carregando...</div>';
    overlay.classList.add("open");

    const endpoints = {
        followers: "/api/profile/" + encodeURIComponent(profile.username) + "/followers",
        following: "/api/profile/" + encodeURIComponent(profile.username) + "/following-list",
        blocked: "/api/auth/blocked",
    };

    const res = await fetch(endpoints[type]).then(r => r.json()).catch(() => []);
    if (!Array.isArray(res) || !res.length) {
        body.innerHTML = '<div class="list-empty">' +
            (type === "blocked" ? "Ninguém bloqueado" : "Nenhum " + (type === "followers" ? "seguidor" : "seguindo") + " encontrado") +
            '</div>';
        return;
    }

    if (type === "blocked") {
        body.innerHTML = res.map(u =>
            '<div class="list-user">' +
                '<img class="list-user-avatar" src="' + avatarSrc(u.avatar) + '" alt="" onerror="this.src=\'' + AVATAR_DEFAULT + '\'">' +
                '<span class="list-user-name">@' + esc(u.username) + '</span>' +
                '<button class="list-unblock" data-username="' + esc(u.username) + '">Desbloquear</button>' +
            '</div>'
        ).join("");
        body.querySelectorAll(".list-unblock").forEach(btn => {
            btn.addEventListener("click", async () => {
                btn.disabled = true;
                try {
                    await fetch("/api/auth/block/" + encodeURIComponent(btn.dataset.username), { method: "POST" });
                    openUserList("blocked");
                } catch { btn.disabled = false; }
            });
        });
        return;
    }

    body.innerHTML = res.map(u =>
        '<a class="list-user" href="/perfil/' + esc(u.username) + '">' +
            '<img class="list-user-avatar" src="' + avatarSrc(u.avatar) + '" alt="" onerror="this.src=\'' + AVATAR_DEFAULT + '\'">' +
            '<span class="list-user-name" style="color:' + esc(u.color || 'var(--text)') + '">@' + esc(u.username) + '</span>' +
        '</a>'
    ).join("");
}

function avatarSrc(avatar) {
    if (!avatar || avatar === "default-avatar.svg") return AVATAR_DEFAULT;
    return "/avatars/" + avatar;
}

document.getElementById("listClose").addEventListener("click", () => {
    document.getElementById("listOverlay").classList.remove("open");
    syncTabsActive();
});
document.getElementById("listOverlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) {
        e.currentTarget.classList.remove("open");
        syncTabsActive();
    }
});

function renderActions(data) {
    const el = document.getElementById("actionButtons");
    if (data.is_me) {
        el.innerHTML = "";
        document.getElementById("btnEdit").hidden = false;
        document.getElementById("btnEdit").addEventListener("click", openEditModal);
        return;
    }

    if (data.is_blocked) {
        el.innerHTML =
            '<button class="action-btn action-btn-danger" id="btnBlock" style="grid-column: 1 / -1">' +
                '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> Desbloquear' +
            '</button>';
        document.getElementById("btnBlock").addEventListener("click", toggleBlock);
        return;
    }

    el.innerHTML =
        '<button class="action-btn action-btn-primary' + (data.is_following ? " following" : "") + '" id="btnFollow">' +
            (data.is_following ?
                '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> Seguindo' :
                '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Seguir') +
        '</button>' +
        '<button class="action-btn action-btn-danger" id="btnBlock">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> Bloquear' +
        '</button>';

    document.getElementById("btnFollow").addEventListener("click", toggleFollow);
    document.getElementById("btnBlock").addEventListener("click", toggleBlock);
}

async function toggleBlock() {
    const res = await fetch("/api/auth/block/" + encodeURIComponent(profile.username), { method: "POST" });
    const data = await res.json();
    if (!res.ok) return;

    profile.is_blocked = data.blocked;
    renderActions(profile);
    loadPosts(profile.username);
}

async function toggleFollow() {
    const res = await fetch("/api/auth/follow/" + encodeURIComponent(profile.username), { method: "POST" });
    const data = await res.json();
    if (!res.ok) return;

    profile.is_following = data.following;
    profile.followers_count = data.followers_count;
    renderStats(profile);

    const btn = document.getElementById("btnFollow");
    btn.classList.toggle("following", data.following);
    btn.innerHTML = data.following ?
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> Seguindo' :
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Seguir';
}

/* ── Details ──────────────────────────────────────────────── */

function renderDetails(data) {
    const list = document.getElementById("detailsList");
    let html = "";

    if (data.location) {
        html += '<div class="detail-item">' +
            '<span class="detail-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></span>' +
            '<span class="detail-text">' + esc(data.location) + '</span></div>';
    }

    if (data.birthday && /^\d{4}-\d{2}-\d{2}$/.test(data.birthday)) {
        const [y, m, d] = data.birthday.split("-");
        html += '<div class="detail-item">' +
            '<span class="detail-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span>' +
            '<span class="detail-text">Nascido em ' + esc(d + "/" + m + "/" + y) + '</span></div>';
    }

    if (data.marital_status) {
        html += '<div class="detail-item">' +
            '<span class="detail-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></span>' +
            '<span class="detail-text">' + esc(data.marital_status) + '</span></div>';
    }

    if (data.created_at) {
        const joined = formatDate(data.created_at);
        if (joined) {
            html += '<div class="detail-item">' +
                '<span class="detail-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span>' +
                '<span class="detail-text">Ingressou em ' + joined + '</span></div>';
        }
    }

    list.innerHTML = html;
}

/* ── Tabs ─────────────────────────────────────────────────── */

function syncTabsActive() {
    document.querySelectorAll(".profile-tabs .tab").forEach(t => {
        const isActive = t.dataset.tab === activeTab;
        t.classList.toggle("active", isActive);
        t.setAttribute("aria-selected", String(isActive));
    });
}

document.getElementById("profileTabs").addEventListener("click", (e) => {
    const tab = e.target.closest(".tab");
    if (!tab || !tab.dataset.tab) return;

    if (tab.dataset.tab === "blocked") {
        const overlay = document.getElementById("listOverlay");
        if (overlay.classList.contains("open")) {
            overlay.classList.remove("open");
            syncTabsActive();
        } else {
            document.querySelectorAll(".profile-tabs .tab").forEach(t => {
                if (t !== tab) {
                    t.classList.remove("active");
                    t.setAttribute("aria-selected", "false");
                }
            });
            tab.classList.add("active");
            tab.setAttribute("aria-selected", "true");
            openUserList("blocked");
        }
        return;
    }

    activeTab = tab.dataset.tab;
    syncTabsActive();
    postsPage = 1;
    postsHasMore = true;
    document.getElementById("postsGrid").innerHTML = "";
    if (typeof allImages !== "undefined") allImages.length = 0;
    document.getElementById("postsEnd").hidden = true;
    if (profile) loadPosts(profile.username);
});

/* ── Posts ────────────────────────────────────────────────── */

let feedStateReady = false;

async function ensureFeedState() {
    if (feedStateReady) return;
    if (typeof initFeedState !== "function" || typeof feedCardHTML !== "function") return;
    await initFeedState();
    feedStateReady = true;
}

async function loadPosts(username) {
    if (postsLoading || !postsHasMore) return;
    postsLoading = true;
    document.getElementById("postsLoading").hidden = false;

    const data = await fetch("/api/profile/" + encodeURIComponent(username) + "/posts?page=" + postsPage)
        .then(r => r.json()).catch(() => null);

    await ensureFeedState();

    postsLoading = false;
    document.getElementById("postsLoading").hidden = true;
    if (!data || !data.posts) return;

    const grid = document.getElementById("postsGrid");
    const cards = [];
    for (const post of data.posts) {
        if (activeTab === "photos" && post.post_type !== "image") continue;
        if (nsfwFilter === "hide" && post.nsfw) continue;
        allImages.push(post);
        cards.push(post);
    }

    grid.insertAdjacentHTML("beforeend", cards.map(feedCardHTML).join(""));
    initFeedMedia(grid);

    postsHasMore = data.has_more;
    postsPage++;

    if (!data.has_more && grid.children.length === 0) {
        document.getElementById("postsEnd").hidden = false;
    }
}

const postsObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && profile) loadPosts(profile.username);
}, { rootMargin: "300px" });
postsObserver.observe(document.getElementById("postsLoading"));

const postsGridEl = document.getElementById("postsGrid");
if (postsGridEl && typeof bindFeedEvents === "function") {
    bindFeedEvents(postsGridEl);
}

/* ── Back ─────────────────────────────────────────────────── */

document.getElementById("btnBack").addEventListener("click", () => {
    location.href = "/";
});

/* ── Edit Modal ───────────────────────────────────────────── */

function openEditModal() {
    if (!profile) return;
    document.getElementById("editUsername").value = profile.username;
    document.getElementById("editBio").value = profile.bio || "";
    document.getElementById("editLocation").value = profile.location || "";
    document.getElementById("editBirthday").value = profile.birthday || "";
    document.getElementById("editMarital").value = profile.marital_status || "";
    document.getElementById("bioCounter").textContent = (profile.bio || "").length + "/110";
    selectedColor = profile.color || "";
    buildEditColors();
    document.getElementById("editOverlay").classList.add("open");
}

function closeEditModal() {
    document.getElementById("editOverlay").classList.remove("open");
}

function buildEditColors() {
    const el = document.getElementById("editColors");
    el.innerHTML = "";
    for (const c of COLORS) {
        const swatch = document.createElement("div");
        swatch.className = "edit-color" + (c === selectedColor ? " selected" : "");
        swatch.style.background = c;
        swatch.tabIndex = 0;
        swatch.setAttribute("role", "radio");
        swatch.setAttribute("aria-checked", String(c === selectedColor));
        swatch.setAttribute("aria-label", c);
        swatch.addEventListener("click", () => pickColor(c));
        el.appendChild(swatch);
    }
}

function pickColor(c) {
    selectedColor = c;
    document.querySelectorAll(".edit-color").forEach(s => {
        const match = s.style.backgroundColor === c || rgbToHex(s.style.backgroundColor) === c;
        s.classList.toggle("selected", match);
        s.setAttribute("aria-selected", String(match));
    });
}

function rgbToHex(rgb) {
    if (!rgb || rgb.startsWith("#")) return rgb;
    const m = rgb.match(/\d+/g);
    if (!m || m.length < 3) return rgb;
    return "#" + m.slice(0, 3).map(x => (+x).toString(16).padStart(2, "0")).join("");
}

document.getElementById("editClose").addEventListener("click", closeEditModal);
document.getElementById("editCancel").addEventListener("click", closeEditModal);
document.getElementById("editOverlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeEditModal();
});

document.getElementById("editBio").addEventListener("input", (e) => {
    document.getElementById("bioCounter").textContent = e.target.value.length + "/110";
});

document.getElementById("editSave").addEventListener("click", async () => {
    const username = document.getElementById("editUsername").value.trim();
    if (username.length < 3) return alert("Nome de usuário mínimo 3 caracteres");

    const body = {
        username,
        bio: document.getElementById("editBio").value.trim(),
        location: document.getElementById("editLocation").value.trim(),
        birthday: document.getElementById("editBirthday").value,
        marital_status: document.getElementById("editMarital").value,
        color: selectedColor,
    };

    const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.error) return alert(data.error);

    closeEditModal();
    if (username !== profile.username) {
        location.href = "/perfil/" + username;
    } else {
        location.reload();
    }
});

/* ── Cover Upload ─────────────────────────────────────────── */

document.getElementById("btnCoverEdit").addEventListener("click", () => {
    document.getElementById("coverFileInput").click();
});

document.getElementById("coverFileInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (file.type === "image/gif") return uploadCoverDirect(file);
    openCoverCrop(file);
});

async function uploadCoverDirect(file) {
    const form = new FormData();
    form.append("cover", file, file.name);
    const res = await fetch("/api/auth/cover", { method: "POST", body: form });
    const data = await res.json().catch(() => null);
    if (data && data.cover) {
        profile.cover = data.cover;
        setCover(document.getElementById("coverImg"), data.cover);
    } else {
        alert((data && data.error) || "Erro ao enviar capa");
    }
}

/* ── Cover Crop ───────────────────────────────────────────── */

const coverCropOverlay = document.getElementById("coverCropOverlay");
const coverCropCanvas = document.getElementById("coverCropCanvas");
const coverCropArea = document.getElementById("coverCropArea");
const coverCropCtx = coverCropCanvas.getContext("2d");
let ccImg = null, ccScale = 1, ccImgX = 0, ccImgY = 0, ccDrag = null;
let ccPinchDist = 0, ccPinchScale = 1;

function cropMinScale(img, w, h) {
    return Math.max(w / img.naturalWidth, h / img.naturalHeight);
}
function cropMaxScale(img, w, h) {
    return cropMinScale(img, w, h) * 10;
}
function clampedOffset(x, y, scale, img, w, h) {
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    const minX = Math.min(0, w - dw);
    const minY = Math.min(0, h - dh);
    return {
        x: Math.min(0, Math.max(minX, x)),
        y: Math.min(0, Math.max(minY, y)),
    };
}

function openCoverCrop(file) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
        ccImg = img;
        coverCropOverlay.classList.add("open");
        requestAnimationFrame(() => requestAnimationFrame(() => resetCoverCrop()));
    };
    img.src = url;
}

function resetCoverCrop() {
    const w = coverCropArea.clientWidth;
    const h = coverCropArea.clientHeight;
    if (!w || !h) return;
    ccScale = cropMinScale(ccImg, w, h);
    ccImgX = (w - ccImg.naturalWidth * ccScale) / 2;
    ccImgY = (h - ccImg.naturalHeight * ccScale) / 2;
    drawCoverCrop();
}

function drawCoverCrop() {
    const w = coverCropArea.clientWidth;
    const h = coverCropArea.clientHeight;
    if (!w || !h) return;
    coverCropCanvas.width = w;
    coverCropCanvas.height = h;
    coverCropCtx.clearRect(0, 0, w, h);
    const dw = ccImg.naturalWidth * ccScale;
    const dh = ccImg.naturalHeight * ccScale;
    coverCropCtx.drawImage(ccImg, ccImgX, ccImgY, dw, dh);
}

coverCropArea.addEventListener("pointerdown", (e) => {
    if (e.isPrimary && coverCropArea.hasPointerCapture(e.pointerId) === false) {
        ccDrag = { x: e.clientX, y: e.clientY, sx: ccImgX, sy: ccImgY };
    }
    const pointers = coverCropArea.querySelectorAll(":hover") || [];
    coverCropArea.setPointerCapture(e.pointerId);
    const active = coverCropArea._activePointers || (coverCropArea._activePointers = new Map());
    active.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (active.size === 2) {
        const pts = [...active.values()];
        ccPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        ccPinchScale = ccScale;
        ccDrag = null;
    }
});
coverCropArea.addEventListener("pointermove", (e) => {
    const active = coverCropArea._activePointers;
    if (active && active.has(e.pointerId)) {
        active.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (active && active.size === 2) {
        const pts = [...active.values()];
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        if (!dist || !ccPinchDist) return;
        const w = coverCropArea.clientWidth;
        const h = coverCropArea.clientHeight;
        const newScale = Math.min(Math.max(ccPinchScale * (dist / ccPinchDist), cropMinScale(ccImg, w, h)), cropMaxScale(ccImg, w, h));
        const cx = (pts[0].x + pts[1].x) / 2;
        const cy = (pts[0].y + pts[1].y) / 2;
        const rect = coverCropArea.getBoundingClientRect();
        const mx = cx - rect.left;
        const my = cy - rect.top;
        ccImgX = mx - (mx - ccImgX) * (newScale / ccScale);
        ccImgY = my - (my - ccImgY) * (newScale / ccScale);
        ccScale = newScale;
        ({ x: ccImgX, y: ccImgY } = clampedOffset(ccImgX, ccImgY, ccScale, ccImg, w, h));
        drawCoverCrop();
        return;
    }
    if (ccDrag) {
        const w = coverCropArea.clientWidth;
        const h = coverCropArea.clientHeight;
        ccImgX = ccDrag.sx + (e.clientX - ccDrag.x);
        ccImgY = ccDrag.sy + (e.clientY - ccDrag.y);
        ({ x: ccImgX, y: ccImgY } = clampedOffset(ccImgX, ccImgY, ccScale, ccImg, w, h));
        drawCoverCrop();
    }
});
coverCropArea.addEventListener("pointerup", (e) => {
    const active = coverCropArea._activePointers;
    if (active) active.delete(e.pointerId);
    if (active && active.size < 2) ccDrag = null;
});
coverCropArea.addEventListener("pointercancel", (e) => {
    const active = coverCropArea._activePointers;
    if (active) active.delete(e.pointerId);
    ccDrag = null;
});
coverCropArea.addEventListener("wheel", (e) => {
    e.preventDefault();
    const w = coverCropArea.clientWidth;
    const h = coverCropArea.clientHeight;
    const rect = coverCropArea.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(Math.max(ccScale * factor, cropMinScale(ccImg, w, h)), cropMaxScale(ccImg, w, h));
    ccImgX = mx - (mx - ccImgX) * (newScale / ccScale);
    ccImgY = my - (my - ccImgY) * (newScale / ccScale);
    ccScale = newScale;
    ({ x: ccImgX, y: ccImgY } = clampedOffset(ccImgX, ccImgY, ccScale, ccImg, w, h));
    drawCoverCrop();
}, { passive: false });

function getCoverBlob() {
    return new Promise(resolve => {
        const c = document.createElement("canvas");
        c.width = 1200; c.height = 400;
        const ctx = c.getContext("2d");
        const aw = coverCropArea.clientWidth;
        const ah = coverCropArea.clientHeight;
        const sx = -ccImgX / ccScale;
        const sy = -ccImgY / ccScale;
        const sw = aw / ccScale;
        const sh = ah / ccScale;
        ctx.drawImage(ccImg, sx, sy, sw, sh, 0, 0, 1200, 400);
        c.toBlob(b => resolve(b), "image/jpeg", 0.88);
    });
}

document.getElementById("coverCropClose").addEventListener("click", () => { coverCropOverlay.classList.remove("open"); ccImg = null; });
document.getElementById("coverCropCancel").addEventListener("click", () => { coverCropOverlay.classList.remove("open"); ccImg = null; });

document.getElementById("coverCropConfirm").addEventListener("click", async () => {
    if (!ccImg) return;
    const blob = await getCoverBlob();
    coverCropOverlay.classList.remove("open");
    ccImg = null;
    const form = new FormData();
    form.append("cover", blob, "cover.jpg");
    const res = await fetch("/api/auth/cover", { method: "POST", body: form });
    const data = await res.json();
    if (data.cover) {
        profile.cover = data.cover;
        setCover(document.getElementById("coverImg"), data.cover);
    } else {
        alert(data.error || "Erro ao enviar capa");
    }
});

/* ── Avatar Upload ────────────────────────────────────────── */

document.getElementById("btnAvatarEdit").addEventListener("click", () => {
    document.getElementById("avatarFileInput").click();
});

document.getElementById("avatarFileInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (file.type === "image/gif") return uploadAvatarDirect(file);
    openAvatarCrop(file);
});

async function uploadAvatarDirect(file) {
    const form = new FormData();
    form.append("avatar", file, file.name);
    const res = await fetch("/api/auth/avatar", { method: "POST", body: form });
    const data = await res.json().catch(() => null);
    if (data && data.avatar) {
        profile.avatar = data.avatar;
        setAvatar(document.getElementById("avatarImg"), data.avatar);
    } else {
        alert((data && data.error) || "Erro ao enviar avatar");
    }
}

/* ── Avatar Crop ──────────────────────────────────────────── */

const cropOverlay = document.getElementById("cropOverlay");
const cropCanvas = document.getElementById("cropCanvas");
const cropArea = document.getElementById("cropArea");
const cropCtx = cropCanvas.getContext("2d");
let acImg = null, acScale = 1, acImgX = 0, acImgY = 0, acDrag = null;
let acPinchDist = 0, acPinchScale = 1;

function openAvatarCrop(file) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
        acImg = img;
        cropOverlay.classList.add("open");
        requestAnimationFrame(() => requestAnimationFrame(() => resetAvatarCrop()));
    };
    img.src = url;
}

function resetAvatarCrop() {
    const s = cropArea.clientWidth;
    if (!s) return;
    acScale = cropMinScale(acImg, s, s);
    acImgX = (s - acImg.naturalWidth * acScale) / 2;
    acImgY = (s - acImg.naturalHeight * acScale) / 2;
    drawAvatarCrop();
}

function drawAvatarCrop() {
    const s = cropArea.clientWidth;
    if (!s) return;
    cropCanvas.width = s;
    cropCanvas.height = s;
    cropCtx.clearRect(0, 0, s, s);
    cropCtx.save();
    cropCtx.beginPath();
    cropCtx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
    cropCtx.clip();
    const dw = acImg.naturalWidth * acScale;
    const dh = acImg.naturalHeight * acScale;
    cropCtx.drawImage(acImg, acImgX, acImgY, dw, dh);
    cropCtx.restore();
}

cropArea.addEventListener("pointerdown", (e) => {
    cropArea.setPointerCapture(e.pointerId);
    const active = cropArea._activePointers || (cropArea._activePointers = new Map());
    active.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (active.size === 2) {
        const pts = [...active.values()];
        acPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        acPinchScale = acScale;
        acDrag = null;
    } else if (active.size === 1) {
        acDrag = { x: e.clientX, y: e.clientY, sx: acImgX, sy: acImgY };
    }
});
cropArea.addEventListener("pointermove", (e) => {
    const active = cropArea._activePointers;
    if (active && active.has(e.pointerId)) {
        active.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (active && active.size === 2) {
        const pts = [...active.values()];
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        if (!dist || !acPinchDist) return;
        const s = cropArea.clientWidth;
        const newScale = Math.min(Math.max(acPinchScale * (dist / acPinchDist), cropMinScale(acImg, s, s)), cropMaxScale(acImg, s, s));
        const cx = (pts[0].x + pts[1].x) / 2;
        const cy = (pts[0].y + pts[1].y) / 2;
        const rect = cropArea.getBoundingClientRect();
        const mx = cx - rect.left;
        const my = cy - rect.top;
        acImgX = mx - (mx - acImgX) * (newScale / acScale);
        acImgY = my - (my - acImgY) * (newScale / acScale);
        acScale = newScale;
        ({ x: acImgX, y: acImgY } = clampedOffset(acImgX, acImgY, acScale, acImg, s, s));
        drawAvatarCrop();
        return;
    }
    if (acDrag) {
        const s = cropArea.clientWidth;
        acImgX = acDrag.sx + (e.clientX - acDrag.x);
        acImgY = acDrag.sy + (e.clientY - acDrag.y);
        ({ x: acImgX, y: acImgY } = clampedOffset(acImgX, acImgY, acScale, acImg, s, s));
        drawAvatarCrop();
    }
});
cropArea.addEventListener("pointerup", (e) => {
    const active = cropArea._activePointers;
    if (active) active.delete(e.pointerId);
    if (active && active.size < 2) acDrag = null;
});
cropArea.addEventListener("pointercancel", (e) => {
    const active = cropArea._activePointers;
    if (active) active.delete(e.pointerId);
    acDrag = null;
});
cropArea.addEventListener("wheel", (e) => {
    e.preventDefault();
    const s = cropArea.clientWidth;
    const rect = cropArea.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(Math.max(acScale * factor, cropMinScale(acImg, s, s)), cropMaxScale(acImg, s, s));
    acImgX = mx - (mx - acImgX) * (newScale / acScale);
    acImgY = my - (my - acImgY) * (newScale / acScale);
    acScale = newScale;
    ({ x: acImgX, y: acImgY } = clampedOffset(acImgX, acImgY, acScale, acImg, s, s));
    drawAvatarCrop();
}, { passive: false });

function getAvatarBlob() {
    return new Promise(resolve => {
        const c = document.createElement("canvas");
        c.width = 256; c.height = 256;
        const ctx = c.getContext("2d");
        const s = cropArea.clientWidth;
        ctx.beginPath();
        ctx.arc(128, 128, 128, 0, Math.PI * 2);
        ctx.clip();
        const sx = -acImgX / acScale;
        const sy = -acImgY / acScale;
        const sw = s / acScale;
        ctx.drawImage(acImg, sx, sy, sw, sw, 0, 0, 256, 256);
        c.toBlob(b => resolve(b), "image/png");
    });
}

document.getElementById("cropClose").addEventListener("click", () => { cropOverlay.classList.remove("open"); acImg = null; });
document.getElementById("cropCancel").addEventListener("click", () => { cropOverlay.classList.remove("open"); acImg = null; });

document.getElementById("cropConfirm").addEventListener("click", async () => {
    if (!acImg) return;
    const blob = await getAvatarBlob();
    cropOverlay.classList.remove("open");
    acImg = null;
    const form = new FormData();
    form.append("avatar", blob, "avatar.png");
    const res = await fetch("/api/auth/avatar", { method: "POST", body: form });
    const data = await res.json();
    if (data.avatar) {
        profile.avatar = data.avatar;
        setAvatar(document.getElementById("avatarImg"), data.avatar);
    } else {
        alert(data.error || "Erro ao enviar avatar");
    }
});

/* ── Init ─────────────────────────────────────────────────── */

loadProfile();
