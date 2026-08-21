const headerSections = document.querySelectorAll(".header-section");
const seguindoSortBtn = document.getElementById("seguindoSortBtn");
const seguindoSortMenu = document.getElementById("seguindoSortMenu");

function currentSubMode() {
    return sortMode.endsWith("_likes") ? "likes" : "recent";
}

headerSections.forEach((section) => {
    section.addEventListener("click", () => {
        headerSections.forEach((s) => s.classList.remove("active"));
        section.classList.add("active");
        if (typeof setSortMode !== "function") return;
        if (section.id === "headerSection1") {
            const leave = sortMode.startsWith("following_") || sortMode === "eleicao";
            setSortMode(leave ? "likes" : sortMode);
        } else if (section.id === "headerSection2") {
            setSortMode("following_" + currentSubMode());
        } else if (section.id === "headerSection3") {
            setSortMode("eleicao");
        }
    });
});

seguindoSortBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("headerSection2").click();
    seguindoSortMenu.hidden = !seguindoSortMenu.hidden;
});

seguindoSortMenu.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        setSortMode(btn.dataset.sort === "popular" ? "following_likes" : "following_recent");
        seguindoSortMenu.hidden = true;
    });
});

document.addEventListener("click", () => {
    seguindoSortMenu.hidden = true;
});
