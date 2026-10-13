// Shared furniture for the exploration pages on cewillis.com.
//  1. Fills any [data-explorations] element with "Next: <title>" and "All explorations" links.
//  2. Adds a "Link to this chart" control under every <figure id> on the page; it copies
//     the page URL with that figure's #id, and an incoming #id is re-scrolled into place
//     after the charts render.
// Keep LIST in the same order as lab/index.html (newest first). "Next" wraps to the start.
(function () {
  var LIST = [
    { href: "/measles.html", title: "Measles in America" },
    { href: "/Cue/", title: "Cue" },
    { href: "/godzilla-el-nino.html", title: "The 2026 El Niño" },
    { href: "/color-intelligence.html", title: "Palette topology" },
    { href: "/color-ramp.html", title: "Ramp from one color" },
    { href: "/outline-echo.html", title: "Yves Outlines" },
    { href: "/luminet-tribute.html", title: "Luminet’s black hole" }
  ];

  var css = document.createElement("style");
  css.textContent =
    ".explorations-nav{display:flex;flex-wrap:wrap;gap:.35rem 1.5rem;margin:0 0 14px;font-family:var(--font-graphic,inherit);font-size:13px}" +
    ".explorations-nav a{color:inherit}" +
    ".fig-link{display:block;margin:6px 2px 0;padding:0;border:0;background:none;cursor:pointer;" +
      "font-family:var(--font-graphic,inherit);font-size:12px;color:var(--ink-faint,#888);text-decoration:underline;text-underline-offset:2px;text-decoration-thickness:1px}" +
    ".fig-link:hover{color:var(--ink,inherit)}" +
    ".fig-link:focus-visible{outline:2px solid currentColor;outline-offset:2px}";
  document.head.appendChild(css);

  // 1. Next / all explorations
  var here = location.pathname.replace(/index\.html$/, "");
  var i = LIST.findIndex(function (e) { return e.href === here; });
  var next = LIST[(i + 1) % LIST.length];
  document.querySelectorAll("[data-explorations]").forEach(function (el) {
    el.classList.add("explorations-nav");
    el.innerHTML = (i >= 0 ? '<span>Next: <a href="' + next.href + '">' + next.title + "</a> &rarr;</span>" : "") +
      '<a href="/lab/">All explorations</a><a href="/">Chris Willis</a>';
  });

  // 2. Figure links
  document.querySelectorAll("figure[id]").forEach(function (fig) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fig-link";
    btn.textContent = "Link to this chart";
    btn.addEventListener("click", function () {
      var url = location.origin + location.pathname + "#" + fig.id;
      history.replaceState(null, "", "#" + fig.id);
      var done = function () { btn.textContent = "Link copied"; setTimeout(function () { btn.textContent = "Link to this chart"; }, 1600); };
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, done); else done();
    });
    fig.appendChild(btn);
  });
  var target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (target && target.tagName === "FIGURE") {
    // Charts draw after load and push the figure down; settle on it once they have
    window.addEventListener("load", function () { setTimeout(function () { target.scrollIntoView(); }, 600); });
  }
})();
