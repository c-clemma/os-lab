(function () {
  "use strict";

  var FS = window.FS;

  var app = {
    originalBuffer: null,
    workingBuffer: null,
    fileName: null,
    parsed: null,
    roles: null,
    gridApi: null,
    treeApi: null,
    treeCollapsed: new Set(),
    arrows: null,
    selection: null,
    dirty: false,
  };

  var dom = {};

  function q(id) {
    return document.getElementById(id);
  }

  function ctx() {
    return {
      parsed: app.parsed,
      roles: app.roles,
      gridApi: app.gridApi,
      arrows: app.arrows,
      onFieldCommit: onFieldCommit,
    };
  }

  function describeSelection(sel) {
    if (!sel) return "No selection.";
    if (sel.kind === "inode") {
      var inode = app.parsed.inodes[sel.index];
      return "Inode " + sel.index + (inode.type === 0 ? " (unallocated)" : " (" + FS.typeName(inode.type) + ")");
    }
    if (sel.kind === "bit") {
      var bit = FS.getBitmapBit(app.parsed.view, app.parsed.superblock, sel.index);
      return "Bitmap bit for block " + sel.index + " (" + (bit ? "in use" : "free") + ")";
    }
    if (sel.kind === "block") {
      var role = (app.roles.get(sel.index) || { role: "data" }).role;
      return "Block " + sel.index + " (" + role + ")";
    }
    return "";
  }

  function setStatus(text) {
    dom.statusBar.textContent = text;
  }

  function setModified(dirty) {
    app.dirty = dirty;
    dom.modifiedIndicator.textContent = dirty ? "● Modified" : "";
    dom.downloadBtn.disabled = !app.parsed;
    dom.resetBtn.disabled = !app.parsed || !dirty;
  }

  function renderBottomPane() {
    dom.hexdumpContainer.innerHTML = "";
    if (!app.selection) return;
    var focus = FS.selectionToHexFocus(app.selection, ctx());
    if (!focus) return;
    dom.hexdumpContainer.appendChild(FS.renderHexDump(app.parsed.bytes, focus.blockNum, focus.highlight));
  }

  function select(sel) {
    app.selection = sel;
    app.arrows.clear();
    FS.renderDetails(dom.details, sel, ctx());
    renderBottomPane();
    setStatus(describeSelection(sel));
    if (app.treeApi) app.treeApi.highlight(sel);
  }

  function onHover(sel) {
    if (!app.parsed) return;
    dom.statusBar.textContent = sel ? describeSelection(sel) : describeSelection(app.selection);
  }

  function clampSelection(sel) {
    if (!sel) return null;
    if (sel.kind === "inode" && (sel.index < 0 || sel.index >= app.parsed.superblock.ninodes)) return null;
    if ((sel.kind === "block" || sel.kind === "bit") && (sel.index < 0 || sel.index >= app.parsed.superblock.size)) return null;
    return sel;
  }

  function reparseAndRender(preserveSelection) {
    app.parsed = FS.parseImage(app.workingBuffer);
    app.roles = FS.classifyBlocks(app.parsed);
    app.gridApi = FS.renderGrid(dom.grid, app.parsed, app.roles, { onSelect: select, onHover: onHover });
    app.arrows.resize();
    app.treeApi = FS.renderDirTree(dom.dirTree, FS.buildDirectoryTree(app.parsed), app.treeCollapsed, {
      onSelectInode: function (inum) {
        app.gridApi.jumpTo("inode", inum);
      },
    });

    var sel = preserveSelection ? clampSelection(app.selection) : null;
    select(sel);
  }

  function onFieldCommit(descriptor) {
    var view = app.parsed.view;
    var sb = app.parsed.superblock;
    if (descriptor.type === "uint16") {
      FS.writeUint16(view, descriptor.offset, descriptor.value);
    } else if (descriptor.type === "uint32") {
      FS.writeUint32(view, descriptor.offset, descriptor.value);
    } else if (descriptor.type === "name") {
      FS.writeName(view, descriptor.offset, descriptor.value);
    } else if (descriptor.type === "bit") {
      FS.writeBitmapBit(view, sb, descriptor.blockNum, descriptor.value);
    }
    setModified(true);
    reparseAndRender(true);
  }

  function loadImage(buffer, fileName) {
    app.originalBuffer = buffer;
    app.workingBuffer = buffer.slice(0);
    app.fileName = fileName;
    app.selection = null;
    app.treeCollapsed = new Set();
    setModified(false);
    reparseAndRender(false);
    dom.emptyState.classList.add("hidden");
  }

  function loadFile(file) {
    if (!file) return;
    file
      .arrayBuffer()
      .then(function (buf) {
        loadImage(buf, file.name);
      })
      .catch(function (err) {
        setStatus("Could not read file: " + err.message);
      });
  }

  function downloadImage() {
    if (!app.workingBuffer) return;
    var blob = new Blob([app.workingBuffer], { type: "application/octet-stream" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    var base = app.fileName ? app.fileName.replace(/\.[^.]*$/, "") : "image";
    a.href = url;
    a.download = base + "-edited.img";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function resetImage() {
    if (!app.originalBuffer) return;
    app.workingBuffer = app.originalBuffer.slice(0);
    setModified(false);
    reparseAndRender(true);
  }

  function showSearchResults(title, items) {
    dom.searchResultsPanel.classList.remove("hidden");
    dom.searchResultsList.innerHTML = "";
    var h = document.createElement("div");
    h.className = "search-results-title";
    h.textContent = title + " (" + items.length + ")";
    dom.searchResultsList.appendChild(h);
    if (items.length === 0) {
      var none = document.createElement("div");
      none.className = "addr-note";
      none.textContent = "(none found)";
      dom.searchResultsList.appendChild(none);
      return;
    }
    items.forEach(function (item) {
      var row = document.createElement("a");
      row.href = "#";
      row.className = "search-result-row";
      row.textContent = item.label;
      row.addEventListener("click", function (e) {
        e.preventDefault();
        item.onClick();
      });
      dom.searchResultsList.appendChild(row);
    });
  }

  function hitLabel(hit) {
    if (hit.kind === "direct") return "inode " + hit.inum + " → direct[" + hit.slot + "]";
    if (hit.kind === "indirect-block") return "inode " + hit.inum + " → indirect block pointer";
    return "inode " + hit.inum + " → indirect[" + hit.slot + "]";
  }

  function wireToolbar() {
    dom.jumpBlockBtn.addEventListener("click", function () {
      if (!app.parsed) return;
      var n = FS.parseIntFlexible(dom.jumpBlockInput.value);
      if (isNaN(n)) return;
      var ok = app.gridApi.jumpTo("block", n);
      if (!ok) {
        var role = (app.roles.get(n) || {}).role;
        setStatus(
          role === "inode" || role === "bitmap"
            ? "Block " + n + " is part of the " + role + " region - shown as " + role + " cells, not a raw block. Try the matching jump box instead."
            : "No such block (" + n + ")."
        );
      }
    });

    dom.jumpInodeBtn.addEventListener("click", function () {
      if (!app.parsed) return;
      var n = FS.parseIntFlexible(dom.jumpInodeInput.value);
      if (isNaN(n)) return;
      var ok = app.gridApi.jumpTo("inode", n);
      if (!ok) setStatus("No such inode (" + n + ").");
    });

    dom.searchBlockBtn.addEventListener("click", function () {
      if (!app.parsed) return;
      var n = FS.parseIntFlexible(dom.searchBlockInput.value);
      if (isNaN(n)) return;
      var hits = FS.searchInodesForBlock(app.parsed, n);
      showSearchResults(
        "Inodes referencing block " + n,
        hits.map(function (hit) {
          return {
            label: hitLabel(hit),
            onClick: function () {
              app.gridApi.jumpTo("inode", hit.inum);
            },
          };
        })
      );
    });

    dom.searchInodeBtn.addEventListener("click", function () {
      if (!app.parsed) return;
      var n = FS.parseIntFlexible(dom.searchInodeInput.value);
      if (isNaN(n)) return;
      var hits = FS.searchDirectoriesForInode(app.parsed, n);
      showSearchResults(
        "Directory entries referencing inode " + n,
        hits.map(function (hit) {
          return {
            label: "directory inode " + hit.dirInum + ", block " + hit.block + ", slot " + hit.slot + ': "' + hit.name + '"',
            onClick: function () {
              app.gridApi.jumpTo("block", hit.block);
            },
          };
        })
      );
    });

    dom.clearSearchResults.addEventListener("click", function () {
      dom.searchResultsPanel.classList.add("hidden");
    });

    function enterSubmits(inputEl, btnEl) {
      inputEl.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          btnEl.click();
        }
      });
    }
    enterSubmits(dom.jumpBlockInput, dom.jumpBlockBtn);
    enterSubmits(dom.jumpInodeInput, dom.jumpInodeBtn);
    enterSubmits(dom.searchBlockInput, dom.searchBlockBtn);
    enterSubmits(dom.searchInodeInput, dom.searchInodeBtn);
  }

  function wireFileLoading() {
    dom.fileInput.addEventListener("change", function (e) {
      loadFile(e.target.files[0]);
    });

    var dropTarget = dom.leftPane;
    dropTarget.addEventListener("dragover", function (e) {
      e.preventDefault();
      dropTarget.classList.add("drag-over");
    });
    dropTarget.addEventListener("dragleave", function () {
      dropTarget.classList.remove("drag-over");
    });
    dropTarget.addEventListener("drop", function (e) {
      e.preventDefault();
      dropTarget.classList.remove("drag-over");
      if (e.dataTransfer.files && e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
    });
  }

  function dragify(splitterEl, axis, targetEl, minSize) {
    splitterEl.addEventListener("mousedown", function (e) {
      e.preventDefault();
      splitterEl.classList.add("dragging");
      var start = axis === "x" ? e.clientX : e.clientY;
      var rect = targetEl.getBoundingClientRect();
      var startSize = axis === "x" ? rect.width : rect.height;

      function onMove(ev) {
        var cur = axis === "x" ? ev.clientX : ev.clientY;
        var delta = start - cur; // target pane sits after the splitter, so dragging toward it shrinks it
        var max = (axis === "x" ? window.innerWidth : window.innerHeight) * 0.7;
        var newSize = Math.max(minSize, Math.min(max, startSize + delta));
        targetEl.style.flex = "0 0 " + newSize + "px";
        if (app.arrows) app.arrows.resize();
      }
      function onUp() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        splitterEl.classList.remove("dragging");
        if (app.arrows) app.arrows.resize();
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  function initSplitters() {
    dragify(q("col-splitter"), "x", q("right-pane"), 200);
    dragify(q("row-splitter"), "y", q("bottom-pane"), 80);
    dragify(q("tree-splitter"), "y", q("tree-pane"), 60);
  }

  function init() {
    dom.fileInput = q("file-input");
    dom.leftPane = q("left-pane");
    dom.grid = q("grid");
    dom.svg = q("arrow-svg");
    dom.details = q("details");
    dom.dirTree = q("dir-tree");
    dom.hexdumpContainer = q("hexdump-container");
    dom.statusBar = q("status-bar");
    dom.modifiedIndicator = q("modified-indicator");
    dom.resetBtn = q("reset-btn");
    dom.downloadBtn = q("download-btn");
    dom.emptyState = q("empty-state");

    dom.jumpBlockInput = q("jump-block");
    dom.jumpBlockBtn = q("jump-block-btn");
    dom.jumpInodeInput = q("jump-inode");
    dom.jumpInodeBtn = q("jump-inode-btn");
    dom.searchBlockInput = q("search-block");
    dom.searchBlockBtn = q("search-block-btn");
    dom.searchInodeInput = q("search-inode");
    dom.searchInodeBtn = q("search-inode-btn");
    dom.searchResultsPanel = q("search-results-panel");
    dom.searchResultsList = q("search-results-list");
    dom.clearSearchResults = q("clear-search-results");

    app.arrows = new FS.ArrowLayer(dom.leftPane, dom.svg);

    dom.resetBtn.addEventListener("click", resetImage);
    dom.downloadBtn.addEventListener("click", downloadImage);

    wireFileLoading();
    wireToolbar();
    initSplitters();
    setModified(false);
    window.addEventListener("resize", function () {
      if (app.arrows) app.arrows.resize();
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
