(function () {
  "use strict";

  var STORAGE_KEY = "md-preview-content";
  var DEBOUNCE_MS = 300;

  var mdInput = document.getElementById("md-input");
  var preview = document.getElementById("preview");
  var btnPdf = document.getElementById("btn-pdf");
  var saveStatus = document.getElementById("save-status");
  var resizer = document.getElementById("resizer");
  var layout = document.querySelector(".layout");
  var paneEditor = document.querySelector(".pane-editor");
  var panePreview = document.querySelector(".pane-preview");

  var saveTimer = null;
  var defaultMd =
    "# 歡迎使用 MD Preview\n\n左側編輯 **Markdown**，右側即時預覽。內容會自動儲存在瀏覽器中。\n\n## 功能\n\n- 左右對照編輯與預覽\n- 匯出 PDF\n- 重新開啟頁面後仍保留內容\n\n```javascript\nconsole.log('Hello');\n```\n";

  function configureMarked() {
    if (typeof marked === "undefined") return;
    marked.setOptions({
      gfm: true,
      breaks: true,
      highlight: function (code, lang) {
        if (typeof hljs !== "undefined" && lang && hljs.getLanguage(lang)) {
          try {
            return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
          } catch (e) {
            /* fallthrough */
          }
        }
        if (typeof hljs !== "undefined") {
          try {
            return hljs.highlightAuto(code).value;
          } catch (e2) {
            return code;
          }
        }
        return code;
      },
    });
  }

  function render() {
    var raw = mdInput.value;
    var html = typeof marked !== "undefined" ? marked.parse(raw) : escapeHtml(raw);
    if (typeof DOMPurify !== "undefined") {
      html = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
    }
    preview.innerHTML = html;
  }

  function escapeHtml(text) {
    var div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, mdInput.value);
      saveStatus.textContent = "已儲存";
      window.setTimeout(function () {
        if (saveStatus.textContent === "已儲存") saveStatus.textContent = "";
      }, 2000);
    } catch (e) {
      saveStatus.textContent = "無法儲存";
    }
  }

  function schedulePersist() {
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(function () {
      saveTimer = null;
      persist();
    }, DEBOUNCE_MS);
  }

  function load() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      mdInput.value = saved !== null && saved !== "" ? saved : defaultMd;
    } catch (e) {
      mdInput.value = defaultMd;
    }
    render();
  }

  function exportPdf() {
    if (typeof html2pdf === "undefined") {
      window.print();
      return;
    }

    btnPdf.disabled = true;
    saveStatus.textContent = "產生 PDF…";

    /* 暫存原有樣式，讓 preview 展開成完整高度以截圖 */
    var prevOverflow = preview.style.overflow;
    var prevFlex = preview.style.flex;
    preview.style.overflow = "visible";
    preview.style.flex = "none";

    var opt = {
      margin: [12, 14, 12, 14],
      filename: "md-preview.pdf",
      image: { type: "jpeg", quality: 0.97 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        scrollX: 0,
        scrollY: 0,
        windowWidth: preview.scrollWidth,
        windowHeight: preview.scrollHeight,
      },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"] },
    };

    html2pdf()
      .set(opt)
      .from(preview)
      .save()
      .then(function () {
        saveStatus.textContent = "";
      })
      .catch(function (err) {
        console.error(err);
        saveStatus.textContent = "PDF 失敗，請用 Ctrl+P 另存";
      })
      .finally(function () {
        preview.style.overflow = prevOverflow;
        preview.style.flex = prevFlex;
        btnPdf.disabled = false;
      });
  }

  function initResizer() {
    var dragging = false;

    function onMove(clientX) {
      if (!dragging || !layout) return;
      var rect = layout.getBoundingClientRect();
      var ratio = (clientX - rect.left) / rect.width;
      ratio = Math.max(0.2, Math.min(0.8, ratio));
      paneEditor.style.flex = ratio + " 1 0%";
      panePreview.style.flex = 1 - ratio + " 1 0%";
    }

    resizer.addEventListener("mousedown", function (e) {
      dragging = true;
      resizer.classList.add("is-dragging");
      e.preventDefault();
    });

    window.addEventListener("mousemove", function (e) {
      onMove(e.clientX);
    });

    window.addEventListener("mouseup", function () {
      dragging = false;
      resizer.classList.remove("is-dragging");
    });
  }

  configureMarked();
  load();

  mdInput.addEventListener("input", function () {
    render();
    schedulePersist();
  });

  btnPdf.addEventListener("click", exportPdf);
  initResizer();
})();
