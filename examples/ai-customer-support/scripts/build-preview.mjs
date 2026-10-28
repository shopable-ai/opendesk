import { build } from 'esbuild';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'preview', 'index.html');
const temp = out + '.next';
const escapeStyle = text => text.replace(/<\/style/gi, '<\\/style');
const escapeScript = text => text.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

try {
  const bundle = await build({
    entryPoints: [join(root, 'src', 'main.tsx')],
    bundle: true,
    write: false,
    outdir: join(root, '.runtime', 'preview-build'),
    format: 'iife',
    platform: 'browser',
    target: ['chrome109', 'safari16'],
    jsx: 'automatic',
    minify: true,
    legalComments: 'none',
    logLevel: 'warning',
    loader: { '.svg': 'dataurl' }
  });
  const js = bundle.outputFiles.find(f => f.path.endsWith('.js'))?.text;
  const css = bundle.outputFiles.find(f => f.path.endsWith('.css'))?.text;
  if (!js || !css || !js.includes('od-r12')) throw new Error('Preview bundle is missing application or styles');
  const html = [
    '<!doctype html>',
    '<html lang="zh-CN"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="description" content="OpenDesk Desktop AI 客服助手 · 六业务 Tab · 离线 React 演示">',
    '<title>OpenDesk AI 客服助手 · React R2.0</title>',
    '<style>' + escapeStyle(css) + '</style>',
    '</head><body style="margin:0"><div id="app"></div>',
    '<script>' + escapeScript(js) + '</script></body></html>',
    ''
  ].join('\n');
  if (!html.includes('id="app"') || html.includes('<script src=') || html.includes('<link rel="stylesheet" href=')) {
    throw new Error('Generated preview violates offline single-file contract');
  }
  await mkdir(dirname(out), { recursive: true });
  await writeFile(temp, html, 'utf8');
  const saved = await readFile(temp, 'utf8');
  if (saved.length < 20000 || !saved.includes('React R2.0')) throw new Error('Preview output failed integrity check');
  await rename(temp, out);
  console.log('Generated', out, saved.length, 'characters');
} catch (error) {
  await rm(temp, { force: true });
  console.error(error);
  process.exitCode = 1;
}
