#!/usr/bin/env python3
"""Save same-origin copies of the live data behind the exploration pages.

    python3 scripts/refresh_data.py            # daily feeds
    python3 scripts/refresh_data.py --weekly   # also rebuild the Godzilla ONI and Hovmöller snapshots

Each page fetches its sources live first. When a source is down, slow or blocks cross-site
requests, the page falls back to the files written here, and only then to the copy embedded
in the HTML. Run by .github/workflows/refresh-data.yml; standard library only.

Writes
  assets/godzilla/nino34.json          Climate Reanalyzer daily Niño 3.4 SST (same shape the page fetches)
  assets/godzilla/crw-pacific-latest.png  NOAA Coral Reef Watch Pacific SST anomaly map
  assets/godzilla/manifest.json        dates each file above was saved
  assets/godzilla/oni.json, hovmoller.json   (--weekly, via assets/godzilla/build-data.py)
  assets/measles/nndss-latest.json     CDC NNDSS weekly measles rows for this year and last (the page's query)
  assets/measles/cdc-year.json         CDC national cases by year (cdc.gov blocks cross-site requests)
  assets/measles/states-albers-10m.json  us-atlas state shapes (only if missing)

A failed source is reported and skipped; the others are still written. Exit code 1 if any failed.
"""
import datetime as dt, json, pathlib, subprocess, sys, time, urllib.parse, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
GOD, MEA = ROOT / "assets/godzilla", ROOT / "assets/measles"
# Climate Reanalyzer rejects requests without a browser-style User-Agent
UA = {"User-Agent": "Mozilla/5.0 (compatible; cewillis.com data refresh; +https://cewillis.com/)"}
TODAY = dt.datetime.now(dt.timezone.utc).date().isoformat()
failures = []


def get(url, retries=3, timeout=90):
    for i in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            if i == retries - 1:
                raise
            print(f"  retry {url[:70]}…: {e}", file=sys.stderr)
            time.sleep(5 * (i + 1))


def write_json(path, data):
    """Write compact JSON; return True if the content changed."""
    text = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
    if path.exists() and path.read_text() == text:
        return False
    path.write_text(text)
    return True


def step(name):
    def wrap(fn):
        print(f"• {name}")
        try:
            fn()
        except Exception as e:  # noqa: BLE001
            print(f"  FAILED: {e}", file=sys.stderr)
            failures.append(name)
        return fn
    return wrap


manifest_path = GOD / "manifest.json"
manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}


@step("Niño 3.4 daily SST (Climate Reanalyzer)")
def _():
    data = json.loads(get("https://climatereanalyzer.org/clim/sst_daily/json_2clim/oisst2.1_nino3.4_sst_day.json"))
    if not isinstance(data, list) or len(data) < 40:
        raise ValueError("unexpected shape")
    if write_json(GOD / "nino34.json", data) or "nino34" not in manifest:
        manifest["nino34"] = TODAY


@step("Coral Reef Watch Pacific map (NOAA)")
def _():
    png = get("https://coralreefwatch.noaa.gov/data_current/5km/v3.1-clim19912020-v1/daily/png/"
              "ct5km_ssta_v3.1-clim19912020-v1_pacific_current.png")
    if not png.startswith(b"\x89PNG") or len(png) < 100_000:
        raise ValueError("not a full PNG")
    path = GOD / "crw-pacific-latest.png"
    if not path.exists() or path.read_bytes() != png:
        path.write_bytes(png)
        manifest["crw"] = TODAY


@step("NNDSS weekly measles rows (CDC)")
def _():
    year = int(TODAY[:4])
    years = {}
    for y in (year - 1, year):
        q = urllib.parse.urlencode({
            "$select": "states,week,label,m3",
            "$where": f"year='{y}' AND starts_with(label,'Measles')",
            "$order": "week DESC", "$limit": "400"})
        rows = json.loads(get("https://data.cdc.gov/resource/x9gk-5huc.json?" + q))
        if rows:
            years[str(y)] = rows
    if not years:
        raise ValueError("no rows")
    old = json.loads((MEA / "nndss-latest.json").read_text()) if (MEA / "nndss-latest.json").exists() else {}
    if old.get("years") != years:
        write_json(MEA / "nndss-latest.json", {"generated": TODAY, "years": years})


@step("National measles cases by year (CDC)")
def _():
    data = json.loads(get("https://www.cdc.gov/wcms/vizdata/measles/MeaslesCasesYear.json"))
    # Was a bare list until Oct 2026; now {"lastUpdated": ..., "data": [...]}. Accept either.
    if isinstance(data, dict):
        data = data.get("data")
    if not isinstance(data, list) or not data:
        raise ValueError("unexpected shape")
    old = json.loads((MEA / "cdc-year.json").read_text()) if (MEA / "cdc-year.json").exists() else {}
    if old.get("data") != data:
        write_json(MEA / "cdc-year.json", {"generated": TODAY, "data": data})


@step("US state shapes (us-atlas, once)")
def _():
    path = MEA / "states-albers-10m.json"
    if not path.exists():
        path.write_bytes(get("https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-albers-10m.json"))


if "--weekly" in sys.argv:
    @step("ONI and Hovmöller snapshots (assets/godzilla/build-data.py)")
    def _():
        subprocess.run([sys.executable, str(GOD / "build-data.py")], check=True, cwd=GOD)

write_json(manifest_path, manifest)
print("Done." if not failures else f"Done with failures: {', '.join(failures)}")
sys.exit(1 if failures else 0)
