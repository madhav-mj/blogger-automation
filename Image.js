(function () {
  if (window.__IRV_GRID__) return;
  window.__IRV_GRID__ = true;

  /* ---------- STYLES ---------- */
  const style = document.createElement("style");
  style.textContent = `
    #irv-btn {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 999999;
      background: #000;
      color: #fff;
      padding: 10px 14px;
      border-radius: 6px;
      cursor: pointer;
      font-family: sans-serif;
    }
    #irv-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,.8);
      z-index: 999998;
      display: none;
    }
    #irv-modal {
      background: #fff;
      width: 95%;
      height: 90%;
      margin: 2% auto;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      padding: 10px;
      font-family: sans-serif;
    }
    #irv-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    #irv-grid {
      flex: 1;
      margin-top: 10px;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 10px;
      overflow: auto;
    }
    .irv-item {
      border: 2px solid transparent;
      cursor: pointer;
      position: relative;
    }
    .irv-item img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 4px;
    }
    .irv-item.selected {
      border-color: #0a84ff;
    }
    .irv-item.selected::after {
      content: "✓";
      position: absolute;
      top: 4px;
      right: 6px;
      background: #0a84ff;
      color: #fff;
      font-size: 12px;
      padding: 2px 5px;
      border-radius: 50%;
    }
    #irv-actions {
      margin-top: 10px;
      display: flex;
      gap: 10px;
    }
  `;
  document.head.appendChild(style);

  /* ---------- BUTTON ---------- */
  const btn = document.createElement("div");
  btn.id = "irv-btn";
  btn.textContent = "Image Grid";
  document.body.appendChild(btn);

  /* ---------- MODAL ---------- */
  const overlay = document.createElement("div");
  overlay.id = "irv-overlay";
  overlay.innerHTML = `
    <div id="irv-modal">
      <div id="irv-header">
        <strong>Select Images to Copy URLs</strong>
        <button id="irv-close">✕</button>
      </div>
      <div id="irv-grid"></div>
      <div id="irv-actions">
        <button id="irv-copy">Copy Selected URLs</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  /* ---------- COLLECT IMAGES ---------- */
  function collectImages() {
    const urls = new Set();

    document.querySelectorAll("img").forEach(img => {
      const src = img.currentSrc || img.src;
      if (src) urls.add(src);
    });

    document.querySelectorAll("*").forEach(el => {
      const bg = getComputedStyle(el).backgroundImage;
      if (!bg || bg === "none") return;

      const matches = bg.match(/url\((['"]?)(.*?)\1\)/g);
      if (!matches) return;

      matches.forEach(m => {
        const url = m.replace(/url\(|\)|'|"/g, "");
        if (url) urls.add(url);
      });
    });

    return [...urls];
  }

  /* ---------- RENDER GRID ---------- */
  function renderGrid(urls) {
    const grid = document.getElementById("irv-grid");
    grid.innerHTML = "";

    urls.forEach(url => {
      const item = document.createElement("div");
      item.className = "irv-item";
      item.dataset.url = url;

      const img = document.createElement("img");
      img.src = url;

      item.appendChild(img);
      item.onclick = () => item.classList.toggle("selected");

      grid.appendChild(item);
    });
  }

  /* ---------- COPY ---------- */
  function copySelected() {
    const selected = [...document.querySelectorAll(".irv-item.selected")]
      .map(el => el.dataset.url);

    if (!selected.length) {
      alert("No images selected");
      return;
    }

    const output =
      "[\n" +
      selected.map(u => `  { url: '${u}' }`).join(",\n") +
      "\n]";

    navigator.clipboard.writeText(output).then(() => {
      alert(`Copied ${selected.length} image URLs`);
    });
  }

  /* ---------- EVENTS ---------- */
  btn.onclick = () => {
    renderGrid(collectImages());
    overlay.style.display = "block";
  };

  overlay.querySelector("#irv-close").onclick = () => {
    overlay.style.display = "none";
  };

  overlay.querySelector("#irv-copy").onclick = copySelected;
})();
