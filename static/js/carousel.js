let current = 0;
let likedImages = new Set();
let allImages = [];
let sortMode = localStorage.getItem("sortMode") || "likes";
let singleVoteMode = false;
let nsfwFilter = localStorage.getItem("nsfwFilter") || "blur";
let myUserId = null;
let followingIds = [];

function askConfirm(msg) {
    return new Promise(resolve => {
        const el = document.getElementById("confirmMsg");
        const modal = document.getElementById("confirmModal");
        if (!el || !modal) { resolve(false); return; }
        el.textContent = msg;
        modal.classList.add("open");
        const cleanup = (val) => {
            modal.classList.remove("open");
            document.getElementById("confirmYes").onclick = null;
            document.getElementById("confirmNo").onclick = null;
            resolve(val);
        };
        document.getElementById("confirmYes").onclick = () => cleanup(true);
        document.getElementById("confirmNo").onclick = () => cleanup(false);
    });
}

async function loadLikes() {
    try {
        const res = await fetch("/api/likes");
        const data = await res.json();
        likedImages = new Set(data.likes || []);
    } catch { /* not logged in */ }
}

async function loadSingleVoteFlag() {
    try {
        const res = await fetch("/api/singlevote");
        const data = await res.json();
        singleVoteMode = data.enabled || false;
        const feedEl = document.getElementById("feedSingleVote");
        if (feedEl) feedEl.style.display = singleVoteMode ? "" : "none";
        const badge = document.getElementById("singleVoteBadge");
        if (badge) badge.hidden = !singleVoteMode;
        renderFeed();
    } catch { /* ignore */ }
}

async function initFeedState() {
    await fetchMyUserId();
    await loadLikes();
    await loadSingleVoteFlag();
}

async function fetchMyUserId() {
    try {
        const me = await fetch("/api/auth/me");
        const meData = await me.json();
        if (meData.user) myUserId = meData.user.id;
    } catch { /* not logged in */ }
}

async function loadCarousel(skipScroll = false) {
    const res = await fetch("/api/images");
    const images = await res.json();
    allImages = images;
    updateLastTimestamp();

    await fetchMyUserId();

    await fetchFollowingIds();

    renderGrid();

    if (!images.length) return;

    await loadLikes();
    await loadSingleVoteFlag();
    renderFeed();
    syncSortSelects();
    if (!skipScroll) {
        highlightPostFromUrl();
    }
}

function highlightPostFromUrl() {
    const params = new URLSearchParams(location.search);
    const name = params.get("img") || params.get("image");
    if (!name) return;
    const target = allImages.find(p =>
        p.name === name || (p.media || []).some(m => m.name === name)
    );
    if (!target) return;
    const card = document.querySelector(`.feed-card[data-name="${CSS.escape(target.name)}"]`);
    if (!card) return;

    let active = true;
    const jumpToCard = () => {
        if (!active) return;
        const rect = card.getBoundingClientRect();
        const y = rect.top + window.scrollY - (window.innerHeight - rect.height) / 2;
        window.scrollTo(0, Math.max(0, y));
    };

    requestAnimationFrame(() => {
        jumpToCard();
        card.style.boxShadow = "0 0 0 2px #378ee9";
        setTimeout(() => { card.style.boxShadow = ""; }, 2000);

        const cards = Array.from(document.querySelectorAll(".feed-card"));
        const idx = cards.indexOf(card);
        const medias = [];
        cards.slice(0, idx).forEach(c =>
            c.querySelectorAll("img, video").forEach(m => medias.push(m))
        );
        medias.forEach(m => {
            m.addEventListener("load", jumpToCard, { once: true });
            m.addEventListener("loadeddata", jumpToCard, { once: true });
            m.addEventListener("error", jumpToCard, { once: true });
        });
        window.addEventListener("load", jumpToCard, { once: true });

        setTimeout(() => { active = false; }, 8000);
    });
}

function escText(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
}

function sortedImages() {
    let imgs = [...allImages];
    if (nsfwFilter === "hide") {
        imgs = imgs.filter(i => !i.nsfw);
    }
    if (sortMode.startsWith("eleicao")) {
        imgs = imgs.filter(i => i.eleicao);
    } else if (sortMode.startsWith("following_")) {
        const followSet = new Set((followingIds || []).map(Number));
        imgs = imgs.filter(i => followSet.has(Number(i.owner_id)));
    }
    const byLikes = sortMode === "likes" || sortMode === "following_likes" || sortMode === "eleicao_likes";
    return imgs.sort((a, b) => {
        if (!byLikes) {
            return String(b.created_at || "").localeCompare(String(a.created_at || ""));
        }
        return (b.likes || 0) - (a.likes || 0);
    });
}

function getExpandedSlides() {
    const images = sortedImages();
    const result = [];
    images.forEach(img => {
        if (img.media && img.media.length > 1) {
            img.media.forEach(m => {
                result.push({ name: m.name, nsfw: img.nsfw });
            });
        } else {
            result.push({ name: img.name, nsfw: img.nsfw });
        }
    });
    return result;
}

function renderGrid() {
    const thumbs = document.getElementById("gridThumbs");
    if (!thumbs) return;
    const slides = getExpandedSlides();
    thumbs.innerHTML = slides.map(img => {
        const isVideo = /\.(mp4|webm|mov)$/i.test(img.name);
        const media = isVideo
            ? `<video src="/images/${escText(img.name)}" muted preload="metadata" playsinline></video>`
            : `<img src="/thumbs/${escText(img.name)}" alt="" loading="lazy" decoding="async">`;
        return `
        <button class="grid-thumb" data-name="${escText(img.name)}">
            ${media}
        </button>`;
    }).join("");

    thumbs.querySelectorAll(".grid-thumb").forEach(btn => {
        btn.addEventListener("click", () => {
            const card = document.querySelector(`.feed-card[data-name="${CSS.escape(btn.dataset.name)}"]`);
            if (card) {
                card.scrollIntoView({ behavior: "smooth", block: "center" });
                card.style.boxShadow = "0 0 0 2px #6366f1";
                setTimeout(() => { card.style.boxShadow = ""; }, 2000);
            }
            closeGrid();
        });
    });
}

