#!/usr/bin/env python3
"""Build the two Meridian chart-colour entries for Palette topology and Ramp from one colour.

Kendo's Meridian theme (@progress/kendo-theme-meridian) ships no stored tonal ramps: every
chart colour is a CSS relative-colour formula, offsets in L, C and h from one seed
(--kendo-color-series). This resolves those formulas from the compiled theme CSS, exactly as
a browser would before display (no gamut mapping), and prints one JSON entry per swatch.

    npm pack @progress/kendo-theme-meridian@14.6.1 && tar xzf progress-kendo-theme-meridian-14.6.1.tgz
    python3 build-meridian.py package > meridian.json
"""
import json, math, re, sys

VERSION = '14.6.1'
LETTERS = 'abcdef'
LEVELS = ['subtler', 'subtle', '', 'bold', 'bolder']  # '' = the series colour itself
# hue names, checked against the resolved hues below; Kendo calls them series A–F
NAMES = {'a': 'indigo', 'b': 'purple', 'c': 'pink', 'd': 'green', 'e': 'yellow', 'f': 'coral'}
# Meridian's slate greys: real tokens, one per role, used as the neutral axis
NEUTRAL_TOKENS = ['surface-alt', 'surface', 'base', 'subtle', 'primary', 'inverse']


def css_vars(path):
    css = open(path, encoding='utf8').read()
    out = {}
    for k, v in re.findall(r'--kendo-color-([a-z0-9-]+):\s*([^;}]+)', css):
        out.setdefault(k, v.strip())  # first definition = the swatch's own
    return out


def clamp(lo, v, hi):
    return max(lo, min(v, hi))


def split_top(s):
    out, depth, cur = [], 0, ''
    for ch in s:
        depth += ch == '('
        depth -= ch == ')'
        if ch == ' ' and depth == 0:
            if cur:
                out.append(cur)
            cur = ''
        else:
            cur += ch
    return out + ([cur] if cur else [])


def resolve(vars_, name, seen=()):
    v = vars_[name]
    m = re.fullmatch(r'oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)(?:deg)?\)', v)
    if m:
        return float(m[1]) / 100, float(m[2]), float(m[3])
    m = re.fullmatch(r'var\(--kendo-color-([a-z0-9-]+)\)', v)
    if m:
        return resolve(vars_, m[1], seen + (name,))
    m = re.fullmatch(r'oklch\(from var\(--kendo-color-([a-z0-9-]+)\) (.*)\)', v)
    if m:
        l, c, h = resolve(vars_, m[1], seen + (name,))
        env = {'clamp': clamp, 'max': max, 'min': min, 'l': l, 'c': c, 'h': h}
        L, C, H = (eval(p.replace('calc(', '('), {'__builtins__': {}}, env) for p in split_top(m[2]))
        return L, max(C, 0.0), H % 360
    raise ValueError(f'{name}: cannot resolve {v!r}')


# --- OKLCH → sRGB / P3 gamut test, WCAG luminance ---
def oklch_lin(L, C, H, p3=False):
    a, b = C * math.cos(math.radians(H)), C * math.sin(math.radians(H))
    l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    if p3:  # linear sRGB → linear Display P3
        r, g, bb = (0.8224621 * r + 0.177538 * g + 0.0000 * bb,
                    0.0331941 * r + 0.9668058 * g + 0.0000 * bb,
                    0.0170827 * r + 0.0723974 * g + 0.9105199 * bb)
    return r, g, bb


def in_gamut(lch, p3=False, eps=1e-4):
    return all(-eps <= x <= 1 + eps for x in oklch_lin(*lch, p3=p3))


def lum(lch):
    r, g, b = (min(max(x, 0), 1) for x in oklch_lin(*lch))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    ya, yb = sorted((lum(a), lum(b)), reverse=True)
    return (ya + 0.05) / (yb + 0.05)


def fmt(lch):
    L, C, H = lch
    return f'oklch({L * 100:.2f}% {C:.4f} {H:.2f})'


