#!/usr/bin/env python3
"""Build feed.xml (RSS) and sitemap.xml from index.html and lab/index.html.

Run from the repo root after adding an essay or exploration:
    python3 scripts/build_feeds.py

The feed lists essays (from "Selected writings") and explorations (from lab/index.html),
newest first. The sitemap lists every page whose canonical URL is on cewillis.com;
essays republished from elsewhere point their canonical away and are left out.
"""
import datetime, html, pathlib, re, subprocess

SITE = "https://cewillis.com/"
ROOT = pathlib.Path(__file__).resolve().parent.parent

def text(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()

def last_modified(path):
    out = subprocess.run(["git", "log", "-1", "--format=%cs", "--", str(path)],
                         cwd=ROOT, capture_output=True, text=True).stdout.strip()
    return out or datetime.date.today().isoformat()

index = (ROOT / "index.html").read_text()
lab = (ROOT / "lab/index.html").read_text()

items = []
writings = index[index.index('class="writings"'):]
writings = writings[:writings.index("</section>")]
for href, body in re.findall(r'<a class="writing" href="([^"]+)">(.*?)</a>', writings, re.S):
    items.append(dict(
        title=text(re.search(r'writing-title">(.*?)</span>', body, re.S).group(1)),
        desc=text(re.search(r'writing-dek">(.*?)</span>', body, re.S).group(1)),
        date=re.search(r'datetime="([^"]+)"', body).group(1),
        link=SITE + href, category="Writing"))
for tags, href, body in re.findall(r'<li data-tags="([^"]*)">\s*<a class="lab-item" href="([^"]+)">(.*?)</a>', lab, re.S):
    link = SITE + href.removeprefix("../").split("#")[0]
    items.append(dict(
        title=text(re.search(r'lab-title">(.*?)</span>', body, re.S).group(1)),
        desc=text(re.search(r'lab-blurb">(.*?)</span>', body, re.S).group(1)),
        date=re.search(r'datetime="([^"]+)"', body).group(1),
        link=link, category=tags.split("|")[0]))
items.sort(key=lambda i: i["date"], reverse=True)

def rfc822(d):
    d = datetime.date.fromisoformat(d.ljust(10, "-")[:7] + "-01" if len(d) == 7 else d)
    return d.strftime("%a, %d %b %Y 12:00:00 +0000")

esc = lambda s: html.escape(s, quote=False)
rss = ['<?xml version="1.0" encoding="UTF-8"?>',
       '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">', "<channel>",
       "  <title>Chris Willis</title>", f"  <link>{SITE}</link>",
       "  <description>Essays and explorations by Chris Willis: design, data and human-AI collaboration.</description>",
       "  <language>en-us</language>",
       f'  <atom:link href="{SITE}feed.xml" rel="self" type="application/rss+xml" />',
       f"  <lastBuildDate>{rfc822(items[0]['date'])}</lastBuildDate>"]
for i in items:
    rss += ["  <item>", f"    <title>{esc(i['title'])}</title>", f"    <link>{esc(i['link'])}</link>",
            f"    <guid>{esc(i['link'])}</guid>", f"    <pubDate>{rfc822(i['date'])}</pubDate>",
            f"    <category>{esc(i['category'])}</category>", f"    <description>{esc(i['desc'])}</description>", "  </item>"]
rss += ["</channel>", "</rss>", ""]
(ROOT / "feed.xml").write_text("\n".join(rss))

# Sitemap: every published HTML page whose canonical is on this site
skip = {"404.html"}
urls = []
for p in sorted(ROOT.rglob("*.html")):
    rel = p.relative_to(ROOT).as_posix()
    if rel in skip or rel.startswith(("_", ".", "color/", "Claude outputs/", "node_modules/")) or "-old" in rel or "/_" in rel:
        continue
    m = re.search(r'<link rel="canonical" href="([^"]+)"', p.read_text(errors="ignore"))
    if not m or not m.group(1).startswith(SITE):
        continue
    urls.append((m.group(1), last_modified(p)))
sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
sm += [f"  <url><loc>{u}</loc><lastmod>{d}</lastmod></url>" for u, d in urls]
sm += ["</urlset>", ""]
(ROOT / "sitemap.xml").write_text("\n".join(sm))
print(f"feed.xml: {len(items)} items; sitemap.xml: {len(urls)} urls")
