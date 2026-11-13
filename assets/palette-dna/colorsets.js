// Categorical color sets. These are starting colors, not reference palettes: each entry is a color and,
// where the set has one, its lighter pair. The builder runs every pair through the chosen reference
// palette to make a full ramp. Values belong to their authors.
var COLOR_SETS = [
  { id: 'tableau20', name: 'Tableau 20', prefix: 'tableau', version: '2016', credit: 'Tableau Software, from the Tableau 10 release',
    url: 'https://www.tableau.com/blog/colors-upgrade-tableau-10-56782', source: 'ggthemes data-raw/theme-data/tableau.yml',
    pairs: [
      { name: 'blue', color: '#4E79A7', tint: '#A0CBE8' },
      { name: 'orange', color: '#F28E2B', tint: '#FFBE7D' },
      { name: 'green', color: '#59A14F', tint: '#8CD17D' },
      { name: 'yellow', color: '#B6992D', tint: '#F1CE63' },
      { name: 'teal', color: '#499894', tint: '#86BCB6' },
      { name: 'red', color: '#E15759', tint: '#FF9D9A' },
      { name: 'gray', color: '#79706E', tint: '#BAB0AC' },
      { name: 'pink', color: '#D37295', tint: '#FABFD2' },
      { name: 'purple', color: '#B07AA1', tint: '#D4A6C8' },
      { name: 'brown', color: '#9D7660', tint: '#D7B5A6' }
    ] }
];
