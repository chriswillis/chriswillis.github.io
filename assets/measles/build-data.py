r"""Build measles.json for the measles page.

Inputs (downloaded into raw/):
  raw/tycho/US.14189004.csv  Project Tycho v2.0, Counts of Measles reported in the US, 1888-2002
                             (DOI 10.25337/T7/ptycho.v2.0/US.14189004, CC BY 4.0, via Zenodo 11452259)
  raw/owid.csv               Our World in Data, reported measles case rate by state (CDC NNDSS annual summaries)
  raw/nndss.json             CDC NNDSS Weekly Data (data.cdc.gov x9gk-5huc), measles rows
  raw/mmr.json               CDC SchoolVaxView kindergarten coverage (data.cdc.gov ijqb-a7ye), MMR rows
  raw/pop/XX.csv             Census resident population by state via FRED (XXPOP), thousands

Fetch (into raw/):
  curl -L -o tycho.zip "https://zenodo.org/records/11452259/files/US.14189004.zip?download=1" && unzip -d tycho tycho.zip
  curl -L -o owid.csv "https://ourworldindata.org/grapher/reported-measles-case-rate-by-state-in-the-united-states.csv?csvType=full&useColumnShortNames=true"
  curl -o nndss.json "https://data.cdc.gov/resource/x9gk-5huc.json?\$select=states,year,week,label,m1,m3,m3_flag,location1,location2&\$where=starts_with(label,'Measles')&\$limit=60000"
  curl -o mmr.json "https://data.cdc.gov/resource/ijqb-a7ye.json?vaccine=MMR&\$limit=5000"
  for s in AL AK ... WY DC; do curl -o pop/$s.csv "https://fred.stlouisfed.org/graph/fredgraph.csv?id=${s}POP"; done
Run: python3 build-data.py raw measles.json, then paste measles.json into the #snapshot script tag of measles.html.

Rules:
  1928-2001  Tycho. Annual = max(sum of weekly reports, largest year-to-date total confirmed by the
             following week). Weeks are assigned to the MMWR year of their Thursday; year-to-date rows
             whose start and end fall in different MMWR years are dropped as mis-dated. State-years Tycho lacks
             (e.g. New York 1964-2001) fall back to OWID.
  2002-2022  OWID rate x FRED population (national sums match CDC's published totals).
  2023-now   NNDSS weekly tables: last available week's year-to-date count, indigenous + imported,
             New York City added to New York. The page refreshes the current year live.
"""
import json, glob, os, sys, datetime
import pandas as pd

R = sys.argv[1] if len(sys.argv) > 1 else "raw"
OUT = sys.argv[2] if len(sys.argv) > 2 else "measles.json"
names = {"AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware", "DC": "District of Columbia", "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina", "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming"}
up = {v.upper(): k for k, v in names.items()}
inv = {v: k for k, v in names.items()}

# population
pop = []
for f in glob.glob(f"{R}/pop/*.csv"):
    x = pd.read_csv(f); x.columns = ["date", "pop"]
    x["abbr"] = os.path.basename(f)[:2]; x["year"] = x.date.str[:4].astype(int)
    pop.append(x[["abbr", "year", "pop"]])
pop = pd.concat(pop); pop["pop"] = (pop["pop"] * 1000).round()
last_pop_year = int(pop.year.max())

# Tycho
d = pd.read_csv(f"{R}/tycho/US.14189004.csv", dtype=str, keep_default_na=False)
s = d[(d.Admin2Name == "NA") & (d.CityName == "NA") & (d.Admin1Name != "NA") & (d.Fatalities == "0")].copy()
s["abbr"] = s.Admin1Name.map(up); s = s.dropna(subset=["abbr"])
s["v"] = s.CountValue.astype(float)
en = pd.to_datetime(s.PeriodEndDate); st = pd.to_datetime(s.PeriodStartDate)
s["year"] = (en - pd.Timedelta(days=2)).dt.year   # MMWR year: the year holding the week's Thursday
w = s[s.PartOfCumulativeCountSeries == "0"].groupby(["year", "abbr"]).v.sum()
c = s[s.PartOfCumulativeCountSeries == "1"]
cst, cen = st[c.index], en[c.index]
# year-to-date series must start and end in the same MMWR year; a few rows are mis-dated in the source
c = c[((cst + pd.Timedelta(days=3)).dt.year == (cen - pd.Timedelta(days=2)).dt.year) & ((cen - cst).dt.days <= 371)]
def persistent_max(g):
    """Largest year-to-date total that is confirmed by the following week (drops one-week transcription spikes)."""
    v = g.groupby("PeriodEndDate").v.max().sort_index().tolist()
    if len(v) < 3: return max(v)
    cand = [min(v[i], v[i + 1]) for i in range(len(v) - 1)]
    if v[-1] <= 3 * v[-2] + 20: cand.append(v[-1])
    return max(cand)
