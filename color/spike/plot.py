"""Phase 0 plots from out/phase0.json. Run: python3 spike/plot.py"""
import json, math
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D

D = json.load(open("out/phase0.json"))
OUT = "out/"

# ── style: recessive grid/axes, text in ink tokens, series colored by their own hue ──
INK, INK2, MUTED, GRID = "#1f1f1f", "#4a4a4a", "#8a8a8a", "#e6e6e3"
SURF = "#fcfcfb"
HUE_COLOR = {"blue": "#155dfc", "yellow": "#a65f00", "green": "#00a63e"}  # TW blue-600 / yellow-700 / green-600
MARK = {"blue": "o", "yellow": "s", "green": "^"}
SYS_STYLE = {"tailwind-v4": "-", "radix-light": "--", "radix-dark": ":"}
SYS_LABEL = {"tailwind-v4": "Tailwind v4", "radix-light": "Radix (light)", "radix-dark": "Radix (dark)"}
FOCUS = ["blue", "yellow", "green"]
plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 10, "axes.edgecolor": GRID, "axes.labelcolor": INK2,
    "xtick.color": INK2, "ytick.color": INK2, "axes.titlecolor": INK, "axes.titleweight": "bold",
    "axes.titlesize": 11, "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.8,
    "axes.spines.top": False, "axes.spines.right": False, "figure.facecolor": SURF, "axes.facecolor": SURF,
    "legend.frameon": False, "savefig.dpi": 180, "savefig.facecolor": SURF,
})

def steps(sys, fam):
    return D["dna"][sys][fam]["steps"]

def label_end(ax, x, y, text, color, dx=0.012):
    ax.annotate(text, (x, y), xytext=(6, 0), textcoords="offset points", va="center", ha="left", fontsize=9, color=color, fontweight="bold")

def label_ends(ax, items, min_gap):
    """items: list of (x, y, text, color). Pushes labels apart vertically by min_gap (data units)."""
    items = sorted(items, key=lambda t: t[1])
    ys = [t[1] for t in items]
    for i in range(1, len(ys)):
        if ys[i] - ys[i - 1] < min_gap: ys[i] = ys[i - 1] + min_gap
    # re-center around the original mean so the group doesn't drift
    shift = (sum(t[1] for t in items) - sum(ys)) / len(ys)
    for (x, y0, text, color), y in zip(items, ys):
        ax.annotate(text, (x, y0), xytext=(6, (y + shift - y0) * 0), textcoords="offset points", va="center", ha="left", fontsize=9, color=color, fontweight="bold") if False else None
        ax.annotate(text, (x, y + shift), xytext=(6, 0), textcoords="offset points", va="center", ha="left", fontsize=9, color=color, fontweight="bold")

# ═══════════════════════════════════════════════════════════════════════════
# Fig 1 — the three DNA curves, both systems, three hues
# ═══════════════════════════════════════════════════════════════════════════
fig, axes = plt.subplots(2, 3, figsize=(13.5, 7.4), sharex=True)
pending = {}
for r, sys in enumerate(["tailwind-v4", "radix-light"]):
    for fam in FOCUS:
        S = steps(sys, fam)
        n = [s["n"] for s in S]
        c = HUE_COLOR[fam]; m = MARK[fam]
        anchor = D["dna"][sys][fam]["anchorIndex"]
        for col, key, ylab in [(0, "L", "L (OKLab)"), (1, None, "relC vs sRGB cusp"), (2, "dhAnchor", "Δh from anchor (°)")]:
            ax = axes[r][col]
            y = [s["relC"]["srgb"] for s in S] if key is None else [s[key] for s in S]
            ax.plot(n, y, SYS_STYLE[sys], color=c, lw=2, marker=m, ms=5.5, mfc=SURF, mew=1.6, zorder=3)
            ax.plot([n[anchor]], [y[anchor]], marker=m, ms=9, color=c, zorder=4)
            pending.setdefault((r, col), []).append((n[-1], y[-1], fam, c))
            if r == 1: ax.set_xlabel("normalized step n (index / (N−1))")
            if col == 1: ax.axhline(1.0, color=MUTED, lw=1, ls=(0, (2, 3)), zorder=1)
            if col == 2: ax.axhline(0, color=MUTED, lw=1, zorder=1)
            if r == 0: ax.set_title(ylab, loc="right", color=INK2, fontweight="normal")
            ax.set_xlim(-0.02, 1.16)
    # step labels along the top of the first panel of each row
    keys = [s["key"] for s in steps(sys, FOCUS[0])]
    ax = axes[r][0]
    ax.set_title(SYS_LABEL[sys], loc="left", fontsize=12)
    ax2 = axes[r][2].twiny(); ax2.set_xlim(axes[r][2].get_xlim()); ax2.set_xticks([s["n"] for s in steps(sys, FOCUS[0])]); ax2.set_xticklabels(keys, fontsize=7.5, color=MUTED); ax2.grid(False); ax2.spines["top"].set_visible(False); ax2.tick_params(length=0)
