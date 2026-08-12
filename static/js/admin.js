let selected = new Set();
const status = document.getElementById("adminStatus");

function showStatus(msg) {
    status.textContent = msg;
    setTimeout(() => { status.textContent = ""; }, 3000);
}

function askConfirm(msg) {
    return new Promise(resolve => {
        document.getElementById("confirmMsg").textContent = msg;
        const modal = document.getElementById("confirmModal");
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

/* === Images tab === */
async function loadImages() {
    const res = await fetch("/api/votos");
    const images = await res.json();
    const grid = document.getElementById("adminGrid");

    grid.innerHTML = images.map(img => `
        <div class="admin-card" data-name="${esc(img.name)}">
            <img src="/images/${img.name}" alt="${img.name}" loading="lazy">
            <button class="admin-select"></button>
            <div class="admin-card-info">
                <span>${esc(img.owner || "—")}</span>
                <span>❤ ${img.likes || 0}</span>
            </div>
            <div class="admin-likers" style="display:none">
                ${img.likers && img.likers.length
                    ? img.likers.map(u => `<span class="admin-liker-tag" data-user-id="${u.id}" data-image="${esc(img.name)}">@${esc(u.username)} <img src="/static/img/trash.svg" alt="del" class="admin-liker-icon"></span>`).join("")
                    : `<span style="font-size:0.6875rem;color:#9ca3af">Nenhum like</span>`}
            </div>
        </div>
    `).join("");

    document.querySelectorAll(".admin-card").forEach(card => {
        card.addEventListener("click", e => {
            if (e.target.closest(".admin-liker-tag") || e.target.closest(".admin-select")) return;
            const likers = card.querySelector(".admin-likers");
            if (likers) likers.style.display = likers.style.display === "none" ? "flex" : "none";
        });

        const selectBtn = card.querySelector(".admin-select");
        if (selectBtn) {
            selectBtn.addEventListener("click", e => {
                e.stopPropagation();
                const name = card.dataset.name;
                if (selected.has(name)) {
                    selected.delete(name);
                    card.classList.remove("selected");
                } else {
                    selected.add(name);
                    card.classList.add("selected");
                }
            });
        }
    });

    document.querySelectorAll(".admin-liker-tag").forEach(tag => {
        tag.addEventListener("click", async e => {
            e.stopPropagation();
            if (!await askConfirm("Remover este like?")) return;
            await api("DELETE", `/api/admin/likes/${encodeURIComponent(tag.dataset.image)}/${tag.dataset.userId}`);
            showStatus("Like removido");
            loadImages();
        });
    });
}

document.getElementById("adminSelectAll").addEventListener("click", () => {
    const cards = document.querySelectorAll(".admin-card");
    const allSelected = selected.size === cards.length;
    cards.forEach(c => {
        if (allSelected) {
            selected.delete(c.dataset.name);
            c.classList.remove("selected");
        } else {
            selected.add(c.dataset.name);
            c.classList.add("selected");
        }
    });
    document.getElementById("adminSelectAll").textContent = allSelected ? "Selecionar todas" : "Limpar seleção";
});

document.getElementById("adminDeleteSelected").addEventListener("click", async () => {
    if (!selected.size) return;
    if (!await askConfirm(`Excluir ${selected.size} imagem(ns)?`)) return;
    const res = await api("DELETE", "/api/admin/images", { images: [...selected] });
    if (res.ok) {
        showStatus(`${selected.size} excluída(s)`);
        selected.clear();
        loadImages();
    }
});

document.getElementById("adminRemoveLikes").addEventListener("click", async () => {
    if (!selected.size) return;
    if (!await askConfirm(`Remover likes de ${selected.size} imagem(ns)?`)) return;
    const res = await api("DELETE", "/api/admin/likes", { images: [...selected] });
    if (res.ok) showStatus("Likes removidos");
    loadImages();
});

/* === Users tab === */
async function loadUsers() {
    const res = await fetch("/api/admin/users");
    const users = await res.json();
    const table = document.getElementById("usersTable");

    table.innerHTML = `
        <tr><th>Usuário</th><th>Tipo</th><th>Ações</th></tr>
        ${users.map(u => `
            <tr>
                <td>${esc(u.username)}</td>
                <td><span class="user-badge ${u.is_admin ? 'badge-admin' : 'badge-user'}">${u.is_admin ? 'Admin' : 'User'}</span></td>
                <td>
                    ${!u.is_admin ? `<button class="admin-btn purple small" data-promote="${u.id}">Tornar admin</button>` : ""}
                    <button class="admin-btn danger small" data-delete="${u.id}">Excluir</button>
                </td>
            </tr>
        `).join("")}
    `;

    table.querySelectorAll("[data-promote]").forEach(btn => {
        btn.addEventListener("click", async () => {
            await api("PUT", `/api/admin/users/${btn.dataset.promote}/promote`);
            showStatus("Usuário promovido a admin");
            loadUsers();
        });
    });

    table.querySelectorAll("[data-delete]").forEach(btn => {
        btn.addEventListener("click", async () => {
            if (!await askConfirm("Excluir este usuário?")) return;
            await api("DELETE", `/api/admin/users/${btn.dataset.delete}`);
            showStatus("Usuário excluído");
            loadUsers();
        });
    });
}

/* === Tab switching === */
document.querySelectorAll(".admin-tab").forEach(tab => {
    tab.addEventListener("click", () => {
        document.querySelectorAll(".admin-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        const isImages = tab.dataset.tab === "images";
        document.getElementById("tabImages").style.display = isImages ? "" : "none";
        document.getElementById("tabUsers").style.display = isImages ? "none" : "";
        document.getElementById("actionsImages").style.display = isImages ? "" : "none";
        document.getElementById("actionsUsers").style.display = isImages ? "none" : "";
        if (!isImages) loadUsers();
    });
});

/* === Helpers === */
async function api(method, url, body) {
    return fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined
    });
}

function esc(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
}

loadImages();
