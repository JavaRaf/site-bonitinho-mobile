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

function loadImageFallback(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image load failed")); };
        img.src = url;
    });
}

function loadImageBitmap(file) {
    if (typeof createImageBitmap !== "function") return loadImageFallback(file);
    try {
        return createImageBitmap(file, { imageOrientation: "from-image" })
            .catch(() => loadImageFallback(file));
    } catch {
        return loadImageFallback(file);
    }
}

async function compressImage(file) {
    const MAX_DIM = 1920;
    const compressible = ["image/jpeg", "image/png"].includes(file.type);
    if (!compressible) return file;

    const src = await loadImageBitmap(file);
    const sw = src.naturalWidth || src.width;
    const sh = src.naturalHeight || src.height;
    const scale = Math.min(1, MAX_DIM / Math.max(sw, sh));

    if (scale === 1) {
        if (src.close) src.close();
        return file;
    }

    const width = Math.round(sw * scale);
    const height = Math.round(sh * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(src, 0, 0, width, height);
    if (src.close) src.close();

    const isPng = file.type === "image/png";
    const type = isPng ? "image/png" : "image/jpeg";
    const blob = await new Promise(res => canvas.toBlob(res, type, isPng ? undefined : 0.9));
    return blob || file;
}

composerPost.addEventListener("click", async () => {
    if (!selectedFile && !selectedZip) return;
    composerPost.disabled = true;

    let imageToUpload = selectedFile;
    let imageName = selectedFile ? selectedFile.name : "";
    if (selectedFile) {
        try {
            imageToUpload = await compressImage(selectedFile);
            if (imageToUpload !== selectedFile) {
                const ext = selectedFile.type === "image/png" ? ".png" : ".jpg";
                imageName = selectedFile.name.replace(/\.[^.]+$/, "") + ext;
            }
        } catch { /* keep original on failure */ }
    }

    const form = new FormData();
    if (selectedFile) form.append("images", imageToUpload, imageName);
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