for (r, col), items in pending.items():
    gap = {0: 0.045, 1: 0.07, 2: 3.6}[col]
    label_ends(axes[r][col], items, gap)
axes[0][1].set_ylim(0, 1.25); axes[1][1].set_ylim(0, 1.25)
axes[0][0].set_ylim(0.2, 1.02); axes[1][0].set_ylim(0.2, 1.02)
axes[0][2].set_ylim(-40, 25); axes[1][2].set_ylim(-40, 25)
# annotations for the findings
axes[1][0].annotate("yellow 8→9: L rises\n(Radix “bright” solid)", xy=(8/11, 0.918), xytext=(0.30, 0.42), fontsize=8.5, color=INK2, arrowprops=dict(arrowstyle="-", color=MUTED, lw=1))
axes[0][1].annotate("rides the shell\n(≈1.0–1.1 → outside sRGB, inside P3)", xy=(0.5, 1.13), xytext=(0.02, 0.28), fontsize=8.5, color=INK2, arrowprops=dict(arrowstyle="-", color=MUTED, lw=1))
axes[1][1].annotate("green tints held at\n~0.3 of the shell", xy=(4/11, 0.29), xytext=(0.05, 0.10), fontsize=8.5, color=INK2, arrowprops=dict(arrowstyle="-", color=MUTED, lw=1))
axes[0][2].annotate("yellow drifts 49°\ntoward orange as it darkens", xy=(1.0, -32), xytext=(0.42, -36), fontsize=8.5, color=INK2, ha="right")
axes[1][2].annotate("blue tints swing 17°\ntoward cyan, then back", xy=(3/11, -17), xytext=(0.36, -30), fontsize=8.5, color=INK2, arrowprops=dict(arrowstyle="-", color=MUTED, lw=1))
fig.suptitle("Fig 1 · Extracted DNA — lightness, relative chroma, hue drift (large marker = anchor step: TW 500 / Radix 9)", x=0.01, ha="left", fontsize=12.5, fontweight="bold", color=INK)
fig.tight_layout(rect=(0, 0, 1, 0.96))
fig.savefig(OUT + "fig1_dna_curves.png"); plt.close(fig)

