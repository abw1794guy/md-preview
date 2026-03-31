(function () {
  "use strict";

  /* ── 常數 ── */
  var STORAGE_CONTENT  = "md-preview-content";
  var STORAGE_EDITOR   = "md-preview-editor-dark";
  var STORAGE_PREVIEW  = "md-preview-preview-dark";
  var STORAGE_SYNC     = "md-preview-sync";
  var STORAGE_LANG     = "md-preview-lang";
  var DEBOUNCE_MS      = 250;

  var HLJS_LIGHT = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css";
  var HLJS_DARK  = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css";

  /* ── i18n 字串 ── */
  var I18N = {
    zh: {
      layoutGroup:    "版面配置",
      split:          "分割視圖",
      editorOnly:     "專注編輯",
      previewOnly:    "純預覽",
      syncOn:         "開啟捲軸同步",
      syncOff:        "關閉捲軸同步",
      theme:          "切換主題",
      themeLabels:    ["暗|亮", "亮|亮", "亮|暗", "暗|暗"],
      langBtn:        "EN",
      langTitle:      "Switch to English",
      import:         "匯入",
      importTitle:    "匯入 .md 檔（或拖曳到編輯區）",
      exportPdf:      "匯出 PDF",
      panePreview:    "預覽",
      placeholder:    "在此輸入 Markdown…\n\n可拖曳 .md 檔到此處匯入",
      saved:          "已儲存",
      cannotSave:     "無法儲存",
      preparing:      "準備中…",
      pdfHint:        "請在對話框選「另存為 PDF」",
      pdfFallback:    "請按 Ctrl+P 另存 PDF",
      importOk:       "已匯入：",
      importFail:     "讀取失敗",
      importWrongExt: "請選擇 .md / .txt 檔",
    },
    en: {
      layoutGroup:    "Layout",
      split:          "Split View",
      editorOnly:     "Focus Editor",
      previewOnly:    "Preview Only",
      syncOn:         "Enable Scroll Sync",
      syncOff:        "Disable Scroll Sync",
      theme:          "Toggle Theme",
      themeLabels:    ["D|L", "L|L", "L|D", "D|D"],
      langBtn:        "中",
      langTitle:      "切換為中文",
      import:         "Import",
      importTitle:    "Import .md file (or drag & drop to editor)",
      exportPdf:      "Export PDF",
      panePreview:    "Preview",
      placeholder:    "Type Markdown here…\n\nDrag & drop a .md file to import",
      saved:          "Saved",
      cannotSave:     "Cannot save",
      preparing:      "Preparing…",
      pdfHint:        "Select \"Save as PDF\" in the dialog",
      pdfFallback:    "Press Ctrl+P to save as PDF",
      importOk:       "Imported: ",
      importFail:     "Read failed",
      importWrongExt: "Please select a .md or .txt file",
    },
  };

  /* 主題 4 個狀態循環：editor dark/light × preview light/dark */
  var THEME_CYCLE = [
    { editorDark: true,  previewDark: false },
    { editorDark: false, previewDark: false },
    { editorDark: false, previewDark: true  },
    { editorDark: true,  previewDark: true  },
  ];

  /* ── DOM ── */
  var html             = document.documentElement;
  var mdInput          = document.getElementById("md-input");
  var preview          = document.getElementById("preview");
  var btnPdf           = document.getElementById("btn-pdf");
  var saveStatus       = document.getElementById("save-status");
  var resizer          = document.getElementById("resizer");
  var layout           = document.getElementById("layout");
  var paneEditor       = document.getElementById("pane-editor");
  var panePreview      = document.getElementById("pane-preview");
  var btnSplit         = document.getElementById("btn-split");
  var btnEditorOnly    = document.getElementById("btn-editor-only");
  var btnPreviewOnly   = document.getElementById("btn-preview-only");
  var btnSync          = document.getElementById("btn-sync");
  var btnTheme         = document.getElementById("btn-theme");
  var themeLabel       = document.getElementById("theme-label");
  var fileInput        = document.getElementById("file-input");
  var hljsThemeEl      = document.getElementById("hljs-theme");
  var btnLang          = document.getElementById("btn-lang");
  var labelImport      = document.getElementById("label-import");
  var panePreviewTitle = document.getElementById("pane-preview-title");
  var layoutGroup      = document.querySelector(".btn-group[role=group]");

  /* ── 狀態 ── */
  var saveTimer      = null;
  var syncEnabled    = false;
  var syncingEditor  = false;
  var syncingPreview = false;
  var themeIndex     = 0;
  var currentLang    = "zh";

  var defaultMd = [
    "# 歡迎使用 MD Preview",
    "",
    "左側編輯 **Markdown**，右側即時預覽。內容自動儲存在瀏覽器中。",
    "",
    "## 功能清單",
    "",
    "- 左右對照編輯與預覽",
    "- 即時渲染",
    "- 主題切換（暗/亮 × 編輯/預覽）",
    "- 捲軸同步",
    "- 版面切換（分割 / 專注編輯 / 純預覽）",
    "- 匯入 `.md` 檔（按鈕或拖曳）",
    "- 匯出 PDF",
    "",
    "## 程式碼範例",
    "",
    "```javascript",
    "function greet(name) {",
    "  return `Hello, ${name}!`;",
    "}",
    "console.log(greet('World'));",
    "```",
    "",
    "## 表格",
    "",
    "| 功能 | 說明 |",
    "| --- | --- |",
    "| 主題 | 四種配色組合 |",
    "| 同步 | 左右同步捲動 |",
    "| 版面 | 分割 / 專注 / 預覽 |",
    "",
    "> 試試拖曳 `.md` 檔到左側編輯區匯入！",
  ].join("\n");

  /* ════════════════════════════════════
     Marked 設定
  ════════════════════════════════════ */
  function configureMarked() {
    if (typeof marked === "undefined") return;
    marked.setOptions({
      gfm: true,
      breaks: true,
      highlight: function (code, lang) {
        if (typeof hljs !== "undefined" && lang && hljs.getLanguage(lang)) {
          try { return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value; }
          catch (e) { /* fallthrough */ }
        }
        if (typeof hljs !== "undefined") {
          try { return hljs.highlightAuto(code).value; } catch (e) { return code; }
        }
        return code;
      },
    });
  }

  /* ════════════════════════════════════
     渲染
  ════════════════════════════════════ */
  function render() {
    var raw = mdInput.value;
    var htmlStr = typeof marked !== "undefined" ? marked.parse(raw) : escapeHtml(raw);
    if (typeof DOMPurify !== "undefined") {
      htmlStr = DOMPurify.sanitize(htmlStr, { USE_PROFILES: { html: true } });
    }
    preview.innerHTML = htmlStr;
  }

  function escapeHtml(text) {
    var div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  /* ════════════════════════════════════
     儲存
  ════════════════════════════════════ */
  function persist() {
    try {
      localStorage.setItem(STORAGE_CONTENT, mdInput.value);
      showStatus(t("saved"), 1800);
    } catch (e) {
      showStatus(t("cannotSave"), 3000);
    }
  }

  function schedulePersist() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { saveTimer = null; persist(); }, DEBOUNCE_MS);
  }

  function t(key) { return I18N[currentLang][key] || I18N.zh[key] || key; }

  function showStatus(msg, duration) {
    saveStatus.textContent = msg;
    clearTimeout(saveStatus._t);
    saveStatus._t = setTimeout(function () {
      if (saveStatus.textContent === msg) saveStatus.textContent = "";
    }, duration || 2000);
  }

  function load() {
    try {
      var saved = localStorage.getItem(STORAGE_CONTENT);
      mdInput.value = (saved !== null && saved !== "") ? saved : defaultMd;
    } catch (e) {
      mdInput.value = defaultMd;
    }
    render();
  }

  /* ════════════════════════════════════
     主題切換
  ════════════════════════════════════ */
  function applyTheme(index) {
    var th = THEME_CYCLE[index];
    html.dataset.editorDark  = th.editorDark  ? "true" : "false";
    html.dataset.previewDark = th.previewDark ? "true" : "false";
    hljsThemeEl.href = th.previewDark ? HLJS_DARK : HLJS_LIGHT;
    themeLabel.textContent = I18N[currentLang].themeLabels[index];
    try {
      localStorage.setItem(STORAGE_EDITOR,  th.editorDark  ? "true" : "false");
      localStorage.setItem(STORAGE_PREVIEW, th.previewDark ? "true" : "false");
    } catch (e) { /* ignore */ }
  }

  function initTheme() {
    try {
      var edDark = localStorage.getItem(STORAGE_EDITOR)  !== "false";
      var prDark = localStorage.getItem(STORAGE_PREVIEW) === "true";
      for (var i = 0; i < THEME_CYCLE.length; i++) {
        if (THEME_CYCLE[i].editorDark === edDark && THEME_CYCLE[i].previewDark === prDark) {
          themeIndex = i;
          break;
        }
      }
    } catch (e) { themeIndex = 0; }
    applyTheme(themeIndex);
  }

  function cycleTheme() {
    themeIndex = (themeIndex + 1) % THEME_CYCLE.length;
    applyTheme(themeIndex);
  }

  /* ════════════════════════════════════
     版面切換（分割 / 專注編輯 / 純預覽）
  ════════════════════════════════════ */
  function setLayout(mode) {
    html.dataset.layout = mode;
    btnSplit.classList.toggle("is-active",       mode === "split");
    btnEditorOnly.classList.toggle("is-active",  mode === "editor");
    btnPreviewOnly.classList.toggle("is-active", mode === "preview");

    if (mode === "split") {
      /* 還原手動拖曳比例 */
      paneEditor.style.flex  = "";
      panePreview.style.flex = "";
    }
  }

  /* ════════════════════════════════════
     捲軸同步
  ════════════════════════════════════ */
  function toggleSync() {
    syncEnabled = !syncEnabled;
    btnSync.classList.toggle("sync-on", syncEnabled);
    btnSync.title = syncEnabled ? t("syncOff") : t("syncOn");
    btnSync.setAttribute("aria-pressed", syncEnabled ? "true" : "false");
    try { localStorage.setItem(STORAGE_SYNC, syncEnabled ? "true" : "false"); } catch (e) { /* ignore */ }
  }

  function initSync() {
    try {
      if (localStorage.getItem(STORAGE_SYNC) === "true") toggleSync();
    } catch (e) { /* ignore */ }

    mdInput.addEventListener("scroll", function () {
      if (!syncEnabled || syncingEditor) return;
      syncingPreview = true;
      var maxSrc = mdInput.scrollHeight - mdInput.clientHeight;
      if (maxSrc <= 0) { syncingPreview = false; return; }
      var ratio = mdInput.scrollTop / maxSrc;
      var maxDst = preview.scrollHeight - preview.clientHeight;
      preview.scrollTop = ratio * maxDst;
      requestAnimationFrame(function () { syncingPreview = false; });
    });

    preview.addEventListener("scroll", function () {
      if (!syncEnabled || syncingPreview) return;
      syncingEditor = true;
      var maxSrc = preview.scrollHeight - preview.clientHeight;
      if (maxSrc <= 0) { syncingEditor = false; return; }
      var ratio = preview.scrollTop / maxSrc;
      var maxDst = mdInput.scrollHeight - mdInput.clientHeight;
      mdInput.scrollTop = ratio * maxDst;
      requestAnimationFrame(function () { syncingEditor = false; });
    });
  }

  /* ════════════════════════════════════
     匯入 .md 檔
  ════════════════════════════════════ */
  function loadFile(file) {
    if (!file) return;
    var ext = file.name.split(".").pop().toLowerCase();
    if (ext !== "md" && ext !== "markdown" && ext !== "txt") {
      showStatus(t("importWrongExt"), 3000);
      return;
    }
    var reader = new FileReader();
    reader.onload = function (e) {
      mdInput.value = e.target.result;
      render();
      persist();
      showStatus(t("importOk") + file.name, 2500);
    };
    reader.onerror = function () { showStatus(t("importFail"), 3000); };
    reader.readAsText(file, "UTF-8");
  }

  function initFileImport() {
    fileInput.addEventListener("change", function () {
      loadFile(fileInput.files[0]);
      fileInput.value = "";
    });

    paneEditor.addEventListener("dragover", function (e) {
      e.preventDefault();
      paneEditor.classList.add("drag-over");
    });

    paneEditor.addEventListener("dragleave", function (e) {
      if (!paneEditor.contains(e.relatedTarget)) {
        paneEditor.classList.remove("drag-over");
      }
    });

    paneEditor.addEventListener("drop", function (e) {
      e.preventDefault();
      paneEditor.classList.remove("drag-over");
      var file = e.dataTransfer.files[0];
      loadFile(file);
    });
  }

  /* ════════════════════════════════════
     拖曳調整分隔條
  ════════════════════════════════════ */
  function initResizer() {
    var dragging = false;

    resizer.addEventListener("mousedown", function (e) {
      if (html.dataset.layout !== "split") return;
      dragging = true;
      resizer.classList.add("is-dragging");
      document.body.style.userSelect = "none";
      e.preventDefault();
    });

    window.addEventListener("mousemove", function (e) {
      if (!dragging) return;
      var rect = layout.getBoundingClientRect();
      var ratio = (e.clientX - rect.left) / rect.width;
      ratio = Math.max(0.2, Math.min(0.8, ratio));
      paneEditor.style.flex  = ratio + " 1 0%";
      panePreview.style.flex = (1 - ratio) + " 1 0%";
    });

    window.addEventListener("mouseup", function () {
      if (!dragging) return;
      dragging = false;
      resizer.classList.remove("is-dragging");
      document.body.style.userSelect = "";
    });
  }

  /* ════════════════════════════════════
     匯出 PDF
  ════════════════════════════════════ */
  function makeFilename() {
    var d = new Date();
    var pad = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
           "_" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  }

  function buildPrintHtml(filename) {
    var isDarkPreview = html.dataset.previewDark === "true";
    var hljsCss = isDarkPreview ? HLJS_DARK : HLJS_LIGHT;

    var printStyles = [
      "*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }",
      "body { font-family: 'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif;",
      "       font-size: 15px; line-height: 1.75; padding: 24mm 20mm; }",
      isDarkPreview
        ? "body { background: #0d1117; color: #e6edf3; }"
        : "body { background: #fff; color: #24292f; }",
      "h1,h2,h3,h4,h5,h6 { font-weight:600; line-height:1.3; margin:1.4em 0 0.6em; }",
      isDarkPreview
        ? "h1,h2 { border-bottom:1px solid #30363d; padding-bottom:.3em; }"
        : "h1,h2 { border-bottom:1px solid #d0d7de; padding-bottom:.3em; }",
      "h1 { font-size:2em; } h2 { font-size:1.5em; } h3 { font-size:1.25em; }",
      "h1:first-child,h2:first-child,h3:first-child { margin-top:0; }",
      "p { margin:0 0 1em; }",
      "ul,ol { margin:0 0 1em; padding-left:1.5em; } li { margin:.3em 0; }",
      isDarkPreview
        ? "blockquote { margin:0 0 1em; padding:.5em 1em; color:#8b949e; border-left:4px solid #3d444d; background:#161b22; }"
        : "blockquote { margin:0 0 1em; padding:.5em 1em; color:#57606a; border-left:4px solid #d0d7de; background:#f8f9fa; }",
      "blockquote p:last-child { margin:0; }",
      isDarkPreview
        ? "pre { padding:1em; font-size:13px; line-height:1.5; background:#161b22; border:1px solid #30363d; border-radius:6px; page-break-inside:avoid; }"
        : "pre { padding:1em; font-size:13px; line-height:1.5; background:#f6f8fa; border:1px solid #d0d7de; border-radius:6px; page-break-inside:avoid; }",
      "pre code { font-family:'JetBrains Mono','Fira Code',monospace; background:none; padding:0; }",
      isDarkPreview
        ? "code:not(pre code) { font-family:'JetBrains Mono',monospace; font-size:.875em; padding:.2em .4em; background:#1c2128; border:1px solid #30363d; border-radius:4px; color:#f78166; }"
        : "code:not(pre code) { font-family:'JetBrains Mono',monospace; font-size:.875em; padding:.2em .4em; background:#f6f8fa; border:1px solid #d0d7de; border-radius:4px; color:#c9241d; }",
      "table { border-collapse:collapse; width:100%; margin:0 0 1em; font-size:.9em; page-break-inside:avoid; }",
      isDarkPreview
        ? "th,td { border:1px solid #30363d; padding:8px 12px; } th { background:#161b22; font-weight:600; }"
        : "th,td { border:1px solid #d0d7de; padding:8px 12px; } th { background:#f6f8fa; font-weight:600; }",
      "img { max-width:100%; height:auto; display:block; margin:0 auto; }",
      isDarkPreview
        ? "a { color:#4493f8; } hr { border:none; border-top:1px solid #30363d; margin:1.5em 0; }"
        : "a { color:#0969da; } hr { border:none; border-top:1px solid #d0d7de; margin:1.5em 0; }",
      "@media print { body { padding:0; } pre { white-space:pre-wrap; word-break:break-all; } }",
    ].join("\n");

    return "<!DOCTYPE html>\n<html lang=\"zh-Hant\">\n<head>\n" +
      "<meta charset=\"UTF-8\"><title>" + filename + "</title>\n" +
      "<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n" +
      "<link href=\"https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap\" rel=\"stylesheet\">\n" +
      "<link rel=\"stylesheet\" href=\"" + hljsCss + "\">\n" +
      "<style>" + printStyles + "</style>\n" +
      "</head>\n<body>" + preview.innerHTML + "</body>\n</html>";
  }

  function exportPdf() {
    btnPdf.disabled = true;
    showStatus(t("preparing"), 60000);

    var filename = makeFilename();
    var htmlStr = buildPrintHtml(filename);

    var old = document.getElementById("pdf-iframe");
    if (old) old.parentNode.removeChild(old);

    var iframe = document.createElement("iframe");
    iframe.id = "pdf-iframe";
    iframe.style.cssText = "position:fixed;width:0;height:0;border:none;top:-1px;left:-1px;";
    document.body.appendChild(iframe);

    iframe.onload = function () {
      setTimeout(function () {
        try {
          iframe.contentWindow.print();
          showStatus(t("pdfHint"), 5000);
        } catch (e) {
          showStatus(t("pdfFallback"), 4000);
        }
        btnPdf.disabled = false;
        setTimeout(function () {
          var el = document.getElementById("pdf-iframe");
          if (el) el.parentNode.removeChild(el);
        }, 3000);
      }, 900);
    };

    var blob = new Blob([htmlStr], { type: "text/html;charset=utf-8" });
    iframe.src = URL.createObjectURL(blob);
  }

  /* ════════════════════════════════════
     語言切換
  ════════════════════════════════════ */
  function applyLang(lang) {
    currentLang = lang;
    var s = I18N[lang];

    /* html lang 屬性 */
    html.lang = lang === "zh" ? "zh-Hant" : "en";

    /* 工具列文字 */
    if (layoutGroup) layoutGroup.setAttribute("aria-label", s.layoutGroup);
    btnSplit.title      = s.split;
    btnEditorOnly.title = s.editorOnly;
    btnPreviewOnly.title = s.previewOnly;
    btnSync.title = syncEnabled ? s.syncOff : s.syncOn;
    btnTheme.title = s.theme;
    btnTheme.setAttribute("aria-label", s.theme);
    themeLabel.textContent = s.themeLabels[themeIndex];
    btnLang.textContent = s.langBtn;
    btnLang.title = s.langTitle;
    labelImport.textContent = s.import;
    labelImport.title = s.importTitle;
    btnPdf.textContent = s.exportPdf;

    /* 預覽標頭 */
    if (panePreviewTitle) panePreviewTitle.textContent = s.panePreview;

    /* textarea placeholder */
    mdInput.placeholder = s.placeholder;

    try { localStorage.setItem(STORAGE_LANG, lang); } catch (e) { /* ignore */ }
  }

  function toggleLang() {
    applyLang(currentLang === "zh" ? "en" : "zh");
  }

  function initLang() {
    try {
      var saved = localStorage.getItem(STORAGE_LANG);
      currentLang = (saved === "en") ? "en" : "zh";
    } catch (e) { currentLang = "zh"; }
    applyLang(currentLang);
  }

  /* ════════════════════════════════════
     初始化
  ════════════════════════════════════ */
  configureMarked();
  initTheme();
  initLang();
  load();
  initSync();
  initFileImport();
  initResizer();
  setLayout("split");

  mdInput.addEventListener("input", function () { render(); schedulePersist(); });

  btnSplit.addEventListener("click",       function () { setLayout("split"); });
  btnEditorOnly.addEventListener("click",  function () { setLayout("editor"); });
  btnPreviewOnly.addEventListener("click", function () { setLayout("preview"); });

  btnSync.addEventListener("click",  toggleSync);
  btnTheme.addEventListener("click", cycleTheme);
  btnLang.addEventListener("click",  toggleLang);
  btnPdf.addEventListener("click",   exportPdf);
})();
