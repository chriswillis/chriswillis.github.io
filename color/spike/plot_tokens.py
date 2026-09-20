"""Phase 3.5 figure: fig11_tokens.png, from out/tokens/figure.json.

Run: npx tsx scripts/demo-tokens.ts && python3 spike/plot_tokens.py
"""
import json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle

d = json.load(open("out/tokens/figure.json"))
roles = [r for r in d["roles"]]
sem = d["set"]["semantics"]

fig = plt.figure(figsize=(17, 14))
gs = fig.add_gridspec(3, 2, height_ratios=[1.35, 1.0, 1.0], hspace=0.52, wspace=0.16)

# ── 1. the semantic tokens, both modes ────────────────────────────────────────
ax = fig.add_subplot(gs[0, :])
ax.set_xlim(0, len(sem))
ax.set_ylim(-0.25, 2.5)
ax.axis("off")
for i, s in enumerate(sem):
    for row, mode, bg, fg in ((1.25, "light", "#ffffff", "#333"), (0.05, "dark", "#111113", "#ddd")):
        ax.add_patch(Rectangle((i, row - 0.04), 1.0, 1.08, color=bg, zorder=1))
        ax.add_patch(Rectangle((i + 0.05, row), 0.9, 0.78, color=s[mode]["hex"], zorder=3))
        lab = (s[mode]["step"] or "—") + ("" if s[mode]["met"] else " ✗")
        ax.text(i + 0.5, row + 0.87, lab, ha="center", va="bottom", fontsize=6.5,
                color="#dc2626" if not s[mode]["met"] else fg, zorder=4)
    ax.text(i + 0.55, 2.38, s["role"], ha="right", va="bottom", fontsize=7, rotation=38)
ax.text(-0.15, 1.65, "light", ha="right", va="center", fontsize=8)
ax.text(-0.15, 0.45, "dark", ha="right", va="center", fontsize=8)
ax.set_title("Semantic tokens from one seed — the label over each swatch is the step the requirement chose, ✗ where it could not be met",
             fontsize=10, loc="left", pad=52)

# ── 2. role recovery against Radix's documented steps ─────────────────────────
for col, mode in enumerate(("light", "dark")):
    ax = fig.add_subplot(gs[1, col])
    rec = d["recovery"][mode]
    named = [r for r in roles if r["name"] in rec]
    steps = [str(i) for i in range(1, 13)]
    ax.set_xlim(-0.5, 11.5)
    ax.set_ylim(len(named) - 0.5, -0.5)
    for y, r in enumerate(named):
        total = sum(rec[r["name"]].values())
        for x, st in enumerate(steps):
            n = rec[r["name"]].get(st, 0)
            if n:
                ax.add_patch(Rectangle((x - 0.45, y - 0.42), 0.9, 0.84, color="#2563eb", alpha=0.18 + 0.82 * n / total, zorder=2))
                if n / total > 0.25:
                    ax.text(x, y, str(n), ha="center", va="center", fontsize=6,
                            color="white" if n / total > 0.6 else "#1e3a8a", zorder=3)
        if r["radixStep"]:
            ax.plot([r["radixStep"] - 1], [y], marker="s", ms=13, mfc="none", mec="#111", mew=1.3, zorder=4)
        # anything resolving outside the ramp
        other = {k: v for k, v in rec[r["name"]].items() if k not in steps}
        if other:
            ax.text(11.7, y, " ".join(f"{k}×{v}" for k, v in other.items()), fontsize=6, va="center", color="#555")
    ax.set_yticks(range(len(named)))
    ax.set_yticklabels([r["name"] for r in named], fontsize=7)
    ax.set_xticks(range(12))
    ax.set_xticklabels(steps, fontsize=7)
    ax.set_xlabel("Radix step", fontsize=8)
    ax.set_title(f"{mode} — where the requirement lands, over 25 families (□ = the step Radix documents)", fontsize=9, loc="left", pad=8)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)

# ── 3. the foreground-on-solid problem ────────────────────────────────────────
ax = fig.add_subplot(gs[2, 0])
os_ = d["onSolid"]
x = range(len(os_))
ax.plot(x, [o["whiteW"] for o in os_], "o-", ms=3, lw=1.3, color="#f59e0b", label="white on the solid")
ax.plot(x, [o["blackW"] for o in os_], "o-", ms=3, lw=1.3, color="#1f2937", label="black on the solid")
ax.axhline(4.5, color="#dc2626", lw=1, ls="--")
ax.text(0.2, 4.7, "SC 1.4.3 — 4.5:1", fontsize=7, color="#dc2626")
# where no single foreground satisfies both measures at once
both = [i for i, o in enumerate(os_)
        if not ((o["whiteW"] >= 4.5 and o["whiteA"] >= 60) or (o["blackW"] >= 4.5 and o["blackA"] >= 60))]
for i in both:
    ax.axvspan(i - 0.5, i + 0.5, color="#fecaca", alpha=0.35, zorder=0)
ax.set_xticks(list(x))
ax.set_xticklabels([o["family"] for o in os_], rotation=90, fontsize=6)
ax.set_ylabel("WCAG 2.1 contrast", fontsize=8)
ax.legend(fontsize=7, frameon=False)
ax.set_title(f"WCAG 2.1 alone is satisfiable on every solid — black where white fails", fontsize=9, loc="left")
for s in ("top", "right"):
    ax.spines[s].set_visible(False)

ax = fig.add_subplot(gs[2, 1])
ax.plot(x, [o["whiteA"] for o in os_], "o-", ms=3, lw=1.3, color="#f59e0b", label="white on the solid")
ax.plot(x, [o["blackA"] for o in os_], "o-", ms=3, lw=1.3, color="#1f2937", label="black on the solid")
ax.axhline(60, color="#dc2626", lw=1, ls="--")
ax.text(0.2, 61.5, "APCA bronze — Lc 60", fontsize=7, color="#dc2626")
# where the two measures pick different foregrounds
flip = [i for i, o in enumerate(os_) if (o["whiteW"] > o["blackW"]) != (o["whiteA"] > o["blackA"])]
for i in flip:
    ax.axvspan(i - 0.5, i + 0.5, color="#bfdbfe", alpha=0.45, zorder=0)
ax.set_xticks(list(x))
ax.set_xticklabels([o["family"] for o in os_], rotation=90, fontsize=6)
ax.set_ylabel("APCA |Lc|", fontsize=8)
ax.legend(fontsize=7, frameon=False)
ax.set_title(f"APCA prefers the opposite foreground on {len(flip)} of 25; on {len(both)} of them no one colour satisfies both", fontsize=9, loc="left")
for s in ("top", "right"):
    ax.spines[s].set_visible(False)

fig.suptitle("Phase 3.5 — semantic roles derived from the contrast matrix", fontsize=12, x=0.008, ha="left", y=0.995)
fig.savefig("out/fig11_tokens.png", dpi=150, bbox_inches="tight", facecolor="white")
print("wrote out/fig11_tokens.png")
