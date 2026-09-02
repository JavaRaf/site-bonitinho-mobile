let videoLightbox = null;
let videoLightboxBody = null;
let videoLightboxClose = null;
let videoLightboxHolder = null;

function cacheVideoLightbox() {
    if (!document.getElementById("videoLightbox")) return false;
    if (!videoLightbox) {
        videoLightbox = document.getElementById("videoLightbox");
        videoLightboxBody = document.getElementById("videoLightboxBody");
        videoLightboxClose = document.getElementById("videoLightboxClose");
        videoLightboxClose.addEventListener("click", closeVideoLightbox);
        videoLightbox.addEventListener("click", (e) => {
            if (!e.target.closest(".video-player")) closeVideoLightbox();
        });
        document.addEventListener("keydown", (e) => {
            if (videoLightbox.classList.contains("open") && e.key === "Escape") closeVideoLightbox();
        });
    }
    return true;
}

function openVideoLightbox(wrapper) {
    if (wrapper.dataset.inLightbox === "1") return;
    if (!cacheVideoLightbox()) return;
    const video = wrapper.querySelector("video");
    videoLightboxHolder = { parent: wrapper.parentNode, next: wrapper.nextSibling };
    videoLightboxBody.appendChild(wrapper);
    wrapper.dataset.inLightbox = "1";
    videoLightbox.classList.add("open");
    document.body.style.overflow = "hidden";
    document.querySelectorAll(".video-player video").forEach(v => {
        if (v !== video) v.pause();
    });
    if (video && video.paused) {
        wrapper.dataset.userPaused = "0";
        wrapper.dataset.autoplayActive = "1";
        video.play().catch(() => {});
    }
    const controls = wrapper.querySelector(".vp-controls");
    if (controls) controls.classList.add("visible");
    if (typeof wrapper._vpUpdateControls === "function") wrapper._vpUpdateControls();
}

function closeVideoLightbox() {
    if (!videoLightbox || !videoLightbox.classList.contains("open")) return;
    const wrapper = videoLightboxBody.querySelector(".video-player");
    if (wrapper && videoLightboxHolder) {
        const holder = videoLightboxHolder;
        if (holder.next) holder.parent.insertBefore(wrapper, holder.next);
        else holder.parent.appendChild(wrapper);
        delete wrapper.dataset.inLightbox;
        if (typeof wrapper._vpUpdateControls === "function") wrapper._vpUpdateControls();
    }
    videoLightboxHolder = null;
    videoLightbox.classList.remove("open");
    document.body.style.overflow = "";
    scheduleAutoPlayCheck();
}

/* Preferência de áudio do usuário (localStorage) */
function currentVideoMutedPref() {
    try {
        const v = localStorage.getItem("mikanet_video_muted");
        return v === null ? false : v === "1";
    } catch {
        return false;
    }
}

function applyVideoMutedPref(muted) {
    const m = typeof muted === "boolean" ? muted : currentVideoMutedPref();
    document.querySelectorAll(".video-player video").forEach(v => { v.muted = m; });
    scheduleAutoPlayCheck();
}

function saveVideoMutedPref(muted) {
    try { localStorage.setItem("mikanet_video_muted", muted ? "1" : "0"); } catch {}
    applyVideoMutedPref(muted);
}

/* Volume preferido do usuário (localStorage) */
function currentVideoVolumePref() {
    try {
        const n = parseFloat(localStorage.getItem("mikanet_video_volume"));
        return isFinite(n) ? Math.max(0, Math.min(1, n)) : 1;
    } catch {
        return 1;
    }
}

function saveVideoVolumePref(volume) {
    try { localStorage.setItem("mikanet_video_volume", String(volume)); } catch {}
    syncVideoSettingsUI();
}

function applyVideoVolumePref(volume) {
    document.querySelectorAll(".video-player video").forEach(v => {
        if (!v.muted) v.volume = volume;
    });
}

/* Preferência de autoplay de vídeos do usuário (localStorage) */
const VIDEO_AUTOPLAY_KEY = "mikanet_video_autoplay";

function currentVideoAutoplayPref() {
    try {
        const v = localStorage.getItem(VIDEO_AUTOPLAY_KEY);
        return v === null ? true : v !== "0";
    } catch {
        return true;
    }
}

