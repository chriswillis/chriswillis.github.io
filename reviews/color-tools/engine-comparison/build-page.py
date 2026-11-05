# Build comparison.html (self-contained) from results.json.
import json, math, re, os, html
here = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(here, 'results.json')))
ENG = [('topology', 'Topology engine', 'Through color, as the ramp page uses it'),
       ('palette-dna', 'palette-dna', "spacing: 'reference' (keeps the palette's own step lightness)"),
       ('palette-dna-auto', 'palette-dna default', "spacing: 'auto' (evens the steps in most systems)"),
       ('nearest-ramp', 'Baseline', 'Nearest remaining ramp, rotated to the seed hue')]
def lab(s):
    m = re.match(r'oklch\(([\d.]+)% ([\d.]+) ([\d.]+|none)\)', s); L = float(m[1]) / 100; C = float(m[2]); h = 0 if m[3] == 'none' else math.radians(float(m[3]))
    return (L, C * math.cos(h), C * math.sin(h))
def q(a, p): a = sorted(a); return a[min(len(a) - 1, int(p * len(a)))]
rows = []
for r in R:
    k = r['steps'].index(r['seedStep']); t = lab(r['truth'][k]); shifted = {}
    for key, _, _ in ENG:
        g = r['engines'][key]; ds = [math.dist(lab(x), t) * 100 if x else 99 for x in g]
        shifted[key] = r['steps'][min(range(len(ds)), key=ds.__getitem__)]
    rows.append({'pal': r['pal'], 'palName': r['palName'], 'ramp': r['ramp'], 'steps': r['steps'], 'seed': r['seedStep'],
                 'truth': r['truth'], 'eng': {e: r['engines'][e] for e, _, _ in ENG},
                 'err': {e: [None if x is None else round(x, 2) for x in r['scores'][e]['perStep']] for e, _, _ in ENG},
                 'mean': {e: round(r['scores'][e]['mean'], 2) for e, _, _ in ENG}, 'placed': shifted})
main = [r for r in rows if r['pal'] != 'meridian-light']
summ = []
for e, name, note in ENG:
    a = [x for r in main for x in r['err'][e] if x is not None]
    moved = sum(r['placed'][e] != r['seed'] for r in main)
    summ.append((name, note, q(a, .5), q(a, .9), 100 * sum(x < 2 for x in a) / len(a), 100 * moved / len(main) if e != 'nearest-ramp' else None))
pals = []
for pid in dict.fromkeys(r['pal'] for r in rows):
    rs = [r for r in rows if r['pal'] == pid]
    pals.append((pid, rs[0]['palName'], len(rs), [q([x for r in rs for x in r['err'][e] if x is not None], .5) for e, _, _ in ENG]))
wins = {'t': 0, 'd': 0, 'x': 0}
for r in main:
    a, b = r['mean']['topology'], r['mean']['palette-dna']; wins['t' if a < b - .25 else 'd' if b < a - .25 else 'x'] += 1
def cell(v, best): return f'<td class="num{" best" if v == best else ""}">{v:.2f}</td>'
srows = ''.join(f'<tr><th scope="row">{html.escape(n)}<span>{html.escape(no)}</span></th><td class="num">{m:.2f}</td><td class="num">{p:.2f}</td><td class="num">{w:.0f}%</td><td class="num">{"—" if mv is None else f"{mv:.0f}%"}</td></tr>' for n, no, m, p, w, mv in summ)
prows = ''.join(f'<tr><th scope="row">{html.escape(nm)}</th><td class="num">{n}</td>' + ''.join(cell(v, min(vals)) for v in vals) + '</tr>' for pid, nm, n, vals in pals)
DATA = json.dumps({'rows': rows, 'eng': [[e, n] for e, n, _ in ENG]}, separators=(',', ':'))
page = open(os.path.join(here, 'page-template.html')).read()
page = page.replace('{{SUMMARY}}', srows).replace('{{PALS}}', prows).replace('{{DATA}}', DATA).replace('{{N}}', str(len(main))) \
           .replace('{{WT}}', str(wins['t'])).replace('{{WD}}', str(wins['d'])).replace('{{WX}}', str(wins['x'])) \
           .replace('{{ENGHEAD}}', ''.join(f'<th scope="col">{html.escape(n)}</th>' for _, n, _ in ENG))
open(os.path.join(here, 'comparison.html'), 'w').write(page)
print('ok', len(page), summ, wins)
