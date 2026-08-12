async function loadRanking() {
    const res = await fetch("/api/votos");
    const items = await res.json();
    const list = document.getElementById("votosList");

    if (!items.length) {
        list.innerHTML = `<p style="text-align:center;color:#71717a;padding:3rem 1rem;">Nenhuma imagem ainda. Faça upload!</p>`;
        return;
    }

    const rankClass = ["rank-gold", "rank-silver", "rank-bronze"];
    const rankLabel = ["🥇", "🥈", "🥉"];

    list.innerHTML = items.map((item, i) => {
        const rc = i < 3 ? rankClass[i] : "rank-normal";
        const rl = i < 3 ? rankLabel[i] : i + 1;
        return `
            <div class="votos-card">
                <div class="votos-card-main">
                    <div class="votos-rank ${rc}">${rl}</div>
                    <div class="votos-card-img">
                        <img src="/images/${esc(item.name)}" alt="" loading="lazy">
                    </div>
                    <div class="votos-card-owner">@${esc(item.owner || "—")}</div>
                    <div class="votos-card-likes">❤ ${item.likes}</div>
                </div>
                <div class="votos-likers">
                    <div class="votos-likers-title">Curtido por:</div>
                    <div class="votos-likers-list">
                        ${item.likers.length
                            ? item.likers.map(u => `<span class="votos-liker-tag">@${esc(u.username)}</span>`).join("")
                            : `<span class="votos-liker-tag" style="color:#a1a1aa">Ninguém ainda</span>`}
                    </div>
                </div>
            </div>
        `;
    }).join("");

    document.querySelectorAll(".votos-card-main").forEach(main => {
        main.addEventListener("click", () => {
            main.parentElement.classList.toggle("expanded");
        });
    });
}

function esc(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
}

loadRanking();
