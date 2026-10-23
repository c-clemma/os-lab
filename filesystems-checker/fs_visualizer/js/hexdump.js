// Renders a hex+ASCII dump of one 512-byte block, with an optional
// byte range highlighted (e.g. one inode's 64 bytes within its block).
(function (global) {
  "use strict";

  var FS = global.FS || {};

  function isPrintable(byte) {
    return byte >= 0x20 && byte <= 0x7e;
  }

  function hex2(n) {
    return (n < 16 ? "0" : "") + n.toString(16);
  }

  // bytes: Uint8Array of the whole image.
  // blockNum: which 512-byte block to dump.
  // highlight: optional {offset, length} in *whole-image* byte offsets.
  // Returns a DOM element (a <div class="hexdump">).
  function renderHexDump(bytes, blockNum, highlight) {
    var container = document.createElement("div");
    container.className = "hexdump";

    var blockOff = blockNum * FS.BSIZE;
    var row, addr, i, byte, span, rowOff;
    var bytesPerRow = 16;

    var header = document.createElement("div");
    header.className = "hexdump-header";
    header.textContent = "Block " + blockNum + " (bytes " + blockOff + "–" + (blockOff + FS.BSIZE - 1) + ")";
    container.appendChild(header);

    var pre = document.createElement("div");
    pre.className = "hexdump-body";

    for (rowOff = 0; rowOff < FS.BSIZE; rowOff += bytesPerRow) {
      row = document.createElement("div");
      row.className = "hexdump-row";

      addr = document.createElement("span");
      addr.className = "hexdump-addr";
      addr.textContent = hex4(blockOff + rowOff) + ":";
      row.appendChild(addr);

      var hexPart = document.createElement("span");
      hexPart.className = "hexdump-hex";
      var asciiPart = document.createElement("span");
      asciiPart.className = "hexdump-ascii";

      for (i = 0; i < bytesPerRow; i++) {
        var globalOff = blockOff + rowOff + i;
        byte = bytes[globalOff];
        var isHi = !!highlight && globalOff >= highlight.offset && globalOff < highlight.offset + highlight.length;

        span = document.createElement("span");
        span.className = "byte" + (isHi ? " byte-hi" : "");
        span.textContent = hex2(byte) + " ";
        hexPart.appendChild(span);

        var achar = document.createElement("span");
        achar.className = "byte" + (isHi ? " byte-hi" : "");
        achar.textContent = isPrintable(byte) ? String.fromCharCode(byte) : ".";
        asciiPart.appendChild(achar);
      }

      row.appendChild(hexPart);
      row.appendChild(asciiPart);
      pre.appendChild(row);
    }

    container.appendChild(pre);
    return container;
  }

  function hex4(n) {
    var s = n.toString(16);
    while (s.length < 6) s = "0" + s;
    return s;
  }

  FS.renderHexDump = renderHexDump;

  global.FS = FS;
})(typeof window !== "undefined" ? window : this);
