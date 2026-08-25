const headerSections = document.querySelectorAll(".header-section");
const paraVoceSortBtn = document.getElementById("paraVoceSortBtn");
const paraVoceSortMenu = document.getElementById("paraVoceSortMenu");
const seguindoSortBtn = document.getElementById("seguindoSortBtn");
const seguindoSortMenu = document.getElementById("seguindoSortMenu");
const eleicaoSortBtn = document.getElementById("eleicaoSortBtn");
const eleicaoSortMenu = document.getElementById("eleicaoSortMenu");

const TAB_SORT_KEY = "tabSorts";
const TAB_DEFAULTS = {
    headerSection1: "recent",
    headerSection2: "following_recent",
    headerSection3: "eleicao_recent",
};

function loadTabSorts() {
    try {
        const raw = localStorage.getItem(TAB_SORT_KEY);
        if (raw) return { ...TAB_DEFAULTS, ...JSON.parse(raw) };
    } catch {}
    return { ...TAB_DEFAULTS };
}

function saveTabSort(tabId, mode) {
    const sorts = loadTabSorts();
    sorts[tabId] = mode;
    localStorage.setItem(TAB_SORT_KEY, JSON.stringify(sorts));
}

function getTabSort(tabId) {
    return loadTabSorts()[tabId] || TAB_DEFAULTS[tabId];
}

// envolve setSortMode para persistir por aba
(function wrapSetSort(){
    if (typeof window.setSortMode === "function" && !window.setSortMode._wrapped) {
        const orig = window.setSortMode;
        window.setSortMode = function(mode){
            orig(mode);
            const active = document.querySelector(".header-section.active");
            if (active) saveTabSort(active.id, mode);
        };
        window.setSortMode._wrapped = true;
        // também expõe como global para carousel
        if (typeof setSortMode !== "undefined") setSortMode = window.setSortMode;
    }
})();

// inicializa sortMode com o da aba ativa
(function initTabSort(){
    const active = document.querySelector(".header-section.active");
    if (active && typeof sortMode !== "undefined") {
        const saved = getTabSort(active.id);
        if (saved && typeof window.setSortMode === "function") {
            setTimeout(()=> window.setSortMode(saved), 0);
        }
    }
})();

headerSections.forEach((section) => {
    section.addEventListener("click", () => {
        headerSections.forEach((s) => s.classList.remove("active"));
        section.classList.add("active");
        if (typeof setSortMode !== "function") return;
        const tabSort = getTabSort(section.id);
        setSortMode(tabSort);
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