function setSortMode(mode) {
    const valid = ["likes", "recent", "following_likes", "following_recent", "eleicao", "eleicao_likes", "eleicao_recent"];
    if (!valid.includes(mode)) return;
    sortMode = mode;
    localStorage.setItem("sortMode", mode);
    syncSortSelects();
    if (sortMode.startsWith("following_") && !followingIds.length) {
        fetchFollowingIds().then(() => { renderGrid(); renderFeed(); });
    } else {
        renderGrid();
        renderFeed();
    }
}

async function fetchFollowingIds() {
    try {
        const res = await fetch("/api/auth/following");
        if (res.ok) {
            const data = await res.json();
            followingIds = Array.isArray(data) ? data : [];
        }
    } catch { /* ignore */ }
}

function syncSortSelects() {
    document.querySelectorAll(".sort-select").forEach(sel => { sel.value = sortMode; });
    const forYou = document.getElementById("tabForYou");
    const following = document.getElementById("tabFollowing");
    const isFollowing = sortMode.startsWith("following_");
    const isEleicao = sortMode.startsWith("eleicao");
    if (forYou && following) {
        forYou.classList.toggle("active", !isFollowing && !isEleicao);
        following.classList.toggle("active", isFollowing);
    }
    document.querySelectorAll(".feed-tab-option").forEach(opt => {
        opt.classList.toggle("active", opt.dataset.mode === sortMode);
    });
    document.querySelectorAll(".header-section").forEach(section => {
        if (section.id === "headerSection1") section.classList.toggle("active", !isFollowing && !isEleicao);
        if (section.id === "headerSection2") section.classList.toggle("active", isFollowing);
        if (section.id === "headerSection3") section.classList.toggle("active", isEleicao);
    });
    document.querySelectorAll("#paraVoceSortMenu button").forEach(btn => {
        btn.classList.toggle("active", !isFollowing && !isEleicao && btn.dataset.sort === (sortMode === "likes" ? "popular" : "recente"));
    });
    document.querySelectorAll("#seguindoSortMenu button").forEach(btn => {
        btn.classList.toggle("active", isFollowing && btn.dataset.sort === (sortMode.endsWith("_likes") ? "popular" : "recente"));
    });
    document.querySelectorAll("#eleicaoSortMenu button").forEach(btn => {
        btn.classList.toggle("active", isEleicao && btn.dataset.sort === (sortMode.endsWith("_likes") ? "popular" : "recente"));
    });
}

function openGrid() {
    document.getElementById("gridOverlay")?.classList.add("open");
}

function closeGrid() {
    document.getElementById("gridOverlay")?.classList.remove("open");
}

document.getElementById("grid-btn")?.addEventListener("click", openGrid);

document.getElementById("gridClose")?.addEventListener("click", closeGrid);

const followingMenu = document.getElementById("followingMenu");

function closeFollowingMenu() {
    followingMenu?.classList.remove("open");
}

document.getElementById("tabForYou")?.addEventListener("click", () => {
    closeFollowingMenu();
    setSortMode("likes");
});

document.getElementById("tabFollowing")?.addEventListener("click", () => {
    followingMenu?.classList.toggle("open");
});

document.getElementById("tabAddPost")?.addEventListener("click", () => {
    document.getElementById("composerModal")?.classList.add("open");
});

document.querySelectorAll(".feed-tab-option").forEach(opt => {
    opt.addEventListener("click", () => {
        setSortMode(opt.dataset.mode);
        closeFollowingMenu();
    });
});

document.addEventListener("click", e => {
    if (!e.target.closest("#tabFollowingWrap")) closeFollowingMenu();
});

document.getElementById("gridOverlay")?.addEventListener("click", e => {
    if (e.target === e.currentTarget) closeGrid();
});

/* === Feed view (scroll mode) === */
function avatarUrl(a) {
    return (!a || a === "default-avatar.svg") ? "/static/svg/default-avatar.svg" : `/avatars/${a}`;
}

function initFeedCarousel(el) {
    const slides = el.querySelectorAll(".feed-carousel-slide");
    const dots = el.querySelectorAll(".feed-carousel-dot");
    let idx = 0;

    function goTo(i) {
        if (i < 0 || i >= slides.length) return;
        slides[idx].classList.remove("active");
        dots[idx].classList.remove("active");
        idx = i;
        slides[idx].classList.add("active");
        dots[idx].classList.add("active");
    }

    slides[0]?.classList.add("active");

    dots.forEach((d, i) => d.addEventListener("click", () => goTo(i)));

    let startX = 0;
    el.addEventListener("touchstart", e => { startX = e.touches[0].clientX; }, { passive: true });
    el.addEventListener("touchend", e => {
        const dx = e.changedTouches[0].clientX - startX;
        if (Math.abs(dx) > 40) {
            if (dx < 0 && idx < slides.length - 1) goTo(idx + 1);
            else if (dx > 0 && idx > 0) goTo(idx - 1);
        }
    }, { passive: true });
}

function renderFeed() {
    const feed = document.getElementById("feedView");
    if (!feed) return;
    feed.innerHTML = sortedImages().map(feedCardHTML).join("");
    initFeedMedia(feed);
}