# ═══════════════════════════════════════════════════════════════════════════
# Fig 2 — relC as a function of L, all hues, with mean ± SD band
# ═══════════════════════════════════════════════════════════════════════════
fig, axes = plt.subplots(1, 2, figsize=(13.5, 5.2), sharey=True)
for ax, sys in zip(axes, ["tailwind-v4", "radix-light"]):
    li = D["lIndexed"][sys]
    L = np.array(li["L"]); mu = np.array(li["mean"]); sd = np.array(li["sd"])
    ax.fill_between(L, mu - sd, mu + sd, color="#000000", alpha=0.06, lw=0, zorder=1)
    ax.plot(L, mu, color=INK2, lw=1.4, zorder=2)
    for fam, curve in li["families"].items():
        ax.plot(L, curve, color="#000000", alpha=0.10, lw=1, zorder=1)
    items = []
    for fam in FOCUS:
        if fam in li["families"]:
            ax.plot(L, li["families"][fam], color=HUE_COLOR[fam], lw=2.2, marker=MARK[fam], ms=4.5, zorder=3)
            items.append((L[-1], li["families"][fam][-1], fam, HUE_COLOR[fam]))
    label_ends(ax, items, 0.07)
    ax.axhline(1.0, color=MUTED, lw=1, ls=(0, (2, 3)))
    ax.set_xlabel("L (OKLab)"); ax.set_xlim(0.33, 1.02); ax.set_ylim(0, 1.3)
    nfam = len(li["families"])
    ax.set_title(f"{SYS_LABEL[sys]} — {nfam} hue families{' (bright scales excluded)' if sys=='radix-light' else ''}", loc="left")
    ax.text(0.34, 1.22, f"mean ± SD across hues · mid-range SD ≈ {np.mean(sd[3:10]):.2f}", fontsize=9, color=INK2)
axes[0].set_ylabel("relC vs sRGB cusp")
fig.suptitle("Fig 2 · Relative chroma as a function of lightness — Tailwind rides the shell; Radix tunes per hue", x=0.01, ha="left", fontsize=12.5, fontweight="bold", color=INK)
fig.tight_layout(rect=(0, 0, 1, 0.94))
fig.savefig(OUT + "fig2_relC_of_L.png"); plt.close(fig)

# ═══════════════════════════════════════════════════════════════════════════
# Fig 3 — transfer error per step: absolute vs relative vs hybrid
# ═══════════════════════════════════════════════════════════════════════════
fig, axes = plt.subplots(1, 2, figsize=(13.5, 4.8), sharey=True)
NORM_COLOR = {"absC": "#8a8a8a", "relC_srgb": "#155dfc", "hybrid": "#1f1f1f"}
NORM_LABEL = {"absC": "absolute chroma", "relC_srgb": "relative chroma (sRGB cusp)", "hybrid": "hybrid w(n)"}
for ax, sys in zip(axes, ["tailwind-v4", "radix-light"]):
    label = "regular" if sys == "radix-light" else "all"
    keys = D["hybridReport"][sys]["keys"]
    x = np.arange(len(keys))
    handles = []
    for norm in ["absC", "relC_srgb"]:
        t = D["transferReport"][sys][f"{label}:{norm}"]
        (ln,) = ax.plot(x, t["perStepMean"], color=NORM_COLOR[norm], lw=2, marker="o", ms=5, mfc=SURF, mew=1.6, label=f'{NORM_LABEL[norm]} — mean {t["mean"]:.3f}, {t["withinJnd"]*100:.0f}% of transfers ≤ 1 JND')
        handles.append(ln)
    h = D["hybridReport"][sys]
    hy = [p["err"] for p in h["perStep"]]
    (ln,) = ax.plot(x, hy, color=NORM_COLOR["hybrid"], lw=2, marker="D", ms=4.5, mfc=SURF, mew=1.6, label=f'hybrid w(n) — mean {h["hybrid"]["err"]:.3f}, {h["hybrid"]["jnd"]*100:.0f}% ≤ 1 JND')
    handles.append(ln)
    ax.axhline(0.02, color="#a65f00", lw=1, ls=(0, (2, 3))); ax.text(x[-1] + 0.3, 0.02, "1 JND", fontsize=8, color="#a65f00", va="center")
    ax.set_xticks(x); ax.set_xticklabels(keys, fontsize=8.5)
    ws = " ".join(f"{p['w']:.2f}" for p in h["perStep"])
    ax.set_title(f"{SYS_LABEL[sys]} — {'20 regular' if sys=='radix-light' else '17'} hues, all ordered pairs", loc="left")
    ax.text(0, -0.22, "best w(n) per step:  " + ws, transform=ax.transAxes, fontsize=8, color=MUTED, family="DejaVu Sans Mono")
    ax.legend(handles=handles, loc="upper left", fontsize=8.5)
    ax.set_xlim(-0.5, len(keys) - 0.3); ax.set_ylim(0, 0.085)
