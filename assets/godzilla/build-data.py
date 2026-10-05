#!/usr/bin/env python3
"""Refresh the two data snapshots used by godzilla-el-nino.html.

    python3 assets/godzilla/build-data.py            # writes oni.json and hovmoller.json beside this script
    python3 assets/godzilla/build-data.py --oni-only
    python3 assets/godzilla/build-data.py --hov-only

Neither source sends CORS headers, so the page cannot fetch them live; this script
pulls them and writes compact JSON that the page loads from the same origin.

  oni.json       NOAA CPC Oceanic Niño Index (3-month running mean of ERSST Niño 3.4 anomalies,
                 CPC's rolling 30-year base periods), DJF 1950 → latest season.
  hovmoller.json Weekly, 1° equatorial (5°S–5°N) sea-surface-temperature anomaly along the Pacific,
                 120°E → 80°W, last ~15 months, from NOAA OISST v2.1 via NOAA CoastWatch ERDDAP,
                 against a 1991–2020 daily climatology computed here (so it matches the page's
                 other figures; ERDDAP's own `anom` field uses 1971–2000).

Standard library only. Roughly 35 HTTP requests; a few minutes.
"""
import json, sys, time, datetime as dt, statistics, urllib.request, urllib.parse, pathlib

HERE = pathlib.Path(__file__).resolve().parent
UA = {"User-Agent": "cewillis.com godzilla-el-nino build-data (python urllib)"}

ONI_URL = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt"
ERDDAP = "https://coastwatch.pfeg.noaa.gov/erddap/griddap/"
DS_FINAL, DS_NRT = "ncdcOisst21Agg", "ncdcOisst21NrtAgg"   # 0–360° longitudes

LAT0, LAT1, LAT_STRIDE = -4.875, 4.875, 8      # 5 rows: -4.875, -2.875, -0.875, 1.125, 3.125
LON0, LON1, LON_STRIDE = 120.125, 279.875, 4   # 160 columns, 1° apart, 120°E → 80°W
WEEKS_BACK = 66                                # ~15 months
CLIM_YEARS = range(1991, 2021)


def get(url, retries=3):
    for i in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r:
                return r.read().decode("utf-8")
        except Exception as e:  # noqa
            if i == retries - 1:
                raise
            print("  retry after error:", e, file=sys.stderr)
            time.sleep(3 * (i + 1))


# ---------------------------------------------------------------- ONI
def build_oni():
    print("ONI: fetching", ONI_URL)
    lines = get(ONI_URL).strip().splitlines()[1:]
    seasons = []
    for ln in lines:
        s, y, total, anom = ln.split()
        seasons.append({"season": s, "year": int(y), "total": float(total), "anom": float(anom)})
    out = {
        "generated": dt.date.today().isoformat(),
        "source": "NOAA Climate Prediction Center, Oceanic Niño Index (ERSST, 3-month running mean, rolling 30-year base periods)",
        "url": ONI_URL,
        "seasons": seasons,
    }
    (HERE / "oni.json").write_text(json.dumps(out, separators=(",", ":")))
    last = seasons[-1]
    print(f"ONI: {len(seasons)} seasons, latest {last['season']} {last['year']} = {last['anom']:+.2f}")


# ---------------------------------------------------------------- ERDDAP helpers
def erddap_sst(dataset, dates, coverage_end=None):
    """Fetch sst for the equatorial band on each date in `dates` (ISO yyyy-mm-dd).
    Returns {date: [lat-mean sst per longitude]} and the longitude list."""
    # ERDDAP needs a contiguous time range with a stride; dates here are 7 days apart,
    # so one request per contiguous weekly run.
    acc = {}
    lons = set()
    CHUNK = 16                                   # weeks per request: keeps responses well under ERDDAP's limits
    for c in range(0, len(dates), CHUNK):
        part = dates[c:c + CHUNK]
        t0 = part[0]
        # stop one day past the last wanted date: ERDDAP's strided stop is otherwise sometimes exclusive
        t1 = dt.date.fromisoformat(part[-1]) + dt.timedelta(days=1)
        if coverage_end and t1 > coverage_end:      # ERDDAP 404s on a stop past the dataset's end
            t1 = coverage_end
        t1 = t1.isoformat()
        q = (f"{ERDDAP}{dataset}.json?sst"
             f"[({t0}T12:00:00Z):7:({t1}T12:00:00Z)]"
             f"[(0.0):1:(0.0)]"
             f"[({LAT0}):{LAT_STRIDE}:({LAT1})]"
             f"[({LON0}):{LON_STRIDE}:({LON1})]")
        url = q.replace("[", "%5B").replace("]", "%5D")
        tbl = json.loads(get(url))["table"]
        cols = tbl["columnNames"]
        it, ilo, isst = cols.index("time"), cols.index("longitude"), cols.index("sst")
        # ERDDAP strides by index, so a missing day in the archive shifts every later sample
        # by one day; snap each returned date to the nearest wanted date (within 3 days).
        wanted = [dt.date.fromisoformat(x) for x in part]
        snap = {}
        for row in tbl["rows"]:
            raw = row[it][:10]
            if raw not in snap:
                rd = dt.date.fromisoformat(raw)
                near = min(wanted, key=lambda w: abs((w - rd).days))
                snap[raw] = near.isoformat() if abs((near - rd).days) <= 3 else None
            d = snap[raw]
            if d is None:
                continue
            lon = row[ilo]
            lons.add(lon)
            v = row[isst]
            if v is None:
                continue
            acc.setdefault(d, {}).setdefault(lon, []).append(v)
    lons = sorted(lons)
    out = {}
    for d, bylon in acc.items():
        out[d] = [round(statistics.fmean(bylon[l]), 3) if l in bylon and bylon[l] else None for l in lons]
    return out, lons


