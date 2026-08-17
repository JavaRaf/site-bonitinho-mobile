(function () {
    const overlay = document.getElementById("lightboxOverlay");
    const imgWrap = document.getElementById("lightboxImgWrap");
    const img = document.getElementById("lightboxImg");
    const closeBtn = document.getElementById("lightboxClose");
    const prevBtn = document.getElementById("lightboxPrev");
    const nextBtn = document.getElementById("lightboxNext");
    const ownerEl = document.getElementById("lightboxOwner");
    const avatarEl = document.getElementById("lightboxAvatar");
    const likesEl = document.getElementById("lightboxLikes");
    const captionEl = document.getElementById("lightboxCaption");

    let zoom = 1;
    let panX = 0;
    let panY = 0;
    let lastPanX = 0;
    let lastPanY = 0;
    let isPanning = false;
    let startDist = 0;
    let startZoom = 1;
    let currentIndex = 0;
    let images = [];

    function applyTransform() {
        img.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
        imgWrap.classList.toggle("zoomed", zoom > 1);
    }

    function resetZoom() {
        zoom = 1;
        panX = 0;
        panY = 0;
        applyTransform();
    }

    function clampPan() {
        if (zoom <= 1) { panX = 0; panY = 0; return; }
        const rect = imgWrap.getBoundingClientRect();
        const imgRect = img.getBoundingClientRect();
        const maxX = Math.max(0, (imgRect.width - rect.width) / 2);
        const maxY = Math.max(0, (imgRect.height - rect.height) / 2);
        panX = Math.max(-maxX, Math.min(maxX, panX));
        panY = Math.max(-maxY, Math.min(maxY, panY));
    }

    function setZoom(newZoom, cx, cy) {
        const oldZoom = zoom;
        zoom = Math.max(1, Math.min(5, newZoom));
        if (zoom === 1) { panX = 0; panY = 0; }
        else if (cx !== undefined && cy !== undefined) {
            const rect = imgWrap.getBoundingClientRect();
            const dx = cx - rect.left - rect.width / 2;
            const dy = cy - rect.top - rect.height / 2;
            panX = lastPanX - dx * (zoom - oldZoom) / oldZoom;
            panY = lastPanY - dy * (zoom - oldZoom) / oldZoom;
        }
        clampPan();
        lastPanX = panX;
        lastPanY = panY;
        applyTransform();
    }

    /* Scroll wheel zoom */
    imgWrap.addEventListener("wheel", e => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.25 : 0.25;
        setZoom(zoom + delta, e.clientX, e.clientY);
    }, { passive: false });

    /* Pinch zoom + pan */
    imgWrap.addEventListener("touchstart", e => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            startDist = Math.hypot(dx, dy);
            startZoom = zoom;
        } else if (e.touches.length === 1 && zoom > 1) {
            isPanning = true;
            lastPanX = panX;
            lastPanY = panY;
            panX = lastPanX + (e.touches[0].clientX - (imgWrap._lastTouchX || e.touches[0].clientX));
            panY = lastPanY + (e.touches[0].clientY - (imgWrap._lastTouchY || e.touches[0].clientY));
        }
        imgWrap._lastTouchX = e.touches[0]?.clientX;
        imgWrap._lastTouchY = e.touches[0]?.clientY;
    }, { passive: false });

    imgWrap.addEventListener("touchmove", e => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.hypot(dx, dy);
            const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            setZoom(startZoom * (dist / startDist), midX, midY);
        } else if (e.touches.length === 1 && isPanning && zoom > 1) {
            e.preventDefault();
            const dx = e.touches[0].clientX - imgWrap._lastTouchX;
            const dy = e.touches[0].clientY - imgWrap._lastTouchY;
            panX = lastPanX + dx;
            panY = lastPanY + dy;
            clampPan();
            applyTransform();
        }
        imgWrap._lastTouchX = e.touches[0]?.clientX;
        imgWrap._lastTouchY = e.touches[0]?.clientY;
    }, { passive: false });

    imgWrap.addEventListener("touchend", e => {
        if (e.touches.length < 2) { startDist = 0; }
        if (e.touches.length === 0) {
            isPanning = false;
            lastPanX = panX;
            lastPanY = panY;
            if (zoom <= 1) resetZoom();
        }
    });

    /* Double-tap to toggle zoom */
    let lastTap = 0;
    imgWrap.addEventListener("click", e => {
        const now = Date.now();
        if (now - lastTap < 300) {
            if (zoom > 1) resetZoom();
            else setZoom(2.5, e.clientX, e.clientY);
            lastTap = 0;
        } else {
            lastTap = now;
        }
    });

    /* Mouse drag pan when zoomed */
    imgWrap.addEventListener("mousedown", e => {
        if (zoom <= 1) return;
        isPanning = true;
        lastPanX = panX;
        lastPanY = panY;
        imgWrap._mouseStartX = e.clientX;
        imgWrap._mouseStartY = e.clientY;
        imgWrap.style.cursor = "grabbing";
        e.preventDefault();
    });

    document.addEventListener("mousemove", e => {
        if (!isPanning || zoom <= 1) return;
        panX = lastPanX + (e.clientX - imgWrap._mouseStartX);
        panY = lastPanY + (e.clientY - imgWrap._mouseStartY);
        clampPan();
        applyTransform();
    });

    document.addEventListener("mouseup", () => {
        if (isPanning) {
            isPanning = false;
            lastPanX = panX;
            lastPanY = panY;
            imgWrap.style.cursor = zoom > 1 ? "grab" : "";
        }
    });

    /* Navigation */
    function updateLightboxInfo() {
        if (!images.length || !images[currentIndex]) return;
        const imgData = images[currentIndex];
        ownerEl.textContent = imgData.owner ? "@" + imgData.owner : "";
        const avatarSrc = (!imgData.owner_avatar || imgData.owner_avatar === "default-avatar.svg")
            ? "/static/svg/default-avatar.svg" : `/avatars/${imgData.owner_avatar}`;
        avatarEl.src = avatarSrc;
        const likes = imgData.likes || 0;
        likesEl.textContent = likes > 0 ? `${likes} curtida${likes > 1 ? "s" : ""}` : "";
        captionEl.textContent = imgData.caption || "";
        img.src = `/images/${imgData.name}`;
        img.alt = imgData.name;
        resetZoom();
    }

    function openLightbox(index, sourceImages) {
        images = sourceImages;
        currentIndex = index;
        overlay.classList.add("open");
        document.body.style.overflow = "hidden";
        updateLightboxInfo();
    }

    function closeLightbox() {
        overlay.classList.remove("open");
        document.body.style.overflow = "";
        resetZoom();
    }

    closeBtn.addEventListener("click", closeLightbox);

    overlay.addEventListener("click", e => {
        if (e.target === overlay) closeLightbox();
    });

    prevBtn.addEventListener("click", e => {
        e.stopPropagation();
        if (!images.length) return;
        currentIndex = (currentIndex - 1 + images.length) % images.length;
        updateLightboxInfo();
    });

    nextBtn.addEventListener("click", e => {
        e.stopPropagation();
        if (!images.length) return;
        currentIndex = (currentIndex + 1) % images.length;
        updateLightboxInfo();
    });

    /* Keyboard */
    document.addEventListener("keydown", e => {
        if (!overlay.classList.contains("open")) return;
        if (e.key === "Escape") closeLightbox();
        if (e.key === "ArrowLeft") { currentIndex = (currentIndex - 1 + images.length) % images.length; updateLightboxInfo(); }
        if (e.key === "ArrowRight") { currentIndex = (currentIndex + 1) % images.length; updateLightboxInfo(); }
    });

    /* Expose for carousel.js and feed */
    window.openLightbox = openLightbox;
    window.closeLightbox = closeLightbox;
    window.getLightboxImages = () => images;
})();
