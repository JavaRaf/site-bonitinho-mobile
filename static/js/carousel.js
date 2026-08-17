let current = 0;
let likedImages = new Set();
let allImages = [];
let feedMode = (localStorage.getItem("viewMode") || "slide") === "feed";
let sortMode = localStorage.getItem("sortMode") || "likes";

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
        const el = document.getElementById("imgOwnerSingleVote");
        if (el) el.style.display = data.enabled ? "" : "none";
    } catch { /* ignore */ }
}

async function loadCarousel() {
    const res = await fetch("/api/images");
    const images = await res.json();
    allImages = images;
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
        const loadNow = i <= 1;
        div.innerHTML = `<img ${loadNow ? `src="/images/${img.name}"` : `data-src="/images/${img.name}"`} alt="slide ${i}" draggable="false">`;
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
    return [...allImages].sort((a, b) => {
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
        return `
        <article class="feed-card" data-name="${escText(img.name)}">
            <div class="feed-owner">
                <img class="feed-avatar" src="${avatarUrl(img.owner_avatar)}" alt="" onerror="this.src='/static/svg/default-avatar.svg'">
                <span class="feed-owner-name">@${escText(img.owner || "—")}</span>
            </div>
            <div class="feed-caption">${escText(img.caption || "")}</div>
            <div class="feed-img"><img src="/images/${escText(img.name)}" alt="" loading="lazy" decoding="async"></div>
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
            </div>
            <div class="feed-likers" hidden></div>
            <div class="feed-comments" hidden>
                <div class="feed-comments-list"></div>
                <form class="comment-form feed-comment-form">
                    <input type="text" placeholder="Adicione um comentário..." autocomplete="off">
                    <button type="submit">Enviar</button>
                </form>
            </div>
        </article>`;
    }).join("");
}

function applyViewMode() {
    const carrossel = document.querySelector(".carrossel");
    const feedView = document.getElementById("feedView");
    const feedSortWrap = document.getElementById("feedSortWrap");
    const toggle = document.getElementById("viewToggle");
    if (!carrossel || !feedView) return;
    if (feedMode) {
        carrossel.style.display = "none";
        feedView.hidden = false;
        if (feedSortWrap) feedSortWrap.hidden = false;
        if (toggle) {
            toggle.innerHTML = SLIDE_ICON;
            toggle.title = "Alternar para slide";
            toggle.setAttribute("aria-label", "Alternar para slide");
        }
    } else {
        carrossel.style.display = "";
        feedView.hidden = true;
        if (feedSortWrap) feedSortWrap.hidden = true;
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
        updateLikeIcon();
        updateLikeCount();
    }
}

async function toggleFeedLikers(el) {
    const name = el.dataset.name;
    const card = el.closest(".feed-card");
    const box = card.querySelector(".feed-likers");
    if (!box.hidden) { box.hidden = true; return; }
    box.innerHTML = "Carregando...";
    box.hidden = false;
    try {
        const res = await fetch(`/api/likers/${encodeURIComponent(name)}`);
        const likers = await res.json();
        box.innerHTML = likers.length
            ? likers.map(u => `<span class="liker-tag">@${escText(u.username)}</span>`).join("")
            : `<span class="liker-tag" style="color:#a1a1aa">Ninguém ainda</span>`;
    } catch { box.hidden = true; }
}

function userColorFeed(username) {
    const colors = ["#f43f5e", "#6366f1", "#10b981", "#f59e0b", "#8b5cf6", "#0ea5e9", "#ec4899", "#84cc16"];
    let hash = 0;
    for (let i = 0; i < username.length; i++) hash = (hash * 31 + username.charCodeAt(i)) >>> 0;
    return colors[hash % colors.length];
}

async function loadFeedComments(card) {
    const name = card.dataset.name;
    const list = card.querySelector(".feed-comments-list");
    try {
        const res = await fetch(`/api/comments/${encodeURIComponent(name)}`);
        const comments = await res.json();
        list.innerHTML = comments.length
            ? comments.map(c => `<div class="comment"><span class="comment-user" style="color:${c.color || userColorFeed(c.username)}">${escText(c.username)}</span><span class="comment-text">${escText(c.text)}</span></div>`).join("")
            : `<div class="comment"><span class="comment-text" style="color:#a1a1aa">Nenhum comentário ainda</span></div>`;
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

