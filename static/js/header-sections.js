const headerSections = document.querySelectorAll(".header-section");
const paraVoceSortBtn = document.getElementById("paraVoceSortBtn");
const paraVoceSortMenu = document.getElementById("paraVoceSortMenu");
const seguindoSortBtn = document.getElementById("seguindoSortBtn");
const seguindoSortMenu = document.getElementById("seguindoSortMenu");
const eleicaoSortBtn = document.getElementById("eleicaoSortBtn");
const eleicaoSortMenu = document.getElementById("eleicaoSortMenu");

function currentSubMode() {
    return sortMode === "likes" || sortMode.endsWith("_likes") ? "likes" : "recent";
}

headerSections.forEach((section) => {
    section.addEventListener("click", () => {
        headerSections.forEach((s) => s.classList.remove("active"));
        section.classList.add("active");
        if (typeof setSortMode !== "function") return;
        const sub = currentSubMode() === "likes" ? "likes" : "recent";
        if (section.id === "headerSection1") {
            const leave = sortMode.startsWith("following_") || sortMode.startsWith("eleicao");
            setSortMode(leave ? sub : sortMode);
        } else if (section.id === "headerSection2") {
            setSortMode("following_" + sub);
        } else if (section.id === "headerSection3") {
            setSortMode("eleicao_" + sub);
        }
    });
});

paraVoceSortBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = paraVoceSortMenu.hidden;
    document.getElementById("headerSection1").click();
    paraVoceSortMenu.hidden = !willOpen;
    seguindoSortMenu.hidden = true;
    eleicaoSortMenu.hidden = true;
});

paraVoceSortMenu.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        setSortMode(btn.dataset.sort === "popular" ? "likes" : "recent");
        paraVoceSortMenu.hidden = true;
    });
});

seguindoSortBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = seguindoSortMenu.hidden;
    document.getElementById("headerSection2").click();
    seguindoSortMenu.hidden = !willOpen;
    paraVoceSortMenu.hidden = true;
    eleicaoSortMenu.hidden = true;
});

seguindoSortMenu.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        setSortMode(btn.dataset.sort === "popular" ? "following_likes" : "following_recent");
        seguindoSortMenu.hidden = true;
    });
});

eleicaoSortBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = eleicaoSortMenu.hidden;
    document.getElementById("headerSection3").click();
    eleicaoSortMenu.hidden = !willOpen;
    paraVoceSortMenu.hidden = true;
    seguindoSortMenu.hidden = true;
});

eleicaoSortMenu.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        setSortMode(btn.dataset.sort === "popular" ? "eleicao_likes" : "eleicao_recent");
        eleicaoSortMenu.hidden = true;
    });
});

document.addEventListener("click", () => {
    paraVoceSortMenu.hidden = true;
    seguindoSortMenu.hidden = true;
    eleicaoSortMenu.hidden = true;
});
