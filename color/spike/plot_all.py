"""Cross-system figures from out/all-systems.json. Run: python3 spike/plot_all.py"""
import json
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D

D = json.load(open("out/all-systems.json"))
S = D["systems"]; GRID = np.array(D["grid"]); FOCUS = D["focus"]
OUT = "out/"
INK, INK2, MUTED, GRID_C, SURF = "#1f1f1f", "#4a4a4a", "#8a8a8a", "#e6e6e3", "#fcfcfb"
HUE_COLOR = {"blue": "#155dfc", "yellow": "#a65f00", "green": "#00a63e"}
MARK = {"blue": "o", "yellow": "s", "green": "^"}
plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 9.5, "axes.edgecolor": GRID_C, "axes.labelcolor": INK2,
    "xtick.color": INK2, "ytick.color": INK2, "axes.titlecolor": INK, "axes.titleweight": "bold", "axes.titlesize": 10,
    "axes.grid": True, "grid.color": GRID_C, "grid.linewidth": 0.7, "axes.spines.top": False, "axes.spines.right": False,
    "figure.facecolor": SURF, "axes.facecolor": SURF, "legend.frameon": False, "savefig.dpi": 170, "savefig.facecolor": SURF,
})
ORDER = ["opencolor", "openprops", "tailwind", "tailwind-v4", "material", "spectrum", "primer", "polaris", "carbon", "atlassian", "webawesome", "radix-light", "radix-dark"]

# ═══════════════════════════════════════════════════════════════════════════
# Fig 6a/6b — curves per system: L, absolute C, relC (sRGB cusp), Δh from peak-chroma step
# ═══════════════════════════════════════════════════════════════════════════
COLS = [("L", "L (OKLab)", (0.0, 1.0)), ("absC", "absolute chroma C", (0.0, 0.32)), ("relC", "relC vs sRGB cusp", (0.0, 1.3)), ("dh", "Δh from peak-chroma step (°)", (-45, 30))]
def draw_grid(ids, fname, title):
    fig, axes = plt.subplots(len(ids), 4, figsize=(14, 2.05 * len(ids) + 0.9), sharex=True)
    for r, sid in enumerate(ids):
        s = S[sid]
        fams = s["families"]
        for c, (key, lab, ylim) in enumerate(COLS):
            ax = axes[r][c]
            mu = np.array(s["mean"][key]); sd = np.array(s["sd"][key])
            ax.fill_between(GRID, mu - sd, mu + sd, color="#000000", alpha=0.07, lw=0, zorder=1)
            for f in fams:
                ax.plot(GRID, s["curves"][f][key], color="#000000", alpha=0.13, lw=0.9, zorder=2)
            ax.plot(GRID, mu, color=INK2, lw=1.5, zorder=3)
            for f in FOCUS:
                if f in s["curves"]:
                    ax.plot(GRID, s["curves"][f][key], color=HUE_COLOR[f], lw=1.6, zorder=4)
            if key == "relC": ax.axhline(1.0, color=MUTED, lw=0.9, ls=(0, (2, 3)), zorder=0)
            if key == "dh": ax.axhline(0, color=MUTED, lw=0.9, zorder=0)
            ax.set_ylim(*ylim); ax.set_xlim(0, 1)
            ax.tick_params(labelsize=8)
            if r == 0: ax.set_title(lab, loc="left", color=INK2, fontweight="normal", fontsize=9.5)
            if r == len(ids) - 1: ax.set_xlabel("normalized step n", fontsize=8.5)
            if c == 0:
                keys = s["keys"]
                sub = f'{len(fams)} hues · {"/".join(map(str, s["stepCounts"]))} steps' + (f' ({keys[0]}–{keys[-1]})' if keys else "")
                ax.text(0.02, 0.06, f'{s["name"]}\n{sub}', transform=ax.transAxes, fontsize=9, fontweight="bold", color=INK, va="bottom")
            if c == 2:
                t = s["transfer"]
                ax.text(0.02, 0.06, f'w̄={np.mean(t["w"]):.2f} ({t["wLabel"]})\nrelC err {t["relC"]["mean"]:.3f} · hybrid {t["hybrid"]["mean"]:.3f} ({t["hybrid"]["withinJnd"]*100:.0f}% ≤ JND)', transform=ax.transAxes, fontsize=7.5, color=INK2, va="bottom")
            if c == 3:
                ax.text(0.98, 0.06, f'range mean {s["hueDrift"]["meanRange"]:.0f}° · max {s["hueDrift"]["maxRange"]:.0f}° ({s["hueDrift"]["maxRangeFamily"]})', transform=ax.transAxes, fontsize=7.5, color=INK2, va="bottom", ha="right")
    handles = [Line2D([], [], color=HUE_COLOR[f], lw=1.6, label=f) for f in FOCUS] + [Line2D([], [], color=INK2, lw=1.5, label="mean across hues"), Line2D([], [], color="#000000", alpha=0.2, lw=0.9, label="each hue family")]
    fig.legend(handles=handles, loc="upper right", ncol=5, fontsize=8.5, bbox_to_anchor=(0.99, 0.995))
    fig.suptitle(title, x=0.01, ha="left", fontsize=12, fontweight="bold", color=INK)
    fig.tight_layout(rect=(0, 0, 1, 0.975))
    fig.savefig(OUT + fname); plt.close(fig)