def weekly_dates(end, n):
    return [(end - dt.timedelta(days=7 * k)).isoformat() for k in range(n - 1, -1, -1)]


def latest_available(dataset):
    info = json.loads(get(f"https://coastwatch.pfeg.noaa.gov/erddap/info/{dataset}/index.json"))
    for r in info["table"]["rows"]:
        if r[1] == "NC_GLOBAL" and r[2] == "time_coverage_end":
            return dt.date.fromisoformat(r[4][:10])
    raise RuntimeError("no time_coverage_end for " + dataset)


def build_hov():
    end_final = latest_available(DS_FINAL)
    end_nrt = latest_available(DS_NRT)
    end = end_nrt
    print(f"Hovmöller: final data to {end_final}, near-real-time to {end_nrt}")
    dates = weekly_dates(end, WEEKS_BACK)
    final_dates = [d for d in dates if dt.date.fromisoformat(d) <= end_final]
    nrt_dates = [d for d in dates if dt.date.fromisoformat(d) > end_final]

    print(f"Hovmöller: fetching {len(final_dates)} weeks from {DS_FINAL} ...")
    sst, lons = erddap_sst(DS_FINAL, final_dates, end_final)
    if nrt_dates:
        print(f"Hovmöller: fetching {len(nrt_dates)} weeks from {DS_NRT} ...")
        s2, _ = erddap_sst(DS_NRT, nrt_dates, end_nrt)
        sst.update(s2)
    missing = [d for d in dates if d not in sst]
    if missing:
        print("  missing weeks (filled from neighbours):", missing)
    for d in missing:                               # linear fill from the nearest weeks on either side
        i = dates.index(d)
        prev = next((dates[k] for k in range(i - 1, -1, -1) if dates[k] in sst), None)
        nxt = next((dates[k] for k in range(i + 1, len(dates)) if dates[k] in sst), None)
        if prev and nxt:
            sst[d] = [None if (a is None or b is None) else round((a + b) / 2, 3) for a, b in zip(sst[prev], sst[nxt])]
        elif prev or nxt:
            sst[d] = list(sst[prev or nxt])
    dates = [d for d in dates if d in sst]

    # climatology: same calendar dates in each of 1991–2020 (Feb 29 → Feb 28)
    print(f"Hovmöller: climatology, {len(CLIM_YEARS)} years ...")
    clim_acc = {d: [[] for _ in lons] for d in dates}
    for y in CLIM_YEARS:
        pairs = []                                   # (target index, date in year y)
        for i, d in enumerate(dates):
            m, dd = int(d[5:7]), int(d[8:10])
            if m == 2 and dd == 29:
                dd = 28
            pairs.append((i, dt.date(y, m, dd)))
        # the weekly series may wrap a year boundary; ERDDAP needs each request to be one
        # contiguous 7-day-strided run, so split where the gap is not 7 days
        runs, cur = [], [pairs[0]]
        for a, b in zip(pairs, pairs[1:]):
            if (b[1] - a[1]).days == 7:
                cur.append(b)
            else:
                runs.append(cur); cur = [b]
        runs.append(cur)
        for run in runs:
            got, _ = erddap_sst(DS_FINAL, [x[1].isoformat() for x in run], end_final)
            for i, x in run:
                row = got.get(x.isoformat())
                if not row:
                    continue
                for j, v in enumerate(row):
                    if v is not None:
                        clim_acc[dates[i]][j].append(v)
        print(f"  {y}", end="", flush=True)
    print()
    clim = [[statistics.fmean(c) if c else None for c in clim_acc[d]] for d in dates]
    # smooth the climatology ±1 week along time
    sm = []
    for i in range(len(dates)):
        row = []
        for j in range(len(lons)):
            vals = [clim[k][j] for k in range(max(0, i - 1), min(len(dates), i + 2)) if clim[k][j] is not None]
            row.append(statistics.fmean(vals) if vals else None)
        sm.append(row)
    anom = []
    for i, d in enumerate(dates):
        anom.append([None if (sst[d][j] is None or sm[i][j] is None) else round(sst[d][j] - sm[i][j], 2) for j in range(len(lons))])

    out = {
        "generated": dt.date.today().isoformat(),
        "source": "NOAA OISST v2.1 daily SST via NOAA CoastWatch ERDDAP (ncdcOisst21Agg; last weeks from ncdcOisst21NrtAgg)",
        "baseline": "1991-2020 daily climatology computed from the same grid cells, smoothed ±1 week",
        "lat_band": "5S-5N (five 2-degree-spaced rows averaged)",
        "final_through": end_final.isoformat(),
        "lons": [round(l + 0.375, 1) for l in lons],   # label each 1° column by its centre, e.g. 120.5
        "weeks": dates,
        "filled_weeks": missing,
        "anom": anom,
    }
    (HERE / "hovmoller.json").write_text(json.dumps(out, separators=(",", ":")))
    # summary: Niño 3.4 mean for the last week
    n34 = [j for j, l in enumerate(out["lons"]) if 190 <= l <= 240]
    last = [anom[-1][j] for j in n34 if anom[-1][j] is not None]
    print(f"Hovmöller: {len(dates)} weeks × {len(lons)} longitudes; latest week {dates[-1]} Niño 3.4 mean anomaly {statistics.fmean(last):+.2f} °C")


if __name__ == "__main__":
    args = sys.argv[1:]
    if "--hov-only" not in args:
        build_oni()
    if "--oni-only" not in args:
        build_hov()
