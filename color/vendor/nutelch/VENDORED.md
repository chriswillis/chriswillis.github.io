# Vendored: nutelch

- Upstream: https://github.com/meodai/nutelch
- Version: 0.2.0 (package.json at vendoring time)
- Commit: 915b785c0ce61c5b8d3910a6b560fcb78b0e0889
- Vendored: 2026-09-19
- Files: src/{index,interp,coords,curves,toe}.ts and src/luts/* (LUT data + decoder). Tests, demo and eval omitted.
- License: MIT (see LICENSE)

Known limits designed around (from upstream docs and our own checks):
- Practical worst-case boundary error about ±0.009 chroma (bilinear LUT interpolation).
- `reach() <= 1` is not a gamut guarantee; constant-hue slices are not convex, a straight
  ray can bulge out of gamut by up to ~0.024 chroma.
- Access only through `src/gamut/shell.ts`. Nothing else imports this directory.
