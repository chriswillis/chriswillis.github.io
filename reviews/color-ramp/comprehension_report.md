## What this proposes

The page offers a ramp generator that takes one color, optionally a second, and follows the shape of a selected design system. Users can keep their input “exact,” fit it to the reference palette, inspect contrast, and export the resulting tokens. It also promises an estimate of how closely generated steps resemble choices the reference system’s designers would make.

## How the existing system works, per this document

The implementation builds an Oklab surface from reference ramps and maps inputs onto it. Most results come from an anchored generator that adjusts lightness, hue, and colorfulness; near-reference inputs and neutral inputs take separate branches that return existing ramps. Confidence text combines pooled hold-out statistics, local adjustment factors, and a near-ramp taper. Imports and previous settings are stored locally.

Scope correction: the main Engine script starts at line **365**, not 388; importer and controller scripts start at **1055** and **1208**. Findings concern this running application. The implementation-progress file was background context, not evidence that fixes exist here. No files were modified or browser checks performed by this reviewer. The first attempt hit a usage limit; the single retry completed.

1. **Major — The confidence wording presents reference statistics as predictions for the actual anchored result.**
   **Affected scope:** lines 343, 1259–1264, 1292–1297, 1329–1342.
   The result says steps “typically land within” a number of a designer-made ramp and that “1 in 10” exceed another number. However, `band()` uses mean input hue, reference gaps, and calibration factors; it does not assess the generated anchors, altered lightness, saturation scaling, or clipping. Two input colors can produce a changing hue trajectory while receiving one band calculated at their mean hue. The user cannot distinguish measured reference reconstruction performance from validated accuracy of their output. Label these as empirical reference statistics and withhold predictive result claims when the generation differs from the tested construction.

2. **Major — “Stays exact” promises behavior that several visible workflows do not provide.**
   **Affected scope:** lines 287, 341, 708–731, 1287–1290, 1339–1343, 1404.
   The control and help promise the input goes into the ramp unchanged. Near-reference recognition can substitute a stored palette sample; neutral inputs return the palette’s neutral ramp without an input anchor; lightness outside the palette’s bounds can move to its endpoint. The neutral explanation describes the replacement but never reconciles it with the still-active “Stays exact” promise, and the mode hint repeats that promise unconditionally. Explain these exceptions beside the control and explicitly identify replacement or movement in the result; use “matches closely” rather than “Your color is” when a nearby reference sample is substituted.

3. **Major — The dropped-second-color message can identify the wrong retained input.**
   **Affected scope:** lines 815–816 and 1296.
   When inputs are almost equal in lightness, generation sorts them lightest first and removes the darker near-duplicate. The result always says “only the first one was used.” If the second input is slightly lighter, it is actually the retained input. This makes the user’s primary color appear preserved when it was discarded. Preserve input priority or derive the message from the surviving `seedIndex`, naming the retained and omitted colors.

4. **Major — File upload is presented as an action but has no keyboard-operable control.**
   **Affected scope:** lines 356–357 and 1518–1524.
   “Upload a file” is a plain label pointing to a `hidden` file input. The label is not keyboard focusable, and the hidden input cannot receive keyboard focus. Keyboard users can paste or load an example, but cannot operate the advertised upload action. Use a native button that opens the picker, or keep the native file input accessibly focusable with an appropriate visible label.

5. **Nit — P3 swatches show a different hex value without an always-visible explanation.**
   **Affected scope:** lines 1312–1317 and 1382–1390.
   A P3 swatch is rendered in Display P3 while its visible hex is a clipped sRGB fallback. That distinction appears in a pointer tooltip and the CSS export comment, but not beside the swatch or in Tailwind v3 export. Users copying the visible value or choosing another export format can reasonably expect the displayed color. Add a persistent explanation of the P3 marker and identify which formats retain the full color.
