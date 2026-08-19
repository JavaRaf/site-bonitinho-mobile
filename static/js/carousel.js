let current = 0;
let likedImages = new Set();
let allImages = [];
let feedMode = (localStorage.getItem("viewMode") || "slide") === "feed";
let sortMode = localStorage.getItem("sortMode") || "likes";
let singleVoteMode = false;
let nsfwFilter = localStorage.getItem("nsfwFilter") || "blur";
let myUserId = null;

const FEED_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>`;
const SLIDE_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`;

async function loadLikes() {
    try {
        const res = await fetch("/api/likes");
        const data = await res.json();
        likedImages = new Set(data.likes || []);
    } catch { /* not logged in */ }
    updateLikeIcon();
}

async function loadSingleVoteFlag() {
    try {
        const res = await fetch("/api/singlevote");
        const data = await res.json();
        singleVoteMode = data.enabled || false;
        const el = document.getElementById("imgOwnerSingleVote");
        if (el) el.style.display = singleVoteMode ? "" : "none";
        renderFeed();
    } catch { /* ignore */ }
}

async function loadCarousel() {
    const res = await fetch("/api/images");
    const images = await res.json();
    allImages = images;

    try {
        const me = await fetch("/api/auth/me");
        const meData = await me.json();
        if (meData.user) myUserId = meData.user.id;
    } catch { /* not logged in */ }

    renderGrid();

    const track = document.getElementById("carouselTrack");
    const dots = document.getElementById("carouselDots");

    if (!images.length) return;

    track.innerHTML = "";
    dots.innerHTML = "";

    images.forEach((img, i) => {
        const div = document.createElement("div");
        div.className = "carousel-slide";
        div.dataset.image = img.name;
        div.dataset.owner = img.owner || "";
        div.dataset.avatar = img.owner_avatar || "";
        div.dataset.likes = img.likes || 0;
        div.dataset.caption = img.caption || "";
        if (img.nsfw) div.dataset.nsfw = "1";
        const loadNow = i <= 1;
        const nsfwClass = (img.nsfw && nsfwFilter === "blur") ? " nsfw-blur" : "";
        const nsfwBtn = (img.nsfw && nsfwFilter === "blur") ? '<button class="nsfw-reveal-btn" type="button">Mostrar imagem</button>' : "";
        div.innerHTML = `<img ${loadNow ? `src="/images/${img.name}"` : `data-src="/images/${img.name}"`} alt="slide ${i}" draggable="false" class="${nsfwClass.trim()}">${nsfwBtn}`;
        track.appendChild(div);

        const dot = document.createElement("span");
        dot.className = "carousel-dot" + (i === 0 ? " active" : "");
        dot.onclick = () => goTo(i);
        dots.appendChild(dot);
    });

    updateOwnerOverlay();
    updateLikeCount();
    await loadLikes();
    loadSingleVoteFlag();
    renderFeed();
    applyViewMode();
    syncSortSelects();
    rebuildCarousel();
}

function updateLikeCount() {
    const slides = document.querySelectorAll(".carousel-slide");
    const el = document.getElementById("likes-count");
    if (el && slides[current]) {
        const n = parseInt(slides[current].dataset.likes) || 0;
        el.textContent = n > 0 ? n : "";
    }
}

function lazyLoadAround(index) {
    const slides = document.querySelectorAll(".carousel-slide");
    [index - 1, index, index + 1].forEach(i => {
        if (i < 0 || i >= slides.length) return;
        const img = slides[i].querySelector("img");
        if (img && img.dataset.src) {
            img.src = img.dataset.src;
            img.removeAttribute("data-src");
        }
    });
}

function updateOwnerOverlay() {
    const slides = document.querySelectorAll(".carousel-slide");
    const owner = slides[current]?.dataset.owner;
    const avatar = slides[current]?.dataset.avatar;
    const caption = slides[current]?.dataset.caption || "";
    const nameEl = document.getElementById("imgOwnerName");
    const avatarEl = document.getElementById("imgOwnerAvatar");
    const captionEl = document.getElementById("imgCaption");
    if (nameEl) nameEl.textContent = owner ? "@" + owner : "";
    if (captionEl) captionEl.textContent = caption;
    if (avatarEl) {
        const target = (!avatar || avatar === "default-avatar.svg")
            ? "/static/svg/default-avatar.svg"
            : `/avatars/${avatar}`;
        if (avatarEl.getAttribute("src") !== target) {
            avatarEl.src = target;
            if (!avatar || avatar === "default-avatar.svg") {
                avatarEl.onerror = null;
            } else {
                avatarEl.onerror = () => { avatarEl.src = "/static/svg/default-avatar.svg"; };
            }
        }
    }
}

