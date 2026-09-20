"""Phase 3 figure: fig10_dark_mode.png, from out/dark-demo.json.

Run: npx tsx scripts/demo-dark.ts && python3 spike/plot_dark.py
"""
import json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle

d = json.load(open("out/dark-demo.json"))
pairs = d["pairs"]

fig = plt.figure(figsize=(16, 4 + 1.5 * len(pairs)))
gs = fig.add_gridspec(len(pairs) + 2, 2, height_ratios=[1.35] * len(pairs) + [1.8, 1.8], hspace=0.75, wspace=0.22)


def swatches(ax, colors, y, h, label, bg=None):
    n = len(colors)
    if bg is not None:
        ax.add_patch(Rectangle((-0.012, y - 0.055), 1.024, h + 0.11, color=bg, zorder=0))
    for i, c in enumerate(colors):
        ax.add_patch(Rectangle((i / n, y), 1 / n - 0.004, h, color=c, zorder=2))
    ax.text(-0.02, y + h / 2, label, ha="right", va="center", fontsize=8)


for r, p in enumerate(pairs):
    ax = fig.add_subplot(gs[r, :])
    ax.set_xlim(-0.14, 1.02)
    ax.set_ylim(-0.1, 1.05)
    ax.axis("off")
    swatches(ax, p["light"], 0.58, 0.34, "light", bg="#ffffff")
    swatches(ax, p["dark"], 0.06, 0.34, "dark", bg="#101012")
    n = len(p["keys"])
    for i, k in enumerate(p["keys"]):
        ax.text(i / n + 0.5 / n, 0.97, k, ha="center", va="bottom", fontsize=6.5, color="#666")
    pin = p["pin"]
    if pin:
        idx = p["keys"].index(pin["stepKey"])
        ax.plot([idx / n + 0.5 / n], [0.47], marker="v", color="#111", markersize=6, zorder=5)
        ax.text(idx / n + 0.5 / n, 0.41, "pinned", ha="center", va="top", fontsize=6.5)
    kind = p["darkSource"]["kind"]
    ax.set_title(
        f"{p['label']}   —   {kind} dark reference"
        + (f"   ·   the pinned color is {pin['light']['wcagVsBg']:.2f}:1 on white and {pin['dark']['wcagVsBg']:.2f}:1 on the dark surface" if pin else ""),
        fontsize=9, loc="left", pad=16)

# fidelity
ax = fig.add_subplot(gs[len(pairs), 0])
f = d["fidelity"]
names = [x["label"] for x in f]
vals = [x["rms"] for x in f]
cols = ["#2563eb" if "default" in nm else ("#94a3b8" if "λ(n)" in nm else "#cbd5e1") for nm in names]
ax.barh(range(len(f)), vals, color=cols)
for i, x in enumerate(f):
    ax.text(x["rms"] + 0.002, i, f"{x['rms']:.4f}   {x['withinTwoJnd']*100:.0f}% within 2 JND", va="center", fontsize=7.5)
ax.set_yticks(range(len(f)))
ax.set_yticklabels(names, fontsize=7.5)
ax.invert_yaxis()
ax.set_xlim(0, max(vals) * 1.6)
ax.set_xlabel("RMS ΔEOK against Radix's own dark scale (25 families × 12 steps)", fontsize=8)
ax.set_title("Derived vs authored: the pin carries the model", fontsize=9, loc="left")
ax.tick_params(labelsize=7)
for s in ("top", "right"):
    ax.spines[s].set_visible(False)

# blue, step by step
ax = fig.add_subplot(gs[len(pairs), 1])
b = d["blue"]
x = range(len(b["keys"]))
ax.plot(x, b["light"], "o-", color="#94a3b8", ms=3, lw=1.2, label="Radix light")
ax.plot(x, b["authoredDark"], "o-", color="#111827", ms=3, lw=1.6, label="Radix dark (authored)")
ax.plot(x, b["derivedDark"], "o--", color="#2563eb", ms=3, lw=1.6, label="derived")
ax.set_xticks(list(x))
ax.set_xticklabels(b["keys"], fontsize=7)
ax.set_xlabel("step", fontsize=8)
ax.set_ylabel("OKLab L", fontsize=8)
ax.legend(fontsize=7, frameon=False)
ax.set_title("Radix blue: the mirror against the real thing", fontsize=9, loc="left")
ax.tick_params(labelsize=7)
for s in ("top", "right"):
    ax.spines[s].set_visible(False)

# per-family error
ax = fig.add_subplot(gs[len(pairs) + 1, 0])
pf = sorted(d["perFamily"].items(), key=lambda kv: kv[1])
ax.bar(range(len(pf)), [v for _, v in pf], color="#2563eb")
ax.axhline(0.02, color="#ef4444", lw=0.9, ls="--")
ax.text(0.3, 0.021, "one JND", color="#ef4444", fontsize=7)
ax.set_xticks(range(len(pf)))
ax.set_xticklabels([k for k, _ in pf], rotation=90, fontsize=6.5)
ax.set_ylabel("RMS ΔEOK", fontsize=8)
ax.set_title("Per family: the bright scales are where hand authoring shows", fontsize=9, loc="left")
ax.tick_params(labelsize=7)
for s in ("top", "right"):
    ax.spines[s].set_visible(False)

# what the pin costs, step by step, for the first pair
ax = fig.add_subplot(gs[len(pairs) + 1, 1])
c = pairs[0]["correspondence"]
x = range(len(c))
ax.plot(x, [abs(v["lightApca"]) for v in c], "o-", color="#f59e0b", ms=3, lw=1.4, label="|Lc| on the light background")
ax.plot(x, [abs(v["darkApca"]) for v in c], "o-", color="#3b82f6", ms=3, lw=1.4, label="|Lc| on the dark background")
ax.axhline(60, color="#94a3b8", lw=0.8, ls=":")
ax.text(0.1, 61, "body text", fontsize=7, color="#64748b")
ax.axhline(45, color="#94a3b8", lw=0.8, ls=":")
ax.text(0.1, 46, "large text", fontsize=7, color="#64748b")
if pairs[0]["pin"]:
    ax.axvline(pairs[0]["keys"].index(pairs[0]["pin"]["stepKey"]), color="#111", lw=0.9)
ax.set_xticks(list(x))
ax.set_xticklabels(pairs[0]["keys"], fontsize=7)
ax.set_ylabel("APCA |Lc|", fontsize=8)
ax.legend(fontsize=7, frameon=False)
ax.set_title("A step is not the same token in both modes — the pin's real cost", fontsize=9, loc="left")
ax.tick_params(labelsize=7)
for s in ("top", "right"):
    ax.spines[s].set_visible(False)

fig.suptitle(f"Phase 3 — dark mode by mirroring contrast, seed {d['seed']}", fontsize=12, x=0.008, ha="left", y=0.995)
fig.savefig("out/fig10_dark_mode.png", dpi=150, bbox_inches="tight", facecolor="white")
print("wrote out/fig10_dark_mode.png")
