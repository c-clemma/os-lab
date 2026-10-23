// SVG arrow overlay: draws lines between DOM cells on top of the grid.
(function (global) {
  "use strict";

  var FS = global.FS || {};
  var SVG_NS = "http://www.w3.org/2000/svg";

  function ArrowLayer(containerEl, svgEl) {
    this.container = containerEl; // the positioned ancestor arrows are drawn relative to
    this.svg = svgEl;
    this._ensureMarker();
  }

  ArrowLayer.prototype._ensureMarker = function () {
    var defs = document.createElementNS(SVG_NS, "defs");

    var marker = document.createElementNS(SVG_NS, "marker");
    marker.setAttribute("id", "arrow-head");
    marker.setAttribute("markerWidth", "8");
    marker.setAttribute("markerHeight", "8");
    marker.setAttribute("refX", "6");
    marker.setAttribute("refY", "3");
    marker.setAttribute("orient", "auto");
    marker.setAttribute("markerUnits", "userSpaceOnUse");
    var path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", "M0,0 L6,3 L0,6 Z");
    path.setAttribute("class", "arrow-head-fill");
    marker.appendChild(path);
    defs.appendChild(marker);

    var markerRed = document.createElementNS(SVG_NS, "marker");
    markerRed.setAttribute("id", "arrow-head-inconsistent");
    markerRed.setAttribute("markerWidth", "8");
    markerRed.setAttribute("markerHeight", "8");
    markerRed.setAttribute("refX", "6");
    markerRed.setAttribute("refY", "3");
    markerRed.setAttribute("orient", "auto");
    markerRed.setAttribute("markerUnits", "userSpaceOnUse");
    var path2 = document.createElementNS(SVG_NS, "path");
    path2.setAttribute("d", "M0,0 L6,3 L0,6 Z");
    path2.setAttribute("class", "arrow-head-fill-inconsistent");
    markerRed.appendChild(path2);
    defs.appendChild(markerRed);

    this.svg.appendChild(defs);
  };

  ArrowLayer.prototype.clear = function () {
    var children = Array.prototype.slice.call(this.svg.childNodes);
    for (var i = 0; i < children.length; i++) {
      if (children[i].tagName !== "defs") this.svg.removeChild(children[i]);
    }
    var cells = this.container.querySelectorAll(".inconsistent");
    for (var c = 0; c < cells.length; c++) cells[c].classList.remove("inconsistent");
  };

  ArrowLayer.prototype.resize = function () {
    var rect = this.container.getBoundingClientRect();
    this.svg.setAttribute("width", this.container.scrollWidth);
    this.svg.setAttribute("height", this.container.scrollHeight);
  };

  // Draws a line from the center of fromEl to the center of toEl, both of
  // which must be descendants of this.container. opts.inconsistent draws it
  // in the "something doesn't add up here" red style.
  ArrowLayer.prototype.drawArrow = function (fromEl, toEl, opts) {
    if (!fromEl || !toEl) return;
    opts = opts || {};
    var containerRect = this.container.getBoundingClientRect();
    var fromRect = fromEl.getBoundingClientRect();
    var toRect = toEl.getBoundingClientRect();

    var x1 = fromRect.left + fromRect.width / 2 - containerRect.left + this.container.scrollLeft;
    var y1 = fromRect.top + fromRect.height / 2 - containerRect.top + this.container.scrollTop;
    var x2 = toRect.left + toRect.width / 2 - containerRect.left + this.container.scrollLeft;
    var y2 = toRect.top + toRect.height / 2 - containerRect.top + this.container.scrollTop;

    var line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y2);
    line.setAttribute("class", "arrow-line" + (opts.inconsistent ? " arrow-line-inconsistent" : ""));
    line.setAttribute("marker-end", opts.inconsistent ? "url(#arrow-head-inconsistent)" : "url(#arrow-head)");
    this.svg.appendChild(line);

    if (opts.inconsistent) {
      toEl.classList.add("inconsistent");
    }
  };

  // Marks a single element (e.g. a details-pane field) as inconsistent
  // without drawing an arrow - used for out-of-range addresses, where
  // there's no real target cell to point at.
  ArrowLayer.prototype.markInconsistent = function (el) {
    if (el) el.classList.add("inconsistent");
  };

  FS.ArrowLayer = ArrowLayer;

  global.FS = FS;
})(typeof window !== "undefined" ? window : this);
