# Stage 7 — design, structural, and style critique

All three fresh-context reviewers completed read-only reviews of the application source. Design and Structural used feature-spec-standard.md adapted to a running app; Style used its persona. Structural and Style explicitly confirmed full reads; Design returned line-specific source findings and evaluated the supplied probes. No application changes. No universal blocker established.

## Major findings

| ID | Finding | Reviewer lenses | Evidence and scope | Recommendation / counterargument |
| --- | --- | --- | --- | --- |
| CR1 | Invalid model state accepted | Design | 425–451,1059–1062,1137–1142,1233,1459–1462; supplied malformed-OKLCH browser reproduction and parser/import probes | Complete syntax, finite coordinates, alpha policy, own-key-safe names. Ordinary hex works and modal exceptions are caught, but supported functional input is still unsafe to accept. |
| CR2 | Exactness promise not enforced | Design, Style | 738–751,811–818,1277–1296,1339–1340,1404; supplied #D14D42 mismatch and P3 probe | Track preserved/changed/substituted input explicitly. Useful near-reference snapping does not establish literal equality. |
| CR3 | Wrong discarded-seed explanation | Design, Style | 814–818 sort by lightness before filtering; 1296 says first entered seed retained | Use surviving seedIndex to identify retained/omitted input, or preserve input priority. “First after sorting” is not a meaningful user interpretation. |
| CR4 | Reference statistics presented as actual generated accuracy | Design, Style | 7,13,254,343,995–1033,1252–1265,1291–1297,1330–1341 | Withhold unsupported probabilities; update metadata too. Local hold-outs and vivid-step caveats do not validate anchors, shifted lightness, or taper. |
| CR5 | Stale import preview and swallowed storage failure | Design | 1220,1497–1504,1515–1524,1532–1535; source transition | Invalidate, validate current fields at commit, and report persistence. Short timing window does not justify advertising stale readiness. |
| CR6 | Reload loses wide-gamut seed | Design | 1423–1445; supplied controller/browser evidence | Versioned non-lossy input state. No Share button does not mitigate ordinary reload loss. |
| CR7 | Keyboard upload action missing | Structural (Major), Design (Nit) | 356–357: label linked to hidden input; no keyboard action | Native upload button or accessible file control. Parent retains Major for a missing advertised keyboard workflow; full keyboard audit remains pending. |
| CR8 | Empty input leaves unexplained previous output | Structural | 1459–1466,1544–1547; source transition, no executed probe | Mark required input and identify previous valid output. Useful result retention needs an explicit status. |
| CR9 | Regression ownership absent for this page | Structural | Sibling tests read the other HTML; probe is diagnostic | Add assertions against this shipped implementation. This is a repair-readiness gap, not proof that all behavior fails. |

## Nits and verification hypotheses

- Export tab roles lack panel relationships, roving focus and arrow behavior; Copy is inside tablist (324–333,1540–1543). Native button activation still works. Use ordinary pressed format buttons or complete tabs. Design and Structural agree this is not a total keyboard failure.
- Import errors use “surface” and “lofted” without a clear recovery action (1172,1200–1201). Style recommends explaining the need for four distinct-hue ramps with matching steps. The methodology introduces surface but does not make “lofted” actionable.
- Broad polite live-region replacement may be verbose. Structural explicitly leaves this unverified pending assistive-technology testing.

## Retain

The static architecture, H1/H2 hierarchy, input-first narrow layout, stacked swatches and native mode buttons fit the task. Do not introduce workers, algorithms or a framework without evidence. These findings stress-test contracts, not absent design-document headings.