draw_grid(ORDER[:7], "fig6a_all_systems_curves.png", "Fig 6a · Extracted curves per system (1 of 2) — light → dark; band = mean ± SD across hue families")
draw_grid(ORDER[7:], "fig6b_all_systems_curves.png", "Fig 6b · Extracted curves per system (2 of 2) — Radix dark runs dark → light by design")

# ═══════════════════════════════════════════════════════════════════════════
# Fig 7 — chroma philosophy: w(n) per system, and transfer error by normalization
# ═══════════════════════════════════════════════════════════════════════════
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5.8), gridspec_kw={"width_ratios": [1.25, 1]})
# heatmap of w(n): rows = systems sorted by mean w, columns = 21-point n grid (resampled)
rows = sorted(ORDER, key=lambda k: -np.mean(S[k]["transfer"]["w"]))
NG = 21; xs = np.linspace(0, 1, NG)
M = np.array([np.interp(xs, np.linspace(0, 1, len(S[k]["transfer"]["w"])), S[k]["transfer"]["w"]) for k in rows])
im = ax1.imshow(M, aspect="auto", cmap="Blues", vmin=0, vmax=1, interpolation="nearest")
ax1.set_yticks(range(len(rows))); ax1.set_yticklabels([f'{S[k]["name"]}   w̄ {np.mean(S[k]["transfer"]["w"]):.2f}' for k in rows], fontsize=8.5)
ax1.set_xticks([0, 5, 10, 15, 20]); ax1.set_xticklabels(["0 (lightest)", "0.25", "0.5", "0.75", "1 (darkest)"], fontsize=8)
ax1.set_xlabel("normalized step n"); ax1.grid(False)
for i in range(len(rows)):
    for j in range(NG):
        v = M[i, j]
        ax1.text(j, i, f"{v:.1f}"[1:] if v < 1 else "1", ha="center", va="center", fontsize=5.5, color="#ffffff" if v > 0.6 else INK2)
for sp in ax1.spines.values(): sp.set_visible(False)
cb = fig.colorbar(im, ax=ax1, fraction=0.025, pad=0.02); cb.set_label("w — 0 = absolute chroma transfers best, 1 = relative chroma (sRGB cusp) transfers best", fontsize=8); cb.ax.tick_params(labelsize=7)
ax1.set_title("Blend weight that minimizes cross-hue transfer error, per step", loc="left")

names = [S[k]["name"] for k in ORDER]
y = np.arange(len(ORDER))
for off, key, col, lab in [(-0.27, "absC", "#8a8a8a", "absolute chroma"), (0.0, "relC", "#155dfc", "relative chroma (sRGB cusp)"), (0.27, "hybrid", "#1f1f1f", "hybrid w(n)")]:
    vals = [S[k]["transfer"][key]["withinJnd"] * 100 for k in ORDER]
    ax2.barh(y + off, vals, height=0.25, color=col, label=lab, zorder=3)
    for yi, v in zip(y + off, vals): ax2.text(v + 0.8, yi, f"{v:.0f}", va="center", fontsize=7, color=col)
