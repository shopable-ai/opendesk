// Pure-data formal Runtime test. Run via the leader MCP harness with
// Execution.input = {} or { scenario: 'all' | 'conversions' | 'channels' }.
// Embedded deterministic PNGs need no files, screen, Node, network or models.
const input = Execution.input;
if (!input || typeof input !== 'object' || Array.isArray(input)) {
  throw new Error('mcp-image-color: Execution.input must be an object');
}
const scenario = input.scenario === undefined ? 'all' : input.scenario;
if (!['all', 'conversions', 'channels'].includes(scenario)) {
  throw new Error('mcp-image-color: unknown scenario');
}
const checks = [];
const errors = [];
function equal(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`mcp-image-color: ${label}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  }
  checks.push({ label, actual });
}
function throws(label, run, fragment) {
  try { run(); } catch (error) {
    const message = String(error && error.message || error);
    if (!message.includes(fragment)) throw new Error(`mcp-image-color: ${label}: unexpected ${message}`);
    errors.push({ label, message });
    return;
  }
  throw new Error(`mcp-image-color: ${label}: expected error containing ${fragment}`);
}

if (scenario !== 'channels') {
  const expected = {
    toRGB: ['rgb(255,0,0)', 'rgb(0,0,0)', 'rgb(255,255,255)', 'rgb(0,255,0)', 'rgb(0,0,255)'],
    toRGBA: ['rgba(255,0,0,1.000000)', 'rgba(0,0,0,1.000000)', 'rgba(255,255,255,1.000000)',
      'rgba(0,255,0,1.000000)', 'rgba(0,0,255,1.000000)'],
    toHSL: ['hsl(0.000000,100.000000%,50.000000%)', 'hsl(0.000000,0.000000%,0.000000%)',
      'hsl(0.000000,0.000000%,100.000000%)', 'hsl(120.000000,100.000000%,50.000000%)',
      'hsl(240.000000,100.000000%,50.000000%)'],
    toHSLA: ['hsla(0.000000,100.000000%,50.000000%,1.000000)', 'hsla(0.000000,0.000000%,0.000000%,1.000000)',
      'hsla(0.000000,0.000000%,100.000000%,1.000000)', 'hsla(120.000000,100.000000%,50.000000%,1.000000)',
      'hsla(240.000000,100.000000%,50.000000%,1.000000)'],
  };
  for (const method of Object.keys(expected)) {
    ['#ff0000', '#000000', '#ffffff', '#00ff00', '#0000ff'].forEach((color, i) => {
      equal(`${method}:${color}`, ImageColor[method](color), expected[method][i]);
    });
    equal(`${method}:uppercase-unprefixed`, ImageColor[method]('FF0000'), expected[method][0]);
    for (const color of ['', '#fff', '#ff000080', 'red', 'rgb(255,0,0)', ' #ff0000', '##ff0000']) {
      throws(`${method}:invalid-length:${color}`, () => ImageColor[method](color), 'invalid hex color length');
    }
    throws(`${method}:non-hex`, () => ImageColor[method]('#gg0000'), 'invalid syntax');
  }
  equal('toHSL:gray', ImageColor.toHSL('#808080'), 'hsl(0.000000,0.000000%,50.196078%)');
  equal('toHSLA:gray', ImageColor.toHSLA('#808080'), 'hsla(0.000000,0.000000%,50.196078%,1.000000)');
}

if (scenario !== 'conversions') {
  const grid = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAYAAACddGYaAAAAG0lEQVR4nGNISUn5/5+B4T8YisqdALH/iwAJAJYwCzOKUr9HAAAAAElFTkSuQmCC';
  const edges = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAMAAAABCAYAAAAb4BS0AAAAE0lEQVR4nGOQFRH5LwfEIgwM/wEUQgOdMp+IzgAAAABJRU5ErkJggg==';
  const alpha = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGM4kWLUAAAFNQHfc2Lj2wAAAABJRU5ErkJggg==';
  for (const channel of ['Red', 'Green', 'Blue']) {
    const method = `find${channel}Channel`;
    const find = (...args) => ImageColor[method](...args);
    equal(`${method}:column-major`, find(grid, 0, 0), '#151ec8');
    equal(`${method}:raw-base64`, find(grid.split(',')[1], 0, 0), '#151ec8');
    equal(`${method}:gray`, find(grid, 0, 0, 1, 1), '');
    equal(`${method}:right-outside`, find(grid, 3, 0), '');
    equal(`${method}:bottom-outside`, find(grid, 0, 2), '');
    equal(`${method}:zero-width`, find(grid, 0, 0, 0, 2), '');
    equal(`${method}:negative-height`, find(grid, 0, 0, 3, -1), '');
    equal(`${method}:negative-start`, find(grid, -1, -1, 2, 3), '#151ec8');
    equal(`${method}:clip-right-bottom`, find(grid, 0, 0, 100, 100), '#151ec8');
    equal(`${method}:channel-20`, find(edges, 2, 0, 1, 1), '');
    equal(`${method}:near-gray-difference-9`, find(edges, 0, 0, 1, 1), '');
    equal(`${method}:difference-10`, find(edges, 1, 0, 1, 1), channel === 'Red' ? '#1e1414' : '');
    equal(`${method}:alpha-premultiplied`, find(alpha, 0, 0), '#643219');
    throws(`${method}:empty-image`, () => find('', 0, 0), 'image input must not be empty');
    throws(`${method}:invalid-image-empty-region`, () => find('', 0, 0, 0, 0), 'image input must not be empty');
    throws(`${method}:non-base64-url`, () => find('data:image/png,abc', 0, 0), 'image data URL must use ;base64,');
    throws(`${method}:empty-payload`, () => find('data:image/png;base64,', 0, 0), 'base64 payload must not be empty');
    throws(`${method}:invalid-base64`, () => find('data:image/png;base64,!!!', 0, 0), 'failed to decode image data URL base64');
    throws(`${method}:corrupt-png`, () => find('data:image/png;base64,YWJj', 0, 0), 'unsupported or corrupt PNG/JPEG image');
  }
  equal('red:explicit-region', ImageColor.findRedChannel(grid, 1, 0, 1, 1), '#ff0000');
  equal('green:explicit-region', ImageColor.findGreenChannel(grid, 2, 0, 1, 1), '#00ff00');
  equal('blue:explicit-region', ImageColor.findBlueChannel(grid, 1, 1, 1, 1), '#0000ff');
}
console.log(JSON.stringify({ test: 'mcp-image-color', scenario, ok: true,
  checkCount: checks.length, errorCount: errors.length, checks, errors }));
