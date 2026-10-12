# Measles page: all text for review

How to edit: change any wording you like, then send the file back. Keep the `###` labels so I can match each block to its place on the page.

- Text in `{curly braces}` is filled in when the page loads, from live or saved data. The value shown is what appears today. You can reword around it, or say in a comment if it should be computed differently.
- Links are written as `[text](url)`.
- Leave notes for me as `> NOTE: ...` anywhere.

---

## 1. Browser tab and social preview

### Page title (browser tab)
We beat measles once: 99 years of cases, state by state

### Search description
Measles cases per 100,000 people in every state from 1928 to 2026, rebuilt from Project Tycho and CDC data, with this year refreshed from the CDC on page load. Plus a map of where kindergarten vaccination has fallen below the herd-immunity line.

### Social share title (Open Graph / X)
We beat measles once: 99 years of cases, state by state

### Social share description (Open Graph)
Measles in every state since 1928, rebuilt from Project Tycho and CDC surveillance data and refreshed from the CDC on page load. The vaccine erased it. The gaps are showing.

### Social share description (X, shorter)
Measles in every state since 1928, rebuilt from Project Tycho and CDC data and refreshed from the CDC on page load.

### Share image alt text
A heat map of measles cases by state and year, dark purple-red before 1963 and nearly white afterward

---

## 2. Top of page

### Brand bar, left
Public health

### Brand bar, right
Live · This year refreshed from the CDC on page load

### Kicker
Measles in America, 1928–2026

### Headline
We beat measles once

### Byline
Charts and text by Chris Willis

### Dateline
Project Tycho and CDC surveillance data · cases reported through the week ending {October 3, 2026}

### Lede
Before 1963, American states reported hundreds of thousands of measles cases a year. The vaccine made the disease so rare that the country declared it eliminated in 2000. In 2026 states have reported {3,782} cases so far, the most since {1991}, and kindergarten vaccination sits below the herd-immunity line in most of the country.

### Status line: while loading
Fetching this year's counts from the CDC…

### Status line: live data loaded
Live: CDC weekly tables through week {39} of {2026}, ending {October 3, 2026}. Earlier years are fixed.

### Status line: CDC unreachable
Couldn't reach the CDC, so this page is showing data saved on {October 12, 2026}, through the week ending {October 3, 2026}.

---

## 3. Fig. 1: the full heat map

### Color key
Cases per 100,000 people · 0 · 100 · 400 · 900 · 1,500+ · No report

### Annotations on the chart
- Vaccine licensed, 1963 *(phone: "1963 vaccine")*
- Declared eliminated, 2000 *(phone: "2000 eliminated")*

### Caption
**Fig. 1 Measles disappears after 1963.** Reported cases per 100,000 people, by state and year, 1928–{2026}. {2026} is the year to date. Hover over a cell for the count. *(phone: "Tap a cell for the count.")*

Note: Square-root color scale. Pre-1965 counts are sums of weekly reports and miss weeks a state did not file. District of Columbia not shown. · Source: Project Tycho; CDC; Our World in Data; Census Bureau · After the Wall Street Journal (2015) and Mike Bostock

---

## 4. Section: The picture

### Eyebrow
The picture

### Heading
One vaccine changed the color of the chart

