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

    if (!images.length) {
        grid.innerHTML = `
            <div class="admin-empty">
                <img src="/static/svg/image-placeholder.svg" alt="" class="img-placeholder">
                <p>Nenhuma imagem ainda.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = images.map(img => `
        <div class="admin-card" data-name="${esc(img.name)}">
            <img src="/images/${img.name}" alt="${img.name}" loading="lazy">
            <input type="checkbox" class="admin-select">
            <div class="admin-card-info">
                <span>${esc(img.owner || "—")}</span>
                <span>❤ ${img.likes || 0}</span>
            </div>
            <div class="admin-likers" style="display:none">
                ${img.likers && img.likers.length
                    ? img.likers.map(u => `<span class="admin-liker-tag" data-user-id="${u.id}" data-image="${esc(img.name)}"><span class="admin-liker-name">@${esc(u.username)}</span><img src="/static/svg/trash.svg" alt="del" class="admin-liker-icon"></span>`).join("")
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
            selectBtn.addEventListener("change", e => {
                e.stopPropagation();
                const name = card.dataset.name;
                if (e.target.checked) {
                    selected.add(name);
                    card.classList.add("selected");
                } else {
                    selected.delete(name);
                    card.classList.remove("selected");
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
    const names = [...cards].map(c => c.dataset.name);
    const allSelected = names.length > 0 && names.every(n => selected.has(n));
    cards.forEach(c => {
        const cb = c.querySelector(".admin-select");
        if (allSelected) {
            selected.delete(c.dataset.name);
            c.classList.remove("selected");
            if (cb) cb.checked = false;
        } else {
            selected.add(c.dataset.name);
            c.classList.add("selected");
            if (cb) cb.checked = true;
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

document.getElementById("adminExportCollage").addEventListener("click", async () => {
    const res = await api("POST", "/api/admin/collage", { images: [...selected] });
    if (!res.ok) {
        const data = await res.json().catch(() => null);
        showStatus(data?.error || "Erro ao exportar");
        return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "collage.png";
    a.click();
    URL.revokeObjectURL(url);
    showStatus("Collage exportada");
});

/* === Users tab === */
let allUsers = [];

function getUserAvatar(avatar) {
    if (!avatar || avatar === "default-avatar.svg") return "/static/svg/default-avatar.svg";
    return `/avatars/${avatar}`;
}

function formatDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr + "Z");
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function renderUsers(filter = "") {
    const list = document.getElementById("usersList");
    const count = document.getElementById("usersCount");
    const filtered = filter
        ? allUsers.filter(u => u.username.toLowerCase().includes(filter.toLowerCase()))
        : allUsers;

    count.textContent = `${filtered.length} de ${allUsers.length}`;

    if (!filtered.length) {
        list.innerHTML = `<div class="users-empty">${filter ? "Nenhum usuário encontrado" : "Nenhum usuário ainda."}</div>`;
        return;
    }

    list.innerHTML = filtered.map(u => `
        <div class="user-card" data-user-id="${u.id}">
            <div class="user-card-row">
                <div class="user-card-avatar">
                    <img src="${getUserAvatar(u.avatar)}" alt="${esc(u.username)}">
                </div>
                <div class="user-card-info">
                    <div class="user-card-name" style="color:${u.color || 'var(--text)'}">${esc(u.username)}</div>
                    <div class="user-card-meta">
                        <span class="user-card-badge ${u.is_admin ? 'badge-admin' : 'badge-user'}">${u.is_admin ? 'Admin' : 'User'}</span>
                        <span>${formatDate(u.created_at)}</span>
                    </div>
                </div>
            </div>
            <div class="user-card-actions">
                ${!u.is_admin ? `<button class="admin-btn purple small" data-promote="${u.id}">Promover</button>` : ""}
                <button class="admin-btn small" data-rename="${u.id}" data-name="${esc(u.username)}">Renomear</button>
                <button class="admin-btn danger small" data-delete="${u.id}">Excluir</button>
            </div>
        </div>
    `).join("");

    list.querySelectorAll("[data-promote]").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (!await askConfirm("Tornar este usuário admin?")) return;
            await api("PUT", `/api/admin/users/${btn.dataset.promote}/promote`);
            showStatus("Usuário promovido a admin");
            loadUsers();
        });
    });

    list.querySelectorAll("[data-rename]").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const card = btn.closest(".user-card");
            const nameEl = card.querySelector(".user-card-name");
            const infoEl = card.querySelector(".user-card-info");
            const currentName = btn.dataset.name;

            const input = document.createElement("input");
            input.type = "text";
            input.className = "user-card-rename-input";
            input.value = currentName;
            input.minLength = 3;

            nameEl.replaceWith(input);
            input.focus();
            input.select();

            const restore = () => {
                const el = card.querySelector(".user-card-rename-input");
                if (el) el.replaceWith(nameEl);
            };

            const save = async () => {
                const newName = input.value.trim();
                if (newName.length < 3) { showStatus("Mínimo 3 caracteres"); restore(); return; }
                if (newName === currentName) { restore(); return; }
                const res = await api("PUT", `/api/admin/users/${btn.dataset.rename}/rename`, { username: newName });
                const data = await res.json().catch(() => null);
                if (res.ok) {
                    showStatus("Usuário renomeado");
                    loadUsers();
                } else {
                    showStatus(data?.error || "Erro ao renomear");
                    restore();
                }
            };

            input.addEventListener("keydown", e => {
                if (e.key === "Enter") { e.preventDefault(); save(); }
                if (e.key === "Escape") restore();
            });
            input.addEventListener("blur", save);
        });
    });

    list.querySelectorAll("[data-delete]").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (!await askConfirm("Excluir este usuário?")) return;
            await api("DELETE", `/api/admin/users/${btn.dataset.delete}`);
            showStatus("Usuário excluído");
            loadUsers();
        });
    });
}

