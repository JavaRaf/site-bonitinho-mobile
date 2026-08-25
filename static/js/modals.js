(function(){
  function ensureModal(){
    let overlay = document.getElementById("appModalOverlay");
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "appModalOverlay";
    overlay.className = "app-modal-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="app-modal-card" role="dialog" aria-modal="true">
        <h3 id="appModalTitle"></h3>
        <p id="appModalMessage"></p>
        <div id="appModalInputWrap" hidden>
          <input type="text" id="appModalInput" class="app-modal-input" />
        </div>
        <div class="app-modal-actions">
          <button id="appModalCancel" class="app-modal-btn secondary">Cancelar</button>
          <button id="appModalConfirm" class="app-modal-btn primary">Confirmar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e)=>{ if(e.target===overlay) closeModal(null); });
    return overlay;
  }

  let lastResolver = null;
  let lastType = null;

  function closeModal(result){
    const overlay = document.getElementById("appModalOverlay");
    if (overlay) overlay.hidden = true;
    if (lastResolver) {
      const r = lastResolver;
      lastResolver = null;
      r(result);
    }
  }

  function showModal({title="", message="", confirmText="Confirmar", cancelText="Cancelar", showCancel=true, input=false, inputValue="", inputPlaceholder="", danger=false}){
    return new Promise(resolve=>{
      const overlay = ensureModal();
      lastResolver = resolve;
      document.getElementById("appModalTitle").textContent = title;
      document.getElementById("appModalMessage").textContent = message;
      const wrap = document.getElementById("appModalInputWrap");
      const inputEl = document.getElementById("appModalInput");
      if (input) {
        wrap.hidden = false;
        inputEl.value = inputValue;
        inputEl.placeholder = inputPlaceholder || "";
        setTimeout(()=>inputEl.focus(), 50);
      } else {
        wrap.hidden = true;
      }
      const cancelBtn = document.getElementById("appModalCancel");
      const confirmBtn = document.getElementById("appModalConfirm");
      cancelBtn.textContent = cancelText;
      confirmBtn.textContent = confirmText;
      cancelBtn.hidden = !showCancel;
      confirmBtn.className = danger ? "app-modal-btn danger" : "app-modal-btn primary";
      // handlers
      const onCancel = ()=>{ cleanup(); closeModal(input ? null : false); };
      const onConfirm = ()=>{
        cleanup();
        if (input) closeModal(inputEl.value);
        else closeModal(true);
      };
      const onKey = (e)=>{
        if (e.key==="Escape") { e.preventDefault(); onCancel(); }
        if (e.key==="Enter" && !e.shiftKey) { if (input) { if (document.activeElement===inputEl) { e.preventDefault(); onConfirm(); } } else { e.preventDefault(); onConfirm(); } }
      };
      function cleanup(){
        cancelBtn.removeEventListener("click", onCancel);
        confirmBtn.removeEventListener("click", onConfirm);
        document.removeEventListener("keydown", onKey);
      }
      cancelBtn.addEventListener("click", onCancel);
      confirmBtn.addEventListener("click", onConfirm);
      document.addEventListener("keydown", onKey);
      overlay.hidden = false;
    });
  }

  window.showAlert = function(message, title="Aviso"){
    return showModal({title, message, confirmText:"OK", showCancel:false});
  };

  window.showConfirm = function(message, title="Confirmar", confirmText="Confirmar", cancelText="Cancelar", danger=false){
    return showModal({title, message, confirmText, cancelText, showCancel:true, danger});
  };

  window.showPrompt = function(message, defaultValue="", title="Informe", confirmText="Confirmar", placeholder=""){
    return showModal({title, message, confirmText, cancelText:"Cancelar", showCancel:true, input:true, inputValue: defaultValue, inputPlaceholder: placeholder});
  };

  // Compat: substituir alert/confirm nativos se desejar, mas manter nativo como fallback
  // Não sobrescreve window.alert para não quebrar libs, use showAlert explicitamente
})();