function goTo(index) {
    const slides = document.querySelectorAll(".carousel-slide");
    if (!slides.length) return;
    current = ((index % slides.length) + slides.length) % slides.length;
    document.getElementById("carouselTrack").style.transform = `translateX(-${current * 100}%)`;
    document.querySelectorAll(".carousel-dot").forEach((d, i) => d.classList.toggle("active", i === current));
    updateGridActive();
    updateLikeIcon();
    updateOwnerOverlay();
    updateLikeCount();
    lazyLoadAround(current);
    const likersSection = document.getElementById("likersSection");
    if (likersSection) likersSection.hidden = true;
    window.dispatchEvent(new CustomEvent("slideChange", { detail: { index: current } }));
}

function currentImageName() {
    const slides = document.querySelectorAll(".carousel-slide");
    return slides[current]?.dataset.image || "";
}

function updateLikeIcon() {
    const btn = document.getElementById("likes-btn");
    const icon = btn.querySelector("img");
    const liked = likedImages.has(currentImageName());
    if (liked) {
        icon.src = "/static/svg/upvote-filled.svg";
        btn.style.color = "#f43f5e";
    } else {
        icon.src = "/static/svg/upvote.svg";
        btn.style.color = "";
    }
}

let lastTapTime = 0;

/* === Swipe === */
let swipeStartX = 0;
let swipeStartY = 0;

const track = document.getElementById("carouselTrack");

track.addEventListener("touchstart", e => {
    if (e.touches.length === 1) {
        swipeStartX = e.touches[0].clientX;
        swipeStartY = e.touches[0].clientY;
    }
});

track.addEventListener("touchend", e => {
    if (!e.changedTouches.length) return;
    const dx = swipeStartX - e.changedTouches[0].clientX;
    const dy = swipeStartY - e.changedTouches[0].clientY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) {
        goTo(current + (dx > 0 ? 1 : -1));
    }
});

/* === Arrow buttons (desktop) === */
document.getElementById("carouselPrev")?.addEventListener("click", () => goTo(current - 1));
document.getElementById("carouselNext")?.addEventListener("click", () => goTo(current + 1));

/* === Keyboard navigation (A/D, arrows) === */
document.addEventListener("keydown", e => {
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    if (["a", "arrowleft", "w"].includes(e.key.toLowerCase())) {
        goTo(current - 1);
    } else if (["d", "arrowright", "s"].includes(e.key.toLowerCase())) {
        goTo(current + 1);
    }
});

/* === Double-tap → toggle like, single-tap → open lightbox === */
let tapTimeout = null;

track.addEventListener("click", e => {
    const revealBtn = e.target.closest(".nsfw-reveal-btn");
    if (revealBtn) {
        e.stopPropagation();
        const slide = revealBtn.closest(".carousel-slide");
        if (slide) {
            slide.querySelector("img")?.classList.remove("nsfw-blur");
            revealBtn.remove();
        }
        return;
    }
    const img = e.target.closest(".carousel-slide img");
    if (!img) return;
    const now = Date.now();
    if (now - lastTapTime < 350) {
        clearTimeout(tapTimeout);
        tapTimeout = null;
        toggleLike();
        lastTapTime = 0;
    } else {
        lastTapTime = now;
        tapTimeout = setTimeout(() => {
            if (lastTapTime === now && typeof openLightbox === "function") {
                openLightbox(current, sortedImages());
            }
        }, 360);
    }
});

async function refreshLikeCounts() {
    try {
        const res = await fetch("/api/images");
        const images = await res.json();
        const map = {};
        images.forEach(img => { map[img.name] = img.likes || 0; });
        document.querySelectorAll(".carousel-slide").forEach(slide => {
            if (map[slide.dataset.image] !== undefined) {
                slide.dataset.likes = map[slide.dataset.image];
            }
        });
        allImages.forEach(img => {
            if (map[img.name] !== undefined) img.likes = map[img.name];
        });
        renderFeed();
    } catch { /* ignore */ }
}

async function toggleLike() {
    const imgName = currentImageName();
    if (!imgName) return;

    const slides = document.querySelectorAll(".carousel-slide");
    const slide = slides[current];
    if (!slide) return;

    // Optimistic update: flip instantly so feedback doesn't wait on the server
    const wasLiked = likedImages.has(imgName);
    const delta = wasLiked ? -1 : 1;
    if (wasLiked) likedImages.delete(imgName);
    else likedImages.add(imgName);
    slide.dataset.likes = Math.max(0, (parseInt(slide.dataset.likes) || 0) + delta);
    updateLikeIcon();
    updateLikeCount();

    try {
        const res = await fetch(`/api/likes/${imgName}`, { method: "POST" });
        if (!res.ok) throw new Error("request failed");
        const data = await res.json();
        if (data.liked !== !wasLiked) {
            // server disagreed (e.g. changed elsewhere) — resync
            await loadLikes();
            await refreshLikeCounts();
        } else {
            // background resync keeps counts accurate without blocking UI
            loadLikes();
            refreshLikeCounts();
        }
    } catch {
        // revert optimistic change on failure
        if (wasLiked) likedImages.add(imgName);
        else likedImages.delete(imgName);
        slide.dataset.likes = Math.max(0, (parseInt(slide.dataset.likes) || 0) - delta);
        updateLikeIcon();
        updateLikeCount();
    }

    const likersSection = document.getElementById("likersSection");
    if (likersSection && !likersSection.hidden) loadLikers();
}

