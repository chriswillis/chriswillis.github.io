// Theme toggle for cewillis.com. Pair with the inline pre-paint snippet in <head>:
//   <script>try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}</script>
// The button is any .theme-toggle; "d" also toggles when nothing is focused.
(function () {
  var root = document.documentElement;
  var systemDark = window.matchMedia("(prefers-color-scheme: dark)");
  function current() {
    var set = root.getAttribute("data-theme");
    if (set === "light" || set === "dark") return set;
    return systemDark.matches ? "dark" : "light";
  }
  function toggle() {
    var next = current() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch (e) {}
  }
  document.querySelectorAll(".theme-toggle").forEach(function (btn) { btn.addEventListener("click", toggle); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "d" && !e.metaKey && !e.ctrlKey && !e.altKey && document.activeElement === document.body) toggle();
  });
})();
