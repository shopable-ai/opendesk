import { build } from 'esbuild';
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root,'preview/index.html');
const temp = output + '.next';
try {
  const b = await build({ entryPoints:[join(root,'src/main.tsx')], bundle:true,write:false,outdir:join(root,'.runtime/build'),
    format:'iife',platform:'browser',target:['chrome109','safari16'],jsx:'automatic',minify:true,legalComments:'none' });
  const js = b.outputFiles.find(x => x.path.endsWith('.js'))?.text;
  const css = b.outputFiles.find(x => x.path.endsWith('.css'))?.text;
  if (!js || !css) throw Error('BUNDLE_INCOMPLETE');
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Codex Workflow Companion · 技术 Demo</title><style>${css.replace(/<\/style/gi,'<\\/style')}</style></head><body><div id="root"></div><script>window.__OD_CWF_TOKEN__="__CWF_AUTH_VALUE__";</script><script>${js.replace(/<\/script/gi,'<\\/script')}</script></body></html>\n`;
  await mkdir(dirname(output),{recursive:true});await writeFile(temp,html);
  const reread=await readFile(temp,'utf8');
  if(!reread.includes('Codex Workflow Companion') || !reread.includes('__CWF_AUTH_VALUE__') || reread.length < 10_000)throw Error('HTML_INTEGRITY');
  await rename(temp,output);console.log('CWF_BUILD_OK',output,reread.length);
}catch(err){await rm(temp,{force:true});throw err;}
