// Right-pane directory tree (below the details pane), rendered from
// FS.buildDirectoryTree(). Clicking an entry's name selects its inode.
//
// Same scope rule as details.js: only raw facts (name, inode number, type).
// A red box appears only where the tree can't sensibly continue - an inode
// number outside the inode table, an entry naming a free or unknown-type
// inode, or a directory that was already listed (not expanded again).
(function (global) {
  "use strict";

  var FS = global.FS || {};

  function el(tag, className, text) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // Returns the red-box note for a node, or null if there's nothing to flag.
  function problemNote(node) {
    if (!node.inRange) return "(inode number out of range)";
    if (node.type === 0) return "(unallocated inode)";
    if (FS.typeName(node.type) === "unknown") return "(unknown type " + node.type + ")";
    if (node.repeat) return "(directory already listed - not expanded again)";
    return null;
  }

  // container: scrollable element to render into (cleared first).
  // collapsed: Set of node keys the user has collapsed. Owned by the caller
  //   so the collapse state survives the full re-render after an edit.
  // callbacks: {onSelectInode(inum)}
  // Returns an API object: {highlight(sel)}
  function renderDirTree(container, tree, collapsed, callbacks) {
    container.innerHTML = "";
    var rowsByInum = new Map();
    var highlighted = [];

    function renderNode(node, key, parentUl) {
      var li = el("li");
      var row = el("div", "tree-row");
      var expandable = node.type === FS.T_DIR && !node.repeat && node.children.length > 0;

      var toggle = el("span", "tree-toggle", expandable ? "▾" : "");
      row.appendChild(toggle);

      var label = node.name + (node.type === FS.T_DIR && node.name !== "/" && !node.dot ? "/" : "");
      if (node.inRange) {
        var link = el("a", "tree-link", label);
        link.href = "#";
        link.title = "Go to inode " + node.inum;
        link.addEventListener("click", function (e) {
          e.preventDefault();
          if (callbacks && callbacks.onSelectInode) callbacks.onSelectInode(node.inum);
        });
        row.appendChild(link);
      } else {
        row.appendChild(el("span", "tree-name", label));
      }
      row.appendChild(el("span", "tree-inum", "  inode " + node.inum + (node.type === FS.T_DEV ? ", device" : "")));

      var problem = problemNote(node);
      if (problem) {
        row.classList.add("inconsistent");
        row.appendChild(el("span", "addr-note", " " + problem));
      }

      li.appendChild(row);
      if (!rowsByInum.has(node.inum)) rowsByInum.set(node.inum, []);
      rowsByInum.get(node.inum).push(row);

      if (expandable) {
        var ul = el("ul");
        node.children.forEach(function (child, idx) {
          renderNode(child, key + "/" + idx, ul);
        });
        li.appendChild(ul);

        function setCollapsed(c) {
          li.classList.toggle("collapsed", c);
          toggle.textContent = c ? "▸" : "▾";
        }
        setCollapsed(collapsed.has(key));
        toggle.addEventListener("click", function () {
          var c = !collapsed.has(key);
          if (c) collapsed.add(key);
          else collapsed.delete(key);
          setCollapsed(c);
        });
      }
      parentUl.appendChild(li);
    }

    var rootUl = el("ul", "dir-tree-root");
    renderNode(tree, "root", rootUl);
    container.appendChild(rootUl);

    // Scrolls only the tree container. (Deliberately not scrollIntoView():
    // that can interrupt the grid's smooth scroll when both happen on one
    // selection.)
    function scrollRowIntoView(row) {
      if (!row.offsetParent) return; // hidden inside a collapsed directory
      var c = container.getBoundingClientRect();
      var r = row.getBoundingClientRect();
      if (r.top < c.top) container.scrollTop -= c.top - r.top;
      else if (r.bottom > c.bottom) container.scrollTop += r.bottom - c.bottom;
    }

    function highlight(sel) {
      highlighted.forEach(function (row) {
        row.classList.remove("selected");
      });
      highlighted = [];
      if (!sel || sel.kind !== "inode") return;
      highlighted = rowsByInum.get(sel.index) || [];
      highlighted.forEach(function (row) {
        row.classList.add("selected");
      });
      if (highlighted.length) scrollRowIntoView(highlighted[0]);
    }

    return { highlight: highlight };
  }

  FS.renderDirTree = renderDirTree;

  global.FS = FS;
})(typeof window !== "undefined" ? window : this);