def entry(pkg, swatch, dark):
    V = css_vars(f'{pkg}/dist/{swatch}.css')
    light_pole = (1.0, 0.0, 0.0)  # Meridian light app-surface, oklch(100% 0 0)
    dark_pole = resolve(css_vars(f'{pkg}/dist/meridian-main-dark.css'), 'app-surface')
    ramps, report = {}, []
    for x in LETTERS:
        lchs = [resolve(V, f'series-{x}' + (f'-{lv}' if lv else '')) for lv in LEVELS]
        order = sorted(range(len(LEVELS)), key=lambda i: -lchs[i][0])  # light → dark
        ramps[x] = [lchs[i] for i in order]
        steps = [LEVELS[i] or 'base' for i in order]
        report.append((x, steps, lchs))
    step_sets = {tuple(s) for _, s, _ in report}
    assert len(step_sets) == 1, f'{swatch}: series disagree on step order {step_sets}'
    steps = list(step_sets.pop())
    for x, _, lchs in report:
        hs = [h for _, _, h in lchs]
        print(f'  {swatch} {x} {NAMES[x]:7s} L {min(l for l,_,_ in lchs):.2f}–{max(l for l,_,_ in lchs):.2f}'
              f'  hue {lchs[2][2]:.1f}  sRGB {sum(in_gamut(c) for c in lchs)}/5  P3 {sum(in_gamut(c, True) for c in lchs)}/5', file=sys.stderr)
    # drop a token that is the pole itself (light surface-alt is white), so the axis has no duplicate
    neu = sorted(((t, resolve(V, t)) for t in NEUTRAL_TOKENS), key=lambda tv: -tv[1][0])
    neu = [(t, c) for t, c in neu if min(abs(c[0] - light_pole[0]), abs(c[0] - dark_pole[0])) > 0.005]
    allc = [c for r in ramps.values() for c in r]
    gamut = 'srgb' if all(in_gamut(c) for c in allc) else 'p3'
    # text: Meridian never sets series colours as text. Use the first step, walking away from
    # the background, at which every series reaches 4.5:1 on that background.
    bg = dark_pole if dark else light_pole
    walk = steps[::-1] if dark else steps
    text = None
    for s in walk:
        k = steps.index(s)
        worst = min(contrast(ramps[x][k], bg) for x in LETTERS)
        print(f'  {swatch} step {s:8s} worst contrast on {"dark" if dark else "light"} app surface {worst:.2f}', file=sys.stderr)
        if worst >= 4.5 and text is None:
            text = s
    mode = 'dark' if dark else 'light'
    other = 'light' if dark else 'dark'
    return {
        'id': f'meridian-{mode}',
        'name': f'Meridian {mode.title()} (charts)',
        'version': VERSION,
        'license': 'Apache-2.0',
        'source': f'@progress/kendo-theme-meridian dist/{swatch}.css',
        'note': ('Kendo UI Meridian ships no stored ramps. These are its chart series A–F '
                 f'(A {NAMES["a"]}, B {NAMES["b"]}, C {NAMES["c"]}, D {NAMES["d"]}, E {NAMES["e"]}, F {NAMES["f"]}) '
                 f'from the {mode} swatch: every color is a CSS relative-color offset from one seed, '
                 f'{fmt(resolve(V, "series"))}, resolved here without gamut mapping. '
                 'Steps run light to dark; the neutral axis is the theme\'s own slate role colors.'),
        'steps': steps,
        'ramps': {NAMES[x]: [fmt(c) for c in ramps[x]] for x in LETTERS},
        'neutrals': {'slate': [fmt(c) for _, c in neu]},
        'neutralSteps': {'slate': [t for t, _ in neu]},
        'neutral': 'slate',
        'poles': {'light': fmt(light_pole), 'dark': fmt(dark_pole)},
        'text': {mode: text, other: None,
                 'basis': f'no official rule (series colors are fills); {text} is the first step where all six reach 4.5:1 on the {mode} app surface'},
        'gamut': gamut,
        'poleNames': {'light': 'light app surface', 'dark': 'dark app surface'},
    }


if __name__ == '__main__':
    pkg = sys.argv[1] if len(sys.argv) > 1 else 'package'
    print(json.dumps([entry(pkg, 'meridian-main', False), entry(pkg, 'meridian-main-dark', True)],
                     ensure_ascii=False, separators=(',', ':')))