function feedCardHTML(img) {
    const liked = likedImages.has(img.name);
    const likes = img.likes || 0;
    const comments = img.comments || 0;
    const isText = img.post_type === "text";
    const isVideo = img.post_type === "video";
    const isMulti = img.media && img.media.length > 1;
    const nsfwClass = (img.nsfw && nsfwFilter === "blur") ? " nsfw-blur" : "";

    let mediaSection = "";
    if (!isText) {
        if (isMulti) {
            const slides = img.media.map((m, i) => {
                if (m.media_type === "video") {
                    return `<div class="feed-carousel-slide">${createVideoPlayerHTML("/images/" + escText(m.name))}</div>`;
                }
                const loadLazy = i > 0 ? ' loading="lazy"' : '';
                return `<div class="feed-carousel-slide"><img src="/images/${escText(m.name)}" alt=""${loadLazy} decoding="async" class="${nsfwClass.trim()}"></div>`;
            }).join("");
            const dots = img.media.map((_, i) => `<span class="feed-carousel-dot${i === 0 ? ' active' : ''}" data-idx="${i}"></span>`).join("");
            mediaSection = `<div class="feed-carousel" data-post="${escText(img.post_id)}">${slides}<div class="feed-carousel-dots">${dots}</div></div>`;
        } else if (isVideo) {
            mediaSection = `<div class="feed-img">${createVideoPlayerHTML("/images/" + escText(img.name))}</div>`;
        } else {
            mediaSection = `<div class="feed-img${img.nsfw ? ' nsfw-container' : ''}"><img src="/images/${escText(img.name)}" alt="" loading="lazy" decoding="async" class="${nsfwClass.trim()}">${img.nsfw && nsfwFilter === "blur" ? '<button class="nsfw-reveal-btn" type="button">Mostrar imagem</button>' : ''}</div>`;
        }
    }

    const downloadBtn = isText ? "" : `<button class="feed-download" data-name="${escText(img.name)}" type="button" title="Baixar"><img src="/static/svg/download.svg" alt="download"></button>`;
    
    const tagNsfwHtml = img.nsfw ? `
        <span class="feed-nsfw-badge" style="display: inline-flex; align-items: center; gap: 0.25rem; background: var(--danger); color: #fff; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.65rem; font-weight: 700; white-space: nowrap;">
            <img src="/static/svg/NSFW.svg" alt="" style="width: 12px; height: 12px; filter: brightness(0) invert(1);"> NSFW
        </span>` : '';
        
    const tagEleicaoHtml = img.eleicao ? `
        <span class="feed-eleicao-badge" style="display: inline-flex; align-items: center; gap: 0.25rem; background: var(--btn-bg); color: #fff; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.65rem; font-weight: 700; white-space: nowrap;">
            <img src="/static/svg/eleicao.svg" alt="" style="width: 12px; height: 12px; filter: brightness(0) invert(1);"> Eleição
        </span>` : '';

    const tagsContainerHtml = (img.nsfw || img.eleicao) ? `
        <div class="feed-post-tags" style="display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.35rem; margin-bottom: 0.15rem; padding: 0 0.75rem;">
            ${tagNsfwHtml}
            ${tagEleicaoHtml}
        </div>` : '';

    return `
    <article class="feed-card${isText ? ' feed-card-text' : ''}" data-name="${escText(img.name)}" data-post-id="${escText(img.post_id || img.name)}">
        <div class="feed-owner">
            <img class="feed-avatar" src="${avatarUrl(img.owner_avatar)}" alt="" onerror="this.src='/static/svg/default-avatar.svg'" data-owner="${escText(img.owner || "")}">
            <span class="feed-owner-name" data-owner="${escText(img.owner || "")}">@${escText(img.owner || "\u2014")}</span>${img.created_at ? `<span class="feed-time">&middot; ${feedTimeAgo(img.created_at)}</span>` : ""}
            <div class="feed-owner-flags">
                ${myUserId && img.owner_id === myUserId ? `
                    <button class="feed-edit" data-name="${escText(img.name)}" data-caption="${escText(img.caption || "")}" data-nsfw="${img.nsfw ? "1" : "0"}" data-eleicao="${img.eleicao ? "1" : "0"}" type="button" title="Editar post" style="background:none;border:none;cursor:pointer;display:inline-flex;align-items:center;padding:4px;">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.65; color: var(--text);">
                            <path d="M12 20h9"></path>
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                        </svg>
                    </button>
                    <button class="feed-delete" data-name="${escText(img.name)}" type="button" title="Apagar post"><img src="/static/svg/trash.svg" alt="delete"></button>
                ` : ""}
            </div>
        </div>
        ${tagsContainerHtml}
        <div class="feed-caption${isText ? ' feed-caption-text' : ''}">${escText(img.caption || "")}</div>
        ${mediaSection}
        <div class="feed-actions">
            <button class="feed-like ${liked ? "liked" : ""}" data-name="${escText(img.name)}" type="button">
                <img src="${liked ? "/static/svg/upvote-filled.svg" : "/static/svg/upvote.svg"}" alt="like">
            </button>
            <span class="feed-likes" data-name="${escText(img.name)}" role="button">${likes > 0 ? likes : ""}</span>
            <button class="feed-comment-toggle" data-name="${escText(img.name)}" type="button">
                <img src="/static/svg/comments.svg" alt="comment">
            </button>
            <span class="feed-comment-count">${comments > 0 ? comments : ""}</span>
            ${downloadBtn}
        </div>
        <div class="feed-likers"></div>
        <div class="feed-comments" hidden>
            <div class="feed-comments-list"></div>
            <div class="feed-reply-indicator"><span class="feed-reply-text"></span><button type="button" class="feed-reply-cancel">&times;</button></div>
            <form class="comment-form feed-comment-form">
                <textarea class="comment-textarea" placeholder="Adicione um comentario..." rows="1" autocomplete="off"></textarea>
                <button type="submit"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>
            </form>
        </div>
    </article>`;
}

