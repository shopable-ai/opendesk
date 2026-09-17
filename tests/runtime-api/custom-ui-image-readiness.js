'use strict';
// Public Runtime API contract for Custom UI image readiness.
// From repository root:
// ./dist/opendesk -ui -script tests/runtime-api/custom-ui-image-readiness.js -console-mode script

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlW0xkAAAAASUVORK5CYII=';
let win = null;
try {
  win = await ui.createWindow({
    id: 'customUIImageReadiness',
    kind: 'floating',
    title: 'Custom UI image readiness',
    position: {mode: 'anchor', size: {width: 180, height: 120}, horizontal: 'center', vertical: 'center', margin: 0, display: 'active'},
    alwaysOnTop: false,
    draggable: false,
    content: {
      html: '<main><img id="fixtureImage" src="' + PNG + '" alt="1x1 readiness fixture"><p>image readiness</p></main>',
      css: 'html,body{margin:0;background:#182231;color:#eef2f8;font:12px sans-serif}main{padding:16px}img{width:32px;height:32px;image-rendering:pixelated}',
    },
  });
  const shown = await win.show();
  if (!shown || shown.visible !== true || shown.onScreen !== true) {
    throw new Error('Custom UI fixture did not become visible: ' + JSON.stringify(shown));
  }

  const image = win.control('fixtureImage');
  let state = null;
  for (let index = 0; index < 80; index += 1) {
    state = await image.getState();
    if (state && state.imageComplete === true) break;
    await new Promise(resolve => setTimeout(resolve, 25));
  }

  if (!state || state.imageComplete !== true) {
    throw new Error('img ControlState did not expose imageComplete=true: ' + JSON.stringify(state));
  }
  if (!(Number(state.imageNaturalWidth) > 0) || !(Number(state.imageNaturalHeight) > 0)) {
    throw new Error('img ControlState did not expose decoded natural dimensions: ' + JSON.stringify(state));
  }
  if (state.source !== PNG) {
    throw new Error('img ControlState source readback mismatch');
  }

  console.log('CUSTOM_UI_IMAGE_READINESS_OK=' + JSON.stringify({
    imageComplete: state.imageComplete,
    imageNaturalWidth: state.imageNaturalWidth,
    imageNaturalHeight: state.imageNaturalHeight,
  }));
} finally {
  if (win) await win.close();
}