/* === Prevent text selection on double-tap === */
track.addEventListener("mousedown", e => {
    if (e.detail > 1) e.preventDefault();
});

/* === Likes button click === */
document.getElementById("likes-btn").addEventListener("click", e => {
    e.stopPropagation();
    toggleLike();
});

/* === Likers (who liked) === */
function escText(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
}

async function loadLikers() {
    const imgName = currentImageName();
    const list = document.getElementById("likersList");
    const section = document.getElementById("likersSection");
    if (!imgName || !list || !section) return;
    try {
        const res = await fetch(`/api/likers/${imgName}`);
        const likers = await res.json();
        list.innerHTML = likers.length
            ? likers.map(u => `<span class="liker-tag">@${escText(u.username)}</span>`).join("")
            : `<span class="liker-tag" style="color:#a1a1aa">Ninguém ainda</span>`;
        section.hidden = false;
    } catch { /* ignore */ }
}

document.getElementById("likes-count")?.addEventListener("click", e => {
    e.stopPropagation();
    const section = document.getElementById("likersSection");
    if (section && !section.hidden) {
        section.hidden = true;
    } else {
        loadLikers();
    }
});

document.getElementById("likersClose")?.addEventListener("click", () => {
    const section = document.getElementById("likersSection");
    if (section) section.hidden = true;
});

/* === Grid gallery === */
function renderGrid() {
    const thumbs = document.getElementById("gridThumbs");
    if (!thumbs) return;
    const activeName = currentImageName();
    thumbs.innerHTML = sortedImages().map(img => `
        <button class="grid-thumb ${img.name === activeName ? "active" : ""}" data-name="${escText(img.name)}">
            <img src="/thumbs/${escText(img.name)}" alt="" loading="lazy" decoding="async">
        </button>
    `).join("");

    thumbs.querySelectorAll(".grid-thumb").forEach(btn => {
        btn.addEventListener("click", () => {
            goTo(carouselIndexByName(btn.dataset.name));
            closeGrid();
        });
    });
}

function updateGridActive() {
    const name = currentImageName();
    document.querySelectorAll(".grid-thumb").forEach(t => {
        t.classList.toggle("active", t.dataset.name === name);
    });
}

function sortedImages() {
    let imgs = [...allImages];
    if (nsfwFilter === "hide") {
        imgs = imgs.filter(i => !i.nsfw);
    }
    return imgs.sort((a, b) => {
        if (sortMode === "recent") {
            return String(b.created_at || "").localeCompare(String(a.created_at || ""));
        }
        return (b.likes || 0) - (a.likes || 0);
    });
}

function carouselIndexByName(name) {
    const slides = document.querySelectorAll(".carousel-slide");
    for (let i = 0; i < slides.length; i++) {
        if (slides[i].dataset.image === name) return i;
    }
    return 0;
}

function setSortMode(mode) {
    if (mode !== "likes" && mode !== "recent") return;
    sortMode = mode;
    localStorage.setItem("sortMode", mode);
    syncSortSelects();
    renderGrid();
    renderFeed();
    rebuildCarousel();
}

function rebuildCarousel() {
    const track = document.getElementById("carouselTrack");
    const dots = document.getElementById("carouselDots");
    const slides = document.querySelectorAll(".carousel-slide");
    if (!track || !dots || !slides.length) return;

    const byName = new Map();
    slides.forEach(s => byName.set(s.dataset.image, s));

    const sorted = sortedImages();
    track.innerHTML = "";
    dots.innerHTML = "";
    sorted.forEach((img, i) => {
        const slide = byName.get(img.name);
        if (!slide) return;
        track.appendChild(slide);
        const dot = document.createElement("span");
        dot.className = "carousel-dot";
        dot.onclick = () => goTo(i);
        dots.appendChild(dot);
    });

    current = 0;
    track.style.transform = "translateX(0%)";
    document.querySelectorAll(".carousel-dot").forEach((d, i) => d.classList.toggle("active", i === current));
    lazyLoadAround(0);
    updateLikeIcon();
    updateOwnerOverlay();
    updateLikeCount();
    updateGridActive();
    // Reload comments for the new first image after reordering.
    if (typeof loadComments === "function") loadComments();
}

function syncSortSelects() {
    document.querySelectorAll(".sort-select").forEach(sel => { sel.value = sortMode; });
}

function openGrid() {
    document.getElementById("gridOverlay")?.classList.add("open");
}

function closeGrid() {
    document.getElementById("gridOverlay")?.classList.remove("open");
}

document.getElementById("grid-btn")?.addEventListener("click", openGrid);

document.getElementById("gridClose")?.addEventListener("click", closeGrid);

document.getElementById("sortSelect")?.addEventListener("change", e => setSortMode(e.target.value));

document.getElementById("feedSortSelect")?.addEventListener("change", e => setSortMode(e.target.value));

