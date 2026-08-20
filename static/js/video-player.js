function initVideoPlayer(wrapper) {
    const video = wrapper.querySelector("video");
    if (!video || video.dataset.playerInit) return;
    video.dataset.playerInit = "1";

    const controls = wrapper.querySelector(".vp-controls");
    const playBtn = wrapper.querySelector(".vp-play");
    const progressWrap = wrapper.querySelector(".vp-progress-wrap");
    const progressFill = wrapper.querySelector(".vp-progress-fill");
    const progressBuffer = wrapper.querySelector(".vp-progress-buffer");
    const progressHandle = wrapper.querySelector(".vp-progress-handle");
    const timeEl = wrapper.querySelector(".vp-time");
    const volumeWrap = wrapper.querySelector(".vp-volume");
    const volumeBtn = wrapper.querySelector(".vp-volume-btn");
    const volumeSlider = wrapper.querySelector(".vp-volume-slider");
    const volumeFill = wrapper.querySelector(".vp-volume-fill");
    const fullscreenBtn = wrapper.querySelector(".vp-fullscreen");
    const pipBtn = wrapper.querySelector(".vp-pip");
    const speedBtn = wrapper.querySelector(".vp-speed");
    const loadingEl = wrapper.querySelector(".vp-loading");
    const bigPlay = wrapper.querySelector(".vp-big-play");
    const tooltip = wrapper.querySelector(".vp-tooltip");

    let hideTimer = null;
    let seekDragging = false;
    let lastVol = 1;

    function fmt(s) {
        if (!isFinite(s) || s < 0) return "0:00";
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return m + ":" + String(sec).padStart(2, "0");
    }

    /* Play / Pause */
    function togglePlay() {
        if (video.paused || video.ended) video.play().catch(() => {});
        else video.pause();
    }

    function updatePlayIcon() {
        const paused = video.paused || video.ended;
        playBtn.innerHTML = paused
            ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>'
            : '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="3" width="4" height="18"/><rect x="15" y="3" width="4" height="18"/></svg>';
        bigPlay.style.display = paused ? "" : "none";
        bigPlay.innerHTML = paused
            ? '<svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>'
            : "";
    }

    video.addEventListener("play", updatePlayIcon);
    video.addEventListener("pause", updatePlayIcon);
    video.addEventListener("ended", updatePlayIcon);
    playBtn.addEventListener("click", (e) => { e.stopPropagation(); togglePlay(); });
    bigPlay.addEventListener("click", (e) => { e.stopPropagation(); togglePlay(); });
    wrapper.addEventListener("click", (e) => {
        if (e.target.closest(".vp-controls") || e.target.closest(".vp-big-play")) return;
        togglePlay();
    });

    /* Progress */
    function updateProgress() {
        if (seekDragging) return;
        const pct = video.duration ? (video.currentTime / video.duration) * 100 : 0;
        progressFill.style.width = pct + "%";
        progressHandle.style.left = pct + "%";
        timeEl.textContent = fmt(video.currentTime) + " / " + fmt(video.duration);
    }

    function updateBuffer() {
        if (video.buffered.length > 0) {
            const end = video.buffered.end(video.buffered.length - 1);
            progressBuffer.style.width = (video.duration ? (end / video.duration) * 100 : 0) + "%";
        }
    }

    video.addEventListener("timeupdate", updateProgress);
    video.addEventListener("progress", updateBuffer);
    video.addEventListener("loadedmetadata", updateProgress);

    function seekFromEvent(e) {
        const rect = progressWrap.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        video.currentTime = pct * video.duration;
        progressFill.style.width = (pct * 100) + "%";
        progressHandle.style.left = (pct * 100) + "%";
        timeEl.textContent = fmt(pct * video.duration) + " / " + fmt(video.duration);
    }

    progressWrap.addEventListener("mousedown", (e) => {
        e.preventDefault();
        seekDragging = true;
        seekFromEvent(e);
    });
    document.addEventListener("mousemove", (e) => {
        if (seekDragging) seekFromEvent(e);
    });
    document.addEventListener("mouseup", () => { seekDragging = false; });

    progressWrap.addEventListener("touchstart", (e) => {
        seekDragging = true;
        seekFromEvent(e.touches[0]);
    }, { passive: true });
    progressWrap.addEventListener("touchmove", (e) => {
        if (seekDragging) seekFromEvent(e.touches[0]);
    }, { passive: true });
    progressWrap.addEventListener("touchend", () => { seekDragging = false; });

    /* Tooltip on desktop */
    if (tooltip) {
        progressWrap.addEventListener("mousemove", (e) => {
            if (seekDragging) return;
            const rect = progressWrap.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const sec = pct * (video.duration || 0);
            tooltip.textContent = fmt(sec);
            tooltip.style.left = (pct * 100) + "%";
            tooltip.style.display = "block";
        });
        progressWrap.addEventListener("mouseleave", () => {
            tooltip.style.display = "none";
        });
    }

    /* Volume */
    function updateVolumeIcon() {
        const muted = video.muted || video.volume === 0;
        const vol = video.muted ? 0 : video.volume;
        volumeBtn.innerHTML = muted || vol === 0
            ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>'
            : vol < 0.5
                ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>'
                : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
        const fillPct = muted ? 0 : video.volume * 100;
        volumeFill.style.width = fillPct + "%";
    }

    function setVolume(v) {
        video.volume = Math.max(0, Math.min(1, v));
        video.muted = video.volume === 0;
        lastVol = video.volume || lastVol;
        updateVolumeIcon();
    }

    volumeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (video.muted || video.volume === 0) {
            video.muted = false;
            video.volume = lastVol || 0.5;
        } else {
            lastVol = video.volume;
            video.muted = true;
        }
        updateVolumeIcon();
    });

    let volDragging = false;
    function volFromEvent(e) {
        const rect = volumeSlider.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        setVolume(pct);
    }

    volumeSlider.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        volDragging = true;
        volFromEvent(e);
    });
    document.addEventListener("mousemove", (e) => { if (volDragging) volFromEvent(e); });
    document.addEventListener("mouseup", () => { volDragging = false; });
    volumeSlider.addEventListener("touchstart", (e) => { volDragging = true; volFromEvent(e.touches[0]); }, { passive: true });
    volumeSlider.addEventListener("touchmove", (e) => { if (volDragging) volFromEvent(e.touches[0]); }, { passive: true });
    volumeSlider.addEventListener("touchend", () => { volDragging = false; });

    video.addEventListener("volumechange", updateVolumeIcon);
    updateVolumeIcon();

    /* Fullscreen */
    function isFullscreen() {
        return document.fullscreenElement === wrapper || document.webkitFullscreenElement === wrapper;
    }

    function toggleFullscreen() {
        if (isFullscreen()) {
            (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        } else {
            (wrapper.requestFullscreen || wrapper.webkitRequestFullscreen).call(wrapper);
        }
    }

    fullscreenBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleFullscreen(); });

    wrapper.addEventListener("dblclick", (e) => {
        if (e.target.closest(".vp-controls")) return;
        toggleFullscreen();
    });

    function updateFsIcon() {
        const fs = isFullscreen();
        fullscreenBtn.innerHTML = fs
            ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>'
            : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
    }

    document.addEventListener("fullscreenchange", updateFsIcon);
    document.addEventListener("webkitfullscreenchange", updateFsIcon);
    updateFsIcon();

    /* PiP */
    if (pipBtn) {
        if (!document.pictureInPictureEnabled) {
            pipBtn.style.display = "none";
        }
        pipBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            try {
                if (document.pictureInPictureElement === video) await document.exitPictureInPicture();
                else await video.requestPictureInPicture();
            } catch {}
        });
    }

    /* Speed */
    const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
    let speedIdx = 2;
    speedBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        speedIdx = (speedIdx + 1) % speeds.length;
        video.playbackRate = speeds[speedIdx];
        speedBtn.textContent = speeds[speedIdx] === 1 ? "1x" : speeds[speedIdx] + "x";
    });

    /* Loading */
    video.addEventListener("waiting", () => { loadingEl.style.display = "flex"; });
    video.addEventListener("canplay", () => { loadingEl.style.display = "none"; });
    video.addEventListener("playing", () => { loadingEl.style.display = "none"; });

    /* Auto-hide controls */
    function showControls() {
        controls.classList.add("visible");
        wrapper.classList.remove("hide-cursor");
        clearTimeout(hideTimer);
        if (!video.paused) {
            hideTimer = setTimeout(() => {
                controls.classList.remove("visible");
                wrapper.classList.add("hide-cursor");
            }, 3000);
        }
    }

    wrapper.addEventListener("mousemove", showControls);
    wrapper.addEventListener("touchstart", showControls, { passive: true });
    wrapper.addEventListener("mouseenter", showControls);
    wrapper.addEventListener("mouseleave", () => {
        if (!video.paused) {
            clearTimeout(hideTimer);
            hideTimer = setTimeout(() => {
                controls.classList.remove("visible");
                wrapper.classList.add("hide-cursor");
            }, 1000);
        }
    });
    video.addEventListener("play", showControls);
    video.addEventListener("pause", () => {
        clearTimeout(hideTimer);
        controls.classList.add("visible");
        wrapper.classList.remove("hide-cursor");
    });

    /* Keyboard */
    wrapper.setAttribute("tabindex", "0");
    wrapper.addEventListener("keydown", (e) => {
        if (e.target !== wrapper && e.target.tagName !== "VIDEO") return;
        switch (e.key) {
            case " ":
            case "k":
                e.preventDefault(); togglePlay(); break;
            case "ArrowLeft":
                e.preventDefault(); video.currentTime = Math.max(0, video.currentTime - 5); break;
            case "ArrowRight":
                e.preventDefault(); video.currentTime = Math.min(video.duration, video.currentTime + 5); break;
            case "ArrowUp":
                e.preventDefault(); setVolume(video.volume + 0.1); break;
            case "ArrowDown":
                e.preventDefault(); setVolume(video.volume - 0.1); break;
            case "m":
            case "M":
                e.preventDefault(); volumeBtn.click(); break;
            case "f":
            case "F":
                e.preventDefault(); toggleFullscreen(); break;
            case "0":
                e.preventDefault(); video.currentTime = 0; break;
        }
        showControls();
    });

    /* Show controls initially */
    controls.classList.add("visible");
    updatePlayIcon();
    updateProgress();
}

