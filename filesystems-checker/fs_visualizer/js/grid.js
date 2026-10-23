// Builds the left-pane disk-layout grid from a parsed image + role map.
// Selection model, kept deliberately simple (see plan doc):
//   {kind: 'block', index: blockNum}  -- boot / superblock / log / any data-region block
//   {kind: 'inode', index: inum}
//   {kind: 'bit',   index: blockNum} -- the bitmap bit that covers blockNum
(function (global) {
  "use strict";

  var FS = global.FS || {};

  function regionLabel(role, count) {
    var names = {
      boot: "Boot block",
      superblock: "Superblock",
      log: "Log",
      inode: "Inodes",
      bitmap: "Bitmap",
      data: "Data",
    };
    return (names[role] || role) + " (" + count + (role === "bitmap" ? " bits" : role === "inode" ? " inodes" : " blocks") + ")";
  }

  function makeCell(kind, index, extraClass, title) {
    var cell = document.createElement("div");
    cell.className = "cell " + extraClass;
    cell.setAttribute("data-kind", kind);
    cell.setAttribute("data-index", String(index));
    if (title) cell.title = title;
    return cell;
  }

  function buildBand(regionRole, label) {
    var band = document.createElement("div");
    band.className = "region-band region-" + regionRole;
    var titleEl = document.createElement("div");
    titleEl.className = "region-title";
    titleEl.textContent = label;
    var cells = document.createElement("div");
    cells.className = "region-cells";
    band.appendChild(titleEl);
    band.appendChild(cells);
    return { band: band, cells: cells };
  }

  // gridContainer: element to render into (cleared first).
  // parsed: result of FS.parseImage(). roles: result of FS.classifyBlocks(parsed).
  // callbacks: {onSelect(sel), onHover(sel|null)}
  // Returns an API object: {getCellEl(kind,index), jumpTo(kind,index), refreshRoles(roles)}
  function renderGrid(gridContainer, parsed, roles, callbacks) {
    gridContainer.innerHTML = "";
    var sb = parsed.superblock;
    var regions = parsed.regions;
    var b, i;

    var bootBand = buildBand("boot", regionLabel("boot", 1));
    var cell = makeCell("block", 0, "cell-block role-boot", "Boot block (unused)");
    bootBand.cells.appendChild(cell);
    gridContainer.appendChild(bootBand.band);

    var sbBand = buildBand("superblock", regionLabel("superblock", 1));
    cell = makeCell("block", regions.superblock.start, "cell-block role-superblock", "Superblock");
    sbBand.cells.appendChild(cell);
    gridContainer.appendChild(sbBand.band);

    var logCount = Math.max(0, regions.log.end - regions.log.start);
    var logBand = buildBand("log", regionLabel("log", logCount));
    for (b = regions.log.start; b < regions.log.end; b++) {
      cell = makeCell("block", b, "cell-block role-log", "Log block " + b);
      logBand.cells.appendChild(cell);
    }
    gridContainer.appendChild(logBand.band);

    var inodeBand = buildBand("inode", regionLabel("inode", sb.ninodes));
    for (i = 0; i < sb.ninodes; i++) {
      var inode = parsed.inodes[i];
      var allocClass = inode.type === 0 ? "inode-unallocated" : "inode-allocated";
      cell = makeCell("inode", i, "cell-inode " + allocClass, "Inode " + i + (inode.type === 0 ? " (unallocated)" : " (" + FS.typeName(inode.type) + ")"));
      inodeBand.cells.appendChild(cell);
    }
    gridContainer.appendChild(inodeBand.band);

    var bitmapBand = buildBand("bitmap", regionLabel("bitmap", sb.size));
    for (b = 0; b < sb.size; b++) {
      var bit = FS.getBitmapBit(parsed.view, sb, b);
      cell = makeCell("bit", b, "cell-bit " + (bit ? "bit-used" : "bit-free"), "Bitmap bit for block " + b + ": " + (bit ? "in use" : "free"));
      bitmapBand.cells.appendChild(cell);
    }
    gridContainer.appendChild(bitmapBand.band);

    var dataCount = Math.max(0, regions.data.end - regions.data.start);
    var dataBand = buildBand("data", regionLabel("data", dataCount));
    for (b = regions.data.start; b < regions.data.end; b++) {
      var info = roles.get(b) || { role: "data" };
      var isAllocatedPlainData = info.role === "data" && FS.getBitmapBit(parsed.view, sb, b);
      var roleClass = "role-" + info.role + (isAllocatedPlainData ? " role-data-allocated" : "");
      var title = "Block " + b + " (" + info.role + (isAllocatedPlainData ? ", allocated" : "") + ")";
      cell = makeCell("block", b, "cell-block " + roleClass, title);
      dataBand.cells.appendChild(cell);
    }
    gridContainer.appendChild(dataBand.band);

    // Delegated click + hover.
    gridContainer.addEventListener("click", function (e) {
      var cellEl = e.target.closest(".cell");
      if (!cellEl || !gridContainer.contains(cellEl)) return;
      var sel = { kind: cellEl.getAttribute("data-kind"), index: parseInt(cellEl.getAttribute("data-index"), 10) };
      if (callbacks && callbacks.onSelect) callbacks.onSelect(sel, cellEl);
    });
    gridContainer.addEventListener(
      "mouseover",
      function (e) {
        var cellEl = e.target.closest(".cell");
        if (!cellEl || !gridContainer.contains(cellEl)) return;
        var sel = { kind: cellEl.getAttribute("data-kind"), index: parseInt(cellEl.getAttribute("data-index"), 10) };
        if (callbacks && callbacks.onHover) callbacks.onHover(sel);
      },
      true
    );
    gridContainer.addEventListener("mouseleave", function () {
      if (callbacks && callbacks.onHover) callbacks.onHover(null);
    });

    function getCellEl(kind, index) {
      return gridContainer.querySelector('.cell[data-kind="' + kind + '"][data-index="' + index + '"]');
    }

    function jumpTo(kind, index) {
      var el = getCellEl(kind, index);
      if (!el) return false;
      el.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
      var sel = { kind: kind, index: index };
      if (callbacks && callbacks.onSelect) callbacks.onSelect(sel, el);
      return true;
    }

    return { getCellEl: getCellEl, jumpTo: jumpTo, container: gridContainer };
  }

  FS.renderGrid = renderGrid;

  global.FS = FS;
})(typeof window !== "undefined" ? window : this);
