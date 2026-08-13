let current = 0;
let likedImages = new Set();

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
    if (nameEl) nameEl.textContent = owner ? owner : "";
    if (captionEl) captionEl.textContent = caption;
    if (avatarEl) {
        if (!avatar || avatar === "default-avatar.svg") {
            avatarEl.src = "/static/svg/default-avatar.svg";
        } else {
            avatarEl.src = `/avatars/${avatar}`;
            avatarEl.onerror = () => { avatarEl.src = "/static/svg/default-avatar.svg"; };
        }
    }
}

function goTo(index) {
    const slides = document.querySelectorAll(".carousel-slide");
    if (!slides.length) return;
    current = ((index % slides.length) + slides.length) % slides.length;
    document.getElementById("carouselTrack").style.transform = `translateX(-${current * 100}%)`;
    document.querySelectorAll(".carousel-dot").forEach((d, i) => d.classList.toggle("active", i === current));
    updateLikeIcon();
    updateOwnerOverlay();
    updateLikeCount();
    lazyLoadAround(current);
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

/* === Double-tap → toggle like (per-image, via API) === */
track.addEventListener("click", e => {
    const img = e.target.closest(".carousel-slide img");
    if (!img) return;
    const now = Date.now();
    if (now - lastTapTime < 350) {
        toggleLike();
        lastTapTime = 0;
    } else {
        lastTapTime = now;
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
    } catch { /* ignore */ }
}

async function toggleLike() {
    const imgName = currentImageName();
    if (!imgName) return;

    const res = await fetch(`/api/likes/${imgName}`, { method: "POST" });
    if (!res.ok) return;

    await loadLikes();
    await refreshLikeCounts();
    updateLikeIcon();
    updateLikeCount();
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

