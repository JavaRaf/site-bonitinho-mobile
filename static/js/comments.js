let currentUserId = null;
let isAdmin = false;
let currentAvatar = "";
const commentsCache = new Map();

const avatarColors = {
    "red.svg": "#f43f5e",
    "indigo.svg": "#6366f1",
    "green.svg": "#10b981",
    "amber.svg": "#f59e0b",
    "purple.svg": "#8b5cf6"
};

async function fetchCurrentUser() {
    try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        if (data.user) {
            currentUserId = data.user.id;
            isAdmin = data.user.is_admin || false;
            currentAvatar = data.user.avatar || "";
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

function renderComments(comments) {
    const list = document.getElementById("commentsList");
    const countEl = document.getElementById("comment-count");
    if (countEl) countEl.textContent = comments.length > 0 ? comments.length : "";
    list.innerHTML = comments.length
        ? comments.map(c => {
            const canDelete = isAdmin || currentUserId === c.user_id;
            const isSelf = currentUserId === c.user_id;
            const selfColor = avatarColors[currentAvatar] || "#4f46e5";
            return `
                <div class="comment" data-id="${c.id}">
                    <span class="comment-user${isSelf ? " is-self" : ""}"${isSelf ? ` style="color:${selfColor}"` : ""}>${escapeHtml(c.username)}</span>
                    <span class="comment-text">${escapeHtml(c.text)}</span>
                    ${canDelete ? `<button class="comment-delete" data-id="${c.id}"><img src="/static/img/trash.svg" alt="del"></button>` : ""}
                </div>`;
        }).join("")
        : `<div class="comment"><span class="comment-text" style="color:#a1a1aa">Nenhum comentário ainda</span></div>`;
}

document.addEventListener("click", async e => {
    const btn = e.target.closest(".comment-delete");
    if (!btn) return;
    e.stopPropagation();
    try {
        await fetch(`/api/comments/id/${btn.dataset.id}`, { method: "DELETE" });
        const imgName = currentImageName();
        commentsCache.delete(imgName);
        await loadComments(true);
    } catch { /* ignore */ }
});

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

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
            const imgName = currentImageName();
            commentsCache.delete(imgName);
            await loadComments(true);
        }
    } catch { /* ignore */ }
});

window.addEventListener("slideChange", () => loadComments());

fetchCurrentUser().then(() => loadComments());
