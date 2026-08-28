(function () {
    const overlay = document.getElementById("searchOverlay");
    const searchBtn = document.getElementById("searchBtn");
    const input = document.getElementById("searchInput");
    const resultsEl = document.getElementById("searchResults");
    const closeBtn = document.getElementById("searchClose");
    if (!overlay || !searchBtn || !input || !resultsEl || !closeBtn) return;

    function esc(s) {
        const d = document.createElement("div");
        d.textContent = s == null ? "" : String(s);
        return d.innerHTML;
    }

    function avatarSrc(av) {
        return !av || av === "default-avatar.svg"
            ? "/static/svg/default-avatar.svg"
            : "/avatars/" + encodeURIComponent(av);
    }

    function openSearch() {
        overlay.hidden = false;
        document.body.style.overflow = "hidden";
        resultsEl.innerHTML = '<p class="search-hint">Digite para buscar pessoas e posts</p>';
        setTimeout(() => input.focus(), 50);
    }

    function closeSearch() {
        overlay.hidden = true;
        document.body.style.overflow = "";
        input.value = "";
        resultsEl.innerHTML = '<p class="search-hint">Digite para buscar pessoas e posts</p>';
    }

    searchBtn.addEventListener("click", openSearch);
    closeBtn.addEventListener("click", closeSearch);
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) closeSearch();
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !overlay.hidden) closeSearch();
    });

    let debounce = null;
    let seq = 0;
    let controller = null;

    input.addEventListener("input", () => {
        clearTimeout(debounce);
        const q = input.value.trim();
        if (q.length < 2) {
            resultsEl.innerHTML = q
                ? '<p class="search-hint">Digite pelo menos 2 caracteres</p>'
                : '<p class="search-hint">Digite para buscar pessoas e posts</p>';
            return;
        }
        debounce = setTimeout(() => runSearch(q, ++seq), 250);
    });

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            clearTimeout(debounce);
            runSearch(input.value.trim(), ++seq);
        }
    });

    async function runSearch(q, token) {
        if (controller) controller.abort();
        controller = new AbortController();
        try {
            const [usersRes, postsRes] = await Promise.all([
                fetch("/api/users/search?q=" + encodeURIComponent(q), { signal: controller.signal }),
                fetch("/api/posts/search?q=" + encodeURIComponent(q), { signal: controller.signal }),
            ]);
            const [users, posts] = await Promise.all([usersRes.json(), postsRes.json()]);
            if (token !== seq) return;
            render(users || [], posts || []);
        } catch (err) {
            if (err && err.name === "AbortError") return;
        }
    }

    function render(users, posts) {
        if (!users.length && !posts.length) {
            resultsEl.innerHTML = '<p class="search-empty">Nenhum resultado para esta busca</p>';
            return;
        }
        let html = "";
        if (users.length) {
            html += '<div class="search-group-title">Pessoas</div>';
            html += users.map(u => `
                <div class="search-user" data-username="${esc(u.username)}" role="button" tabindex="0">
                    <img class="search-avatar" src="${avatarSrc(u.avatar)}" alt="">
                    <div>
                        <div class="search-user-name">${esc(u.display_name || u.username)}</div>
                        <div class="search-user-handle">@${esc(u.username)}</div>
                    </div>
                </div>`).join("");
        }
        if (posts.length) {
            html += '<div class="search-group-title">Posts</div>';
            html += posts.map(p => {
                const isVideo = p.media_type === "video" || /\.(mp4|webm|mov)$/i.test(p.name || "");
                const thumb = isVideo
                    ? `<video class="search-post-thumb" src="/images/${encodeURIComponent(p.name)}" muted playsinline preload="metadata"></video>`
                    : `<img class="search-post-thumb" src="/images/${encodeURIComponent(p.name)}" alt="" loading="lazy">`;
                return `
                <div class="search-post" data-name="${esc(p.name)}" role="button" tabindex="0">
                    ${thumb}
                    <div class="search-post-info">
                        <div class="search-post-caption">${esc(p.caption || "Post de @" + (p.owner || ""))}</div>
                        <div class="search-post-owner">@${esc(p.owner || "anônimo")}</div>
                    </div>
                </div>`;
            }).join("");
        }
        resultsEl.innerHTML = html;
        resultsEl.querySelectorAll(".search-user").forEach(el => {
            el.addEventListener("click", () => {
                const u = el.dataset.username;
                if (u) goToProfile(u);
            });
        });
        resultsEl.querySelectorAll(".search-post").forEach(el => {
            el.addEventListener("click", () => {
                const n = el.dataset.name;
                if (n) location.href = "/?img=" + encodeURIComponent(n);
            });
        });
    }
})();