document.getElementById("gridOverlay")?.addEventListener("click", e => {
    if (e.target === e.currentTarget) closeGrid();
});

/* === Feed view (scroll mode) === */
function avatarUrl(a) {
    return (!a || a === "default-avatar.svg") ? "/static/svg/default-avatar.svg" : `/avatars/${a}`;
}

function renderFeed() {
    const feed = document.getElementById("feedView");
    if (!feed) return;
    feed.innerHTML = sortedImages().map((img) => {
        const liked = likedImages.has(img.name);
        const likes = img.likes || 0;
        const comments = img.comments || 0;
        const nsfwClass = (img.nsfw && nsfwFilter === "blur") ? " nsfw-blur" : "";
        return `
        <article class="feed-card" data-name="${escText(img.name)}">
            <div class="feed-owner">
                <img class="feed-avatar" src="${avatarUrl(img.owner_avatar)}" alt="" onerror="this.src='/static/svg/default-avatar.svg'">
                <span class="feed-owner-name">@${escText(img.owner || "—")}</span>
                ${singleVoteMode ? '<span class="feed-singlevote">Voto único</span>' : ''}
                ${img.nsfw ? '<span class="feed-nsfw-badge">+18</span>' : ''}
            </div>
            <div class="feed-caption">${escText(img.caption || "")}</div>
            <div class="feed-img${img.nsfw ? ' nsfw-container' : ''}"><img src="/images/${escText(img.name)}" alt="" loading="lazy" decoding="async" class="${nsfwClass.trim()}">${img.nsfw && nsfwFilter === "blur" ? '<button class="nsfw-reveal-btn" type="button">Mostrar imagem</button>' : ''}</div>
            <div class="feed-actions">
                <button class="feed-like ${liked ? "liked" : ""}" data-name="${escText(img.name)}" type="button">
                    <img src="${liked ? "/static/svg/upvote-filled.svg" : "/static/svg/upvote.svg"}" alt="like">
                </button>
                <span class="feed-likes" data-name="${escText(img.name)}" role="button">${likes > 0 ? likes : ""}</span>
                <button class="feed-comment-toggle" data-name="${escText(img.name)}" type="button">
                    <img src="/static/svg/comments.svg" alt="comment">
                </button>
                <span class="feed-comment-count">${comments > 0 ? comments : ""}</span>
                <button class="feed-download" data-name="${escText(img.name)}" type="button" title="Baixar">
                    <img src="/static/svg/download.svg" alt="download">
                </button>
                ${myUserId && img.owner_id === myUserId ? `<button class="feed-delete" data-name="${escText(img.name)}" type="button" title="Apagar post"><img src="/static/svg/trash.svg" alt="delete"></button>` : ""}
            </div>
            <div class="feed-likers"></div>
            <div class="feed-comments" hidden>
                <div class="feed-comments-list"></div>
                <form class="comment-form feed-comment-form">
                    <input type="text" placeholder="Adicione um comentário..." autocomplete="off">
                    <button type="submit"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>
                </form>
            </div>
        </article>`;
    }).join("");
}

function applyViewMode() {
    const carrossel = document.querySelector(".carrossel");
    const feedView = document.getElementById("feedView");
    const feedSortWrap = document.getElementById("feedSortWrap");
    const feedCreate = document.getElementById("feedCreate");
    const toggle = document.getElementById("viewToggle");
    if (!carrossel || !feedView) return;
    if (feedMode) {
        carrossel.style.display = "none";
        feedView.hidden = false;
        if (feedSortWrap) feedSortWrap.hidden = false;
        if (feedCreate) feedCreate.hidden = false;
        if (toggle) {
            toggle.innerHTML = SLIDE_ICON;
            toggle.title = "Alternar para slide";
            toggle.setAttribute("aria-label", "Alternar para slide");
        }
    } else {
        carrossel.style.display = "";
        feedView.hidden = true;
        if (feedSortWrap) feedSortWrap.hidden = true;
        if (feedCreate) feedCreate.hidden = true;
        if (toggle) {
            toggle.innerHTML = FEED_ICON;
            toggle.title = "Alternar para feed";
            toggle.setAttribute("aria-label", "Alternar para feed");
        }
    }
}