axes[0].set_ylabel("mean |C_pred − C_actual|  (ΔEOK)")
fig.suptitle("Fig 3 · Transfer error — apply hue A's curve at hue B's (L, h); w(n)=1 is pure relative, 0 is pure absolute", x=0.01, ha="left", fontsize=12.5, fontweight="bold", color=INK)
fig.tight_layout(rect=(0, 0.05, 1, 0.94))
fig.savefig(OUT + "fig3_transfer_error.png"); plt.close(fig)

# ═══════════════════════════════════════════════════════════════════════════
# Fig 4 — hue centroids vs published
# ═══════════════════════════════════════════════════════════════════════════
fig, ax = plt.subplots(figsize=(13.5, 3.9))
fams = ["red", "orange", "yellow", "green", "cyan", "blue", "purple"]
hr = D["hueReport"]
for i, fam in enumerate(fams):
    p = hr[fam]["published"]; q = hr[fam]["peakPerPalette"]
    ax.errorbar([p["mean"]], [i + 0.15], xerr=[[p["sd"]], [p["sd"]]], fmt="o", color=MUTED, ms=6, capsize=3, lw=1.5)
    ax.errorbar([q["mean"]], [i - 0.15], xerr=[[q["sd"]], [q["sd"]]], fmt="D", color=INK, ms=5, capsize=3, lw=1.5)
    ax.text(p["mean"] + p["sd"] + 3, i + 0.15, f'published (mid step): {p["mean"]:.1f}° ± {p["sd"]:.1f}', va="center", fontsize=8.5, color=MUTED)
    ax.text(q["mean"] + q["sd"] + 3, i - 0.15, f'peak-chroma step, circular: {q["mean"]:.1f}° ± {q["sd"]:.1f}', va="center", fontsize=8.5, color=INK)
for sys, mk in [("tailwind-v4", "o"), ("radix-light", "s")]:
    for fam in FOCUS:
        h = D["classReport"][f"{sys}/{fam}"]["h"]; i = fams.index(fam)
        ax.plot([h], [i + (0.42 if sys == "tailwind-v4" else 0.5)], marker=mk, ms=6, color=HUE_COLOR[fam], mfc=SURF if sys == "radix-light" else HUE_COLOR[fam], mew=1.6, clip_on=False)
ax.set_yticks(range(len(fams))); ax.set_yticklabels(fams); ax.invert_yaxis()
ax.set_xlim(0, 360); ax.set_xlabel("OKLCH hue (°)"); ax.grid(axis="y", visible=False)
ax.legend(handles=[Line2D([], [], marker="o", color=MUTED, ls="", label="published (Color.js palettes, 11 systems)"), Line2D([], [], marker="D", color=INK, ls="", label="reproduced here at each ramp's peak-chroma step"), Line2D([], [], marker="o", color=INK2, ls="", label="Tailwind v4 anchor (filled) / Radix 9 (hollow)", mfc=SURF)], loc="upper right", fontsize=8.5)
ax.set_title("Fig 4 · Cross-system hue centroids — reproduced exactly; yellow's σ halves when measured at peak chroma instead of the middle step", loc="left")
fig.tight_layout(); fig.savefig(OUT + "fig4_hue_centroids.png"); plt.close(fig)