function initFeedMedia(root) {
    root.querySelectorAll(".feed-carousel").forEach(initFeedCarousel);
    root.querySelectorAll(".video-player").forEach(initVideoPlayer);
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

    let prevUnlikedName = null;
    let prevUnlikedImg = null;
    if (singleVoteMode && liked) {
        for (const n of likedImages) {
            if (n === name) continue;
            const cand = allImages.find(x => x.name === n);
            if (!cand || !cand.eleicao) continue;
            prevUnlikedName = n;
            likedImages.delete(n);
            prevUnlikedImg = cand;
            if (prevUnlikedImg) prevUnlikedImg.likes = Math.max(0, (prevUnlikedImg.likes || 0) - 1);
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
        if (prevUnlikedName) {
            likedImages.add(prevUnlikedName);
            if (prevUnlikedImg) prevUnlikedImg.likes = (prevUnlikedImg.likes || 0) + 1;
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
    const canEdit = currentUserId === c.user_id;
    if (canEdit || canDelete) {
        html += `<div class="comment-owner-actions" style="display:flex; gap:0.25rem; align-items:center;">`;
        if (canEdit) {
            html += `<button class="comment-edit" data-id="${c.id}" data-text="${escText(c.text)}" style="background:none;border:none;cursor:pointer;padding:4px;display:inline-flex;align-items:center;">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.65; color: var(--text);">
                    <path d="M12 20h9"></path>
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                </svg>
            </button>`;
        }
        if (canDelete) {
            html += `<button class="comment-delete" data-id="${c.id}"><img src="/static/svg/trash.svg" alt="del"></button>`;
        }
        html += `</div>`;
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

function onFeedClick(e) {
    if (e.target.closest(".video-player")) return;

    const ownerEl = e.target.closest("[data-owner]");
    if (ownerEl && ownerEl.dataset.owner) {
        location.href = "/perfil/" + encodeURIComponent(ownerEl.dataset.owner);
        return;
    }

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
        const commentId = parseInt(feedReplyBtn.dataset.id);
        const username = feedReplyBtn.dataset.user;
        const card = feedReplyBtn.closest(".feed-card");
        feedReplyParentId = commentId;
        const indicator = card.querySelector(".feed-reply-indicator");
        const indicatorText = card.querySelector(".feed-reply-text");
        if (indicator && indicatorText) {
            indicatorText.textContent = `Respondendo a @${username}`;
            indicator.classList.add("visible");
        }
        const textarea = card.querySelector(".feed-comment-form textarea");
        if (textarea) {
            textarea.placeholder = `Responder @${username}...`;
            textarea.focus();
        }
        return;
    }

    const feedReplyCancel = e.target.closest(".feed-reply-cancel");
    if (feedReplyCancel) {
        e.stopPropagation();
        const card = feedReplyCancel.closest(".feed-card");
        feedReplyParentId = null;
        const indicator = card.querySelector(".feed-reply-indicator");
        if (indicator) indicator.classList.remove("visible");
        const textarea = card.querySelector(".feed-comment-form textarea");
        if (textarea) textarea.placeholder = "Adicione um comentario...";
        return;
    }

    const commentEditBtn = e.target.closest(".comment-edit");
    if (commentEditBtn) {
        e.stopPropagation();
        const id = commentEditBtn.dataset.id;
        const currentText = commentEditBtn.dataset.text || "";

        const modal = document.createElement("div");
        modal.className = "confirm-overlay";
        modal.style.cssText = "position: fixed; inset: 0; background: rgba(0, 0, 0, 0.75); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1rem;";
        modal.innerHTML = `
            <div class="confirm-box" style="width: 90%; max-width: 400px; padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem;">
                <h3 style="margin: 0; font-size: 1.125rem; color: var(--text);">Editar Comentário</h3>
                
                <div style="display: flex; flex-direction: column; gap: 0.35rem;">
                    <textarea id="editCommentText" rows="3" style="width: 100%; padding: 0.5rem; border-radius: 6px; border: 1.5px solid var(--border); background: var(--surface); color: var(--text); resize: none; font-family: inherit;">${currentText}</textarea>
                </div>
                
                <div style="display: flex; justify-content: flex-end; gap: 0.5rem;">
                    <button id="editCommentCancel" class="confirm-btn confirm-no" style="padding: 0.5rem 1rem; border-radius: 6px;">Cancelar</button>
                    <button id="editCommentSave" class="confirm-btn confirm-yes" style="padding: 0.5rem 1rem; border-radius: 6px; background: var(--btn-bg); color: #fff;">Salvar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector("#editCommentCancel").onclick = () => modal.remove();
        modal.querySelector("#editCommentSave").onclick = async () => {
            const text = modal.querySelector("#editCommentText").value.trim();
            modal.remove();
            if (!text) return;

            try {
                const res = await fetch(`/api/comments/id/${id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text }),
                    credentials: "include"
                });
                const data = await res.json();
                if (data.id) {
                    const feedCard = commentEditBtn.closest(".feed-card");
                    if (feedCard) loadFeedComments(feedCard);
                }
            } catch (err) {
                console.error("Erro ao editar comentário:", err);
            }
        };
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

    const postEditBtn = e.target.closest(".feed-edit");
    if (postEditBtn) {
        e.stopPropagation();
        const name = postEditBtn.dataset.name;
        const currentCaption = postEditBtn.dataset.caption || "";
        const currentNsfw = postEditBtn.dataset.nsfw === "1";
        const currentEleicao = postEditBtn.dataset.eleicao === "1";
        
        const card = postEditBtn.closest(".feed-card");
        const postId = card?.dataset.postId;
        const postData = allImages.find(x => x.post_id === postId || x.name === name) || { media: [{ name, media_type: "image" }], post_id: postId || name };

        let mediaList = [...postData.media];
        let mediaToRemove = [];
        let newFiles = [];
        let editNsfwActive = currentNsfw;
        let editEleicaoActive = currentEleicao;

        const modal = document.createElement("div");
        modal.className = "confirm-overlay";
        modal.style.cssText = "position: fixed; inset: 0; background: rgba(0, 0, 0, 0.75); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1rem;";
        
        modal.innerHTML = `
            <div class="confirm-box" style="width: 100%; max-width: 480px; padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; max-height: 90vh; overflow-y: auto;">
                <h3 style="margin: 0; font-size: 1.125rem; color: var(--text);">Editar Postagem</h3>
                
                <div style="display: flex; flex-direction: column; gap: 0.35rem;">
                    <label style="font-size: 0.8rem; color: var(--text-secondary); font-weight: 600;">Legenda</label>
                    <textarea id="editPostCaption" rows="3" style="width: 100%; padding: 0.5rem; border-radius: 6px; border: 1.5px solid var(--border); background: var(--surface); color: var(--text); resize: none; font-family: inherit;">${currentCaption}</textarea>
                </div>

                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                    <label style="font-size: 0.8rem; color: var(--text-secondary); font-weight: 600;">Mídias do Post</label>
                    <div id="editMediaPreviews" style="display: flex; flex-wrap: wrap; gap: 0.5rem; min-height: 60px; padding: 0.5rem; border: 1.5px dashed var(--border); border-radius: 6px; background: var(--surface-2);"></div>
                    <button id="editAddMediaBtn" type="button" style="align-self: flex-start; background: var(--surface); border: 1.5px solid var(--border); color: var(--text); padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.8rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 0.25rem;">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Adicionar Imagem/Vídeo
                    </button>
                    <input type="file" id="editFileInput" multiple accept="image/*,video/*" style="display: none;">
                </div>
                
                <div style="display: flex; gap: 0.5rem; align-items: center; margin-top: 0.25rem;">
                    <button id="editNsfwToggle" type="button" class="feed-create-nsfw ${editNsfwActive ? 'active visible' : 'visible'}" style="margin: 0; padding: 0.35rem 0.75rem; font-size: 0.8rem; font-weight: 700; height: auto; border-radius: 6px;">18+</button>
                    <button id="editEleicaoToggle" type="button" style="background: ${editEleicaoActive ? 'var(--btn-bg)' : 'var(--surface-2)'}; color: ${editEleicaoActive ? '#fff' : 'var(--text-soft)'}; border: 1.5px solid ${editEleicaoActive ? 'var(--btn-bg)' : 'var(--border)'}; padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.8rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 0.25rem; transition: background 0.15s, color 0.15s;">
                        <img src="/static/svg/eleicao.svg" alt="" style="width: 14px; height: 14px; filter: ${editEleicaoActive ? 'brightness(0) invert(1)' : 'none'};"> Eleição
                    </button>
                </div>
                
                <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem; border-top: 1.5px solid var(--border); padding-top: 0.75rem;">
                    <button id="editPostCancel" class="confirm-btn confirm-no" style="padding: 0.5rem 1rem; border-radius: 6px;">Cancelar</button>
                    <button id="editPostSave" class="confirm-btn confirm-yes" style="padding: 0.5rem 1rem; border-radius: 6px; background: var(--btn-bg); color: #fff;">Salvar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const previewsContainer = modal.querySelector("#editMediaPreviews");
        const fileInput = modal.querySelector("#editFileInput");
        const nsfwToggle = modal.querySelector("#editNsfwToggle");
        const eleicaoToggle = modal.querySelector("#editEleicaoToggle");

        nsfwToggle.onclick = () => {
            editNsfwActive = !editNsfwActive;
            nsfwToggle.classList.toggle("active", editNsfwActive);
        };

        eleicaoToggle.onclick = () => {
            editEleicaoActive = !editEleicaoActive;
            eleicaoToggle.style.background = editEleicaoActive ? 'var(--btn-bg)' : 'var(--surface-2)';
            eleicaoToggle.style.color = editEleicaoActive ? '#fff' : 'var(--text-soft)';
            eleicaoToggle.style.borderColor = editEleicaoActive ? 'var(--btn-bg)' : 'var(--border)';
            eleicaoToggle.querySelector("img").style.filter = editEleicaoActive ? 'brightness(0) invert(1)' : 'none';
        };

        modal.querySelector("#editAddMediaBtn").onclick = () => fileInput.click();

        function renderEditPreviews() {
            previewsContainer.innerHTML = "";
            
            // Renderiza mídias atuais
            mediaList.forEach(m => {
                const div = document.createElement("div");
                div.className = "composer-preview-item";
                div.style.cssText = "position: relative; width: 60px; height: 60px; border-radius: 4px; overflow: hidden; background: #000;";
                if (m.media_type === "video") {
                    const vid = document.createElement("video");
                    vid.src = `/images/${m.name}`;
                    vid.style.cssText = "width: 100%; height: 100%; object-fit: cover;";
                    div.appendChild(vid);
                } else {
                    const img = document.createElement("img");
                    img.src = `/images/${m.name}`;
                    img.style.cssText = "width: 100%; height: 100%; object-fit: cover;";
                    div.appendChild(img);
                }
                const removeBtn = document.createElement("button");
                removeBtn.className = "composer-remove";
                removeBtn.type = "button";
                removeBtn.innerHTML = "&times;";
                removeBtn.onclick = () => {
                    mediaToRemove.push(m.name);
                    mediaList = mediaList.filter(x => x.name !== m.name);
                    renderEditPreviews();
                };
                div.appendChild(removeBtn);
                previewsContainer.appendChild(div);
            });

            // Renderiza novas mídias adicionadas
            newFiles.forEach((file, idx) => {
                const div = document.createElement("div");
                div.className = "composer-preview-item";
                div.style.cssText = "position: relative; width: 60px; height: 60px; border-radius: 4px; overflow: hidden; background: #000;";
                const isVideo = file.type.startsWith("video/");
                if (isVideo) {
                    const vid = document.createElement("video");
                    vid.src = URL.createObjectURL(file);
                    vid.style.cssText = "width: 100%; height: 100%; object-fit: cover;";
                    div.appendChild(vid);
                } else {
                    const img = document.createElement("img");
                    img.src = URL.createObjectURL(file);
                    img.style.cssText = "width: 100%; height: 100%; object-fit: cover;";
                    div.appendChild(img);
                }
                const removeBtn = document.createElement("button");
                removeBtn.className = "composer-remove";
                removeBtn.type = "button";
                removeBtn.innerHTML = "&times;";
                removeBtn.onclick = () => {
                    newFiles.splice(idx, 1);
                    renderEditPreviews();
                };
                div.appendChild(removeBtn);
                previewsContainer.appendChild(div);
            });
        }

        fileInput.onchange = () => {
            const files = Array.from(fileInput.files);
            if (!files.length) return;
            for (const file of files) {
                if (file.type.startsWith("video/")) {
                    const vid = document.createElement("video");
                    vid.preload = "metadata";
                    vid.src = URL.createObjectURL(file);
                    vid.onloadedmetadata = () => {
                        if (vid.duration > 60) {
                            alert("Vídeo muito longo (máximo 1 minuto).");
                            URL.revokeObjectURL(vid.src);
                            return;
                        }
                        newFiles.push(file);
                        renderEditPreviews();
                    };
                } else {
                    newFiles.push(file);
                }
            }
            renderEditPreviews();
            fileInput.value = "";
        };

        renderEditPreviews();

        modal.querySelector("#editPostCancel").onclick = () => modal.remove();
        
        modal.querySelector("#editPostSave").onclick = async () => {
            const caption = modal.querySelector("#editPostCaption").value.trim();
            const saveBtn = modal.querySelector("#editPostSave");
            saveBtn.disabled = true;
            saveBtn.textContent = "Salvando...";

            try {
                // 1. Remove mídias deletadas
                if (mediaToRemove.length > 0) {
                    await Promise.all(mediaToRemove.map(imgName => 
                        fetch(`/api/my-images/${encodeURIComponent(imgName)}/single`, {
                            method: "DELETE",
                            credentials: "include"
                        })
                    ));
                }

                // 2. Upload de novas mídias
                if (newFiles.length > 0) {
                    const form = new FormData();
                    form.append("post_id", postData.post_id);
                    form.append("caption", caption);
                    form.append("nsfw", editNsfwActive ? "1" : "0");
                    form.append("eleicao", editEleicaoActive ? "1" : "0");
                    
                    // Reaproveita função de compressão se disponível
                    const compressor = typeof compressImage === "function" ? compressImage : async (f) => f;
                    
                    for (const file of newFiles) {
                        if (file.type.startsWith("video/")) {
                            form.append("images", file, file.name);
                        } else {
                            try {
                                const compressed = await compressor(file);
                                let name = file.name;
                                if (compressed !== file) {
                                    const ext = file.type === "image/png" ? ".png" : ".jpg";
                                    name = file.name.replace(/\.[^.]+$/, "") + ext;
                                }
                                form.append("images", compressed, name);
                            } catch {
                                form.append("images", file, file.name);
                            }
                        }
                    }
                    await fetch("/api/upload", {
                        method: "POST",
                        body: form,
                        credentials: "include"
                    });
                }

                // 3. Atualiza dados do post (caption, nsfw, eleicao)
                const res = await fetch(`/api/my-posts/${encodeURIComponent(name)}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        caption,
                        nsfw: editNsfwActive,
                        eleicao: editEleicaoActive
                    }),
                    credentials: "include"
                });
                const data = await res.json();
                
                if (data.ok) {
                    modal.remove();
                    if (typeof loadCarousel === "function") {
                        await loadCarousel(true);
                    } else {
                        location.reload();
                    }
                }
            } catch (err) {
                console.error("Erro ao salvar post:", err);
                saveBtn.disabled = false;
                saveBtn.textContent = "Salvar";
            }
        };
        return;
    }

    const postDeleteBtn = e.target.closest(".feed-delete");
    if (postDeleteBtn) {
        e.stopPropagation();
        const name = postDeleteBtn.dataset.name;
        askConfirm("Apagar este post?").then(ok => {
            if (!ok) return;
            fetch(`/api/my-images/${encodeURIComponent(name)}`, { method: "DELETE", credentials: "include" })
                .then(res => res.json())
                .then(data => {
                    if (data.ok) {
                        allImages = allImages.filter(x => x.name !== name);
                        postDeleteBtn.closest(".feed-card")?.remove();
                        renderFeed();
                        renderGrid();
                    }
                });
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
}

function downloadFeedImage(name) {
    if (!name) return;
    const a = document.createElement("a");
    a.href = `/images/${name}`;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

let feedReplyParentId = null;

async function onFeedSubmit(e) {
    if (!e.target.matches(".feed-comment-form")) return;
    e.preventDefault();
    if (typeof mentionDropdown !== "undefined" && mentionDropdown && typeof mentionUsers !== "undefined" && mentionUsers.length) return;
    const form = e.target;
    const textarea = form.querySelector("textarea");
    const text = textarea.value.trim();
    if (!text) return;
    const card = form.closest(".feed-card");
    const name = card.dataset.name;
    const body = { text };
    if (feedReplyParentId) {
        body.parent_id = feedReplyParentId;
        feedReplyParentId = null;
        const indicator = card.querySelector(".feed-reply-indicator");
        if (indicator) indicator.classList.remove("visible");
        textarea.placeholder = "Adicione um comentario...";
    }
    try {
        const res = await fetch(`/api/comments/${encodeURIComponent(name)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        if (res.ok) {
            textarea.value = "";
            autoResizeFeed(textarea);
            await loadFeedComments(card);
            const img = allImages.find(x => x.name === name);
            if (img) img.comments = (img.comments || 0) + 1;
            const countEl = card.querySelector(".feed-comment-count");
            if (countEl) countEl.textContent = img.comments > 0 ? img.comments : "";
        }
    } catch { /* ignore */ }
    if (typeof hideMentionDropdown === "function") hideMentionDropdown();
}

function onFeedInput(e) {
    if (e.target.matches(".feed-comment-form textarea") && typeof handleMentionInput === "function") {
        handleMentionInput(e);
    }
    if (e.target.matches(".feed-comment-form textarea")) {
        autoResizeFeed(e.target);
    }
}

function onFeedKeydown(e) {
    if (e.target.matches(".feed-comment-form textarea") && typeof handleMentionKeydown === "function") {
        const wasOpen = typeof mentionDropdown !== "undefined" && mentionDropdown !== null;
        handleMentionKeydown(e);
        if (wasOpen && e.key === "Enter") return;
    }
    if (e.target.matches(".feed-comment-form textarea") && e.key === "Enter" && !e.shiftKey) {
        if (typeof mentionDropdown !== "undefined" && mentionDropdown) return;
        e.preventDefault();
        e.target.closest("form").requestSubmit();
    }
}

function bindFeedEvents(root) {
    root.addEventListener("click", onFeedClick);
    root.addEventListener("submit", onFeedSubmit);
    root.addEventListener("input", onFeedInput);
    root.addEventListener("keydown", onFeedKeydown);
}

const feedRootEl = document.getElementById("feedView");
if (feedRootEl) bindFeedEvents(feedRootEl);

function autoResizeFeed(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
}

if (document.getElementById("feedView")) loadCarousel();

/* === Feed card navigation (desktop) === */
(function () {
    const navUp = document.getElementById("feedNavUp");
    const navDown = document.getElementById("feedNavDown");
    if (!navUp || !navDown) return;

    function getCards() {
        const container = document.getElementById("feedView") || document.getElementById("postsGrid");
        return container ? Array.from(container.querySelectorAll(".feed-card")) : [];
    }

    function currentCardIndex() {
        const cards = getCards();
        const scrollY = window.scrollY + window.innerHeight * 0.3;
        for (let i = cards.length - 1; i >= 0; i--) {
            if (cards[i].getBoundingClientRect().top + window.scrollY <= scrollY) return i;
        }
        return 0;
    }

    navUp.addEventListener("click", () => {
        const cards = getCards();
        if (!cards.length) return;
        const idx = Math.max(0, currentCardIndex() - 1);
        cards[idx].scrollIntoView({ behavior: "smooth", block: "center" });
    });

    navDown.addEventListener("click", () => {
        const cards = getCards();
        if (!cards.length) return;
        const idx = Math.min(cards.length - 1, currentCardIndex() + 1);
        cards[idx].scrollIntoView({ behavior: "smooth", block: "center" });
    });
})();

/* === Real-time new posts polling === */
let lastPostTimestamp = "";
let pendingNewPosts = [];

function checkNewPosts() {
    if (!lastPostTimestamp) return;
    fetch(`/api/images/since?after=${encodeURIComponent(lastPostTimestamp)}`, { credentials: "include" })
        .then(r => r.json())
        .then(newPosts => {
            if (newPosts.length > 0) {
                pendingNewPosts = newPosts;
                showNewPostsBanner(newPosts.length);
            }
        })
        .catch(() => {});
}

function showNewPostsBanner(count) {
    let banner = document.getElementById("newPostsBanner");
    if (!banner) {
        banner = document.createElement("div");
        banner.id = "newPostsBanner";
        banner.className = "new-posts-banner";
        banner.innerHTML = `<div class="new-posts-inner"><span class="new-posts-text"></span></div>`;
        banner.addEventListener("click", loadPendingPosts);
        const feed = document.getElementById("feedView");
        if (feed) {
            feed.parentNode.insertBefore(banner, feed);
        }
    }
    banner.querySelector(".new-posts-text").textContent = `${count} novo${count > 1 ? "s" : ""} post${count > 1 ? "s" : ""} \u2022 toque para ver`;
    banner.hidden = false;
}

function loadPendingPosts() {
    if (pendingNewPosts.length === 0) return;
    allImages = [...pendingNewPosts.filter(p => !allImages.some(x => x.post_id === p.post_id)), ...allImages];
    pendingNewPosts = [];
    updateLastTimestamp();
    renderFeed();
    renderGrid();
    const banner = document.getElementById("newPostsBanner");
    if (banner) banner.hidden = true;
}

function updateLastTimestamp() {
    if (allImages.length > 0) {
        const latest = allImages.reduce((a, b) => (a.created_at || "") > (b.created_at || "") ? a : b);
        lastPostTimestamp = latest.created_at || "";
    }
}

setInterval(checkNewPosts, 60000);

/* === Feed create post (compact) === */
let feedCreateFiles = [];
let feedCreateZip = null;
let feedCreateNsfw = false;
let feedCreateEleicao = false;

document.getElementById("feedCreateImg")?.addEventListener("click", () => {
    document.getElementById("feedCreateFile")?.click();
});

document.getElementById("feedCreateZipBtn")?.addEventListener("click", () => {
    document.getElementById("feedCreateZip")?.click();
});

function setFeedCreateNsfw(active) {
    feedCreateNsfw = active;
    document.getElementById("feedCreateNsfwBtn")?.classList.toggle("active", active);
}

document.getElementById("feedCreateNsfwBtn")?.addEventListener("click", () => {
    setFeedCreateNsfw(!feedCreateNsfw);
});

function setFeedCreateEleicao(active) {
    feedCreateEleicao = active;
    document.getElementById("feedCreateEleicaoBtn")?.classList.toggle("active", active);
}

document.getElementById("feedCreateEleicaoBtn")?.addEventListener("click", () => {
    setFeedCreateEleicao(!feedCreateEleicao);
});

function clearFeedCreateZip() {
    feedCreateZip = null;
    const input = document.getElementById("feedCreateZip");
    if (input) input.value = "";
    const preview = document.getElementById("feedCreateZipPreview");
    if (preview) preview.hidden = true;
    const label = document.getElementById("feedCreateZipLabel");
    if (label) label.textContent = "Arquivo ZIP selecionado";
    const size = document.getElementById("feedCreateZipSize");
    if (size) size.textContent = "";
}

document.getElementById("feedCreateZip")?.addEventListener("change", () => {
    const input = document.getElementById("feedCreateZip");
    const file = input.files[0];
    if (!file) return;
    feedCreateFiles = [];
    renderFeedCreatePreviews();
    feedCreateZip = file;
    const label = document.getElementById("feedCreateZipLabel");
    if (label) label.textContent = file.name;
    const size = document.getElementById("feedCreateZipSize");
    if (size) size.textContent = `${Math.round(file.size / 1024)} KB`;
    const preview = document.getElementById("feedCreateZipPreview");
    if (preview) preview.hidden = false;
    updateFeedCreateBtn();
    input.value = "";
});

document.getElementById("feedCreateZipRemove")?.addEventListener("click", () => {
    clearFeedCreateZip();
    updateFeedCreateBtn();
});

document.getElementById("feedCreateFile")?.addEventListener("change", () => {
    const fileInput = document.getElementById("feedCreateFile");
    const files = Array.from(fileInput.files);
    if (!files.length) return;
    clearFeedCreateZip();
    for (const file of files) {
        if (file.type.startsWith("video/")) {
            const vid = document.createElement("video");
            vid.preload = "metadata";
            vid.src = URL.createObjectURL(file);
            vid.onloadedmetadata = () => {
                if (vid.duration > 60) {
                    alert("Video muito longo (maximo 1 minuto).");
                    URL.revokeObjectURL(vid.src);
                    return;
                }
                feedCreateFiles.push(file);
                renderFeedCreatePreviews();
                updateFeedCreateBtn();
            };
        } else {
            feedCreateFiles.push(file);
        }
    }
    renderFeedCreatePreviews();
    updateFeedCreateBtn();
    fileInput.value = "";
});

function renderFeedCreatePreviews() {
    const container = document.getElementById("feedCreatePreviews");
    if (!container) return;
    container.innerHTML = "";
    feedCreateFiles.forEach((file, idx) => {
        const div = document.createElement("div");
        div.className = "composer-preview-item";
        const isVideo = file.type.startsWith("video/");
        if (isVideo) {
            const vid = document.createElement("video");
            vid.src = URL.createObjectURL(file);
            vid.muted = true;
            vid.loop = true;
            vid.playsInline = true;
            div.appendChild(vid);
        } else {
            const img = document.createElement("img");
            img.src = URL.createObjectURL(file);
            div.appendChild(img);
        }
        const removeBtn = document.createElement("button");
        removeBtn.className = "composer-remove";
        removeBtn.type = "button";
        removeBtn.innerHTML = "&times;";
        removeBtn.addEventListener("click", () => {
            feedCreateFiles.splice(idx, 1);
            renderFeedCreatePreviews();
            updateFeedCreateBtn();
        });
        div.appendChild(removeBtn);
        container.appendChild(div);
    });
    if (feedCreateFiles.length > 0) {
        const nsfwBtn = document.createElement("button");
        nsfwBtn.type = "button";
        nsfwBtn.className = "feed-create-nsfw" + (feedCreateNsfw ? " active visible" : " visible");
        nsfwBtn.textContent = "18+";
        nsfwBtn.addEventListener("click", () => {
            setFeedCreateNsfw(!feedCreateNsfw);
        });
        container.appendChild(nsfwBtn);
    }
}

document.getElementById("feedCreateText")?.addEventListener("input", (e) => {
    autoResizeFeedCreate(e.target);
    updateFeedCreateBtn();
});

document.getElementById("feedCreateText")?.addEventListener("paste", (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageItems = items.filter(i => i.type.startsWith("image/"));
    if (!imageItems.length) return;
    e.preventDefault();
    for (const item of imageItems) {
        const file = item.getAsFile();
        if (file) feedCreateFiles.push(file);
    }
    renderFeedCreatePreviews();
    updateFeedCreateBtn();
});

function autoResizeFeedCreate(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 150) + "px";
}

function updateFeedCreateBtn() {
    const btn = document.getElementById("feedCreateSend");
    const text = document.getElementById("feedCreateText")?.value.trim();
    btn.disabled = !feedCreateFiles.length && !feedCreateZip && !text;
}

document.getElementById("feedCreateSend")?.addEventListener("click", async () => {
    const btn = document.getElementById("feedCreateSend");
    const text = document.getElementById("feedCreateText")?.value.trim();
    if (!feedCreateFiles.length && !feedCreateZip && !text) return;
    btn.disabled = true;

    const form = new FormData();
    for (const file of feedCreateFiles) {
        if (file.type.startsWith("video/")) {
            form.append("images", file, file.name);
        } else {
            let imageToUpload = file;
            let imageName = file.name;
            if (typeof compressImage === "function") {
                try {
                    imageToUpload = await compressImage(file);
                    if (imageToUpload !== file) {
                        const ext = file.type === "image/png" ? ".png" : ".jpg";
                        imageName = file.name.replace(/\.[^.]+$/, "") + ext;
                    }
                } catch { /* keep original */ }
            }
            form.append("images", imageToUpload, imageName);
        }
    }
    if (feedCreateZip) form.append("zip", feedCreateZip);
    form.append("caption", text);
    if (feedCreateNsfw) form.append("nsfw", "1");
    if (feedCreateEleicao) form.append("eleicao", "1");

    try {
        const res = await fetch("/api/upload", { method: "POST", body: form });
        if (res.ok) {
            feedCreateFiles = [];
            setFeedCreateNsfw(false);
            setFeedCreateEleicao(false);
            clearFeedCreateZip();
            const feedInput = document.getElementById("feedCreateText");
            feedInput.value = "";
            autoResizeFeedCreate(feedInput);
            document.getElementById("feedCreatePreviews").innerHTML = "";
            await loadCarousel(true);
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