async function toggleFeedLike(btn) {
    const name = btn.dataset.name;
    if (!name) return;

    const wasLiked = likedImages.has(name);
    const delta = wasLiked ? -1 : 1;
    if (wasLiked) likedImages.delete(name);
    else likedImages.add(name);
    const liked = !wasLiked;

    btn.classList.toggle("liked", liked);
    btn.querySelector("img").src = liked ? "/static/svg/upvote-filled.svg" : "/static/svg/upvote.svg";

    const countEl = btn.parentElement.querySelector(".feed-likes");
    const before = parseInt(countEl.textContent) || 0;
    const after = Math.max(0, before + delta);
    countEl.textContent = after > 0 ? after : "";

    const img = allImages.find(x => x.name === name);
    if (img) img.likes = Math.max(0, (img.likes || 0) + delta);
    document.querySelectorAll(".carousel-slide").forEach(s => {
        if (s.dataset.image === name) s.dataset.likes = Math.max(0, (parseInt(s.dataset.likes) || 0) + delta);
    });

    let prevUnlikedName = null;
    let prevUnlikedImg = null;
    if (singleVoteMode && liked) {
        for (const n of likedImages) {
            if (n !== name) {
                prevUnlikedName = n;
                likedImages.delete(n);
                prevUnlikedImg = allImages.find(x => x.name === n);
                if (prevUnlikedImg) prevUnlikedImg.likes = Math.max(0, (prevUnlikedImg.likes || 0) - 1);
                document.querySelectorAll(".carousel-slide").forEach(s => {
                    if (s.dataset.image === n) s.dataset.likes = Math.max(0, (parseInt(s.dataset.likes) || 0) - 1);
                });
                const prevBtn = document.querySelector(`.feed-like[data-name="${CSS.escape(n)}"]`);
                if (prevBtn) {
                    prevBtn.classList.remove("liked");
                    prevBtn.querySelector("img").src = "/static/svg/upvote.svg";
                }
                const prevCountEl = document.querySelector(`.feed-likes[data-name="${CSS.escape(n)}"]`);
                if (prevCountEl) {
                    const pv = parseInt(prevCountEl.textContent) || 0;
                    prevCountEl.textContent = Math.max(0, pv - 1) > 0 ? Math.max(0, pv - 1) : "";
                }
                break;
            }
        }
    }

    updateLikeIcon();
    updateLikeCount();

    try {
        const res = await fetch(`/api/likes/${encodeURIComponent(name)}`, { method: "POST" });
        if (!res.ok) throw new Error("request failed");
        const data = await res.json();
        if (data.liked !== liked) {
            await loadLikes();
            renderFeed();
        }
    } catch {
        if (wasLiked) likedImages.add(name);
        else likedImages.delete(name);
        btn.classList.toggle("liked", wasLiked);
        btn.querySelector("img").src = wasLiked ? "/static/svg/upvote-filled.svg" : "/static/svg/upvote.svg";
        countEl.textContent = before > 0 ? before : "";
        if (img) img.likes = Math.max(0, (img.likes || 0) - delta);
        document.querySelectorAll(".carousel-slide").forEach(s => {
            if (s.dataset.image === name) s.dataset.likes = Math.max(0, (parseInt(s.dataset.likes) || 0) - delta);
        });
        if (prevUnlikedName) {
            likedImages.add(prevUnlikedName);
            if (prevUnlikedImg) prevUnlikedImg.likes = (prevUnlikedImg.likes || 0) + 1;
            document.querySelectorAll(".carousel-slide").forEach(s => {
                if (s.dataset.image === prevUnlikedName) s.dataset.likes = (parseInt(s.dataset.likes) || 0) + 1;
            });
            const prevBtn = document.querySelector(`.feed-like[data-name="${CSS.escape(prevUnlikedName)}"]`);
            if (prevBtn) {
                prevBtn.classList.add("liked");
                prevBtn.querySelector("img").src = "/static/svg/upvote-filled.svg";
            }
            const prevCountEl = document.querySelector(`.feed-likes[data-name="${CSS.escape(prevUnlikedName)}"]`);
            if (prevCountEl) {
                const pv = parseInt(prevCountEl.textContent) || 0;
                prevCountEl.textContent = pv + 1 > 0 ? pv + 1 : "";
            }
        }
        updateLikeIcon();
        updateLikeCount();
    }
}

async function toggleFeedLikers(el) {
    const name = el.dataset.name;
    const card = el.closest(".feed-card");
    const box = card.querySelector(".feed-likers");
    if (box.classList.contains("open")) { box.classList.remove("open"); box.innerHTML = ""; return; }
    box.innerHTML = "Carregando...";
    box.classList.add("open");
    try {
        const res = await fetch(`/api/likers/${encodeURIComponent(name)}`);
        const likers = await res.json();
        box.innerHTML = likers.length
            ? likers.map(u => `<span class="liker-tag">@${escText(u.username)}</span>`).join("")
            : `<span class="liker-tag" style="color:#a1a1aa">Ninguém ainda</span>`;
    } catch { box.classList.remove("open"); box.innerHTML = ""; }
}

function userColorFeed(username) {
    const colors = ["#f43f5e", "#6366f1", "#10b981", "#f59e0b", "#8b5cf6", "#0ea5e9", "#ec4899", "#84cc16"];
    let hash = 0;
    for (let i = 0; i < username.length; i++) hash = (hash * 31 + username.charCodeAt(i)) >>> 0;
    return colors[hash % colors.length];
}

function feedAvatarUrl(avatar) {
    if (!avatar || avatar === "default-avatar.svg") return "/static/svg/default-avatar.svg";
    return `/avatars/${avatar}`;
}