function setVideoAutoplayPref(enabled) {
    try { localStorage.setItem(VIDEO_AUTOPLAY_KEY, enabled ? "1" : "0"); } catch {}
    syncVideoSettingsUI();
    scheduleAutoPlayCheck();
}

function syncVideoSettingsUI() {
    const autoplay = currentVideoAutoplayPref();
    document.querySelectorAll(".video-player .vp-autoplay-btn").forEach(b => {
        b.setAttribute("aria-checked", autoplay ? "true" : "false");
    });
    const vol = Math.round(currentVideoVolumePref() * 100);
    document.querySelectorAll(".video-player .vp-settings-vol").forEach(s => { s.value = vol; });
    document.querySelectorAll(".video-player .vp-settings-vol-val").forEach(el => { el.textContent = vol + "%"; });
}

/* Autoplay: vídeo toca quando está no centro (destaque) e pausa ao sair */
const AUTOPLAY_VIDEOS = new Set();
let autoplayTicking = false;

function registerAutoPlay(wrapper) {
    if (wrapper.closest(".comment-media")) return;
    AUTOPLAY_VIDEOS.add(wrapper);
    scheduleAutoPlayCheck();
}

function scheduleAutoPlayCheck() {
    if (autoplayTicking) return;
    autoplayTicking = true;
    requestAnimationFrame(() => { autoplayTicking = false; updateAutoPlayAll(); });
}

function updateAutoPlayAll() {
    const autoplayEnabled = currentVideoAutoplayPref();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    AUTOPLAY_VIDEOS.forEach(wrapper => {
        if (wrapper.dataset.inLightbox === "1") return;
        const video = wrapper.querySelector("video");
        if (!video) return;
        const r = wrapper.getBoundingClientRect();
        const onScreen = r.bottom > 0 && r.top < vh && r.width > 0;
        if (!onScreen) {
            if (!video.paused) video.pause();
            return;
        }
        if (!autoplayEnabled) return;
        const centerY = r.top + r.height / 2;
        const centered = centerY > vh * 0.33 && centerY < vh * 0.67;
        if (centered) {
            if (video.paused && !video.ended && wrapper.dataset.userPaused !== "1") {
                wrapper.dataset.autoplayActive = "1";
                video.play().catch(() => {
                    if (!video.muted) {
                        video.muted = true;
                        video.play().catch(() => {});
                    }
                });
            }
        } else if (wrapper.dataset.autoplayActive === "1" && !video.paused) {
            wrapper.dataset.autoplayActive = "0";
            video.pause();
        }
    });
}

window.addEventListener("scroll", scheduleAutoPlayCheck, { passive: true });
window.addEventListener("resize", scheduleAutoPlayCheck, { passive: true });

