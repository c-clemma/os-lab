// Parsing and byte-level read/write helpers for xv6 file system images.
// Layout reference: from_book/filesystems-checker/xcheck.h
//
// No ES modules on purpose (see plan doc): everything attaches to window.FS
// so the page keeps working when opened directly via a file:// URL.
(function (global) {
  "use strict";

  var FS = global.FS || {};

  var BSIZE = 512;
  var DIRSIZ = 14;
  var DINODE_SIZE = 64; // 4*u16 + u32 + 13*u32
  var DIRENT_SIZE = 16; // u16 + 14 bytes
  var NDIRECT = 12;
  var NADDRS = NDIRECT + 1; // + 1 indirect

  var T_DIR = 1;
  var T_FILE = 2;
  var T_DEV = 3;
  var TYPE_NAMES = { 0: "unallocated", 1: "T_DIR", 2: "T_FILE", 3: "T_DEV" };

  function typeName(type) {
    return TYPE_NAMES.hasOwnProperty(type) ? TYPE_NAMES[type] : "unknown";
  }

  // ---- geometry ----

  function inodesPerBlock() {
    return Math.floor(BSIZE / DINODE_SIZE); // 8
  }

  function direntsPerBlock() {
    return Math.floor(BSIZE / DIRENT_SIZE); // 32
  }

  function addrsPerIndirectBlock() {
    return Math.floor(BSIZE / 4); // 128
  }

  function bitsPerBitmapBlock() {
    return BSIZE * 8; // 4096
  }

  function readSuperblock(view) {
    var off = 1 * BSIZE;
    return {
      size: view.getUint32(off + 0, true),
      nblocks: view.getUint32(off + 4, true),
      ninodes: view.getUint32(off + 8, true),
      nlog: view.getUint32(off + 12, true),
      logstart: view.getUint32(off + 16, true),
      inodestart: view.getUint32(off + 20, true),
      bmapstart: view.getUint32(off + 24, true),
    };
  }

  var SB_FIELD_OFFSETS = {
    size: 0,
    nblocks: 4,
    ninodes: 8,
    nlog: 12,
    logstart: 16,
    inodestart: 20,
    bmapstart: 24,
  };

  function superblockFieldOffset(field) {
    if (!SB_FIELD_OFFSETS.hasOwnProperty(field)) return -1;
    return 1 * BSIZE + SB_FIELD_OFFSETS[field];
  }

  function deriveGeometry(superblock) {
    var inodeBlocks = Math.ceil(superblock.ninodes / inodesPerBlock());
    var bitmapBlocks = Math.ceil(superblock.size / bitsPerBitmapBlock());
    var datastart = superblock.bmapstart + bitmapBlocks;
    return {
      inodeBlocks: inodeBlocks,
      bitmapBlocks: bitmapBlocks,
      datastart: datastart,
      regions: {
        boot: { start: 0, end: 1 },
        superblock: { start: 1, end: 2 },
        log: { start: superblock.logstart, end: superblock.logstart + superblock.nlog },
        inodes: { start: superblock.inodestart, end: superblock.inodestart + inodeBlocks },
        bitmap: { start: superblock.bmapstart, end: superblock.bmapstart + bitmapBlocks },
        data: { start: datastart, end: superblock.size },
      },
    };
  }

  // Is blockNum a real block index anywhere in the image (metadata or data)?
  // Use this for bounds-safety (e.g. indexing the bitmap), not for deciding
  // whether an inode's address is a legitimate data pointer - see
  // isValidDataAddress for that.
  function isValidBlock(superblock, blockNum) {
    return (
      typeof blockNum === "number" &&
      isFinite(blockNum) &&
      Math.floor(blockNum) === blockNum &&
      blockNum >= 0 &&
      blockNum < superblock.size
    );
  }

  // Is blockNum a legitimate target for an inode's direct/indirect address,
  // i.e. a block inside the data region? A number like BMAPSTART is
  // in-bounds (isValidBlock true) but is metadata, not data - the real
  // xv6 checker (and this tool's "out of range" red-box) needs this
  // narrower check, not just "somewhere in the image". datastart must come
  // from the same parsed image (parsed.datastart).
  function isValidDataAddress(superblock, datastart, blockNum) {
    return isValidBlock(superblock, blockNum) && blockNum >= datastart;
  }

  function inodeOffset(superblock, inum) {
    return superblock.inodestart * BSIZE + inum * DINODE_SIZE;
  }

  function readInode(view, superblock, inum) {
    var off = inodeOffset(superblock, inum);
    var type = view.getUint16(off + 0, true);
    var major = view.getUint16(off + 2, true);
    var minor = view.getUint16(off + 4, true);
    var nlink = view.getUint16(off + 6, true);
    var size = view.getUint32(off + 8, true);
    var addrs = [];
    var i;
    for (i = 0; i < NADDRS; i++) {
      addrs.push(view.getUint32(off + 12 + i * 4, true));
    }
    return {
      inum: inum,
      offset: off,
      type: type,
      major: major,
      minor: minor,
      nlink: nlink,
      size: size,
      addrs: addrs,
    };
  }

  function inodeFieldOffset(superblock, inum, field) {
    var base = inodeOffset(superblock, inum);
    switch (field) {
      case "type":
        return base + 0;
      case "major":
        return base + 2;
      case "minor":
        return base + 4;
      case "nlink":
        return base + 6;
      case "size":
        return base + 8;
      default:
        if (/^addrs\[(\d+)\]$/.test(field)) {
          var idx = parseInt(field.match(/^addrs\[(\d+)\]$/)[1], 10);
          return base + 12 + idx * 4;
        }
        return -1;
    }
  }

  function getBitmapBit(view, superblock, blockNum) {
    var byteIndex = Math.floor(blockNum / 8);
    var bitIndex = blockNum % 8;
    var byteOff = superblock.bmapstart * BSIZE + byteIndex;
    var byte = view.getUint8(byteOff);
    return (byte >> bitIndex) & 1;
  }

  function bitmapBitByteOffset(superblock, blockNum) {
    var byteIndex = Math.floor(blockNum / 8);
    return superblock.bmapstart * BSIZE + byteIndex;
  }

  function readIndirectBlock(view, blockNum) {
    var n = addrsPerIndirectBlock();
    var off = blockNum * BSIZE;
    var addrs = [];
    var i;
    for (i = 0; i < n; i++) {
      addrs.push(view.getUint32(off + i * 4, true));
    }
    return addrs;
  }

  function indirectEntryOffset(blockNum, index) {
    return blockNum * BSIZE + index * 4;
  }

  function readDirents(view, blockNum) {
    var n = direntsPerBlock();
    var off = blockNum * BSIZE;
    var ents = [];
    var i, c, eoff, inum, name, ch;
    for (i = 0; i < n; i++) {
      eoff = off + i * DIRENT_SIZE;
      inum = view.getUint16(eoff, true);
      name = "";
      for (c = 0; c < DIRSIZ; c++) {
        ch = view.getUint8(eoff + 2 + c);
        if (ch === 0) break;
        name += String.fromCharCode(ch);
      }
      ents.push({ slot: i, blockNum: blockNum, offset: eoff, inum: inum, name: name });
    }
    return ents;
  }

  function direntFieldOffset(blockNum, slot, field) {
    var eoff = blockNum * BSIZE + slot * DIRENT_SIZE;
    if (field === "inum") return eoff;
    if (field === "name") return eoff + 2;
    return -1;
  }

  // ---- top-level parse ----

  function parseImage(buffer) {
    var view = new DataView(buffer);
    var bytes = new Uint8Array(buffer);
    var superblock = readSuperblock(view);
    var geometry = deriveGeometry(superblock);

    var inodes = [];
    var i;
    for (i = 0; i < superblock.ninodes; i++) {
      inodes.push(readInode(view, superblock, i));
    }

    return {
      buffer: buffer,
      view: view,
      bytes: bytes,
      superblock: superblock,
      regions: geometry.regions,
      inodeBlocks: geometry.inodeBlocks,
      bitmapBlocks: geometry.bitmapBlocks,
      datastart: geometry.datastart,
      inodes: inodes,
    };
  }

  // ---- writers (mirror the readers exactly) ----

  function writeUint16(view, off, val) {
    view.setUint16(off, val & 0xffff, true);
  }

  function writeUint32(view, off, val) {
    view.setUint32(off, val >>> 0, true);
  }

  function writeBitmapBit(view, superblock, blockNum, bitVal) {
    var byteOff = bitmapBitByteOffset(superblock, blockNum);
    var bitIndex = blockNum % 8;
    var b = view.getUint8(byteOff);
    if (bitVal) {
      b |= 1 << bitIndex;
    } else {
      b &= ~(1 << bitIndex) & 0xff;
    }
    view.setUint8(byteOff, b);
  }

  function writeName(view, off, str) {
    var c;
    for (c = 0; c < DIRSIZ; c++) {
      view.setUint8(off + c, c < str.length ? str.charCodeAt(c) & 0xff : 0);
    }
  }

  // Accepts "123" or "0x7b" (any case); returns NaN if unparsable.
  function parseIntFlexible(str) {
    if (typeof str !== "string") return NaN;
    var s = str.trim();
    if (s === "") return NaN;
    if (/^0x[0-9a-f]+$/i.test(s)) return parseInt(s, 16);
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);
    return NaN;
  }

  FS.BSIZE = BSIZE;
  FS.DIRSIZ = DIRSIZ;
  FS.NDIRECT = NDIRECT;
  FS.NADDRS = NADDRS;
  FS.T_DIR = T_DIR;
  FS.T_FILE = T_FILE;
  FS.T_DEV = T_DEV;
  FS.typeName = typeName;

  FS.inodesPerBlock = inodesPerBlock;
  FS.direntsPerBlock = direntsPerBlock;
  FS.addrsPerIndirectBlock = addrsPerIndirectBlock;
  FS.bitsPerBitmapBlock = bitsPerBitmapBlock;

  FS.readSuperblock = readSuperblock;
  FS.superblockFieldOffset = superblockFieldOffset;
  FS.deriveGeometry = deriveGeometry;
  FS.isValidBlock = isValidBlock;
  FS.isValidDataAddress = isValidDataAddress;
  FS.inodeOffset = inodeOffset;
  FS.readInode = readInode;
  FS.inodeFieldOffset = inodeFieldOffset;
  FS.getBitmapBit = getBitmapBit;
  FS.bitmapBitByteOffset = bitmapBitByteOffset;
  FS.readIndirectBlock = readIndirectBlock;
  FS.indirectEntryOffset = indirectEntryOffset;
  FS.readDirents = readDirents;
  FS.direntFieldOffset = direntFieldOffset;
  FS.parseImage = parseImage;

  FS.writeUint16 = writeUint16;
  FS.writeUint32 = writeUint32;
  FS.writeBitmapBit = writeBitmapBit;
  FS.writeName = writeName;
  FS.parseIntFlexible = parseIntFlexible;

  global.FS = FS;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = FS;
  }
})(typeof window !== "undefined" ? window : global);