function feedTimeAgo(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr + "Z");
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return "agora";
    if (diff < 3600) return `${Math.floor(diff / 60)}min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function renderFeedNode(c, depth, currentUserId, isAdmin, myCommentLikes) {
    const canDelete = isAdmin || currentUserId === c.user_id;
    const cls = ["comment"];
    if (depth > 0) cls.push("comment-reply");
    if (depth === 1) cls.push("comment-depth-1");
    if (depth >= 2) cls.push("comment-depth-2");

    const liked = myCommentLikes.has(c.id);
    const likes = c.likes || 0;

    let html = `<div class="${cls.join(" ")}" data-id="${c.id}">`;
    html += `<div class="comment-main">`;
    html += `<div class="comment-avatar"><img src="${feedAvatarUrl(c.avatar)}" alt=""></div>`;
    html += `<div class="comment-body">`;
    html += `<div class="comment-bubble">`;
    html += `<span class="comment-user" style="color:${c.color || userColorFeed(c.username)}">${escText(c.username)}</span>`;
    html += `<span class="comment-text">${escText(c.text).replace(/@(\w+)/g, '<span class="comment-mention">@$1</span>')}</span>`;
    html += `</div>`;
    html += `<div class="comment-meta">`;
    html += `<span class="comment-time">${feedTimeAgo(c.created_at)}</span>`;
    if (currentUserId) {
        html += `<button class="comment-like-btn${liked ? " liked" : ""}" data-id="${c.id}"><svg width="12" height="12" viewBox="0 0 20 20" fill="${liked ? "#f43f5e" : "none"}" stroke="${liked ? "#f43f5e" : "currentColor"}" stroke-width="2"><path d="M10 19a3.966 3.966 0 01-3.96-3.962V10.98H2.838a1.731 1.731 0 01-1.605-1.073 1.734 1.734 0 01.377-1.895L9.364.254a.925.925 0 011.272 0l7.754 7.759c.498.499.646 1.242.376 1.894-.27.652-.9 1.073-1.605 1.073h-3.202v4.058A3.965 3.965 0 019.999 19H10z"/></svg></button>`;
        html += `<span class="comment-like-count" data-id="${c.id}"${likes > 0 ? "" : " style='display:none'"}>${likes || ""}</span>`;
        html += `<div class="comment-likers" data-id="${c.id}" hidden></div>`;
        html += `<button class="comment-reply-btn" data-id="${c.id}" data-user="${escText(c.username)}">Responder</button>`;
    }
    html += `</div></div>`;
    if (canDelete) {
        html += `<button class="comment-delete" data-id="${c.id}"><img src="/static/svg/trash.svg" alt="del"></button>`;
    }
    html += `</div>`;

    if (c.replies && c.replies.length) {
        html += `<div class="comment-children">`;
        html += c.replies.map(r => renderFeedNode(r, depth + 1, currentUserId, isAdmin, myCommentLikes)).join("");
        html += `</div>`;
    }

    html += `</div>`;
    return html;
}

function buildFeedTree(comments) {
    const map = new Map();
    const roots = [];
    comments.forEach(c => map.set(c.id, { ...c, replies: [] }));
    comments.forEach(c => {
        const node = map.get(c.id);
        if (c.parent_id && map.has(c.parent_id)) {
            map.get(c.parent_id).replies.push(node);
        } else {
            roots.push(node);
        }
    });
    return roots;
}

async function loadFeedComments(card) {
    const name = card.dataset.name;
    const list = card.querySelector(".feed-comments-list");
    let feedCurrentUserId = null;
    let feedIsAdmin = false;
    let feedMyLikes = new Set();
    try {
        const me = await fetch("/api/auth/me");
        const meData = await me.json();
        if (meData.user) {
            feedCurrentUserId = meData.user.id;
            feedIsAdmin = meData.user.is_admin || false;
        }
    } catch { /* ignore */ }
    try {
        const likesRes = await fetch("/api/comment-likes");
        const likesData = await likesRes.json();
        feedMyLikes = new Set(likesData.likes || []);
    } catch { /* ignore */ }
    try {
        const res = await fetch(`/api/comments/${encodeURIComponent(name)}`);
        const comments = await res.json();
        if (!comments.length) {
            list.innerHTML = `<div class="comment"><div class="comment-main"><div class="comment-body"><span class="comment-text" style="color:var(--text-muted)">Nenhum comentário ainda</span></div></div></div>`;
            return;
        }
        const tree = buildFeedTree(comments);
        list.innerHTML = tree.map(c => renderFeedNode(c, 0, feedCurrentUserId, feedIsAdmin, feedMyLikes)).join("");
    } catch { list.innerHTML = ""; }
}

function toggleFeedComments(btn) {
    const card = btn.closest(".feed-card");
    const box = card.querySelector(".feed-comments");
    if (box.hidden) {
        box.hidden = false;
        loadFeedComments(card);
    } else {
        box.hidden = true;
    }
}

