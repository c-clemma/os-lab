// Right-pane renderer: one function per selection kind, plus the editable
// field helpers shared by all of them. ctx = {parsed, roles, gridApi, arrows, onFieldCommit}.
//
// Scope reminder (see plan doc): this file never renders a verdict like
// "check #N would fail". It only (a) shows raw field values in decimal/hex,
// (b) draws the arrows the spec asks for, and (c) puts a red box around a
// field when the tool itself has nothing sensible to point an arrow at
// (an out-of-range address) or when a pointer we're actively tracing
// disagrees with the bitmap bit at the far end.
(function (global) {
  "use strict";

  var FS = global.FS || {};

  function el(tag, className, text) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function attachEdit(displayEl, row, currentValue, commitFn, opts) {
    opts = opts || {};
    displayEl.classList.add("editable");
    displayEl.title = "Double-click to edit";
    displayEl.addEventListener("dblclick", function () {
      var input = document.createElement("input");
      input.type = "text";
      input.className = "field-input";
      input.value = String(currentValue);
      row.replaceChild(input, displayEl);
      input.focus();
      input.select();
      var done = false;

      function commit() {
        if (done) return;
        done = true;
        var nv;
        if (opts.isName) {
          nv = input.value.slice(0, FS.DIRSIZ);
        } else {
          nv = FS.parseIntFlexible(input.value);
          if (isNaN(nv) || nv < 0 || (opts.maxValue !== undefined && nv > opts.maxValue)) {
            row.replaceChild(displayEl, input);
            return;
          }
        }
        row.replaceChild(displayEl, input);
        commitFn(nv);
      }

      function cancel() {
        if (done) return;
        done = true;
        row.replaceChild(displayEl, input);
      }

      input.addEventListener("blur", commit);
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          input.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      });
    });
  }

  // Generic "label: value (hex) (note)" row, optionally editable.
  function fieldRow(container, opts) {
    var row = el("div", "field-row" + (opts.inconsistent ? " inconsistent" : ""));
    row.appendChild(el("span", "field-label", opts.label + ":"));
    var val = el("span", "field-value");

    function display() {
      if (opts.isName) {
        val.textContent = '"' + opts.value + '"';
      } else {
        val.textContent = opts.value + (opts.hex ? " (0x" + (opts.value >>> 0).toString(16) + ")" : "");
        if (opts.typeName) val.textContent += " (" + opts.typeName + ")";
      }
    }
    display();
    row.appendChild(val);

    if (opts.note) {
      row.appendChild(el("span", "addr-note", " " + opts.note));
    }

    if (opts.onCommit) {
      attachEdit(
        val,
        row,
        opts.isName ? opts.value : opts.value,
        function (nv) {
          opts.value = nv;
          display();
          opts.onCommit(nv);
        },
        { isName: !!opts.isName, maxValue: opts.maxValue }
      );
    }

    container.appendChild(row);
    return row;
  }

  // A single inode address slot (direct or indirect-table entry): value,
  // hex, editable, and a note that is exactly one of "(unused)",
  // "(out of range - not a data block)", or a pointer note - with the
  // pointer note becoming a clickable single-arrow link when onLinkClick
  // is given (used for indirect-table entries; the inode's own 13 slots
  // pass null and get their arrows auto-drawn by the caller instead).
  function renderAddrRow(container, label, value, offset, ctx, onLinkClick) {
    var sb = ctx.parsed.superblock;
    var datastart = ctx.parsed.datastart;
    var row = el("div", "field-row addr-row");
    row.appendChild(el("span", "field-label", label + ":"));
    var val = el("span", "field-value", value + " (0x" + (value >>> 0).toString(16) + ")");
    row.appendChild(val);

    if (value === 0) {
      row.appendChild(el("span", "addr-note", " (unused)"));
    } else if (!FS.isValidDataAddress(sb, datastart, value)) {
      row.appendChild(el("span", "addr-note", " (out of range - not a data block)"));
      row.classList.add("inconsistent");
    } else {
      var bitSet = FS.getBitmapBit(ctx.parsed.view, sb, value);
      if (onLinkClick) {
        var link = el("a", "addr-link", " → block " + value);
        link.href = "#";
        link.addEventListener("click", function (e) {
          e.preventDefault();
          onLinkClick(value);
        });
        row.appendChild(link);
      } else {
        row.appendChild(el("span", "addr-note", " → block " + value));
      }
      if (!bitSet) {
        row.appendChild(el("span", "addr-note", " (bitmap bit not set)"));
        row.classList.add("inconsistent");
      }
    }

    attachEdit(val, row, value, function (nv) {
      ctx.onFieldCommit({ type: "uint32", offset: offset, value: nv });
    }, { maxValue: 0xffffffff });

    container.appendChild(row);
    return row;
  }

  function renderIndirectEntries(container, indirectBlockNum, ctx, fromEl) {
    var parsed = ctx.parsed;
    var entries = FS.readIndirectBlock(parsed.view, indirectBlockNum);
    var list = el("div", "indirect-entries");
    var i;
    for (i = 0; i < entries.length; i++) {
      (function (idx, value) {
        var offset = FS.indirectEntryOffset(indirectBlockNum, idx);
        renderAddrRow(list, "[" + idx + "]", value, offset, ctx, function (targetBlock) {
          ctx.arrows.clear();
          var targetCell = ctx.gridApi.getCellEl("block", targetBlock);
          if (targetCell) ctx.arrows.drawArrow(fromEl, targetCell, {});
          var bitCell = ctx.gridApi.getCellEl("bit", targetBlock);
          var bitSet = FS.getBitmapBit(parsed.view, parsed.superblock, targetBlock);
          if (bitCell) ctx.arrows.drawArrow(targetCell, bitCell, { inconsistent: !bitSet });
        });
      })(i, entries[i]);
    }
    container.appendChild(list);
  }

  function renderDirectoryEntries(container, blockNum, ctx, fromEl) {
    var parsed = ctx.parsed;
    var ents = FS.readDirents(parsed.view, blockNum);

    container.appendChild(el("h4", null, "Directory entries"));
    var btn = el("button", "action-button", "Show entries (draw arrows to all)");
    container.appendChild(btn);
    var list = el("div", "dirent-list");
    container.appendChild(list);

    ents.forEach(function (e) {
      var row = el("div", "field-row dirent-row");
      row.appendChild(el("span", "field-label", "[" + e.slot + "]"));

      var inumSpan = el("span", "field-value", "inum=" + e.inum);
      row.appendChild(inumSpan);
      attachEdit(inumSpan, row, e.inum, function (nv) {
        ctx.onFieldCommit({ type: "uint16", offset: FS.direntFieldOffset(blockNum, e.slot, "inum"), value: nv });
      }, { maxValue: 0xffff });

      var nameSpan = el("span", "field-value", ' name="' + e.name + '"');
      row.appendChild(nameSpan);
      attachEdit(nameSpan, row, e.name, function (nv) {
        ctx.onFieldCommit({ type: "name", offset: FS.direntFieldOffset(blockNum, e.slot, "name"), value: nv });
      }, { isName: true });

      if (e.inum === 0) {
        row.appendChild(el("span", "addr-note", " (empty)"));
      }
      list.appendChild(row);
    });

    btn.addEventListener("click", function () {
      ctx.arrows.clear();
      ents.forEach(function (e) {
        if (e.inum === 0 || e.inum >= parsed.superblock.ninodes) return;
        var inodeCell = ctx.gridApi.getCellEl("inode", e.inum);
        if (inodeCell) ctx.arrows.drawArrow(fromEl, inodeCell, {});
      });
    });
  }

  function renderBootDetails(paneEl) {
    paneEl.appendChild(el("h3", null, "Boot block"));
    paneEl.appendChild(el("p", null, "Block 0. Unused by xv6's file system."));
  }

  function renderSuperblockDetails(paneEl, blockNum, ctx) {
    var parsed = ctx.parsed;
    var sb = parsed.superblock;
    paneEl.appendChild(el("h3", null, "Superblock"));
    ["size", "nblocks", "ninodes", "nlog", "logstart", "inodestart", "bmapstart"].forEach(function (f) {
      fieldRow(paneEl, {
        label: f,
        value: sb[f],
        hex: true,
        maxValue: 0xffffffff,
        onCommit: function (nv) {
          ctx.onFieldCommit({ type: "uint32", offset: FS.superblockFieldOffset(f), value: nv });
        },
      });
    });
    paneEl.appendChild(el("h4", null, "Derived (read-only)"));
    fieldRow(paneEl, { label: "inode blocks", value: parsed.inodeBlocks });
    fieldRow(paneEl, { label: "bitmap blocks", value: parsed.bitmapBlocks });
    fieldRow(paneEl, { label: "data start", value: parsed.datastart });
  }

  function renderLogDetails(paneEl, blockNum, ctx) {
    var log = ctx.parsed.regions.log;
    paneEl.appendChild(el("h3", null, "Log block " + blockNum));
    paneEl.appendChild(
      el("p", null, "Part of the write-ahead log (blocks " + log.start + "–" + (log.end - 1) + "). Not decoded in detail here.")
    );
  }

  function renderIndirectBlockDetails(paneEl, blockNum, ctx) {
    var parsed = ctx.parsed;
    var sb = parsed.superblock;
    var info = ctx.roles.get(blockNum) || {};
    paneEl.appendChild(el("h3", null, "Indirect block " + blockNum));
    if (info.owner !== undefined) {
      paneEl.appendChild(el("p", null, "Owned by inode " + info.owner + "."));
    }

    var fromEl = ctx.gridApi.getCellEl("block", blockNum);
    var bitCell = ctx.gridApi.getCellEl("bit", blockNum);
    var bitSet = FS.getBitmapBit(parsed.view, sb, blockNum);
    if (bitCell) ctx.arrows.drawArrow(fromEl, bitCell, { inconsistent: !bitSet });
    if (info.owner !== undefined) {
      var ownerCell = ctx.gridApi.getCellEl("inode", info.owner);
      if (ownerCell) ctx.arrows.drawArrow(ownerCell, fromEl, {});
    }

    paneEl.appendChild(el("h4", null, "Contents (128 entries)"));
    renderIndirectEntries(paneEl, blockNum, ctx, fromEl);
  }

  function renderDataBlockDetails(paneEl, blockNum, ctx, flavor) {
    var parsed = ctx.parsed;
    var sb = parsed.superblock;
    var info = ctx.roles.get(blockNum) || { role: flavor };
    paneEl.appendChild(el("h3", null, (flavor === "dir" ? "Directory data block " : "Data block ") + blockNum));

    var bit = FS.getBitmapBit(parsed.view, sb, blockNum);
    var owned = info.role === "dir" || info.role === "indirect";
    fieldRow(paneEl, { label: "bitmap bit", value: bit, inconsistent: owned && !bit });

    var fromEl = ctx.gridApi.getCellEl("block", blockNum);
    var bitCell = ctx.gridApi.getCellEl("bit", blockNum);
    if (bitCell) ctx.arrows.drawArrow(fromEl, bitCell, { inconsistent: owned && !bit });

    var hits = FS.searchInodesForBlock(parsed, blockNum);
    var uniqueInodes = Array.from(new Set(hits.map(function (h) { return h.inum; })));
    if (uniqueInodes.length === 0) {
      paneEl.appendChild(el("p", "addr-note", "(no inode currently references this block)"));
    } else {
      hits.forEach(function (hit) {
        var inodeCell = ctx.gridApi.getCellEl("inode", hit.inum);
        if (!inodeCell) return;
        if (hit.kind === "indirect-entry") {
          // Reached only through the inode's indirect block - show the real
          // two-hop chain (inode -> indirect block -> this block) instead of
          // a shortcut arrow that would hide the indirection.
          var ia = parsed.inodes[hit.inum].addrs[FS.NDIRECT];
          var indirectCell = ctx.gridApi.getCellEl("block", ia);
          if (indirectCell) {
            var iaBitSet = FS.getBitmapBit(parsed.view, sb, ia);
            ctx.arrows.drawArrow(inodeCell, indirectCell, { inconsistent: !iaBitSet });
            ctx.arrows.drawArrow(indirectCell, fromEl, {});
            return;
          }
        }
        ctx.arrows.drawArrow(inodeCell, fromEl, {});
      });
      paneEl.appendChild(el("p", null, "Referenced by inode(s): " + uniqueInodes.join(", ")));
    }

    if (flavor === "dir") {
      renderDirectoryEntries(paneEl, blockNum, ctx, fromEl);
    }
  }

  function renderInodeDetails(paneEl, inum, ctx) {
    var parsed = ctx.parsed;
    var sb = parsed.superblock;
    var inode = parsed.inodes[inum];
    var inodeCellEl = ctx.gridApi.getCellEl("inode", inum);

    paneEl.appendChild(el("h3", null, "Inode " + inum + (inode.type === 0 ? " (unallocated)" : "")));

    fieldRow(paneEl, {
      label: "type", value: inode.type, hex: true, typeName: FS.typeName(inode.type), maxValue: 0xffff,
      onCommit: function (nv) { ctx.onFieldCommit({ type: "uint16", offset: FS.inodeFieldOffset(sb, inum, "type"), value: nv }); },
    });
    fieldRow(paneEl, {
      label: "major", value: inode.major, hex: true, maxValue: 0xffff,
      onCommit: function (nv) { ctx.onFieldCommit({ type: "uint16", offset: FS.inodeFieldOffset(sb, inum, "major"), value: nv }); },
    });
    fieldRow(paneEl, {
      label: "minor", value: inode.minor, hex: true, maxValue: 0xffff,
      onCommit: function (nv) { ctx.onFieldCommit({ type: "uint16", offset: FS.inodeFieldOffset(sb, inum, "minor"), value: nv }); },
    });
    fieldRow(paneEl, {
      label: "nlink", value: inode.nlink, hex: true, maxValue: 0xffff,
      onCommit: function (nv) { ctx.onFieldCommit({ type: "uint16", offset: FS.inodeFieldOffset(sb, inum, "nlink"), value: nv }); },
    });
    fieldRow(paneEl, {
      label: "size", value: inode.size, hex: true, maxValue: 0xffffffff,
      onCommit: function (nv) { ctx.onFieldCommit({ type: "uint32", offset: FS.inodeFieldOffset(sb, inum, "size"), value: nv }); },
    });

    paneEl.appendChild(el("h4", null, "Addresses"));

    var i;
    for (i = 0; i < FS.NDIRECT; i++) {
      var val = inode.addrs[i];
      var offset = FS.inodeFieldOffset(sb, inum, "addrs[" + i + "]");
      renderAddrRow(paneEl, "direct[" + i + "]", val, offset, ctx, null);
      if (inodeCellEl && val !== 0 && FS.isValidDataAddress(sb, parsed.datastart, val)) {
        var targetCell = ctx.gridApi.getCellEl("block", val);
        var bitCell = ctx.gridApi.getCellEl("bit", val);
        var bitSet = FS.getBitmapBit(parsed.view, sb, val);
        if (targetCell) ctx.arrows.drawArrow(inodeCellEl, targetCell, {});
        if (bitCell) ctx.arrows.drawArrow(targetCell, bitCell, { inconsistent: !bitSet });
      }
    }

    var ia = inode.addrs[FS.NDIRECT];
    var iaOffset = FS.inodeFieldOffset(sb, inum, "addrs[" + FS.NDIRECT + "]");
    renderAddrRow(paneEl, "indirect", ia, iaOffset, ctx, null);
    if (inodeCellEl && ia !== 0 && FS.isValidDataAddress(sb, parsed.datastart, ia)) {
      var indirectCell = ctx.gridApi.getCellEl("block", ia);
      var indirectBitCell = ctx.gridApi.getCellEl("bit", ia);
      var indirectBitSet = FS.getBitmapBit(parsed.view, sb, ia);
      if (indirectCell) ctx.arrows.drawArrow(inodeCellEl, indirectCell, {});
      if (indirectBitCell) ctx.arrows.drawArrow(indirectCell, indirectBitCell, { inconsistent: !indirectBitSet });

      paneEl.appendChild(el("h4", null, "Indirect block contents"));
      renderIndirectEntries(paneEl, ia, ctx, indirectCell);
    }
  }

  function renderBitDetails(paneEl, blockNum, ctx) {
    var parsed = ctx.parsed;
    var sb = parsed.superblock;
    paneEl.appendChild(el("h3", null, "Bitmap bit for block " + blockNum));
    var bit = FS.getBitmapBit(parsed.view, sb, blockNum);

    fieldRow(paneEl, {
      label: "value", value: bit, maxValue: 1,
      onCommit: function (nv) { ctx.onFieldCommit({ type: "bit", blockNum: blockNum, value: nv ? 1 : 0 }); },
    });

    var info = ctx.roles.get(blockNum) || { role: "data" };
    var bitCellEl = ctx.gridApi.getCellEl("bit", blockNum);
    var hasBlockCell = info.role !== "inode" && info.role !== "bitmap";
    var blockCellEl = hasBlockCell ? ctx.gridApi.getCellEl("block", blockNum) : null;

    if (blockCellEl) {
      ctx.arrows.drawArrow(bitCellEl, blockCellEl, {});
    } else {
      paneEl.appendChild(el("p", "addr-note", "Block " + blockNum + " is part of the " + info.role + " region."));
    }

    var hits = FS.searchInodesForBlock(parsed, blockNum);
    var uniqueInodes = Array.from(new Set(hits.map(function (h) { return h.inum; })));
    if (uniqueInodes.length === 0) {
      paneEl.appendChild(el("p", "addr-note", "(no inode currently references block " + blockNum + ")"));
    } else {
      var origin = blockCellEl || bitCellEl;
      uniqueInodes.forEach(function (inum) {
        var inodeCell = ctx.gridApi.getCellEl("inode", inum);
        if (inodeCell) ctx.arrows.drawArrow(origin, inodeCell, {});
      });
      paneEl.appendChild(el("p", null, "Referenced by inode(s): " + uniqueInodes.join(", ")));
    }
  }

  function renderDetails(paneEl, sel, ctx) {
    paneEl.innerHTML = "";
    if (!sel) {
      paneEl.appendChild(el("p", "placeholder", "Click a block, inode, or bitmap bit to see its details."));
      return;
    }
    if (sel.kind === "inode") {
      renderInodeDetails(paneEl, sel.index, ctx);
      return;
    }
    if (sel.kind === "bit") {
      renderBitDetails(paneEl, sel.index, ctx);
      return;
    }
    if (sel.kind === "block") {
      var role = (ctx.roles.get(sel.index) || { role: "data" }).role;
      if (role === "boot") return renderBootDetails(paneEl);
      if (role === "superblock") return renderSuperblockDetails(paneEl, sel.index, ctx);
      if (role === "log") return renderLogDetails(paneEl, sel.index, ctx);
      if (role === "indirect") return renderIndirectBlockDetails(paneEl, sel.index, ctx);
      if (role === "dir") return renderDataBlockDetails(paneEl, sel.index, ctx, "dir");
      return renderDataBlockDetails(paneEl, sel.index, ctx, "data");
    }
  }

  function selectionToHexFocus(sel, ctx) {
    if (!sel) return null;
    var sb = ctx.parsed.superblock;
    if (sel.kind === "inode") {
      var off = FS.inodeOffset(sb, sel.index);
      return { blockNum: Math.floor(off / FS.BSIZE), highlight: { offset: off, length: 64 } };
    }
    if (sel.kind === "bit") {
      var byteOff = FS.bitmapBitByteOffset(sb, sel.index);
      return { blockNum: Math.floor(byteOff / FS.BSIZE), highlight: { offset: byteOff, length: 1 } };
    }
    if (sel.kind === "block") {
      return { blockNum: sel.index, highlight: null };
    }
    return null;
  }

  FS.renderDetails = renderDetails;
  FS.selectionToHexFocus = selectionToHexFocus;

  global.FS = FS;
})(typeof window !== "undefined" ? window : this);
