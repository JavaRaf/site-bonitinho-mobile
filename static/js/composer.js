const composerModal = document.getElementById("composerModal");
const composerClose = document.getElementById("composerClose");
const composerImageInput = document.getElementById("composerImageInput");
const composerAdd = document.getElementById("composerAddImage");
const composerZipInput = document.getElementById("composerZipInput");
const composerAddZip = document.getElementById("composerAddZip");
const composerZipPreview = document.getElementById("composerZipPreview");
const composerZipLabel = document.getElementById("composerZipLabel");
const composerZipRemove = document.getElementById("composerZipRemove");
const composerPost = document.getElementById("composerPost");
const composerText = document.getElementById("composerText");
const composerPreview = document.getElementById("composerPreview");
const composerPreviewImg = document.getElementById("composerPreviewImg");
const composerRemove = document.getElementById("composerRemove");

let selectedFile = null;
let selectedZip = null;

function closeComposer() {
    composerModal.classList.remove("open");
}

composerClose.addEventListener("click", closeComposer);

composerModal.addEventListener("click", e => {
    if (e.target === composerModal) closeComposer();
});

composerAdd.addEventListener("click", () => composerImageInput.click());
composerAddZip.addEventListener("click", () => composerZipInput.click());

function clearImage() {
    selectedFile = null;
    composerImageInput.value = "";
    composerPreviewImg.removeAttribute("src");
    composerPreview.hidden = true;
}

function clearZip() {
    selectedZip = null;
    composerZipInput.value = "";
    composerZipPreview.hidden = true;
    composerZipLabel.textContent = "Arquivo ZIP selecionado";
}

composerImageInput.addEventListener("change", () => {
    const file = composerImageInput.files[0];
    if (!file) return;
    clearZip();
    selectedFile = file;
    composerPreviewImg.src = URL.createObjectURL(file);
    composerPreview.hidden = false;
    composerPost.disabled = false;
});

composerZipInput.addEventListener("change", () => {
    const file = composerZipInput.files[0];
    if (!file) return;
    clearImage();
    selectedZip = file;
    composerZipLabel.textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;
    composerZipPreview.hidden = false;
    composerPost.disabled = false;
});

composerRemove.addEventListener("click", () => {
    clearImage();
    composerPost.disabled = true;
});

composerZipRemove.addEventListener("click", () => {
    clearZip();
    composerPost.disabled = true;
});

composerPost.addEventListener("click", async () => {
    if (!selectedFile && !selectedZip) return;
    composerPost.disabled = true;
    const form = new FormData();
    if (selectedFile) form.append("images", selectedFile);
    if (selectedZip) form.append("zip", selectedZip);
    form.append("caption", composerText.value.trim());
    try {
        const res = await fetch("/api/upload", { method: "POST", body: form });
        if (res.ok) {
            clearImage();
            clearZip();
            composerText.value = "";
            closeComposer();
            if (typeof loadCarousel === "function") {
                await loadCarousel();
            } else {
                location.reload();
            }
        } else if (res.status === 401) {
            location.href = "/login";
        } else if (res.status === 413) {
            alert("Arquivo muito grande (máximo 10 MB).");
        }
    } catch { /* ignore */ }
    composerPost.disabled = true;
});
