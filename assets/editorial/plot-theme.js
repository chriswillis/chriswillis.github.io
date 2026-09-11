/* ============================================================================
 * editorial-graphics · plot-theme.js
 * Observable Plot theme for graphics-desk-style charts. Load after Plot:
 *
 *   load .../plot.umd.min.js, then this file (script tags or ES import);
 *   safe to inline in single-file pages — no literal closing tags inside
 *
 * Then build charts with EGPlot instead of raw Plot.plot:
 *
 *   el.append(EGPlot.plot({
 *     marks: [ Plot.lineY(data, {x: "year", y: "value", stroke: EGPlot.color(0)}) ],
 *     y: {label: "Deaths per 100,000"}
 *   }));
 *
 * Everything reads live CSS variables from tokens.css, so charts restyle
 * themselves when the page's type voice or palette changes.
 * Works as an ES module too: import * as EGPlot from "./plot-theme.js".
 * ========================================================================== */

(function (global, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    global.EGPlot = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---- tokens, read live from the page ---- */
  function cssVar(name, fallback) {
    if (typeof getComputedStyle === "undefined") return fallback;
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    /* collapse newlines/indent that multi-line CSS custom properties keep */
    if (v) v = v.replace(/\s+/g, " ").trim();
    return v || fallback;
  }

  function tokens() {
    return {
      ink: cssVar("--ink", "#121212"),
      inkSoft: cssVar("--ink-soft", "#5a5a5a"),
      inkFaint: cssVar("--ink-faint", "#9a9a94"),
      grid: cssVar("--grid", "#e6e6e0"),
      hair: cssVar("--hair", "#d5d5cd"),
      panel: cssVar("--panel", "#fdfdfb"),
      graphicFont: cssVar("--font-graphic", "Libre Franklin, sans-serif"),
      muted: cssVar("--data-muted", "#c9c9c1"),
      series: [1, 2, 3, 4, 5, 6].map(function (i) {
        return cssVar("--data-" + i, "#326295");
      })
    };
  }

  /* nth series color; color(0) is the house blue */
  function color(i) { return tokens().series[i % 6]; }

  /* categorical range for Plot's color scale */
  function range() { return tokens().series.slice(); }

  /* Highlight one key in a series; everything else recedes to muted gray.
   * Usage: fill: EGPlot.highlight("Neptune")            (uses d.key or d.name)
   *        stroke: EGPlot.highlight("Sweden", {by: "country"})
   * Options: by (field name or accessor fn), color (highlight color). */
  function highlight(key, opts) {
    var t = tokens();
    var o = opts || {};
    var hi = o.color || t.series[0];
    var by = typeof o.by === "function" ? o.by
      : o.by ? function (d) { return d[o.by]; }
      : function (d) {
          if (d == null || typeof d !== "object") return d;
          if ("key" in d) return d.key;
          if ("name" in d) return d.name;
          return d;
        };
    return function (d) { return by(d) === key ? hi : t.muted; };
  }

  /* ---- number formats (graphics-desk abbreviations) ---- */
  function fmtShort(n) {
    var a = Math.abs(n);
    if (a >= 1e9) return trim(n / 1e9) + " billion";
    if (a >= 1e6) return trim(n / 1e6) + " million";
    if (a >= 1e3) return trim(n / 1e3) + "K";
    return String(n);
  }
  function trim(x) {
    var s = x.toFixed(1);
    return s.endsWith(".0") ? s.slice(0, -2) : s;
  }
  function fmtPct(n) { return trim(n) + "%"; }
  function fmtUSD(n) {
    var a = Math.abs(n), sign = n < 0 ? "\u2212" : "";
    if (a >= 1e9) return sign + "$" + trim(a / 1e9) + " billion";
    if (a >= 1e6) return sign + "$" + trim(a / 1e6) + " million";
    return sign + "$" + a.toLocaleString("en-US");
  }

  /* ---- the theme ----------------------------------------------------------
   * Merge house defaults under the caller's options. Conventions encoded:
   *   - graphic sans for every label, sized for captions not posters
   *   - y: horizontal gridlines only, no axis line, no ticks, label at top
   *   - x: hairline baseline, no vertical gridlines
   *   - no implicit legend: label lines and areas directly (see labelLast)
   */
  function plot(options) {
    var t = tokens();
    var o = options || {};

    var defaults = {
      /* generous, consistent breathing room: the unit tick and annotations
       * need headroom, end labels need the right margin, x ticks need the
       * bottom. End-labeled charts should pass marginRight: 60–80. */
      marginTop: 36,
      marginRight: 32,
      marginBottom: 36,
      marginLeft: 46,
      style: {
        background: "transparent",
        color: t.inkSoft,
        fontFamily: t.graphicFont,
        fontSize: "12px",
        fontVariantNumerics: "tabular-nums",
        overflow: "visible"
      },
      x: {
        line: true,          /* hairline baseline */
        grid: false,
        tickSize: 4,
        label: null          /* x is usually self-evident (years, categories) */
      },
      y: {
        grid: true,          /* horizontal rules only */
        line: false,
        tickSize: 0,
        labelArrow: "none",
        labelAnchor: "top",
        nice: true
      },
      color: { range: t.series.slice() },
      grid: false
    };

    var merged = Object.assign({}, defaults, o);
    merged.style = Object.assign({}, defaults.style, o.style || {});
    merged.x = Object.assign({}, defaults.x, o.x || {});
    merged.y = Object.assign({}, defaults.y, o.y || {});
    merged.color = Object.assign({}, defaults.color, o.color || {});

    /* yUnit: "children" — the desk's y-axis. Tick labels move inside the
     * plot: left-anchored at the left edge, haloed, sitting just above
     * their gridline, with the unit appended to the topmost tick
     * ("2,000 arrests" over bare "1,500", "1,000"...). This keeps long
     * labels inside the panel instead of overflowing the left margin. */
    var yUnit = merged.yUnit;
    delete merged.yUnit;
    if (yUnit) {
      merged.y.label = null;
      merged.y.axis = null;                 /* suppress the default axis */
      if (o.marginLeft == null) merged.marginLeft = 12;
      var axisMark = Plot.axisY(Object.assign({
        tickSize: 0,
        dx: 0, dy: -3,
        lineAnchor: "bottom",             /* text bottom sits on the tick */
        textAnchor: "start",
        fill: t.inkSoft,
        textStroke: t.panel, textStrokeWidth: 4
      }, o.yAxisOptions || {}));
      merged.marks = [axisMark].concat(merged.marks || []);
    }

    var node = Plot.plot(merged);

    if (yUnit) {
      var best = null, bestY = Infinity;
      node.querySelectorAll("[aria-label^='y-axis tick label'] text")
        .forEach(function (el) {
          var y = 0;
          var tr = el.getAttribute("transform");
          var m = tr && tr.match(/translate\([^,]+,\s*([-\d.]+)/);
          if (m) y = parseFloat(m[1]);
          else if (el.getAttribute("y")) y = parseFloat(el.getAttribute("y"));
          if (y < bestY) { bestY = y; best = el; }
        });
      if (best) best.textContent = best.textContent + " " + yUnit;
    }

    /* recolor Plot's default axis/grid strokes to the house grays */
    node.querySelectorAll("[aria-label^='y-grid'] line").forEach(function (l) {
      l.setAttribute("stroke", t.grid);
      l.setAttribute("stroke-opacity", "1");
    });
    node.querySelectorAll(
      "[aria-label^='x-axis line'], [aria-label^='x-axis tick'] line"
    ).forEach(function (l) {
      l.setAttribute("stroke", t.hair);
      l.setAttribute("stroke-opacity", "1");
    });
    return node;
  }

  /* ---- annotation marks ----------------------------------------------------
   * annotate(): editorial note inside the chart, haloed so it sits on top of
   * data. Pass [{x, y, text, dx, dy, anchor}] in data coordinates. */
  function annotate(notes, opts) {
    var t = tokens();
    return Plot.text(notes, Object.assign({
      x: "x", y: "y", text: "text",
      dx: function (d) { return d.dx || 0; },
      dy: function (d) { return d.dy || 0; },
      textAnchor: function (d) { return d.anchor || "start"; },
      fill: t.ink,
      stroke: t.panel, strokeWidth: 4,   /* white halo, keeps notes legible */
      fontSize: 12, fontWeight: 600,
      lineWidth: 14, lineHeight: 1.25
    }, opts || {}));
  }

  /* labelLast(): direct series labels at the final point — the house
   * substitute for a legend. data: tidy rows; z: series field. */
  function labelLast(data, opts) {
    var t = tokens();
    var o = opts || {};
    return Plot.text(data, Plot.selectLast(Object.assign({
      z: o.z, x: o.x, y: o.y,
      text: o.z,
      dx: 6, textAnchor: "start",
      fill: o.stroke || t.ink,
      stroke: t.panel, strokeWidth: 4,
      fontSize: 12, fontWeight: 600
    }, o)));
  }

  /* labelFirst(): mirror of labelLast for slope charts and left-edge labels */
  function labelFirst(data, opts) {
    var t = tokens();
    var o = opts || {};
    return Plot.text(data, Plot.selectFirst(Object.assign({
      z: o.z, x: o.x, y: o.y,
      text: o.z,
      dx: -6, textAnchor: "end",
      fill: o.stroke || t.ink,
      stroke: t.panel, strokeWidth: 4,
      fontSize: 12, fontWeight: 600
    }, o)));
  }

  /* divergingColor(): positive -> --data-pos, negative -> --data-neg.
   * Call with a number for one color, or use as an accessor factory:
   *   fill: d => EGPlot.divergingColor(d.change) */
  function divergingColor(v) {
    return v < 0 ? cssVar("--data-neg", "#b04a3c")
                 : cssVar("--data-pos", "#3d7a4f");
  }

  /* arrow(): curved leader from an annotation toward its subject, the
   * desk's pointer when a label can't sit adjacent to its line.
   *   EGPlot.arrow({x: 2013, y: 29.5}, {x: 2012.4, y: 28.6})  (from label, to data) */
  function arrow(from, to, opts) {
    var t = tokens();
    return Plot.arrow([{ x1: from.x, y1: from.y, x2: to.x, y2: to.y }],
      Object.assign({
        x1: "x1", y1: "y1", x2: "x2", y2: "y2",
        bend: 25, headLength: 6,
        stroke: t.ink, strokeWidth: 1
      }, opts || {}));
  }

  /* seriesLabel(): the two-line direct label — bold colored series name over
   * a gray qualifier — that replaces a legend.
   *   EGPlot.seriesLabel([{x, y, name: "Elite", note: "<20% admissions rate",
   *                        color: EGPlot.color(0), dx, dy, anchor}])          */
  function seriesLabel(items, opts) {
    var t = tokens();
    var o = opts || {};
    var base = {
      x: "x", y: "y",
      dx: function (d) { return d.dx || 0; },
      textAnchor: function (d) { return d.anchor || "start"; },
      stroke: t.panel, strokeWidth: 4, fontSize: 12
    };
    return [
      Plot.text(items, Object.assign({}, base, {
        text: "name",
        dy: function (d) { return (d.dy || 0) - 7; },
        fill: function (d) { return d.color || t.series[0]; },
        fontWeight: 700
      }, o)),
      Plot.text(items, Object.assign({}, base, {
        text: "note",
        dy: function (d) { return (d.dy || 0) + 7; },
        fill: t.inkSoft
      }, o))
    ];
  }

  /* refLine(): dashed reference rule with an optional flush-right label */
  function refLine(y, text) {
    var t = tokens();
    var marks = [Plot.ruleY([y], {
      stroke: t.inkSoft, strokeDasharray: "3,3", strokeWidth: 0.8
    })];
    if (text) marks.push(Plot.text([{ y: y, text: text }], {
      y: "y", text: "text",
      frameAnchor: "right", dy: -8, textAnchor: "end",
      fill: t.inkSoft, stroke: t.panel, strokeWidth: 4, fontSize: 11
    }));
    return marks;
  }

  /* ---- figure furniture ----------------------------------------------------
   * caption(): assemble the figcaption a graphics-desk figure carries.
   *   caption(fig, {no: 1, lead: "Bold summary.", body: "...", source, note, credit})
   */
  function caption(figureEl, o) {
    var cap = figureEl.querySelector("figcaption") ||
      figureEl.appendChild(document.createElement("figcaption"));
    var html = "";
    if (o.no != null) html += '<span class="figno">Fig. ' + o.no + "</span> ";
    if (o.lead) html += "<b>" + o.lead + "</b> ";
    if (o.body) html += o.body;
    var small = [];
    if (o.note) small.push("Note: " + o.note);
    if (o.source) small.push("Source: " + o.source);
    if (o.credit) small.push(o.credit);
    if (small.length) html += '<span class="source">' + small.join(" &middot; ") + "</span>";
    cap.innerHTML = html;
    return cap;
  }

  return {
    plot: plot,
    tokens: tokens,
    color: color,
    range: range,
    highlight: highlight,
    annotate: annotate,
    labelLast: labelLast,
    labelFirst: labelFirst,
    divergingColor: divergingColor,
    arrow: arrow,
    seriesLabel: seriesLabel,
    refLine: refLine,
    caption: caption,
    fmtShort: fmtShort,
    fmtPct: fmtPct,
    fmtUSD: fmtUSD
  };
});