async function loadUsers() {
    const list = document.getElementById("usersList");
    list.innerHTML = `<div class="users-empty">Carregando...</div>`;
    const res = await fetch("/api/admin/users");
    allUsers = await res.json();
    const search = document.getElementById("usersSearch");
    renderUsers(search.value);
}

document.getElementById("usersSearch").addEventListener("input", e => {
    renderUsers(e.target.value);
});

/* === Turnos tab === */
async function loadTurnos() {
    const res = await fetch("/api/admin/turnos");
    const data = await res.json();
    const grid = document.getElementById("turnoGrid");

    document.getElementById("turnoNumber").textContent = data.current_round;
    document.getElementById("turnoActiveCount").textContent = data.active_count;

    const modeRes = await fetch("/api/admin/turnos/mode");
    const mode = await modeRes.json();
    document.getElementById("turnoSingleVote").checked = mode.single_vote_mode;

    grid.innerHTML = data.images.map(img => `
        <div class="admin-card">
            <img src="/images/${img.name}" alt="${img.name}" loading="lazy">
            <div class="admin-card-info">
                <span>${esc(img.owner || "—")}</span>
                <span>❤ ${img.likes || 0}</span>
            </div>
        </div>
    `).join("");

    const history = document.getElementById("turnosHistory");
    history.innerHTML = data.history.length
        ? `<p>Histórico:</p>` + data.history.map(h =>
            `<span class="turnos-history-item">Turno ${h.round_number}: top ${h.cutoff}</span>`
          ).join("")
        : "";
}

document.getElementById("turnoAdvance").addEventListener("click", async () => {
    const cutoff = parseInt(document.getElementById("turnoCutoff").value, 10);
    if (!cutoff || cutoff < 1) {
        showStatus("Informe um número válido");
        return;
    }
    if (!await askConfirm(`Avançar turno mantendo as ${cutoff} mais curtidas?`)) return;
    const res = await api("POST", "/api/admin/turnos/advance", { cutoff });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        showStatus(data?.error || "Erro ao avançar turno");
        return;
    }
    showStatus(`Turno ${data.round} avançado: ${data.passed.length} passaram, ${data.removed.length} removidas`);
    loadTurnos();
});

document.getElementById("turnoSingleVote").addEventListener("change", async e => {
    const res = await api("POST", "/api/admin/turnos/mode", { enabled: e.target.checked });
    const data = await res.json().catch(() => null);
    showStatus(data?.single_vote_mode ? "Modo voto único ativado" : "Modo voto único desativado");
});

document.getElementById("turnoReset").addEventListener("click", async () => {
    if (!await askConfirm("Resetar turnos? Limpa apenas o histórico.")) return;
    await api("POST", "/api/admin/turnos/reset");
    showStatus("Turnos resetados");
    loadTurnos();
});

/* === Tab switching === */
document.querySelectorAll(".admin-tab").forEach(tab => {
    tab.addEventListener("click", () => {
        document.querySelectorAll(".admin-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        const tabName = tab.dataset.tab;
        document.getElementById("tabImages").style.display = tabName === "images" ? "" : "none";
        document.getElementById("tabUsers").style.display = tabName === "users" ? "" : "none";
        document.getElementById("tabTurnos").style.display = tabName === "turnos" ? "" : "none";
        document.getElementById("actionsImages").style.display = tabName === "images" ? "" : "none";
        document.getElementById("actionsUsers").style.display = "none";
        document.getElementById("actionsTurnos").style.display = "none";
        if (tabName === "users") loadUsers();
        if (tabName === "turnos") loadTurnos();
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