function createVideoPlayerHTML(src) {
    return `
    <div class="video-player">
        <video src="${src}" playsinline preload="metadata"></video>
        <div class="vp-loading" style="display:none"><div class="vp-spinner"></div></div>
        <button class="vp-big-play" type="button" aria-label="Reproduzir">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>
        </button>
        <div class="vp-controls">
            <div class="vp-progress-wrap">
                <div class="vp-progress-buffer"></div>
                <div class="vp-progress-fill"></div>
                <div class="vp-progress-handle"></div>
                <div class="vp-tooltip" style="display:none"></div>
            </div>
            <div class="vp-controls-row">
                <button class="vp-play vp-btn" type="button" aria-label="Reproduzir">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>
                </button>
                <div class="vp-volume">
                    <button class="vp-volume-btn vp-btn" type="button" aria-label="Volume">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                    </button>
                    <div class="vp-volume-slider">
                        <div class="vp-volume-fill"></div>
                    </div>
                </div>
                <span class="vp-time">0:00 / 0:00</span>
                <div class="vp-spacer"></div>
                <button class="vp-speed vp-btn" type="button" aria-label="Velocidade">1x</button>
                <button class="vp-pip vp-btn" type="button" aria-label="Picture-in-Picture">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><rect x="12" y="9" width="8" height="6" rx="1" fill="currentColor" opacity="0.3"/></svg>
                </button>
                <button class="vp-fullscreen vp-btn" type="button" aria-label="Tela cheia">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
                </button>
            </div>
        </div>
    </div>`;
}