function initVideoPlayer(wrapper) {
    const video = wrapper.querySelector("video");
    if (!video || video.dataset.playerInit) return;
    video.dataset.playerInit = "1";
    video.muted = currentVideoMutedPref();
    video.volume = currentVideoVolumePref();

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
    const muteBtn = wrapper.querySelector(".vp-mute");
    const pipBtn = wrapper.querySelector(".vp-pip");
    const speedBtn = wrapper.querySelector(".vp-speed");
    const loadingEl = wrapper.querySelector(".vp-loading");
    const bigPlay = wrapper.querySelector(".vp-big-play");
    const tooltip = wrapper.querySelector(".vp-tooltip");
    const settingsBtn = wrapper.querySelector(".vp-settings");
    const settingsPanel = wrapper.querySelector(".vp-settings-panel");
    const autoplaySwitch = wrapper.querySelector(".vp-autoplay-btn");
    const volSlider = wrapper.querySelector(".vp-settings-vol");
    const volVal = wrapper.querySelector(".vp-settings-vol-val");

    const tapIndicator = document.createElement("div");
    tapIndicator.className = "vp-tap-indicator";
    wrapper.appendChild(tapIndicator);

    let hideTimer = null;
    let seekDragging = false;
    let lastVol = video.volume;

    function fmt(s) {
        if (!isFinite(s) || s < 0) return "0:00";
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return m + ":" + String(sec).padStart(2, "0");
    }

    /* Play / Pause */
    function showTapIndicator(paused) {
        tapIndicator.innerHTML = paused
            ? '<svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="3" width="4" height="18"/><rect x="15" y="3" width="4" height="18"/></svg>'
            : '<svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>';
        tapIndicator.classList.remove("show");
        void tapIndicator.offsetWidth;
        tapIndicator.classList.add("show");
    }

    function togglePlay() {
        if (video.paused || video.ended) {
            showTapIndicator(false);
            wrapper.dataset.userPaused = "0";
            wrapper.dataset.autoplayActive = "0";
            video.play().catch(() => {});
        } else {
            showTapIndicator(true);
            wrapper.dataset.userPaused = "1";
            wrapper.dataset.autoplayActive = "0";
            video.pause();
        }
    }

    function updatePlayIcon() {
        const paused = video.paused || video.ended;
        playBtn.innerHTML = paused
            ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>'
            : '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="3" width="4" height="18"/><rect x="15" y="3" width="4" height="18"/></svg>';
        bigPlay.style.display = paused ? "" : "none";
        bigPlay.innerHTML = paused
            ? '<svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>'
            : "";
    }

    video.addEventListener("play", updatePlayIcon);
    video.addEventListener("pause", updatePlayIcon);
    video.addEventListener("ended", updatePlayIcon);
    playBtn.addEventListener("click", (e) => { e.stopPropagation(); togglePlay(); });
    bigPlay.addEventListener("click", (e) => { e.stopPropagation(); togglePlay(); });
    wrapper.addEventListener("click", (e) => {
        if (settingsPanel && !settingsPanel.hidden && !e.target.closest(".vp-settings-panel") && !e.target.closest(".vp-settings")) {
            closeSettings();
            return;
        }
        if (e.target.closest(".vp-controls") || e.target.closest(".vp-big-play") || e.target.closest(".vp-settings-panel") || e.target.closest(".vp-settings")) return;
        const rect = wrapper.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        const inCenter = x > 0.3 && x < 0.7 && y > 0.3 && y < 0.7;
        const inBottomLeft = x < 0.28 && y > 0.72;
        if (inCenter || inBottomLeft) {
            togglePlay();
        } else if (wrapper.dataset.inLightbox === "1") {
            closeVideoLightbox();
        } else {
            openVideoLightbox(wrapper);
        }
    });

    /* Preferências (engrenagem) */
    function closeSettings() {
        settingsPanel.hidden = true;
        if (settingsBtn) settingsBtn.classList.remove("active");
    }

    if (settingsBtn && settingsPanel) {
        settingsBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const opening = settingsPanel.hidden;
            settingsPanel.hidden = !opening;
            settingsBtn.classList.toggle("active", opening);
            if (opening) {
                syncVideoSettingsUI();
                showControls();
            }
        });
        if (autoplaySwitch) {
            autoplaySwitch.addEventListener("click", (e) => {
                e.stopPropagation();
                setVideoAutoplayPref(!currentVideoAutoplayPref());
            });
        }
        if (volSlider) {
            volSlider.addEventListener("input", (e) => {
                e.stopPropagation();
                setVolume(parseInt(e.target.value, 10) / 100);
                syncVideoSettingsUI();
            });
        }
    }

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
        const icons = {
            off: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>',
            low: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>',
            high: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>',
        };
        const html = muted || vol === 0 ? icons.off : vol < 0.5 ? icons.low : icons.high;
        if (volumeBtn) volumeBtn.innerHTML = html;
        if (muteBtn) muteBtn.innerHTML = muted || vol === 0
            ? icons.off
            : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
        const fillPct = muted ? 0 : video.volume * 100;
        volumeFill.style.width = fillPct + "%";
    }

    function setVolume(v) {
        video.volume = Math.max(0, Math.min(1, v));
        video.muted = video.volume === 0;
        lastVol = video.volume || lastVol;
        updateVolumeIcon();
        saveVideoVolumePref(lastVol);
        applyVideoVolumePref(lastVol);
    }

    function toggleMute() {
        if (video.muted || video.volume === 0) {
            video.muted = false;
            video.volume = lastVol || 0.5;
        } else {
            lastVol = video.volume;
            video.muted = true;
        }
        updateVolumeIcon();
        saveVideoMutedPref(video.muted || video.volume === 0);
    }

    if (volumeBtn) volumeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleMute();
    });

    if (muteBtn) muteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleMute();
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

    /* Fullscreen nativo não é mais usado; extras aparecem no lightbox */
    function isFullscreen() {
        return document.fullscreenElement === wrapper || document.webkitFullscreenElement === wrapper;
    }

    function updateControlsVisibility() {
        const showExtras = isFullscreen() || wrapper.dataset.inLightbox === "1";
        const extraControls = wrapper.querySelectorAll(".vp-volume, .vp-time, .vp-spacer, .vp-speed, .vp-pip");
        extraControls.forEach(el => { el.style.display = showExtras ? "" : "none"; });
        const playBtn = wrapper.querySelector(".vp-play");
        if (playBtn) playBtn.style.display = "";
        const muteBtn = wrapper.querySelector(".vp-mute");
        if (muteBtn) muteBtn.style.display = "";
    }

    document.addEventListener("fullscreenchange", updateControlsVisibility);
    document.addEventListener("webkitfullscreenchange", updateControlsVisibility);
    wrapper._vpUpdateControls = updateControlsVisibility;
    updateControlsVisibility();

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

    function panelOpen() {
        return settingsPanel && !settingsPanel.hidden;
    }

    /* Auto-hide controls */
    function showControls() {
        controls.classList.add("visible");
        wrapper.classList.remove("hide-cursor");
        clearTimeout(hideTimer);
        if (!video.paused && !panelOpen()) {
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
        if (!video.paused && !panelOpen()) {
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
                e.preventDefault();
                if (wrapper.dataset.inLightbox === "1") closeVideoLightbox();
                else openVideoLightbox(wrapper);
                break;
            case "0":
                e.preventDefault(); video.currentTime = 0; break;
        }
        showControls();
    });

    /* Show controls initially */
    controls.classList.add("visible");
    updatePlayIcon();
    updateProgress();
    syncVideoSettingsUI();

    registerAutoPlay(wrapper);
}