document.getElementById("feedView")?.addEventListener("click", e => {
    const feedImg = e.target.closest(".feed-img img");
    if (feedImg) {
        const card = feedImg.closest(".feed-card");
        if (card && typeof openLightbox === "function") {
            const name = card.dataset.name;
            const sorted = sortedImages();
            const idx = sorted.findIndex(x => x.name === name);
            openLightbox(idx >= 0 ? idx : 0, sorted);
        }
        return;
    }

    const feedReplyBtn = e.target.closest(".comment-reply-btn");
    if (feedReplyBtn) {
        e.stopPropagation();
        document.querySelectorAll(".comment-reply-form").forEach(f => f.remove());
        const commentEl = feedReplyBtn.closest(".comment");
        const commentId = feedReplyBtn.dataset.id;
        const username = feedReplyBtn.dataset.user;

        const form = document.createElement("div");
        form.className = "comment-reply-form";
        form.innerHTML = `
            <div class="comment-reply-form-avatar"><img src="/static/svg/default-avatar.svg" alt=""></div>
            <input type="text" placeholder="Responder @${username}..." autocomplete="off">
            <button type="button" class="comment-reply-send"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>`;
        commentEl.appendChild(form);

        const input = form.querySelector("input");
        if (typeof handleMentionInput === "function") {
            mentionInput = input;
            input.addEventListener("input", handleMentionInput);
            input.addEventListener("keydown", handleMentionKeydown);
        }
        input.focus();

        const send = async () => {
            const text = input.value.trim();
            if (!text) { form.remove(); if (typeof hideMentionDropdown === "function") hideMentionDropdown(); return; }
            const feedCard = commentEl.closest(".feed-card");
            const imgName = feedCard.dataset.name;
            try {
                const res = await fetch(`/api/comments/${imgName}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text, parent_id: parseInt(commentId) })
                });
                if (res.ok) {
                    loadFeedComments(feedCard);
                }
            } catch { /* ignore */ }
            if (typeof hideMentionDropdown === "function") hideMentionDropdown();
        };

        form.querySelector(".comment-reply-send").addEventListener("click", send);
        input.addEventListener("keydown", ev => {
            if (ev.key === "Enter" && !(typeof mentionDropdown !== "undefined" && mentionDropdown)) send();
            if (ev.key === "Escape") { form.remove(); if (typeof hideMentionDropdown === "function") hideMentionDropdown(); }
        });
        return;
    }

    const feedDeleteBtn = e.target.closest(".comment-delete");
    if (feedDeleteBtn) {
        e.stopPropagation();
        fetch(`/api/comments/id/${feedDeleteBtn.dataset.id}`, { method: "DELETE" })
            .then(() => {
                const feedCard = feedDeleteBtn.closest(".feed-card");
                if (feedCard) loadFeedComments(feedCard);
            });
        return;
    }

    const revealBtn = e.target.closest(".nsfw-reveal-btn");
    if (revealBtn) {
        e.stopPropagation();
        const container = revealBtn.closest(".feed-img");
        if (container) {
            container.querySelector("img")?.classList.remove("nsfw-blur");
            revealBtn.remove();
            container.classList.remove("nsfw-container");
        }
        return;
    }

    const postDeleteBtn = e.target.closest(".feed-delete");
    if (postDeleteBtn) {
        e.stopPropagation();
        const name = postDeleteBtn.dataset.name;
        if (!confirm("Apagar este post?")) return;
        fetch(`/api/my-images/${encodeURIComponent(name)}`, { method: "DELETE", credentials: "include" })
            .then(res => res.json())
            .then(data => {
                if (data.ok) {
                    allImages = allImages.filter(x => x.name !== name);
                    renderFeed();
                    renderGrid();
                }
            });
        return;
    }

    const likeBtn = e.target.closest(".feed-like");
    if (likeBtn) { toggleFeedLike(likeBtn); return; }
    const likersEl = e.target.closest(".feed-likes");
    if (likersEl) { toggleFeedLikers(likersEl); return; }
    const commentBtn = e.target.closest(".feed-comment-toggle");
    if (commentBtn) { toggleFeedComments(commentBtn); return; }
    const dlBtn = e.target.closest(".feed-download");
    if (dlBtn) { downloadFeedImage(dlBtn.dataset.name); return; }
});

function downloadFeedImage(name) {
    if (!name) return;
    const a = document.createElement("a");
    a.href = `/images/${name}`;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

document.getElementById("feedView")?.addEventListener("submit", async e => {
    if (!e.target.matches(".feed-comment-form")) return;
    e.preventDefault();
    if (typeof mentionDropdown !== "undefined" && mentionDropdown && typeof mentionUsers !== "undefined" && mentionUsers.length) return;
    const form = e.target;
    const input = form.querySelector("input");
    const text = input.value.trim();
    if (!text) return;
    const card = form.closest(".feed-card");
    const name = card.dataset.name;
    try {
        const res = await fetch(`/api/comments/${encodeURIComponent(name)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text })
        });
        if (res.ok) {
            input.value = "";
            await loadFeedComments(card);
            const img = allImages.find(x => x.name === name);
            if (img) img.comments = (img.comments || 0) + 1;
            const countEl = card.querySelector(".feed-comment-count");
            if (countEl) countEl.textContent = img.comments > 0 ? img.comments : "";
        }
    } catch { /* ignore */ }
    if (typeof hideMentionDropdown === "function") hideMentionDropdown();
});

