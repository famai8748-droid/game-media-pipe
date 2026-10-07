/**
 * DMI YOGA - Pixel-art sprites for the Mario-style arena frame.
 * Each sprite is a character grid rendered to a crisp inline SVG,
 * so the decorations stay sharp at any size and need no image files.
 *
 * Usage: <div data-sprite="mushroom"></div>
 */
const PIXEL_PALETTE = {
  K: '#000000', // outline
  R: '#e52521', // red
  W: '#ffffff', // white
  S: '#fcd8a8', // skin / stem
  Y: '#ffd700', // yellow
  O: '#f08c00', // orange shade
  L: '#fff6a8'  // light highlight
};

const PIXEL_SPRITES = {
  mushroom: [
    '      KKKK      ',
    '    KKRRRRKK    ',
    '   KRRWWWRRRK   ',
    '  KRRWWWWWRRRK  ',
    ' KRRRWWWWWRRWWK ',
    ' KRRRRWWWRRWWWK ',
    'KWWRRRRRRRRWWWRK',
    'KWWWRRRRRRRRWRRK',
    'KWWWRRRRRRRRRRRK',
    'KRWRRKKKKKKRRWRK',
    ' KKKKSSSSSSKKKK ',
    '   KSSKSSKSSK   ',
    '   KSSKSSKSSK   ',
    '   KSSSSSSSSK   ',
    '    KSSSSSSK    ',
    '     KKKKKK     '
  ],
  star: [
    '       KK       ',
    '      KYYK      ',
    '      KYYK      ',
    '     KYLYYK     ',
    'KKKKKKYLYYKKKKKK',
    'KYYYYYYYYYYYYYYK',
    ' KYYYYKYYKYYYYK ',
    '  KYYYKYYKYYYK  ',
    '   KYYKYYKYYK   ',
    '   KYYYYYYYYK   ',
    '  KYYYYYYYYYOK  ',
    '  KYYYYKKYYYOK  ',
    ' KYYYKK  KKYOOK ',
    ' KYYK      KOOK ',
    'KYKK        KKOK',
    'KK            KK'
  ],
  coin: [
    '   KKKK   ',
    '  KYYYYK  ',
    ' KYYYYYOK ',
    ' KYLYYOYK ',
    'KYYLYYOYOK',
    'KYYLYYOYOK',
    'KYYLYYOYOK',
    'KYYLYYOYOK',
    'KYYLYYOYOK',
    'KYYLYYOYOK',
    ' KYLYYOYK ',
    ' KYYYYYOK ',
    '  KOOOOK  ',
    '   KKKK   '
  ]
};

function pixelSpriteToSVG(rows) {
  const width = Math.max(...rows.map(r => r.length));
  const height = rows.length;
  let rects = '';

  rows.forEach((row, y) => {
    // Merge horizontal runs of the same color to keep the SVG small
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let run = 1;
      while (x + run < row.length && row[x + run] === ch) run++;
      if (PIXEL_PALETTE[ch]) {
        rects += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${PIXEL_PALETTE[ch]}"/>`;
      }
      x += run;
    }
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges" width="100%" height="100%">${rects}</svg>`;
}

document.querySelectorAll('[data-sprite]').forEach(el => {
  const rows = PIXEL_SPRITES[el.dataset.sprite];
  if (rows) el.innerHTML = pixelSpriteToSVG(rows);
});