ax2.set_yticks(y); ax2.set_yticklabels(names, fontsize=8.5); ax2.invert_yaxis()
ax2.set_xlim(0, 100); ax2.set_xlabel("% of cross-hue transfers within 1 JND (ΔEOK 0.02)"); ax2.grid(axis="y", visible=False)
ax2.legend(loc="upper center", fontsize=8, ncol=3, bbox_to_anchor=(0.5, -0.1))
ax2.set_title("Kinship: how well one hue's curve predicts another's", loc="left")
fig.suptitle("Fig 7 · Chroma philosophy across systems", x=0.01, ha="left", fontsize=12, fontweight="bold", color=INK)
fig.tight_layout(rect=(0, 0, 1, 0.95))
fig.savefig(OUT + "fig7_chroma_philosophy.png", bbox_inches="tight"); plt.close(fig)

# ═══════════════════════════════════════════════════════════════════════════
# Fig 8 — contrast per step vs white (min–max across hues): is the numbering contrast-bearing?
# ═══════════════════════════════════════════════════════════════════════════
ids = [k for k in ORDER if S[k]["keys"]]
fig, axes = plt.subplots(2, 7, figsize=(15.5, 5.6), sharey=True)
axes = axes.flatten()
for ax, sid in zip(axes, ids):
    s = S[sid]; c = s["contrast"]; x = np.arange(len(s["keys"]))
    lo = np.array(c["perStepMinWhite"]); hi = np.array(c["perStepMaxWhite"])
    cb = c["numbering"].startswith("contrast")
    ax.fill_between(x, lo, hi, color="#155dfc" if cb else "#8a8a8a", alpha=0.35, lw=0, zorder=2)
    ax.plot(x, lo, color="#155dfc" if cb else "#8a8a8a", lw=1); ax.plot(x, hi, color="#155dfc" if cb else "#8a8a8a", lw=1)
    ax.axhline(4.5, color="#a65f00", lw=0.9, ls=(0, (2, 3))); ax.axhline(3.0, color="#a65f00", lw=0.9, ls=(0, (1, 3)))
    ax.set_yscale("log"); ax.set_ylim(1, 21); ax.set_yticks([1, 1.5, 2, 3, 4.5, 7, 10, 15, 21]); ax.set_yticklabels(["1", "1.5", "2", "3", "4.5", "7", "10", "15", "21"], fontsize=7)
    ax.set_xticks(x); ax.set_xticklabels(s["keys"], fontsize=6, rotation=90)
    ax.set_title(f'{s["name"]}\nσ(log CR) {c["invariance"]:.2f} · {"contrast-bearing" if cb else "nominal"}', loc="left", fontsize=7.5)
    if c["first45"]: ax.annotate(f'4.5:1 ∀ hues\nfrom {c["first45"]}', (c["first45Idx"], 4.5), xytext=(0, -36), textcoords="offset points", fontsize=6.5, color="#a65f00", ha="center", arrowprops=dict(arrowstyle="-", color="#a65f00", lw=0.7))
    if sid == "radix-dark": ax.text(0.5, 0.04, "vs own step 1", transform=ax.transAxes, fontsize=6.5, color=INK2, ha="center")
for ax in axes[len(ids):]: ax.axis("off")
axes[0].set_ylabel("WCAG 2.1 contrast vs white (log)"); axes[7].set_ylabel("WCAG 2.1 contrast vs white (log)")
fig.suptitle("Fig 8 · Contrast per step across all hues (band = min–max). A thin band means the step number carries a contrast promise.", x=0.01, ha="left", fontsize=12, fontweight="bold", color=INK)
fig.tight_layout(rect=(0, 0, 1, 0.94)); fig.savefig(OUT + "fig8_contrast_invariance.png"); plt.close(fig)
print("wrote fig6a, fig6b, fig7, fig8")