document.getElementById("feedView")?.addEventListener("input", e => {
    if (e.target.matches(".feed-comment-form input") && typeof handleMentionInput === "function") {
        handleMentionInput(e);
    }
});

document.getElementById("feedView")?.addEventListener("keydown", e => {
    if (e.target.matches(".feed-comment-form input") && typeof handleMentionKeydown === "function") {
        handleMentionKeydown(e);
    }
});

document.getElementById("viewToggle")?.addEventListener("click", () => {
    feedMode = !feedMode;
    localStorage.setItem("viewMode", feedMode ? "feed" : "slide");
    applyViewMode();
});

/* === Refresh on tab focus (economical) === */
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        const imgName = currentImageName();
        if (imgName && typeof commentsCache !== "undefined") {
            commentsCache.delete(imgName);
            if (typeof loadComments === "function") loadComments();
        }
    }
});

loadCarousel();

/* === Feed create post (compact) === */
let feedCreateFile = null;
let feedCreateNsfw = false;

document.getElementById("feedCreateImg")?.addEventListener("click", () => {
    document.getElementById("feedCreateFile")?.click();
});

document.getElementById("feedCreateNsfw")?.addEventListener("click", () => {
    feedCreateNsfw = !feedCreateNsfw;
    document.getElementById("feedCreateNsfw").classList.toggle("active", feedCreateNsfw);
});

document.getElementById("feedCreateFile")?.addEventListener("change", () => {
    const fileInput = document.getElementById("feedCreateFile");
    const file = fileInput.files[0];
    if (!file) return;
    feedCreateFile = file;
    const preview = document.getElementById("feedCreatePreview");
    const previewImg = document.getElementById("feedCreatePreviewImg");
    previewImg.src = URL.createObjectURL(file);
    preview.hidden = false;
    document.getElementById("feedCreateNsfw")?.classList.add("visible");
    updateFeedCreateBtn();
    fileInput.value = "";
});

document.getElementById("feedCreatePreviewRemove")?.addEventListener("click", () => {
    feedCreateFile = null;
    feedCreateNsfw = false;
    document.getElementById("feedCreatePreview").hidden = true;
    document.getElementById("feedCreatePreviewImg").src = "";
    const nsfw = document.getElementById("feedCreateNsfw");
    if (nsfw) { nsfw.classList.remove("visible", "active"); }
    updateFeedCreateBtn();
});

document.getElementById("feedCreateText")?.addEventListener("input", updateFeedCreateBtn);

function updateFeedCreateBtn() {
    const btn = document.getElementById("feedCreateSend");
    const text = document.getElementById("feedCreateText")?.value.trim();
    btn.disabled = !feedCreateFile && !text;
}

document.getElementById("feedCreateSend")?.addEventListener("click", async () => {
    const btn = document.getElementById("feedCreateSend");
    const text = document.getElementById("feedCreateText")?.value.trim();
    if (!feedCreateFile && !text) return;
    btn.disabled = true;

    const form = new FormData();
    if (feedCreateFile) {
        let imageToUpload = feedCreateFile;
        let imageName = feedCreateFile.name;
        if (typeof compressImage === "function") {
            try {
                imageToUpload = await compressImage(feedCreateFile);
                if (imageToUpload !== feedCreateFile) {
                    const ext = feedCreateFile.type === "image/png" ? ".png" : ".jpg";
                    imageName = feedCreateFile.name.replace(/\.[^.]+$/, "") + ext;
                }
            } catch { /* keep original */ }
        }
        form.append("images", imageToUpload, imageName);
    }
    form.append("caption", text);
    if (feedCreateNsfw) form.append("nsfw", "1");

    try {
        const res = await fetch("/api/upload", { method: "POST", body: form });
        if (res.ok) {
            feedCreateFile = null;
            feedCreateNsfw = false;
            document.getElementById("feedCreateText").value = "";
            document.getElementById("feedCreatePreview").hidden = true;
            document.getElementById("feedCreatePreviewImg").src = "";
            const nsfw = document.getElementById("feedCreateNsfw");
            if (nsfw) nsfw.classList.remove("visible", "active");
            await loadCarousel();
        } else if (res.status === 401) {
            location.href = "/login";
        }
    } catch { /* ignore */ }

    updateFeedCreateBtn();
});

(async () => {
    try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        if (data.user) {
            const avatar = document.getElementById("feedCreateAvatar");
            if (avatar) {
                const src = (!data.user.avatar || data.user.avatar === "default-avatar.svg")
                    ? "/static/svg/default-avatar.svg" : `/avatars/${data.user.avatar}`;
                avatar.src = src;
            }
        }
    } catch { /* ignore */ }
})();

