document.getElementById("download-btn").addEventListener("click", () => {
    const slides = document.querySelectorAll(".carousel-slide");
    const dots = document.querySelectorAll(".carousel-dot");
    let idx = 0;

    dots.forEach((d, i) => {
        if (d.classList.contains("active")) idx = i;
    });

    const img = slides[idx]?.querySelector("img");
    if (!img) return;

    const a = document.createElement("a");
    a.href = img.src;
    a.download = img.src.split("/").pop();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
});