c = c.groupby(["year", "abbr"])[["PeriodEndDate", "v"]].apply(persistent_max)
ty = pd.DataFrame({"w": w, "c": c}).max(axis=1).rename("cases").reset_index()
ty = ty[(ty.year >= 1928) & (ty.year <= 2001)]; ty["src"] = "T"

# OWID
o = pd.read_csv(f"{R}/owid.csv"); o["abbr"] = o.entity.map(inv)
o = o.merge(pop, on=["abbr", "year"], how="left")
o["cases"] = (o.case_rate * o["pop"] / 1e5).round(); o["src"] = "O"
o = o[(o.year >= 1928)][["year", "abbr", "cases", "src"]]
fill = o[o.year <= 2001].merge(ty[["year", "abbr"]], how="left", indicator=True)
fill = fill[fill._merge == "left_only"].drop(columns="_merge")
mid = o[(o.year >= 2002) & (o.year <= 2022)]

# NNDSS
n = pd.DataFrame(json.load(open(f"{R}/nndss.json")))
n["states"] = n.states.str.upper().replace({"NEW YORK CITY": "NEW YORK"})
n["week"] = n.week.astype(int); n["year"] = n.year.astype(int)
n["m3"] = pd.to_numeric(n.m3, errors="coerce").fillna(0)
n["abbr"] = n.states.map(up)
n = n.dropna(subset=["abbr"])
lastwk = n.groupby("year").week.max()
n = n[n.week == n.year.map(lastwk)]
nn = n.groupby(["year", "abbr"]).m3.sum().rename("cases").reset_index()
nn = nn[nn.year >= 2023]; nn["src"] = "N"

allc = pd.concat([ty, fill, mid, nn])
allc = allc[allc.abbr != "DC"]  # DC lacks 2002-2022 state data; kept out of the year grid
allc["py"] = allc.year.clip(upper=last_pop_year)
allc = allc.merge(pop.rename(columns={"year": "py"}), on=["abbr", "py"], how="left")
allc["rate"] = (allc.cases / allc["pop"] * 1e5).round(3)
allc = allc.dropna(subset=["rate"]).sort_values(["year", "abbr"])

# coverage
m = pd.DataFrame(json.load(open(f"{R}/mmr.json")))
m = m[(m.geography_type == "States") & m.geography.isin(names.values())].copy()
m["abbr"] = m.geography.map(inv)
m["pct"] = pd.to_numeric(m.coverage_estimate, errors="coerce")
m = m.dropna(subset=["pct"])
nat = pd.DataFrame(json.load(open(f"{R}/mmr.json")))
nat = nat[nat.geography == "United States"]

# CDC's headline national count (cdc.gov/measles/data-research). It runs ahead of the weekly tables.
# cdc.gov blocks scripted requests, so copy these from the page when refreshing; the page also tries
# https://www.cdc.gov/wcms/vizdata/measles/MeaslesCasesYear.json live in the browser.
CDC_NATIONAL = {"asOf": "2026-10-08", "years": {"2025": 2289, "2026": 4080}}
pop_last = pop[pop.year == last_pop_year].set_index("abbr")["pop"].astype(int).to_dict()
out = {
    "built": datetime.date.today().isoformat(),
    "current": {"year": int(lastwk.index.max()), "week": int(lastwk[lastwk.index.max()])},
    "nndssWeeks": {str(int(y)): int(w) for y, w in lastwk.items() if y >= 2023},
    "states": [{"abbr": k, "name": v, "pop": pop_last[k]} for k, v in sorted(names.items(), key=lambda kv: kv[1])],
    "cases": [[int(r.year), r.abbr, int(r.cases), float(r.rate), r.src] for r in allc.itertuples()],
    "coverage": [[r.year_season, r.abbr, float(r.pct)] for r in m.sort_values(["year_season", "abbr"]).itertuples()],
    "cdcNational": CDC_NATIONAL,
    "coverageUS": {r.year_season: float(r.coverage_estimate) for r in nat.itertuples() if r.coverage_estimate not in ("NA", None)},
}
json.dump(out, open(OUT, "w"), separators=(",", ":"))
tot = allc.groupby("year").cases.sum()
print("rows", len(allc), "years", allc.year.min(), allc.year.max(), "bytes", os.path.getsize(OUT))
print(tot.loc[[1928, 1941, 1958, 1963, 1970, 1990, 2001, 2002, 2011, 2014, 2019, 2022, 2023, 2024, 2025, 2026]].to_string())
print("src counts", allc.src.value_counts().to_dict())
print("coverage seasons", sorted(m.year_season.unique())[-3:], len(m))