### Body
In 2015 Tynan DeBold and Dov Friedman of the Wall Street Journal drew a [grid of cases by state and year](https://graphics.wsj.com/infectious-diseases-and-vaccines/) for seven diseases and marked the year each vaccine arrived. It became one of the most shared charts of the decade because it needs no explanation: the color is there, and then it isn't. Mike Bostock later [rebuilt it in Observable Plot](https://observablehq.com/@observablehq/plot-impact-of-vaccines) with a purple-red ramp and a square-root scale, which this page borrows.

Both versions stop in the early 2000s, where Project Tycho's digitized weekly reports end. The grid above runs to the current week. The pre-vaccine rhythm is easy to read: epidemics every two or three years, rolling across states as each new crop of children reached school age. The CDC estimates three to four million Americans caught measles each year then, though only about half a million cases a year were reported.

After the vaccine was licensed in 1963 the color drains within five years. One more band shows up in 1989–91, when about 55,000 cases and 123 deaths, mostly among unvaccinated preschoolers, led to the recommendation of a second dose. By 2000 there was no longer continuous transmission anywhere in the country, which is what "eliminated" means. On this scale the most recent years look clean. They aren't.

---

## 5. Section: The comeback

### Eyebrow
The comeback

### Heading
Zoom in and the last two years light up

### Body
A rate that would have been a quiet year in 1940 is an emergency now, because almost every case can be traced and almost every outbreak means a pocket of unvaccinated people. To see the recent years, the next chart starts in 2000 and uses a logarithmic scale: each step in color is ten times the rate of the last. Gray means no cases were reported that year. States are ordered by their rate since January 2025, and numbers are printed where at least 25 cases were reported.

The CDC counted 2,289 confirmed cases in 2025 and three deaths, the first American measles deaths in a decade. The year began with an outbreak in Gaines County, Texas. In 2026 the count passed 4,000 by early October. The largest totals this year are in Pennsylvania, South Carolina and Utah, where one outbreak has now run for more than a year. A regional commission of the Pan American Health Organization is expected to rule in November on whether the United States has lost its elimination status. Canada lost its status in November 2025.

> NOTE: The paragraph above is static text. It needs a manual update after the PAHO ruling and whenever the state ranking changes.

### Fig. 2 color key
Cases per 100,000 people, log scale · 0.01 · 0.1 · 1 · 10+ · No cases

### Fig. 2 caption
**Fig. 2 The resurgence, on a scale that can see it.** Reported cases per 100,000 people, 2000–{2026}, log scale. States ordered by their rate since January 2025; numbers are case counts. The weekly tables used for 2023 onward show {2,026} cases in 2025 and {3,782} in {2026} through the week ending {October 3, 2026}.

Note: Weekly tables are provisional and run below the CDC's final national counts (2,289 in 2025). · Source: CDC annual summaries via Our World in Data (2000–2022); CDC NNDSS weekly tables (2023–{2026}); Census Bureau

---

## 6. Section: Herd immunity

### Eyebrow
Herd immunity

### Heading
Most states are below the line

### Body
Measles is among the most contagious diseases known: one case in a fully susceptible population infects 12 to 18 others. To stop it spreading, roughly 95 percent of a community needs two doses of MMR vaccine. That 95 percent is a rule of thumb rather than a cliff, but it is the target public health agencies use, and it is what the gray means on this map.

Each year the CDC collects coverage among children entering kindergarten from state immunization programs. In the 2019–20 school year the national rate was 95.2 percent. Since then it has fallen to {92.4} percent in 2025–26, while exemptions reached a record. Drag the slider to watch states slip under the line.

### Controls
- Slider label: School year
- Slider readout: {2025–26}
- Button: Play / Pause

### Headline above the map (changes with the slider)
{39} of {49} reporting states were below 95 percent in {2025–26}. National coverage: {92.4%}

### Map color key
Kindergartners with two MMR doses, % · Below 88 · 88–90 · 90–92 · 92–95 · 95+ herd immunity · No report

### Label above the bar chart
Number of states below 95 percent, by school year

### Fig. 3 caption
**Fig. 3 Kindergarten MMR coverage slipped below the line.** Share of kindergartners with two doses of measles, mumps and rubella vaccine, by state and school year, 2009–10 to 2025–26. Gray states meet the 95 percent herd-immunity target. Click a bar to jump to a year.

Note: Includes the District of Columbia. States use different collection methods. Montana has not reported since 2020–21; Kansas did not report for 2025–26. · Source: CDC SchoolVaxView; state shapes from us-atlas

### Paragraph after the map
A state average is a blunt instrument. The Economist's county map from Johns Hopkins data shows how much it hides: coverage in a single county or school can be 20 points below the state's. Outbreaks start in those pockets, which is why the next chart is not as tidy as the map suggests it should be.

### If the state outlines fail to load
The state outlines could not be loaded. The bar chart below still shows how many states fell short each year.

---

## 7. Section: Coverage and cases

### Eyebrow
Coverage and cases

### Heading
Lower coverage, more measles, but loosely

### Body
Put each state's kindergarten coverage against its cases since January 2025 and the relationship is there: states below 95 percent have had about twice the median case rate of states above it. It is also noisy. Utah, at 87 percent, has the highest rate in the country. New Mexico, which clears the line, has a higher rate than most states that don't, because the West Texas outbreak crossed the border. Several states with low coverage have had almost no cases, so far.

That noise is the honest answer to a fair question: why not shade one map by both vaccination and cases? Because measles arrives as a handful of outbreaks in a handful of places. In any one year most states have few or no cases, so a two-variable map would be mostly one color, and state averages would bury the communities where the cases are.

> NOTE: Utah, New Mexico and "about twice" in the first paragraph are static text taken from today's data.

### Labels on the chart
- Y axis, top tick: 10 cases per 100,000 since Jan. 2025 *(phone: "10 per 100,000")*
- Bottom row: No cases
- Vertical line: 95% threshold
- Named dots (chosen from the data): the six highest rates plus the two lowest coverage values. Today that's Utah, South Carolina, Pennsylvania, North Dakota, New Mexico, Arizona, Idaho and Wisconsin.

### Fig. 4 caption
**Fig. 4 A real relationship, with a lot of scatter.** Each dot is a state: kindergarten MMR coverage in 2025–26 against reported cases per 100,000 people from January 2025 through {October 3, 2026} (log scale). Median rate below 95 percent: {0.48}; at or above: {0.23}. Rank correlation: {-0.32}.

Note: {48} states with coverage data; Kansas and Montana did not report coverage; DC not shown. Case counts are provisional. · Source: CDC SchoolVaxView; CDC NNDSS weekly tables; Census Bureau

---

## 8. Hover tooltips

### Heat maps (Figs. 1 and 2)
{Texas}, {2025} *(+ " (through week 39)" for the current year)*
{803} cases · {2.5} per 100,000
{source name}

Source names:
- Project Tycho (weekly reports)
- CDC annual summaries via Our World in Data
- CDC NNDSS weekly tables, provisional

Empty cell: {State}, {year} / No report in the source

### Map (Fig. 3)
{Idaho}, {2025–26}
{75.2}% of kindergartners with two MMR doses *(or "Not reported")*

### Bar chart
{2025–26}
{39} of {49} reporting states below 95%

### Scatterplot (Fig. 4)
{Utah}
{87.2}% of kindergartners vaccinated, {2025–26}
{710} cases since January 2025 · {20} per 100,000

---

## 9. Screen-reader descriptions (not visible on the page)

- **Fig. 1:** Heat map of measles cases per 100,000 people by state and year, 1928 to {2026}. Rates are high in every state until the vaccine is licensed in 1963, then fall to near zero within five years. A smaller band appears around 1990. Recent years are faint on this scale.
- **Fig. 2:** Heat map of measles cases per 100,000 people by state, 2000 to {2026}, on a log scale. Most cells are gray or pale until 2025 and 2026, when many states darken. States are ordered by their rate since January 2025.
- **Fig. 3 map:** Map of kindergarten MMR coverage by state, {2025–26}. {39} of {49} reporting states are below the 95 percent herd-immunity threshold.
- **Fig. 3 bars:** Bar chart of the number of states below 95 percent MMR coverage, by school year.
- **Fig. 4:** Scatter plot of kindergarten MMR coverage against measles cases per 100,000 since January 2025, by state. States with lower coverage tend to have higher case rates, but the relationship is loose. Utah has the highest rate.

---

## 10. More experiments (cards at the bottom)

### Card 1
**Some monsters are real: the 2026 El Niño, charted live**
Daily sea-surface temperature in the Niño 3.4 region, recomputed from NOAA data on page load and drawn against a warped grid of standard deviations.

> NOTE: Cards 2–4 (Luminet, Yves Outlines, color palette) are copied unchanged from the El Niño page and aren't repeated here.

---

## 11. About this page (colophon)

### Heading
About this page

### 1928–2001
**1928–2001.** Counts are from [Project Tycho version 2.0](https://doi.org/10.25337/T7/ptycho.v2.0/US.14189004), the University of Pittsburgh's digitization of the weekly notifiable-disease tables the CDC and its predecessors published. For each state and year the page uses whichever is larger: the sum of the weekly reports, or the largest year-to-date total the state published that the following week's report confirms (Tycho has those from 1965). That rule drops a handful of mis-dated rows and one-week transcription spikes in the source. Each week is assigned to the MMWR year containing its Thursday. Tycho only records weeks a state actually reported, so some state-years are short: national totals usually run 5 to 25 percent below the CDC's annual summaries, and 1992–93 run somewhat high. The shape of the history is not in doubt; individual cells are approximate. New York is missing from Tycho between 1964 and 2001; those years, and a few other gaps, are filled from the state series published by Our World in Data. A hatched cell means no source has a number.

### 2002–2022
**2002–2022.** State rates come from [Our World in Data](https://ourworldindata.org/grapher/reported-measles-case-rate-by-state-in-the-united-states), which compiles the CDC's annual Summary of Notifiable Diseases and NNDSS annual tables. Converted back to counts with Census population, they add up to the CDC's published national total in every year (44 cases in 2002, 1,274 in 2019).

### 2023 to now
**2023 to now.** Counts are the year-to-date totals in the [NNDSS weekly tables](https://data.cdc.gov/NNDSS/NNDSS-Weekly-Data/x9gk-5huc), indigenous and imported cases combined, with New York City added to New York. The current year and the one before are fetched live from data.cdc.gov when the page loads; if that fails, the page falls back to a copy saved on {October 12, 2026} and says so under the headline. Weekly tables are provisional and lag the CDC's own count: they sum to {2,026} cases for 2025 against the CDC's final 2,289. State figures are the best available but run low.

### Rates
**Rates** are cases per 100,000 residents, using Census Bureau annual estimates via FRED; the latest year's population stands in for the current year. The District of Columbia is left out of the grids because no state-level series covers it for 2002–2022. The color scale in Fig. 1 is a square root and tops out at 1,500 per 100,000; a few epidemic years in small states ran higher. Fig. 2 tops out at 10 per 100,000.

### Coverage
**Coverage** is the CDC's [SchoolVaxView](https://data.cdc.gov/Vaccinations/Vaccination-Coverage-and-Exemptions-among-Kinderga/ijqb-a7ye) estimate of two-dose MMR coverage among kindergartners, collected by states using methods that range from a census of every school to a sample survey, so small differences between states are within the noise. Montana has not reported since 2020–21 and Kansas did not report for 2025–26. Kindergarten coverage is a leading indicator, not a measure of immunity in the whole population.

### Sources
Sources: Van Panhuis, W., Cross, A., Burke, D., [Counts of Measles reported in the United States of America: 1888–2002](https://zenodo.org/records/11452259), Project Tycho v2.0 (CC BY 4.0). CDC [National Notifiable Diseases Surveillance System weekly tables](https://data.cdc.gov/NNDSS/NNDSS-Weekly-Data/x9gk-5huc). CDC [Measles cases and outbreaks](https://www.cdc.gov/measles/data-research/index.html), October 8, 2026. CDC [SchoolVaxView](https://www.cdc.gov/schoolvaxview/data/index.html). Our World in Data, [Reported measles case rate by state](https://ourworldindata.org/grapher/reported-measles-case-rate-by-state-in-the-united-states). U.S. Census Bureau resident population via [FRED](https://fred.stlouisfed.org/). CDC, [History of measles](https://www.cdc.gov/measles/about/history.html). STAT, [on the PAHO elimination review](https://www.statnews.com/2026/08/06/measles-elimination-status-2026-paho/), August 6, 2026. Johns Hopkins, [county MMR coverage study](https://hub.jhu.edu/2025/06/03/united-states-measles-vaccination-rate-declines), 2025.

### Credits
After Tynan DeBold and Dov Friedman, [Battling Infectious Diseases in the 20th Century](https://graphics.wsj.com/infectious-diseases-and-vaccines/), Wall Street Journal, 2015, and Mike Bostock's [Plot recreation](https://observablehq.com/@observablehq/plot-impact-of-vaccines). Charts are drawn with [Observable Plot](https://observablehq.com/plot/) and [D3](https://d3js.org/); state shapes are from [us-atlas](https://github.com/topojson/us-atlas). The data is built by `assets/measles/build-data.py` in this site's repository.

### Footer
Set in IBM Plex Serif, Sans and Mono. Data from Project Tycho (CC BY 4.0), the CDC and the Census Bureau. Text and charts © 2026 Chris Willis. [cewillis.com](index.html)

---

## 12. Homepage teaser card (index.html)

### Title
We beat measles once. 99 years of cases, state by state

### Blurb
The Wall Street Journal's famous vaccine grid, rebuilt from Project Tycho and CDC surveillance data and carried to the current week, with this year refreshed from the CDC every time the page loads. A log-scale zoom on the 2025–26 resurgence, a map of the states where kindergarten MMR coverage has slipped under the 95 percent herd-immunity line, and an honest look at how loosely coverage and cases line up.

### Image alt text
A heat map of measles cases by state and year, dark purple-red before the 1963 vaccine and nearly white afterward
