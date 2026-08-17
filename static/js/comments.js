let currentUserId = null;
let isAdmin = false;
const commentsCache = new Map();

const commentColors = ["#f43f5e", "#6366f1", "#10b981", "#f59e0b", "#8b5cf6", "#0ea5e9", "#ec4899", "#84cc16"];

function userColor(username) {
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = (hash * 31 + username.charCodeAt(i)) >>> 0;
    }
    return commentColors[hash % commentColors.length];
}

async function fetchCurrentUser() {
    try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        if (data.user) {
            currentUserId = data.user.id;
            isAdmin = data.user.is_admin || false;
        }
    } catch { /* ignore */ }
}

function currentImageName() {
    const slides = document.querySelectorAll(".carousel-slide");
    const dots = document.querySelectorAll(".carousel-dot");
    let idx = 0;
    dots.forEach((d, i) => { if (d.classList.contains("active")) idx = i; });
    return slides[idx]?.dataset.image || "";
}

function avatarUrl(avatar) {
    if (!avatar || avatar === "default-avatar.svg") return "/static/svg/default-avatar.svg";
    return `/avatars/${avatar}`;
}

function timeAgo(dateStr) {
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

function esc(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
}

async function loadComments(forceRefresh = false) {
    const imgName = currentImageName();
    const list = document.getElementById("commentsList");
    if (!imgName || !list) return;

    if (!forceRefresh && commentsCache.has(imgName)) {
        renderComments(commentsCache.get(imgName));
        return;
    }

    try {
        const res = await fetch(`/api/comments/${imgName}`);
        const comments = await res.json();
        commentsCache.set(imgName, comments);
        renderComments(comments);
    } catch {
        list.innerHTML = "";
    }
}

function buildTree(comments) {
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

function renderNode(c, depth) {
    const canDelete = isAdmin || currentUserId === c.user_id;
    const cls = ["comment"];
    if (depth > 0) cls.push("comment-reply");
    if (depth === 1) cls.push("comment-depth-1");
    if (depth >= 2) cls.push("comment-depth-2");

    let html = `<div class="${cls.join(" ")}" data-id="${c.id}">`;
    html += `<div class="comment-main">`;
    html += `<div class="comment-avatar"><img src="${avatarUrl(c.avatar)}" alt=""></div>`;
    html += `<div class="comment-body">`;
    html += `<div class="comment-bubble">`;
    html += `<span class="comment-user" style="color:${c.color || userColor(c.username)}">${esc(c.username)}</span>`;
    html += `<span class="comment-text">${esc(c.text)}</span>`;
    html += `</div>`;
    html += `<div class="comment-meta">`;
    html += `<span class="comment-time">${timeAgo(c.created_at)}</span>`;
    if (currentUserId) {
        html += `<button class="comment-reply-btn" data-id="${c.id}" data-user="${esc(c.username)}">Responder</button>`;
    }
    html += `</div></div>`;
    if (canDelete) {
        html += `<button class="comment-delete" data-id="${c.id}"><img src="/static/svg/trash.svg" alt="del"></button>`;
    }
    html += `</div>`;

    if (c.replies && c.replies.length) {
        html += `<div class="comment-children">`;
        html += c.replies.map(r => renderNode(r, depth + 1)).join("");
        html += `</div>`;
    }

    html += `</div>`;
    return html;
}

function renderComments(comments) {
    const list = document.getElementById("commentsList");
    const countEl = document.getElementById("comment-count");
    if (countEl) countEl.textContent = comments.length > 0 ? comments.length : "";

    if (!comments.length) {
        list.innerHTML = `<div class="comment"><div class="comment-main"><div class="comment-body"><span class="comment-text" style="color:var(--text-muted)">Nenhum comentário ainda</span></div></div></div>`;
        return;
    }

    const tree = buildTree(comments);
    list.innerHTML = tree.map(c => renderNode(c, 0)).join("");
}

document.addEventListener("click", async e => {
    const replyBtn = e.target.closest(".comment-reply-btn");
    if (replyBtn) {
        e.stopPropagation();
        document.querySelectorAll(".comment-reply-form").forEach(f => f.remove());
        const commentEl = replyBtn.closest(".comment");
        const commentId = replyBtn.dataset.id;
        const username = replyBtn.dataset.user;

        const form = document.createElement("div");
        form.className = "comment-reply-form";
        form.innerHTML = `
            <div class="comment-reply-form-avatar"><img src="${avatarUrl()}" alt=""></div>
            <input type="text" placeholder="Responder @${username}..." autocomplete="off">
            <button type="button" class="comment-reply-send">Enviar</button>`;
        commentEl.appendChild(form);

        const input = form.querySelector("input");
        input.focus();

        const send = async () => {
            const text = input.value.trim();
            if (!text) { form.remove(); return; }
            const imgName = currentImageName();
            try {
                const res = await fetch(`/api/comments/${imgName}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text, parent_id: parseInt(commentId) })
                });
                if (res.ok) {
                    commentsCache.delete(imgName);
                    await loadComments(true);
                }
            } catch { /* ignore */ }
        };

        form.querySelector(".comment-reply-send").addEventListener("click", send);
        input.addEventListener("keydown", ev => {
            if (ev.key === "Enter") send();
            if (ev.key === "Escape") form.remove();
        });
        return;
    }

    const btn = e.target.closest(".comment-delete");
    if (btn) {
        e.stopPropagation();
        try {
            await fetch(`/api/comments/id/${btn.dataset.id}`, { method: "DELETE" });
            const imgName = currentImageName();
            commentsCache.delete(imgName);
            await loadComments(true);
        } catch { /* ignore */ }
    }
});

document.getElementById("commentForm").addEventListener("submit", async e => {
    e.preventDefault();
    const input = document.getElementById("commentInput");
    const text = input.value.trim();
    if (!text) return;

    const slides = document.querySelectorAll(".carousel-slide");
    const dots = document.querySelectorAll(".carousel-dot");
    let idx = 0;
    dots.forEach((d, i) => { if (d.classList.contains("active")) idx = i; });
    const imgName = slides[idx]?.dataset.image;
    if (!imgName) return;

    try {
        const res = await fetch(`/api/comments/${imgName}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text })
        });
        if (res.ok) {
            input.value = "";
            commentsCache.delete(currentImageName());
            await loadComments(true);
        }
    } catch { /* ignore */ }
});

window.addEventListener("slideChange", () => loadComments());

fetchCurrentUser().then(() => loadComments());
