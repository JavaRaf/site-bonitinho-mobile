const uploadBtn = document.getElementById("uploadBtn");
const uploadInput = document.getElementById("uploadInput");
const uploadStatus = document.getElementById("uploadStatus");

uploadBtn.addEventListener("click", () => uploadInput.click());

uploadInput.addEventListener("change", async () => {
    const files = uploadInput.files;
    if (!files.length) return;

    const form = new FormData();
    for (const f of files) form.append("images", f);

    uploadStatus.textContent = "Enviando...";

    try {
        const res = await fetch("/api/upload", { method: "POST", body: form });
        if (res.ok) {
            const data = await res.json();
            uploadStatus.textContent = `${data.saved.length} imagem(ns) salva(s)!`;
            uploadInput.value = "";
            setTimeout(() => { uploadStatus.textContent = ""; }, 3000);
            location.reload();
        } else {
            const err = await res.json();
            uploadStatus.textContent = err.error || "Erro no upload";
        }
    } catch {
        uploadStatus.textContent = "Erro de conexão";
    }
});
