// Role classification and on-demand search helpers, built on top of fsimage.js.
//
// Important scope note (see plan doc): none of this is a consistency checker.
// classifyBlocks() only picks a *display role* (which color/decoder to use),
// and the search functions only run when a student explicitly asks a
// question ("who references block N?") - nothing here is surfaced passively
// as an owner count or badge on the grid at rest.
(function (global) {
  "use strict";

  var FS = global.FS || {};

  // Returns every valid, in-range data block address an inode uses,
  // expanding the indirect block's contents. Used for role classification
  // and for walking a directory's own dirent blocks.
  function allDataBlocksOfInode(parsed, inode) {
    var view = parsed.view;
    var superblock = parsed.superblock;
    var datastart = parsed.datastart;
    var out = [];
    var i, a, ia, entries, j;

    for (i = 0; i < FS.NDIRECT; i++) {
      a = inode.addrs[i];
      if (a !== 0 && FS.isValidDataAddress(superblock, datastart, a)) out.push(a);
    }
    ia = inode.addrs[FS.NDIRECT];
    if (ia !== 0 && FS.isValidDataAddress(superblock, datastart, ia)) {
      entries = FS.readIndirectBlock(view, ia);
      for (j = 0; j < entries.length; j++) {
        a = entries[j];
        if (a !== 0 && FS.isValidDataAddress(superblock, datastart, a)) out.push(a);
      }
    }
    return out;
  }

  // One pass over all in-use inodes to tag each block with a display role.
  // Returns a Map: blockNum -> { role, owner? }
  // role is one of: 'boot' | 'superblock' | 'log' | 'inode' | 'bitmap' | 'data' | 'dir' | 'indirect'
  function classifyBlocks(parsed) {
    var roles = new Map();
    var regions = parsed.regions;
    var superblock = parsed.superblock;
    var b, i, inode, ia;

    for (b = regions.log.start; b < regions.log.end; b++) roles.set(b, { role: "log" });
    for (b = regions.inodes.start; b < regions.inodes.end; b++) roles.set(b, { role: "inode" });
    for (b = regions.bitmap.start; b < regions.bitmap.end; b++) roles.set(b, { role: "bitmap" });
    for (b = regions.data.start; b < regions.data.end; b++) roles.set(b, { role: "data" });
    // Boot and superblock are fixed by the format (blocks 0 and 1), so set
    // them last: a broken superblock whose other regions overlap them
    // (e.g. inodestart = 0) must not hide the superblock, or it could no
    // longer be selected and edited to repair the image.
    for (b = regions.boot.start; b < regions.boot.end; b++) roles.set(b, { role: "boot" });
    for (b = regions.superblock.start; b < regions.superblock.end; b++) roles.set(b, { role: "superblock" });

    // Indirect blocks first (structural role: "this block is a pointer table").
    for (i = 0; i < parsed.inodes.length; i++) {
      inode = parsed.inodes[i];
      if (inode.type === 0) continue;
      ia = inode.addrs[FS.NDIRECT];
      if (ia !== 0 && FS.isValidDataAddress(superblock, parsed.datastart, ia) && roles.has(ia)) {
        if (roles.get(ia).role === "data") roles.set(ia, { role: "indirect", owner: inode.inum });
      }
    }

    // Directory data blocks (the targets a directory's addrs[] point at,
    // not the indirect table itself, which was already classified above).
    for (i = 0; i < parsed.inodes.length; i++) {
      inode = parsed.inodes[i];
      if (inode.type !== FS.T_DIR) continue;
      var blocks = allDataBlocksOfInode(parsed, inode);
      for (var k = 0; k < blocks.length; k++) {
        var bn = blocks[k];
        if (roles.has(bn) && roles.get(bn).role === "data") {
          roles.set(bn, { role: "dir", owner: inode.inum });
        }
      }
    }

    return roles;
  }

  // Every place some inode's addrs[] (direct or indirect-block contents)
  // equals targetBlock. One entry per occurrence, so a "used more than
  // once" situation shows up as more than one hit.
  function searchInodesForBlock(parsed, targetBlock) {
    var hits = [];
    // An address of 0 means "unused slot", never "points at block 0" -
    // matching on it would report every empty slot of every inode.
    if (targetBlock === 0) return hits;
    var view = parsed.view;
    var superblock = parsed.superblock;
    var i, inode, j, ia, entries;

    for (i = 0; i < parsed.inodes.length; i++) {
      inode = parsed.inodes[i];
      if (inode.type === 0) continue;
      for (j = 0; j < FS.NDIRECT; j++) {
        if (inode.addrs[j] === targetBlock) {
          hits.push({ inum: inode.inum, kind: "direct", slot: j });
        }
      }
      ia = inode.addrs[FS.NDIRECT];
      if (ia === targetBlock) {
        hits.push({ inum: inode.inum, kind: "indirect-block", slot: null });
      }
      if (ia !== 0 && FS.isValidDataAddress(superblock, parsed.datastart, ia)) {
        entries = FS.readIndirectBlock(view, ia);
        for (j = 0; j < entries.length; j++) {
          if (entries[j] === targetBlock) {
            hits.push({ inum: inode.inum, kind: "indirect-entry", slot: j });
          }
        }
      }
    }
    return hits;
  }

  // Every directory dirent (in any in-use directory's data blocks) whose
  // inum equals targetInum. Skips empty (inum == 0) slots.
  function searchDirectoriesForInode(parsed, targetInum) {
    var hits = [];
    var view = parsed.view;
    var i, inode, blocks, k, bn, ents, e;

    for (i = 0; i < parsed.inodes.length; i++) {
      inode = parsed.inodes[i];
      if (inode.type !== FS.T_DIR) continue;
      blocks = allDataBlocksOfInode(parsed, inode);
      for (k = 0; k < blocks.length; k++) {
        bn = blocks[k];
        ents = FS.readDirents(view, bn);
        for (e = 0; e < ents.length; e++) {
          if (ents[e].inum === 0) continue;
          if (ents[e].inum === targetInum) {
            hits.push({ dirInum: inode.inum, block: bn, slot: ents[e].slot, name: ents[e].name });
          }
        }
      }
    }
    return hits;
  }

  var ROOTINO = 1;

  // The directory tree reachable from the root inode, for the tree pane.
  // Follows every directory's entries in on-disk order, skipping empty
  // (inum == 0) slots. "." and ".." are listed (dot: true) but never
  // expanded, since they point back up the tree. Each other directory
  // inode is expanded at most once, so a corrupted image with a directory
  // loop (or a directory listed in two places) can't recurse forever - any
  // later occurrence comes back as a leaf with repeat: true.
  // Node: {name, inum, inRange, type, dot, repeat, children}
  // (type is null when inum is outside [0, ninodes) and there's no inode to read.)
  function buildDirectoryTree(parsed) {
    var view = parsed.view;
    var ninodes = parsed.superblock.ninodes;
    var expanded = new Set();

    function makeNode(name, inum, dot) {
      var node = { name: name, inum: inum, inRange: inum < ninodes, type: null, dot: !!dot, repeat: false, children: [] };
      if (!node.inRange) return node;
      var inode = parsed.inodes[inum];
      node.type = inode.type;
      if (inode.type !== FS.T_DIR || node.dot) return node;
      if (expanded.has(inum)) {
        node.repeat = true;
        return node;
      }
      expanded.add(inum);

      var blocks = allDataBlocksOfInode(parsed, inode);
      var k, e, ents;
      for (k = 0; k < blocks.length; k++) {
        ents = FS.readDirents(view, blocks[k]);
        for (e = 0; e < ents.length; e++) {
          if (ents[e].inum === 0) continue;
          node.children.push(makeNode(ents[e].name, ents[e].inum, ents[e].name === "." || ents[e].name === ".."));
        }
      }
      return node;
    }

    return makeNode("/", ROOTINO);
  }

  FS.ROOTINO = ROOTINO;
  FS.allDataBlocksOfInode = allDataBlocksOfInode;
  FS.classifyBlocks = classifyBlocks;
  FS.searchInodesForBlock = searchInodesForBlock;
  FS.searchDirectoriesForInode = searchDirectoriesForInode;
  FS.buildDirectoryTree = buildDirectoryTree;

  global.FS = FS;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = FS;
  }
})(typeof window !== "undefined" ? window : global);