# ═══════════════════════════════════════════════════════════════════════════
# Fig 5 — Radix dark: actual vs three mirrors
# ═══════════════════════════════════════════════════════════════════════════
fig, axes = plt.subplots(1, 3, figsize=(13.5, 4.4), sharey=True)
for ax, fam in zip(axes, FOCUS):
    dm = D["darkMirror"][fam]; rows = dm["rows"]; x = np.arange(1, 13)
    ax.plot(x, [r["actual"] for r in rows], color=HUE_COLOR[fam], lw=2.4, marker=MARK[fam], ms=6, zorder=4)
    ax.plot(x, [r["lMirror"] for r in rows], color=MUTED, lw=1.4, ls=(0, (2, 2)), marker="o", ms=3.5)
    ax.plot(x, [r["wcagMirror"] for r in rows], color=INK2, lw=1.4, ls="--", marker="o", ms=3.5)
    ax.plot(x, [r["apcaMirror"] for r in rows], color=INK, lw=1.6, ls="-", marker="o", ms=3.5)
    ax.set_xticks(x); ax.set_xlabel("Radix step"); ax.set_ylim(0, 1.0)
    ax.set_title(fam, loc="left", color=HUE_COLOR[fam])
    ax.text(0.98, 0.04, f'RMS ΔL vs actual\n1−L mirror  {dm["rms"]["lMirror"]:.3f}\nWCAG mirror  {dm["rms"]["wcagMirror"]:.3f}\nAPCA mirror  {dm["rms"]["apcaMirror"]:.3f}', transform=ax.transAxes, ha="right", va="bottom", fontsize=8.5, color=INK2, family="DejaVu Sans Mono")
axes[0].set_ylabel("L (OKLab) of dark-mode step")
axes[0].legend(handles=[Line2D([], [], color=INK2, lw=2.4, label="actual Radix dark"), Line2D([], [], color=MUTED, ls=(0, (2, 2)), label="lightness mirror 1−L"), Line2D([], [], color=INK2, ls="--", label="WCAG-contrast mirror"), Line2D([], [], color=INK, label="APCA-contrast mirror")], loc="upper left", fontsize=8.5)
fig.suptitle("Fig 5 · Radix dark scales vs three ways of deriving them from the light scales (chroma and hue held at Radix's actual dark values)", x=0.01, ha="left", fontsize=12.5, fontweight="bold", color=INK)
fig.tight_layout(rect=(0, 0, 1, 0.92)); fig.savefig(OUT + "fig5_dark_mirror.png"); plt.close(fig)

# ═══════════════════════════════════════════════════════════════════════════
# Fig 0 — swatches of the actual ramps (sRGB-clipped for display)
# ═══════════════════════════════════════════════════════════════════════════
def oklch_to_srgb_hex(L, C, h):
    # OKLab -> linear sRGB -> sRGB (clip). Good enough for swatches.
    a = C * math.cos(math.radians(h)); b = C * math.sin(math.radians(h))
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_**3, m_**3, s_**3
    r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    def tr(v):
        v = min(max(v, 0), 1)
        return 12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055
    return "#%02x%02x%02x" % tuple(int(round(tr(v) * 255)) for v in (r, g, bb))
fig, axes = plt.subplots(6, 1, figsize=(13.5, 3.6))
row = 0
for sys in ["tailwind-v4", "radix-light"]:
    for fam in FOCUS:
        ax = axes[row]; S = steps(sys, fam)
        for i, s in enumerate(S):
            ax.add_patch(plt.Rectangle((i, 0), 0.94, 1, color=oklch_to_srgb_hex(s["L"], s["C"], s["h"]), lw=0))
            if not s["inGamut"]["srgb"]:
                ax.text(i + 0.47, 0.5, "P3", ha="center", va="center", fontsize=7, color="#ffffff" if s["L"] < 0.6 else "#000000", alpha=0.7)
        ax.set_xlim(0, len(S)); ax.set_ylim(0, 1); ax.axis("off")
        ax.text(-0.15, 0.5, f"{SYS_LABEL[sys]} {fam}", ha="right", va="center", fontsize=9, color=INK2, transform=ax.transData)
        row += 1
fig.suptitle("Fig 0 · The six ramps under study (sRGB-clipped for display; 'P3' marks steps outside sRGB)", x=0.01, ha="left", fontsize=11.5, fontweight="bold", color=INK)
fig.tight_layout(rect=(0.12, 0, 1, 0.93)); fig.savefig(OUT + "fig0_swatches.png"); plt.close(fig)
print("wrote figures to out/")
