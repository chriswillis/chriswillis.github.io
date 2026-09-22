"""Solver demo figure from out/solver-demo.json. Run: python3 spike/plot_solver.py"""
import json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle

D = json.load(open("out/solver-demo.json"))
INK, INK2, MUTED, SURF = "#1f1f1f", "#4a4a4a", "#8a8a8a", "#fcfcfb"
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 9, "figure.facecolor": SURF})

def lum(h):
    h = h.lstrip("#"); r, g, b = (int(h[i:i+2], 16) / 255 for i in (0, 2, 4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def strip(ax, steps, y, label, sub=None, mark_seed=True, show_wcag=False, bg=None, height=0.7, gaps=None):
    n = len(steps)
    if bg:
        ax.add_patch(Rectangle((-0.35, y - 0.14), n + 0.7, height + 0.28, color=bg, lw=0, zorder=0))
    for i, s in enumerate(steps):
        ax.add_patch(Rectangle((i, y), 0.94, height, color=s["hex"], lw=0, zorder=1))
        tc = "#ffffff" if lum(s["hex"]) < 0.45 else "#111111"
        ax.text(i + 0.47, y + height - 0.12, s["key"], ha="center", va="top", fontsize=6.5, color=tc, alpha=0.85)
        if show_wcag:
            ax.text(i + 0.47, y + 0.1, f'{s["wcagVsBg"]:.1f}', ha="center", va="bottom", fontsize=6.5, color=tc, alpha=0.85)
        if mark_seed and s.get("isSeed"):
            ax.add_patch(Rectangle((i + 0.02, y + 0.02), 0.90, height - 0.04, fill=False, ec=tc, lw=1.8, zorder=3))
        if s.get("detached"):
            ax.text(i + 0.47, y + height + 0.04, "detached", ha="center", va="bottom", fontsize=6, color=MUTED)
    if gaps:  # perceptual gap between consecutive spine steps, drawn on the seams
        spine = [i for i, s in enumerate(steps) if not s.get("detached")]
        for j, g in enumerate(gaps):
            x = (spine[j] + spine[j + 1]) / 2 + 0.47
            ax.text(x, y - 0.05, f"{g:.02f}"[1:], ha="center", va="top", fontsize=5.8, color=MUTED)
    ycen = y + height / 2
    if label and sub:
        ax.annotate(label, (-0.45, ycen), xytext=(0, 5), textcoords="offset points", ha="right", va="bottom", fontsize=8.5, color=INK, fontweight="bold")
        ax.annotate(sub, (-0.45, ycen), xytext=(0, -6), textcoords="offset points", ha="right", va="top", fontsize=7, color=INK2)
    elif label:
        ax.annotate(label, (-0.45, ycen), xytext=(0, 0), textcoords="offset points", ha="right", va="center", fontsize=8.5, color=INK, fontweight="bold")
    elif sub:
        ax.annotate(sub, (-0.45, ycen), xytext=(0, 0), textcoords="offset points", ha="right", va="center", fontsize=7, color=INK2)

fig = plt.figure(figsize=(14.5, 13.6))
gs = fig.add_gridspec(4, 1, height_ratios=[7.6, 2.3, 3.3, 1.5], hspace=0.30)

# A — reference vs even spacing
ax = fig.add_subplot(gs[0]); ax.set_xlim(-6.2, 17); ax.set_ylim(-0.5, 11.2); ax.axis("off")
ax.set_title(f'A · One seed ({D["seed"]}) — the reference\'s own step placement vs equal-ΔEOK spacing of the same curve\n'
             'Numbers under each seam are the perceptual gap (ΔEOK) to the next step. Same DNA, same endpoints, same step count.',
             loc="left", fontsize=11, fontweight="bold", color=INK)
y = 10.2
for ref, even in zip(D["oneSeed"], D["oneSeedEven"]):
    strip(ax, ref["steps"], y, ref["dna"]["name"], f'reference spacing · CV {ref["spacing"]["cv"]:.2f}', gaps=ref["spacing"]["deltaE"])
    strip(ax, even["steps"], y - 0.88, "", f'even spacing · CV {even["spacing"]["cv"]:.2f}', gaps=even["spacing"]["deltaE"])
    y -= 2.0
ax.text(-6.2, -0.42, "Carbon and Tailwind barely move: their numbering is already close to perceptually even. Radix and Polaris are role-indexed, so their own steps cluster.", fontsize=7.5, color=MUTED)

# B — role-preserving variant
ax = fig.add_subplot(gs[1]); ax.set_xlim(-6.2, 17); ax.set_ylim(-0.5, 2.3); ax.axis("off")
rk = D["roleKept"]
ax.set_title("B · Keeping a role-bearing step number: Radix DNA, even spacing, seed pinned to step 9 (Radix's \"solid background\")", loc="left", fontsize=11, fontweight="bold", color=INK)
strip(ax, D["oneSeedEven"][0]["steps"], 1.2, "even, seed by lightness", f'seed at {D["oneSeedEven"][0]["seed"]["stepKey"]} · CV {D["oneSeedEven"][0]["spacing"]["cv"]:.2f}', gaps=D["oneSeedEven"][0]["spacing"]["deltaE"])
strip(ax, rk["steps"], 0.15, "even, seedStep: '9'", f'seed at 9 · CV {rk["spacing"]["cv"]:.2f} · uneven halves', gaps=rk["spacing"]["deltaE"])

# C — lightness modes
ax = fig.add_subplot(gs[2]); ax.set_xlim(-6.2, 17); ax.set_ylim(-0.5, 3.3); ax.axis("off")
ax.set_title("C · Tailwind v4 DNA at hue 30° on a warm page (#efe9dc): curve-faithful → blend → contrast-faithful (WCAG vs the page in each swatch)", loc="left", fontsize=11, fontweight="bold", color=INK)
for r, ramp in enumerate(D["modes"]):
    name = {0: "curve-faithful (t=0)", 0.5: "blend (t=0.5)", 1: "contrast-faithful (t=1)"}[ramp["mode"]]
    strip(ax, ramp["steps"], 2.25 - r * 1.05, name, None, mark_seed=False, show_wcag=True, bg=ramp["background"])

# D — replication
ax = fig.add_subplot(gs[3]); ax.set_xlim(-6.2, 17); ax.set_ylim(-0.5, 2.2); ax.axis("off")
rec = D["reconstruction"]
ax.set_title("D · Replication check (reference spacing): Tailwind v3 blue, real vs generated from one seed (#3b82f6) + Tailwind v4 DNA", loc="left", fontsize=11, fontweight="bold", color=INK)
strip(ax, rec["real"], 1.15, "Tailwind v3 blue (real)", mark_seed=False)
strip(ax, rec["generated"]["steps"], 0.15, "generated", f'max ΔEOK {max(rec["deltaE"]):.3f} · mean {sum(rec["deltaE"])/len(rec["deltaE"]):.3f}')

fig.suptitle("Fig 9 · Phase 2 solver — seed-priority transfer, and step spacing", x=0.01, ha="left", fontsize=13, fontweight="bold", color=INK, y=0.997)
fig.savefig("out/fig9_solver_demo.png", dpi=170, bbox_inches="tight", facecolor=SURF)
print("wrote out/fig9_solver_demo.png")
