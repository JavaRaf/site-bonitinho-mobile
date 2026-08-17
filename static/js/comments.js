let currentUserId = null;
let isAdmin = false;
const commentsCache = new Map();
let myCommentLikes = new Set();

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

async function fetchMyCommentLikes() {
    try {
        const res = await fetch("/api/comment-likes");
        const data = await res.json();
        myCommentLikes = new Set(data.likes || []);
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

function parseMentions(text) {
    return esc(text).replace(/@(\w+)/g, '<span class="comment-mention">@$1</span>');
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

    const liked = myCommentLikes.has(c.id);
    const likes = c.likes || 0;

    let html = `<div class="${cls.join(" ")}" data-id="${c.id}">`;
    html += `<div class="comment-main">`;
    html += `<div class="comment-avatar"><img src="${avatarUrl(c.avatar)}" alt=""></div>`;
    html += `<div class="comment-body">`;
    html += `<div class="comment-bubble">`;
    html += `<span class="comment-user" style="color:${c.color || userColor(c.username)}">${esc(c.username)}</span>`;
    html += `<span class="comment-text">${parseMentions(c.text)}</span>`;
    html += `</div>`;
    html += `<div class="comment-meta">`;
    html += `<span class="comment-time">${timeAgo(c.created_at)}</span>`;
    if (currentUserId) {
        html += `<button class="comment-like-btn${liked ? " liked" : ""}" data-id="${c.id}"><svg width="12" height="12" viewBox="0 0 20 20" fill="${liked ? "#f43f5e" : "none"}" stroke="${liked ? "#f43f5e" : "currentColor"}" stroke-width="2"><path d="M10 19a3.966 3.966 0 01-3.96-3.962V10.98H2.838a1.731 1.731 0 01-1.605-1.073 1.734 1.734 0 01.377-1.895L9.364.254a.925.925 0 011.272 0l7.754 7.759c.498.499.646 1.242.376 1.894-.27.652-.9 1.073-1.605 1.073h-3.202v4.058A3.965 3.965 0 019.999 19H10z"/></svg> ${likes > 0 ? likes : ""}</button>`;
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

/* === Comment Like === */
document.addEventListener("click", async e => {
    const likeBtn = e.target.closest(".comment-like-btn");
    if (likeBtn) {
        e.stopPropagation();
        const id = parseInt(likeBtn.dataset.id);
        const wasLiked = myCommentLikes.has(id);
        const delta = wasLiked ? -1 : 1;
        if (wasLiked) myCommentLikes.delete(id);
        else myCommentLikes.add(id);

        const svg = likeBtn.querySelector("svg");
        const num = likeBtn.childNodes[likeBtn.childNodes.length - 1];
        const count = (parseInt(num.textContent) || 0) + delta;
        svg.setAttribute("fill", !wasLiked ? "#f43f5e" : "none");
        svg.setAttribute("stroke", !wasLiked ? "#f43f5e" : "currentColor");
        num.textContent = count > 0 ? " " + count : "";
        likeBtn.classList.toggle("liked", !wasLiked);

        try {
            const res = await fetch(`/api/comment-likes/${id}`, { method: wasLiked ? "DELETE" : "POST" });
            if (!res.ok) throw new Error();
        } catch {
            if (wasLiked) myCommentLikes.add(id);
            else myCommentLikes.delete(id);
            svg.setAttribute("fill", wasLiked ? "#f43f5e" : "none");
            svg.setAttribute("stroke", wasLiked ? "#f43f5e" : "currentColor");
            const newCount = (parseInt(num.textContent) || 0) - delta;
            num.textContent = newCount > 0 ? " " + newCount : "";
            likeBtn.classList.toggle("liked", wasLiked);
        }
        return;
    }

/* === Autocomplete @mentions === */
let mentionDropdown = null;
let mentionInput = null;
let mentionStart = -1;
let mentionQuery = "";
let mentionUsers = [];
let mentionIndex = 0;

function createMentionDropdown() {
    if (mentionDropdown) mentionDropdown.remove();
    mentionDropdown = document.createElement("div");
    mentionDropdown.className = "mention-dropdown";
    document.body.appendChild(mentionDropdown);
}

function hideMentionDropdown() {
    if (mentionDropdown) { mentionDropdown.remove(); mentionDropdown = null; }
    mentionUsers = [];
    mentionIndex = 0;
    mentionStart = -1;
}

async function searchUsers(query) {
    try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
        return await res.json();
    } catch { return []; }
}

function renderMentionDropdown() {
    if (!mentionDropdown || !mentionUsers.length) { hideMentionDropdown(); return; }

    const filtered = mentionUsers.filter(u => u.username.toLowerCase().includes(mentionQuery.toLowerCase()));
    if (!filtered.length) { hideMentionDropdown(); return; }

    mentionDropdown.innerHTML = filtered.map((u, i) => `
        <div class="mention-option${i === mentionIndex ? " active" : ""}" data-username="${esc(u.username)}">
            <img class="mention-option-avatar" src="${avatarUrl(u.avatar)}" alt="">
            <span class="mention-option-name">${esc(u.username)}</span>
        </div>
    `).join("");

    const rect = mentionInput.getBoundingClientRect();
    const ddHeight = Math.min(filtered.length * 40, 200);
    const spaceAbove = rect.top;
    const showAbove = spaceAbove >= ddHeight + 8;

    mentionDropdown.style.left = rect.left + "px";
    mentionDropdown.style.width = Math.min(220, rect.width) + "px";

    if (showAbove) {
        mentionDropdown.style.top = "";
        mentionDropdown.style.bottom = (window.innerHeight - rect.top + 4) + "px";
    } else {
        mentionDropdown.style.bottom = "";
        mentionDropdown.style.top = (rect.bottom + 4) + "px";
    }

    mentionDropdown.querySelectorAll(".mention-option").forEach(opt => {
        opt.addEventListener("mousedown", e => {
            e.preventDefault();
            insertMention(opt.dataset.username);
        });
    });
}

function insertMention(username) {
    const val = mentionInput.value;
    const before = val.slice(0, mentionStart);
    const after = val.slice(mentionInput.selectionStart);
    mentionInput.value = before + "@" + username + " " + after;
    mentionInput.focus();
    const pos = before.length + username.length + 2;
    mentionInput.setSelectionRange(pos, pos);
    hideMentionDropdown();
}

function handleMentionInput(e) {
    mentionInput = e.target;
    const input = e.target;
    const val = input.value;
    const cursor = input.selectionStart;
    const textBefore = val.slice(0, cursor);
    const atMatch = textBefore.match(/@(\w*)$/);

    if (atMatch) {
        mentionStart = atMatch.index;
        mentionQuery = atMatch[1];
        if (!mentionDropdown) createMentionDropdown();
        searchUsers(mentionQuery).then(users => {
            mentionUsers = users;
            mentionIndex = 0;
            renderMentionDropdown();
        });
    } else {
        hideMentionDropdown();
    }
}

function handleMentionKeydown(e) {
    if (!mentionDropdown || !mentionUsers.length) return;
    const filtered = mentionUsers.filter(u => u.username.toLowerCase().includes(mentionQuery.toLowerCase()));
    if (!filtered.length) return;

    if (e.key === "ArrowDown") {
        e.preventDefault();
        mentionIndex = (mentionIndex + 1) % filtered.length;
        renderMentionDropdown();
    } else if (e.key === "ArrowUp") {
        e.preventDefault();
        mentionIndex = (mentionIndex - 1 + filtered.length) % filtered.length;
        renderMentionDropdown();
    } else if (e.key === "Enter" && mentionStart >= 0) {
        e.preventDefault();
        insertMention(filtered[mentionIndex].username);
    } else if (e.key === "Escape") {
        hideMentionDropdown();
    }
}

/* === Reply === */
    const replyBtn = e.target.closest(".comment-reply-btn");
    if (replyBtn) {
        e.stopPropagation();
        document.querySelectorAll(".comment-reply-form").forEach(f => f.remove());
        hideMentionDropdown();
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
        mentionInput = input;
        input.addEventListener("input", handleMentionInput);
        input.addEventListener("keydown", handleMentionKeydown);
        input.focus();

        const send = async () => {
            const text = input.value.trim();
            if (!text) { form.remove(); hideMentionDropdown(); return; }
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
            hideMentionDropdown();
        };

        form.querySelector(".comment-reply-send").addEventListener("click", send);
        input.addEventListener("keydown", ev => {
            if (ev.key === "Enter" && mentionStart < 0) send();
            if (ev.key === "Escape") { form.remove(); hideMentionDropdown(); }
        });
        return;
    }

/* === Delete === */
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

/* === Main form === */
document.getElementById("commentForm").addEventListener("submit", async e => {
    e.preventDefault();
    if (mentionDropdown && mentionUsers.length) return;
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
    hideMentionDropdown();
});

const mainCommentInput = document.getElementById("commentInput");
if (mainCommentInput) {
    mentionInput = mainCommentInput;
    mainCommentInput.addEventListener("input", handleMentionInput);
    mainCommentInput.addEventListener("keydown", handleMentionKeydown);
}

document.addEventListener("mousedown", e => {
    if (mentionDropdown && !mentionDropdown.contains(e.target) && e.target !== mentionInput) {
        hideMentionDropdown();
    }
});

window.addEventListener("scroll", () => {
    if (mentionDropdown && mentionInput) renderMentionDropdown();
}, true);

window.addEventListener("slideChange", () => { loadComments(); hideMentionDropdown(); });

fetchCurrentUser().then(() => fetchMyCommentLikes().then(() => loadComments()));