function createVideoPlayerHTML(src, highPrio) {
    const fetchPrio = highPrio ? ' fetchpriority="high"' : ' fetchpriority="low"';
    return `
    <div class="video-player">
        <video src="${src}" playsinline preload="metadata"${fetchPrio}></video>
        <div class="vp-loading" style="display:none"><div class="vp-spinner"></div></div>
        <button class="vp-big-play" type="button" aria-label="Reproduzir">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>
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
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>
                </button>
                <div class="vp-volume" style="display:none">
                    <button class="vp-volume-btn vp-btn" type="button" aria-label="Volume">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                    </button>
                    <div class="vp-volume-slider">
                        <div class="vp-volume-fill"></div>
                    </div>
                </div>
                <span class="vp-time" style="display:none">0:00 / 0:00</span>
                <div class="vp-spacer"></div>
                <button class="vp-speed vp-btn" type="button" aria-label="Velocidade" style="display:none">1x</button>
                <button class="vp-pip vp-btn" type="button" aria-label="Picture-in-Picture" style="display:none">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><rect x="12" y="9" width="8" height="6" rx="1" fill="currentColor" opacity="0.3"/></svg>
                </button>
                <button class="vp-mute vp-btn" type="button" aria-label="Mudo">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                </button>
                <button class="vp-settings vp-btn" type="button" aria-label="Preferências">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                </button>
            </div>
        </div>
        <div class="vp-settings-panel" hidden>
            <div class="vp-settings-row">
                <span>Autoplay</span>
                <button class="vp-settings-switch vp-autoplay-btn" type="button" role="switch" aria-checked="true" aria-label="Autoplay de vídeos"><span class="vp-settings-thumb"></span></button>
            </div>
            <div class="vp-settings-row">
                <span>Volume padrão: <span class="vp-settings-vol-val">100%</span></span>
                <input type="range" class="vp-settings-vol" min="0" max="100" step="5" value="100" aria-label="Volume padrão">
            </div>
        </div>
    </div>`;
}
