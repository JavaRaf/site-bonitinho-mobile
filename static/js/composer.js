const composerModal = document.getElementById("composerModal");
const composerClose = document.getElementById("composerClose");
const composerImageInput = document.getElementById("composerImageInput");
const composerAdd = document.getElementById("composerAddImage");
const composerPost = document.getElementById("composerPost");
const composerText = document.getElementById("composerText");
const composerPreview = document.getElementById("composerPreview");
const composerPreviewImg = document.getElementById("composerPreviewImg");
const composerRemove = document.getElementById("composerRemove");

let selectedFile = null;

function closeComposer() {
    composerModal.classList.remove("open");
}

composerClose.addEventListener("click", closeComposer);

composerModal.addEventListener("click", e => {
    if (e.target === composerModal) closeComposer();
});

composerAdd.addEventListener("click", () => composerImageInput.click());

composerImageInput.addEventListener("change", () => {
    const file = composerImageInput.files[0];
    if (!file) return;
    selectedFile = file;
    composerPreviewImg.src = URL.createObjectURL(file);
    composerPreview.hidden = false;
    composerPost.disabled = false;
});

composerRemove.addEventListener("click", () => {
    selectedFile = null;
    composerImageInput.value = "";
    composerPreviewImg.removeAttribute("src");
    composerPreview.hidden = true;
    composerPost.disabled = true;
});

composerPost.addEventListener("click", async () => {
    if (!selectedFile) return;
    composerPost.disabled = true;
    const form = new FormData();
    form.append("images", selectedFile);
    form.append("caption", composerText.value.trim());
    try {
        const res = await fetch("/api/upload", { method: "POST", body: form });
        if (res.ok) {
            selectedFile = null;
            composerImageInput.value = "";
            composerText.value = "";
            composerPreviewImg.removeAttribute("src");
            composerPreview.hidden = true;
            closeComposer();
            if (typeof loadCarousel === "function") {
                await loadCarousel();
            } else {
                location.reload();
            }
        } else if (res.status === 401) {
            location.href = "/login";
        }
    } catch { /* ignore */ }
    composerPost.disabled = true;
});
