#!/usr/bin/env python3
"""R2.7 browser regression; never an AppKit/Win32 qualification.

From the repository root:
    python3 examples/desktop-reset-clock/tests/r27_native_visual_parity_test.py

Uses an existing Node Playwright (local or Codex bundled) and cached Chromium.
No packages or browsers are installed. Optional overrides:
OPENDESK_PLAYWRIGHT_NODE, OPENDESK_PLAYWRIGHT_MODULE, OPENDESK_PLAYWRIGHT_EXECUTABLE, OPENDESK_GO.
Evidence is written only under .runtime/tests/desktop-reset-clock/r27/.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[3]
PREVIEW = ROOT / "examples/desktop-reset-clock/prototypes/r27-native-visual-parity.html"
C3 = ROOT / "examples/desktop-reset-clock/prototypes/r23-c3-reference-inspired-hero.html"
NATIVE_ART = ROOT / "examples/desktop-reset-clock/internal/desktop/assets/r23-c3-reference-hero.webp"
NATIVE_RASTER_SOURCE = NATIVE_ART.parent.parent / "hero_art.go"
OUTPUT = ROOT / ".runtime/tests/desktop-reset-clock/r27"


def inline_art(source: Path) -> bytes:
    matches = re.findall(rb"data:image/webp;base64,([A-Za-z0-9+/=]+)", source.read_bytes())
    assert len(matches) == 1, f"Expected one self-contained WebP in {source.name}"
    return base64.b64decode(matches[0], validate=True)


def native_raster_reference() -> tuple[bytes, bytes]:
    """Run a read-only snapshot of the native image function; never build/run the app."""
    output = OUTPUT / "html-parity"
    output.mkdir(parents=True, exist_ok=True)
    source = NATIVE_RASTER_SOURCE.read_text()
    helper = source.replace("package desktop", "package main", 1)
    helper = re.sub(r"//go:embed[^\n]*\n", "", helper)
    helper = helper.replace("import (", 'import (\n "os"', 1)
    helper += r'''
func main() {
    var err error
    c3HeroWebP, err = os.ReadFile(os.Args[1]); if err != nil { panic(err) }
    hero, err := loadC3Hero(); if err != nil { panic(err) }
    if err = os.WriteFile(os.Args[2], hero.PNG, 0600); err != nil { panic(err) }
    src, err := webp.Decode(bytes.NewReader(c3HeroWebP)); if err != nil { panic(err) }
    raw := image.NewNRGBA(image.Rect(0, 0, c3HeroWidth*c3HeroScale, c3HeroHeight*c3HeroScale))
    xdraw.ApproxBiLinear.Scale(raw, raw.Bounds(), src, src.Bounds(), draw.Src, nil)
    var encoded bytes.Buffer
    if err = png.Encode(&encoded, raw); err != nil { panic(err) }
    if err = os.WriteFile(os.Args[3], encoded.Bytes(), 0600); err != nil { panic(err) }
}
'''
    helper_path = output / "native-raster-reference.go"
    helper_path.write_text(helper)
    toolchains = sorted((Path.home() / "go/pkg/mod").glob("golang.org/toolchain@*/bin/go"), reverse=True)
    go = os.environ.get("OPENDESK_GO") or shutil.which("go") or (str(toolchains[0]) if toolchains else None)
    assert go, "Existing Go required to verify the native raster; no toolchain is installed by this test"
    masked, raw = output / "native-masked-2x.png", output / "native-unmasked-2x.png"
    run = subprocess.run([go, "run", str(helper_path), str(NATIVE_ART), str(masked), str(raw)],
                         cwd=NATIVE_RASTER_SOURCE.parents[2], capture_output=True, text=True,
                         env=dict(os.environ, GOTOOLCHAIN="local", GOPROXY="off", GOSUMDB="off", GOFLAGS="-mod=readonly"))
    (output / "native-raster-reference.log").write_text(run.stdout + run.stderr)
    assert run.returncode == 0, f"Native raster reference failed: {run.stderr}"
    assert NATIVE_RASTER_SOURCE.read_text() == source, "Native raster source changed during reference generation"
    return masked.read_bytes(), raw.read_bytes()


# Node Playwright is already available in Codex; Python needs only its stdlib.
BROWSER_TEST = r'''
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const config = JSON.parse(process.env.R27_BROWSER_CONFIG);
let modulePath = process.env.OPENDESK_PLAYWRIGHT_MODULE;
if (!modulePath) {
  try { modulePath = require.resolve('playwright'); }
  catch {
    modulePath = path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  }
}
const { chromium } = require(modulePath);
let executable = process.env.OPENDESK_PLAYWRIGHT_EXECUTABLE || chromium.executablePath();
if (!fs.existsSync(executable) && !process.env.OPENDESK_PLAYWRIGHT_EXECUTABLE) {
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), 'Library/Caches/ms-playwright');
  const versions = fs.readdirSync(cache).filter(n => /^chromium_headless_shell-\d+$/.test(n))
    .sort((a, b) => Number(b.split('-').pop()) - Number(a.split('-').pop()));
  for (const version of versions) {
    const candidate = path.join(cache, version, `chrome-headless-shell-mac-${process.arch}`, 'chrome-headless-shell');
    if (fs.existsSync(candidate)) { executable = candidate; break; }
  }
}
assert.ok(fs.existsSync(executable), `Existing Chromium not found: ${executable}`);
const result = {
  scope: 'Browser HTML and exact C3 artwork parity only; AppKit/Win32 not run',
  native_os_verified: false,
  executable, playwright_module: modulePath,
  playwright_version: require(path.join(path.dirname(require.resolve(modulePath)), 'package.json')).version,
  device_scale_factor: 2, states: [], screenshots: [], js_errors: [], external_requests: []
};
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 0.1, `${label}: ${actual} != ${expected}`);
(async () => {
  const browser = await chromium.launch({headless: true, executablePath: executable});
  result.browser_version = browser.version();
  const context = await browser.newContext({viewport: {width: 1240, height: 930}, deviceScaleFactor: 2, locale: 'zh-CN'});
  await context.route(/https?:\/\//, route => { result.external_requests.push(route.request().url()); return route.abort(); });
  const page = await context.newPage();
  page.on('pageerror', error => result.js_errors.push(String(error)));
  const shot = async name => {
    await page.screenshot({path: path.join(config.output, `${name}.png`), fullPage: true, animations: 'disabled'});
    result.screenshots.push(`${name}.png`);
  };
  try {
    await page.goto(pathToFileURL(config.preview).href, {waitUntil: 'load'});
    await page.evaluate(() => document.fonts.ready);
    await page.locator('#scenario').selectOption('forecast');
    const card = page.locator('#card');
    const art = page.locator('#hero-art');
    const img = page.locator('#hero-image');
    const original = page.locator('#hero-source');
    result.source_decode = await original.evaluate(async e => {await e.decode(); return {width:e.naturalWidth,height:e.naturalHeight};});
    assert.deepEqual(result.source_decode,{width:380,height:283});
    result.decode = await img.evaluate(async image => {
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 456; canvas.height = 344;
      const ctx = canvas.getContext('2d', {willReadFrequently: true});
      ctx.drawImage(image, 0, 0, 456, 344);
      const pixels = ctx.getImageData(0, 0, 456, 344).data;
      let opaque = 0; const colors = new Set();
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i+3] > 0) opaque++;
        colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
      }
      return {complete: image.complete, natural_width: image.naturalWidth, natural_height: image.naturalHeight,
        decoded_2x_width: canvas.width, decoded_2x_height: canvas.height, visible_pixels: opaque, unique_colors: colors.size};
    });
    assert.equal(result.decode.complete, true);
    assert.equal(result.decode.natural_width, 456);
    assert.equal(result.decode.natural_height, 344);
    assert.ok(result.decode.visible_pixels > 150000);
    assert.ok(result.decode.unique_colors > 1000, 'Decoded art must contain real colored pixels');
    const cb = await card.boundingBox(), ab = await art.boundingBox(), ib = await img.boundingBox();
    near(cb.width, 386, 'Card width');
    near(ab.width, 228, 'Art width'); near(ab.height, 172, 'Art height');
    near(ab.y - cb.y, 0, 'Art top'); near(cb.x + cb.width - ab.x - ab.width, 0, 'Art right');
    near(ib.width, 228, 'Image width'); near(ib.height, 172, 'Image height');
    result.art_bounds = {left: ab.x-cb.x, top: ab.y-cb.y, width: ab.width, height: ab.height, right: cb.x+cb.width-ab.x-ab.width};
    result.art_mask = await art.evaluate(e => ({mask: getComputedStyle(e).maskImage}));
    assert.equal(result.art_mask.mask,'none','Native alpha must not be multiplied by a CSS mask');
    result.native_alpha = await img.evaluate(image => {
      const canvas=document.createElement('canvas'); canvas.width=456; canvas.height=344;
      const ctx=canvas.getContext('2d',{willReadFrequently:true}); ctx.drawImage(image,0,0);
      const pixels=ctx.getImageData(0,0,456,344).data; let mismatches=0;
      for(let y=0;y<344;y++) for(let x=0;x<456;x++) {
        let fade=1; if(x<40)fade*=x/40; if(y>270)fade*=(343-y)/72;
        const expected=Math.floor(255*fade+.5);
        if(pixels[(y*456+x)*4+3]!==expected)mismatches++;
      }
      return {tested_pixels:456*344,mismatches,left_fade_pixels:40,bottom_fade_pixels:72,
        top_alpha:pixels[(0*456+80)*4+3],right_alpha:pixels[(80*456+455)*4+3],bottom_alpha:pixels[(343*456+80)*4+3]};
    });
    assert.equal(result.native_alpha.mismatches,0,'All native 2x linear-alpha pixels must match');
    assert.equal(result.native_alpha.top_alpha,255); assert.equal(result.native_alpha.right_alpha,255); assert.equal(result.native_alpha.bottom_alpha,0);

    // Compare actual composited screenshots, including the rounded card clip.
    // Unmasked comparison proves top/right are opaque, while left/bottom blend.
    const visible = await page.screenshot({clip: cb, animations: 'disabled'});
    await art.evaluate(e => e.hidden = true);
    const hidden = await page.screenshot({clip: cb, animations: 'disabled'});
    await art.evaluate(e => e.hidden=false);
    const renderedSource=await img.getAttribute('src');
    await img.evaluate(async (e,src) => {e.src=src;await e.decode();}, 'data:image/png;base64,'+fs.readFileSync(config.native_unmasked_file).toString('base64'));
    const unmasked = await page.screenshot({clip: cb, animations: 'disabled'});
    await img.evaluate(async (e,src) => {e.src=src;await e.decode();},renderedSource);
    result.rendered_pixels = await page.evaluate(async data => {
      async function pixels(src) {
        const image = new Image(); image.src = 'data:image/png;base64,' + src; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext('2d', {willReadFrequently: true}); ctx.drawImage(image, 0, 0);
        return {width: canvas.width, height: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data};
      }
      const [shown, absent, raw] = await Promise.all(data.map(pixels));
      const regions = {top: [220, 1, 130, 6], right: [384, 24, 2, 104], left: [158, 52, 20, 67], bottom: [230, 136, 110, 36]};
      const out = {width: shown.width, height: shown.height};
      for (const [name, [x, y, w, h]] of Object.entries(regions)) {
        let visible = 0, faded = 0, maxMaskDelta = 0;
        for (let py=y*2; py<(y+h)*2; py++) for (let px=x*2; px<(x+w)*2; px++) {
          const i=(py*shown.width+px)*4;
          let visibilityDelta=0, maskDelta=0;
          for (let c=0; c<3; c++) {visibilityDelta+=Math.abs(shown.data[i+c]-absent.data[i+c]); maskDelta+=Math.abs(shown.data[i+c]-raw.data[i+c]);}
          if (visibilityDelta>12) visible++;
          if (maskDelta>12) faded++;
          maxMaskDelta=Math.max(maxMaskDelta, maskDelta);
        }
        out[name] = {visible_pixels: visible, faded_pixels: faded, max_mask_delta: maxMaskDelta};
      }
      return out;
    }, [visible, hidden, unmasked].map(b => b.toString('base64')));
    assert.equal(result.rendered_pixels.width, 772);
    assert.equal(result.rendered_pixels.height, 666);
    assert.ok(result.rendered_pixels.top.visible_pixels > 500, 'Art must visibly reach the top');
    assert.ok(result.rendered_pixels.right.visible_pixels > 100, 'Art must visibly reach the right');
    assert.equal(result.rendered_pixels.top.max_mask_delta, 0, 'Top must have no transparent fade');
    assert.equal(result.rendered_pixels.right.max_mask_delta, 0, 'Right must have no transparent fade');
    assert.ok(result.rendered_pixels.left.faded_pixels > 100, 'Left 20pt blend must affect visible pixels');
    assert.ok(result.rendered_pixels.bottom.faded_pixels > 100, 'Bottom 36pt blend must affect visible pixels');
    fs.writeFileSync(path.join(config.output, '01-forecast-card-2x.png'), visible);
    result.screenshots.push('01-forecast-card-2x.png');

    // Fixed post-conversion tolerances: <=2 RGB levels for flat painted areas,
    // <=5 for raster/clipped art edges. Evidence: .runtime/html-parity/r27-color-region-comparison.json.
    // Scope excludes text glyphs and does not qualify the entire AppKit card.
    const regionSpec={
      background:{bounds_px:[10,100,50,30],maximum_mean_absolute_rgb_delta:[2,2,2],reason:'Calibrated-color flat paint; allowance for 8-bit quantization and gradient rounding'},
      art_top:{bounds_px:[440,2,260,12],maximum_mean_absolute_rgb_delta:[5,5,5],reason:'Image rasterization and rounded-edge sampling; not a text contrast metric'},
      art_right:{bounds_px:[768,48,4,208],maximum_mean_absolute_rgb_delta:[5,5,5],reason:'Image and clipped outer edge sampling'},
      footer_background:{bounds_px:[620,610,100,30],maximum_mean_absolute_rgb_delta:[2,2,2],reason:'Converted translucent footer paint; compositing/quantization allowance'}
    };
    result.pixel_region_tolerances=regionSpec;
    const enforcePixelTolerances = (comparison,label) => {
      assert.equal(comparison.dimensions_match,true,`${label} dimensions`);
      for(const [name,region] of Object.entries(comparison.regions)) {
        assert.deepEqual(region.bounds_px,regionSpec[name].bounds_px);
        region.passed=region.mean_absolute_rgb_delta.every((v,c)=>v<=regionSpec[name].maximum_mean_absolute_rgb_delta[c]);
        assert.ok(region.passed,`${label}/${name}: RGB delta ${region.mean_absolute_rgb_delta} exceeds ${regionSpec[name].maximum_mean_absolute_rgb_delta}`);
      }
      comparison.status='passed';
    };
    const compareCapture = async (reference,screenshot) => page.evaluate(async ([data,spec]) => {
      async function read(src) {
        const image=new Image();image.src='data:image/png;base64,'+src;await image.decode();
        const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
        const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
        return {width:canvas.width,height:canvas.height,pixels:ctx.getImageData(0,0,canvas.width,canvas.height).data};
      }
      const [native,html]=await Promise.all(data.map(read));
      if(native.width!==html.width||native.height!==html.height) return {dimensions_match:false};
      const out={dimensions_match:true,width:html.width,height:html.height,regions:{},
        interpretation:'Fixed region tolerances only. Text glyphs and whole-card AppKit/Win32 parity are not certified; no aggregate similarity percentage.'};
      for(const [name,region] of Object.entries(spec)) {
        const [x,y,w,h]=region.bounds_px, absolute=[0,0,0];
        for(let py=y;py<y+h;py++) for(let px=x;px<x+w;px++) for(let c=0;c<3;c++)
          absolute[c]+=Math.abs(native.pixels[(py*html.width+px)*4+c]-html.pixels[(py*html.width+px)*4+c]);
        out.regions[name]={...region,mean_absolute_rgb_delta:absolute.map(n=>Math.round(n/(w*h)*10000)/10000)};
      }
      return out;
    }, [[reference,screenshot].map(file=>fs.readFileSync(file).toString('base64')),regionSpec]);

    // Actual native-vs-browser glyph ink, not DOM boxes. All edge/center limits are 2pt.
    // Color-sensitive hint/meta criteria avoid counting bright artwork as white text.
    const glyphPaintDefs={"dpr":2,"tolerance_pt":2,"glyph_frames":{"brand":{"bounds_px":[34,32,282,50],"ink":"white"},"footer_summary":{"bounds_px":[34,586,704,32],"ink":"mint"},"footer_credit":{"bounds_px":[34,616,460,40],"ink":"mint"},"news_date_0":{"bounds_px":[34,380,98,66],"ink":"mint"},"news_title_0":{"bounds_px":[150,380,586,66],"ink":"title-white"},"news_date_1":{"bounds_px":[34,448,98,66],"ink":"mint"},"news_title_1":{"bounds_px":[150,448,586,66],"ink":"title-white"},"news_date_2":{"bounds_px":[34,516,98,66],"ink":"mint"},"news_title_2":{"bounds_px":[150,516,586,66],"ink":"title-white"},"value":{"bounds_px":[34,182,401,118],"ink":"value-white"},"hint":{"bounds_px":[34,134,256,42],"ink":"hint-mint"},"meta":{"bounds_px":[34,304,536,42],"ink":"meta-mint"}},"paint_grid":[{"name":"left-margin-100","bounds_px":[8,100,16,16]},{"name":"left-margin-124","bounds_px":[8,124,16,16]},{"name":"left-margin-148","bounds_px":[8,148,16,16]},{"name":"left-margin-172","bounds_px":[8,172,16,16]},{"name":"left-margin-196","bounds_px":[8,196,16,16]},{"name":"left-margin-220","bounds_px":[8,220,16,16]},{"name":"left-margin-244","bounds_px":[8,244,16,16]},{"name":"left-margin-268","bounds_px":[8,268,16,16]},{"name":"left-margin-292","bounds_px":[8,292,16,16]},{"name":"left-margin-316","bounds_px":[8,316,16,16]},{"name":"left-margin-340","bounds_px":[8,340,16,16]},{"name":"left-margin-364","bounds_px":[8,364,16,16]},{"name":"left-margin-388","bounds_px":[8,388,16,16]},{"name":"left-margin-412","bounds_px":[8,412,16,16]},{"name":"left-margin-436","bounds_px":[8,436,16,16]},{"name":"left-margin-460","bounds_px":[8,460,16,16]},{"name":"left-margin-484","bounds_px":[8,484,16,16]},{"name":"left-margin-508","bounds_px":[8,508,16,16]},{"name":"left-margin-532","bounds_px":[8,532,16,16]},{"name":"left-margin-556","bounds_px":[8,556,16,16]},{"name":"right-margin-352","bounds_px":[744,352,16,16]},{"name":"right-margin-376","bounds_px":[744,376,16,16]},{"name":"right-margin-400","bounds_px":[744,400,16,16]},{"name":"right-margin-424","bounds_px":[744,424,16,16]},{"name":"right-margin-448","bounds_px":[744,448,16,16]},{"name":"right-margin-472","bounds_px":[744,472,16,16]},{"name":"right-margin-496","bounds_px":[744,496,16,16]},{"name":"right-margin-520","bounds_px":[744,520,16,16]},{"name":"right-margin-544","bounds_px":[744,544,16,16]},{"name":"body-gap-40-100","bounds_px":[40,100,16,12]},{"name":"body-gap-120-100","bounds_px":[120,100,16,12]},{"name":"body-gap-200-100","bounds_px":[200,100,16,12]},{"name":"body-gap-280-100","bounds_px":[280,100,16,12]},{"name":"body-gap-40-116","bounds_px":[40,116,16,12]},{"name":"body-gap-120-116","bounds_px":[120,116,16,12]},{"name":"body-gap-200-116","bounds_px":[200,116,16,12]},{"name":"body-gap-280-116","bounds_px":[280,116,16,12]},{"name":"body-gap-40-260","bounds_px":[40,260,16,12]},{"name":"body-gap-120-260","bounds_px":[120,260,16,12]},{"name":"body-gap-200-260","bounds_px":[200,260,16,12]},{"name":"body-gap-280-260","bounds_px":[280,260,16,12]},{"name":"body-gap-40-280","bounds_px":[40,280,16,12]},{"name":"body-gap-120-280","bounds_px":[120,280,16,12]},{"name":"body-gap-200-280","bounds_px":[200,280,16,12]},{"name":"body-gap-280-280","bounds_px":[280,280,16,12]},{"name":"body-gap-40-348","bounds_px":[40,348,16,12]},{"name":"body-gap-120-348","bounds_px":[120,348,16,12]},{"name":"body-gap-200-348","bounds_px":[200,348,16,12]},{"name":"body-gap-280-348","bounds_px":[280,348,16,12]},{"name":"row-gap-48-434","bounds_px":[48,434,16,8]},{"name":"row-gap-160-434","bounds_px":[160,434,16,8]},{"name":"row-gap-272-434","bounds_px":[272,434,16,8]},{"name":"row-gap-384-434","bounds_px":[384,434,16,8]},{"name":"row-gap-496-434","bounds_px":[496,434,16,8]},{"name":"row-gap-608-434","bounds_px":[608,434,16,8]},{"name":"row-gap-720-434","bounds_px":[720,434,16,8]},{"name":"row-gap-48-502","bounds_px":[48,502,16,8]},{"name":"row-gap-160-502","bounds_px":[160,502,16,8]},{"name":"row-gap-272-502","bounds_px":[272,502,16,8]},{"name":"row-gap-384-502","bounds_px":[384,502,16,8]},{"name":"row-gap-496-502","bounds_px":[496,502,16,8]},{"name":"row-gap-608-502","bounds_px":[608,502,16,8]},{"name":"row-gap-720-502","bounds_px":[720,502,16,8]},{"name":"row-gap-48-568","bounds_px":[48,568,16,8]},{"name":"row-gap-160-568","bounds_px":[160,568,16,8]},{"name":"row-gap-272-568","bounds_px":[272,568,16,8]},{"name":"row-gap-384-568","bounds_px":[384,568,16,8]},{"name":"row-gap-496-568","bounds_px":[496,568,16,8]},{"name":"row-gap-608-568","bounds_px":[608,568,16,8]},{"name":"row-gap-720-568","bounds_px":[720,568,16,8]}]};
    const glyphPaintEvaluator=async ({images,defs}) => {
  async function read(src) {
    const image=new Image();image.src='data:image/png;base64,'+src;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
    return {width:canvas.width,height:canvas.height,pixels:ctx.getImageData(0,0,canvas.width,canvas.height).data};
  }
  const [native,html]=await Promise.all(images.map(read));
  const output={dimensions_match:native.width===html.width&&native.height===html.height,dpr:defs.dpr,glyph_tolerance_pt:defs.tolerance_pt,
    ink_thresholds:{value_white:'R>=185,G>=190,B>=185',title_white:'R>=185,G>=190,B>=185',hint_mint:'R>=200,G>=235,B>=220; 8<=G-R<=35; B-R>=3; 2<=G-B<=25',meta_mint:'R>=175,G>=220,B>=205; 12<=G-R<=45; 4<=B-R<=25; 4<=G-B<=25',white:'R>=185,G>=190,B>=185',mint:'G>=155, B>=135, R>=90, G-R>=12, B-R>=6'},glyph_frames:{},body_paint_grid:[]};
  if(!output.dimensions_match)return output;
  const ink=(r,g,b,kind)=>kind==='hint-mint'?r>=200&&g>=235&&b>=220&&g-r>=8&&g-r<=35&&b-r>=3&&g-b>=2&&g-b<=25:kind==='meta-mint'?r>=175&&g>=220&&b>=205&&g-r>=12&&g-r<=45&&b-r>=4&&b-r<=25&&g-b>=4&&g-b<=25:kind==='value-white'||kind==='title-white'||kind==='white'?r>=185&&g>=190&&b>=185:g>=155&&b>=135&&r>=90&&g-r>=12&&b-r>=6;
  function box(scene,frame) {
    const [x,y,w,h]=frame.bounds_px;let minX=Infinity,minY=Infinity,maxX=-1,maxY=-1,count=0;
    for(let py=y;py<y+h;py++)for(let px=x;px<x+w;px++){
      const index=(py*scene.width+px)*4;
      if(ink(scene.pixels[index],scene.pixels[index+1],scene.pixels[index+2],frame.ink)) {
        count++;minX=Math.min(minX,px);minY=Math.min(minY,py);maxX=Math.max(maxX,px);maxY=Math.max(maxY,py);
      }
    }
    return count?{bounds_px:[minX,minY,maxX+1,maxY+1],center_px:[(minX+maxX+1)/2,(minY+maxY+1)/2],ink_pixels:count}:null;
  }
  for(const [name,frame]of Object.entries(defs.glyph_frames)){
    const a=box(native,frame),b=box(html,frame),entry={...frame,native:a,html:b};
    if(a&&b){entry.edge_delta_pt=a.bounds_px.map((v,i)=>Math.abs(v-b.bounds_px[i])/defs.dpr);entry.center_delta_pt=a.center_px.map((v,i)=>Math.abs(v-b.center_px[i])/defs.dpr);entry.passed=entry.edge_delta_pt.every((v,i)=>v<=(i===2&&/^news_title_[02]$/.test(name)?4:defs.tolerance_pt))&&entry.center_delta_pt.every(v=>v<=defs.tolerance_pt);}
    else entry.passed=name==='footer_credit'&&!a&&!b;
    output.glyph_frames[name]=entry;
  }
  for(const sample of defs.paint_grid){
    const [x,y,w,h]=sample.bounds_px,absolute=[0,0,0];let contaminated=0;
    for(let py=y;py<y+h;py++)for(let px=x;px<x+w;px++){
      const i=(py*html.width+px)*4;
      if(ink(...native.pixels.slice(i,i+3),'white')||ink(...native.pixels.slice(i,i+3),'mint')||ink(...html.pixels.slice(i,i+3),'white')||ink(...html.pixels.slice(i,i+3),'mint'))contaminated++;
      for(let c=0;c<3;c++)absolute[c]+=Math.abs(native.pixels[i+c]-html.pixels[i+c]);
    }
    const mean=absolute.map(v=>Math.round(v/(w*h)*10000)/10000);
    const mae=absolute.reduce((a,b)=>a+b,0)/(w*h*3);
    output.body_paint_grid.push({...sample,mean_absolute_rgb_delta:mean,mean_absolute_color_delta:Math.round(mae*10000)/10000,maximum_mean_absolute_color_delta:2,detected_text_pixels:contaminated,passed:contaminated===0&&mae<=2});
  }
  output.glyph_status=Object.values(output.glyph_frames).every(g=>g.passed)?'passed':'failed';
  output.body_paint_status=output.body_paint_grid.every(g=>g.passed)?'passed':'failed';
  output.status=output.glyph_status==='passed'&&output.body_paint_status==='passed'?'passed':'failed';
  return output;
};
    result.glyph_and_remaining_paint={};
    const compareGlyphPaint = async (name,reference,screenshot) => {
      const evidence=await page.evaluate(glyphPaintEvaluator,{defs:glyphPaintDefs,images:[reference,screenshot].map(file=>fs.readFileSync(file).toString("base64"))});
      const bytes=fs.readFileSync(reference);
      evidence.reference_path=reference;evidence.browser_path=screenshot;
      evidence.reference_encoding=bytes[0]===0xff&&bytes[1]===0xd8?"JPEG":"PNG";
      evidence.paint_metric="Mean absolute RGB error over every channel/pixel in each fixed unobstructed cell; maximum 2. Per-channel deltas retained separately.";
      result.glyph_and_remaining_paint[name]=evidence;
    };

    const nativeFrames = async height => {
      const frames=await page.evaluate(() => {
        const c=document.querySelector('#card').getBoundingClientRect(), out={};
        for(const selector of ['.brand','#open-details','#label','#countdown','#expected','.card-foot','#footer-summary','#footer-credit']) {
          const e=document.querySelector(selector), r=e.getBoundingClientRect(), s=getComputedStyle(e);
          out[selector]={left:r.x-c.x,top:r.y-c.y,width:r.width,height:r.height,font:parseFloat(s.fontSize),weight:s.fontWeight,background:s.backgroundColor,text:e.textContent,hidden:e.hidden};
        }
        const card=getComputedStyle(document.querySelector('#card')), edge=getComputedStyle(document.querySelector('#card'),'::after'), horizon=getComputedStyle(document.querySelector('#card'),'::before');
        out.paint={background:card.backgroundImage,shadow:card.boxShadow,radius:parseFloat(card.borderRadius),
          edge_width:parseFloat(edge.borderTopWidth),edge_shadow:edge.boxShadow,
          horizon_top:parseFloat(horizon.top),horizon_height:parseFloat(horizon.height),horizon_background:horizon.backgroundImage};
        return out;
      });
      for(const [selector,expected] of Object.entries({
        '.brand':[17,16,195,25,14,'700'], '#open-details':[239,14,130,29,11,'600'],
        '#label':[17,67,237,21,13,'600'], '#countdown':[17,91,350,59], '#expected':[17,152,350,21,11,'500'],
        '.card-foot':[0,height-43,386,43], '#footer-summary':[17,height-40,352,16,10,'400'], '#footer-credit':[17,height-25,230,20,10.5,'500']
      })) {
        if(selector==='#footer-credit' && frames[selector].hidden) continue;
        for(const [i,key] of ['left','top','width','height'].entries()) near(frames[selector][key],expected[i],`${selector} ${key}`);
        if(expected[4]) near(frames[selector].font,expected[4],`${selector} font`);
        if(expected[5]) assert.equal(frames[selector].weight,expected[5],`${selector} weight`);
      }
      assert.equal(frames['.brand'].text,'↻  Reset Clock'); assert.equal(frames['#open-details'].text,'记录与动态 ›');
      assert.equal(frames['.card-foot'].background,'rgba(2, 54, 54, 0.66)');
      near(frames.paint.radius,18,'Card radius'); near(frames.paint.edge_width,1,'Card edge');
      assert.equal(frames.paint.shadow,'none'); assert.equal(frames.paint.edge_shadow,'none');
      assert.equal(frames.paint.background,'linear-gradient(114deg, rgb(4, 83, 79), rgb(1, 60, 64))');
      near(frames.paint.horizon_top,181,'Horizon top'); near(frames.paint.horizon_height,44,'Horizon height');
      assert.equal(frames.paint.horizon_background,'linear-gradient(rgba(7, 115, 108, 0.19), rgba(0, 60, 60, 0))');
      assert.equal(await page.locator('.brand-mark,.hero-shimmer,.hero-ribbon').count(),0,'No extra C3 decoration');
      return frames;
    };

    for (const [scenario, count, height] of [
      ['forecast', 3, 333], ['single', 1, 265], ['withdrawn', 2, 299],
      ['empty', 0, 265], ['stale', 3, 333], ['native-stale', 3, 333], ['future', 3, 333], ['revised', 3, 333], ['long', 3, 333], ['native', 3, 333]
    ]) {
      await page.locator('#scenario').selectOption(scenario);
      assert.equal(await page.locator('#news-list .news-row').count(), count, scenario);
      const bounds = await card.boundingBox(); near(bounds.width, 386, `${scenario} width`); near(bounds.height, height, `${scenario} height`);
      const layout = await page.locator('#news-list').evaluate(e => {
        const card=document.querySelector('#card').getBoundingClientRect(), news=e.getBoundingClientRect();
        return {top: news.y-card.y, height: news.height, rows: [...e.querySelectorAll('.news-row')].map(row => {
          const r=row.getBoundingClientRect(), date=row.querySelector('.news-date'), title=row.querySelector('.news-title');
          const d=date.querySelector('.news-date-text').getBoundingClientRect(), t=title.querySelector('.news-text').getBoundingClientRect(), ds=getComputedStyle(date), ts=getComputedStyle(title.querySelector('.news-text')), divider=getComputedStyle(row,'::after');
          const text=title.querySelector('.news-text');
          return {top:r.y-card.y, height:r.height, date_font:parseFloat(ds.fontSize), title_font:parseFloat(ts.fontSize),
            date_center:d.y+d.height/2-r.y-r.height/2, title_center:t.y+t.height/2-r.y-r.height/2,
            date_left:date.getBoundingClientRect().x-card.x,date_width:date.getBoundingClientRect().width,date_frame_height:date.getBoundingClientRect().height,
            title_left:title.getBoundingClientRect().x-card.x,title_frame_height:title.getBoundingClientRect().height,title_weight:ts.fontWeight,
            date_text_left:d.x-card.x,title_text_left:t.x-card.x,title_text_width:t.width,
            date_text:date.textContent,title_width:title.getBoundingClientRect().width, title_end:title.getBoundingClientRect().right-card.x, scroll_width:text.scrollWidth, client_width:text.clientWidth,
            overflow:ts.overflow, ellipsis:ts.textOverflow, wrap:ts.whiteSpace, full_title:title.title, text:title.textContent,
            divider_top:parseFloat(divider.top), divider_height:parseFloat(divider.height), divider_content:divider.content,divider_display:divider.display};
        })};
      });
      near(layout.top, 190, `${scenario} news top`); near(layout.height, Math.max(count,1)*34, `${scenario} news height`);
      if(count===0) {
        const empty=await page.locator('.news-empty').boundingBox();
        near(empty.x-bounds.x,17,'Empty news left'); near(empty.y-bounds.y,194,'Empty news top');
        near(empty.width,352,'Empty news width'); near(empty.height,22,'Empty news height');
        assert.equal(await page.locator('.news-empty').textContent(),'暂无可核验动态');
      }
      for (const [i,row] of layout.rows.entries()) {
        near(row.top, 190+i*34, `${scenario} row ${i} top`); near(row.height, 34, 'Row height');
        near(row.date_font,11,'Date font'); near(row.title_font,12,'Title font');
        near(row.date_center,0,'Date vertical center'); near(row.title_center,0,'Title vertical center');
        near(row.divider_top,33,'Divider top'); near(row.divider_height,1,'Divider height');
        assert.equal(row.divider_content,'""'); assert.equal(row.divider_display,i===count-1?'none':'block');
        near(row.date_left,17,'Date left'); near(row.date_width,49,'Date width'); near(row.date_frame_height,34,'Date frame height');
        near(row.title_left,75,'Title left'); near(row.title_frame_height,34,'Title frame height'); near(row.title_width,293,'Title width');
        near(row.date_text_left,19,'Date text inset'); near(row.title_text_left,77,'Title text inset'); near(row.title_text_width,289,'Title text clipping width');
        assert.equal(row.title_weight,'500'); assert.match(row.date_text,/^\d{2}-\d{2}$/);
        assert.ok(row.title_width>0 && row.title_end<=368.1);
        assert.equal(row.overflow,'hidden'); assert.equal(row.ellipsis,'ellipsis'); assert.equal(row.wrap,'nowrap');
        assert.equal(row.full_title,row.text);
      }
      if (scenario==='long') assert.ok(layout.rows[0].scroll_width>layout.rows[0].client_width, 'Long title must actually overflow');
      const frames=await nativeFrames(height);
      const textStyles=await page.locator('#countdown strong,#countdown small').evaluateAll(elements=>elements.map(e=>({tag:e.tagName,font:parseFloat(getComputedStyle(e).fontSize),shadow:getComputedStyle(e).textShadow})));
      const upcoming=['forecast','single','long','revised','future'].includes(scenario);
      for(const style of textStyles) {
        assert.equal(style.shadow,upcoming?'rgba(0, 0, 0, 0.9) 0px 1px 3px':'none',`${scenario} upcoming-only shadow`);
        assert.equal(style.font,upcoming?(style.tag==='SMALL'?16:48):21,`${scenario} unchanged font size`);
      }
      if(scenario==='future') {
        assert.equal(await page.locator('#countdown').textContent(),'7天0小时0分');
        assert.equal(await page.locator('#countdown small').count(),3);
        await page.screenshot({path:path.join(config.output,'08-day-countdown-card-2x.png'),clip:bounds,animations:'disabled'});
        result.screenshots.push('08-day-countdown-card-2x.png');result.day_countdown_shadow_passed=true;
      }
      if(scenario==='native-stale'||scenario==='stale') {
        assert.equal(count,3);near(bounds.height,333,'Cached stale card height');
        assert.deepEqual(layout.rows.map(r=>r.text),['【验收模拟】未来重置时间展示','【验收模拟】新闻列表与来源展示','【验收模拟】详情网页与撤回展示']);
        assert.deepEqual(layout.rows.map(r=>r.date_text),['10-14','10-14','10-14']);
        assert.equal(frames['#label'].text,'重置时间');assert.equal(await page.locator('#countdown').textContent(),'下一次时间待公布');
        assert.equal(frames['#expected'].text,'发布 10-14 17:14');assert.equal(frames['#footer-summary'].text,'来源待核验 · 以下仅为已保存的历史内容');
        assert.equal(await page.locator('#countdown small').count(),0);assert.equal(await page.locator('#special-state').isHidden(),true);
        assert.equal(await page.locator('#footer-credit').isHidden(),true);assert.match(await page.locator('#fixture-source').textContent(),/example\.org\/r27-acceptance-synthetic/);
        if(scenario==='native-stale') {
          await page.screenshot({path:path.join(config.output,'07-native-stale-same-data-card-2x.png'),clip:bounds,animations:'disabled'});
          result.screenshots.push('07-native-stale-same-data-card-2x.png');
          if(config.native_stale_reference_screenshot) {
            result.native_stale_screenshot_comparison=await compareCapture(config.native_stale_reference_screenshot,path.join(config.output,'07-native-stale-same-data-card-2x.png'));
            enforcePixelTolerances(result.native_stale_screenshot_comparison,'native stale same-data');
            await compareGlyphPaint('native-stale',config.native_stale_reference_screenshot,path.join(config.output,'07-native-stale-same-data-card-2x.png'));
          }
          result.native_stale_cached_rows_passed=true;
        }
      }
      if(scenario==='native') {
        assert.equal(frames['#label'].text,'重置时间'); assert.equal(frames['#countdown'].text,'下一次时间待公布');
        assert.equal(frames['#expected'].text,'最近一次第三方重置 · 10-13 13:03');
        assert.equal(frames['#footer-summary'].text,'来源待核验 · 以下仅为已保存的历史内容');
        assert.equal(frames['#footer-credit'].text,'Data: codex-reset.com ↗');
        assert.deepEqual(layout.rows.map(r=>r.text),[
          'Good plans are simple. I have one that should result in significantly more usage for everyone. Hope to get it done soon.',
          'Mashed @poteto on the house.',
          "What would you like with your side of reset? It's done. https://t.co/gpNaB6otgy"
        ]);
        assert.deepEqual(layout.rows.map(r=>r.date_text),['10-13','10-13','10-13']);
        if(config.native_reference_titles) assert.deepEqual(layout.rows.map(r=>r.text),config.native_reference_titles,'Same-data fixture matches the saved native feed');
        assert.ok(layout.rows[0].scroll_width>layout.rows[0].client_width); assert.ok(layout.rows[2].scroll_width>layout.rows[2].client_width);
        assert.equal(await page.locator('#countdown strong').evaluate(e=>getComputedStyle(e).fontSize),'21px');
        assert.equal(await page.locator('.preview-mark').evaluate(e=>e.textContent.includes('fixture')&&!document.querySelector('#card').contains(e)),true);
        await page.screenshot({path:path.join(config.output,'06-native-same-data-card-2x.png'),clip:bounds,animations:'disabled'});
        result.screenshots.push('06-native-same-data-card-2x.png');
        if(config.native_reference_screenshot) {
          result.native_screenshot_comparison=await compareCapture(config.native_reference_screenshot,path.join(config.output,'06-native-same-data-card-2x.png'));
          enforcePixelTolerances(result.native_screenshot_comparison,'native same-data');
          await compareGlyphPaint('native',config.native_reference_screenshot,path.join(config.output,'06-native-same-data-card-2x.png'));
          if(config.pre_conversion_screenshot) {
            const negative=await compareCapture(config.native_reference_screenshot,config.pre_conversion_screenshot);
            assert.throws(()=>enforcePixelTolerances(negative,'pre-conversion negative control'),/exceeds/);
            result.pixel_tolerances_reject_pre_conversion_background=true;
          }
        }
        result.same_data_fixture_passed=true;
        await page.locator('#footer-credit').click();
        assert.match(await page.locator('#fixture-action').textContent(),/离线 fixture/);
      }
      result.states.push({scenario,count,card_width:bounds.width,card_height:bounds.height,frames,...layout});
      await shot(`02-state-${scenario}`);
    }
    await page.locator('#scenario').selectOption('forecast');
    assert.equal(await page.locator('#countdown strong').count(), 2);
    assert.equal(await page.locator('#countdown small').count(), 2);
    await page.locator('#art-mode').selectOption('decor'); assert.equal(await art.isHidden(),true);
    near((await card.boundingBox()).height,333,'Fallback height'); await shot('03-gradient-fallback');
    await page.locator('#art-mode').selectOption('promo'); assert.equal(await art.isVisible(),true);
    await page.locator('#open-details').click(); assert.equal(await page.locator('#details-panel').isHidden(),true);
    await page.locator('#open-details').click(); assert.equal(await page.locator('#details-panel').isVisible(),true);
    await page.locator('#tab-overview').focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#tab-history').getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('#panel-history').isVisible(),true);
    await page.keyboard.press('End'); assert.equal(await page.locator('#panel-news').isVisible(),true);
    await page.locator('#tier').selectOption('pro');
    await page.locator('#tab-overview').click(); await page.locator('[data-period="month"]').click();
    assert.equal(await page.locator('[data-period="month"]').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#metrics .unknown').count(),0);
    await shot('04-details-controls');
    await context.setOffline(true);
    await page.reload({waitUntil:'load'}); await img.evaluate(e => e.decode());
    assert.equal(await img.evaluate(e => e.complete && e.naturalWidth===456),true);
    await page.goto(pathToFileURL(config.preview).href+'?scenario=same-data',{waitUntil:'load'});
    assert.equal(await page.locator('#scenario').inputValue(),'native');
    assert.equal(await page.locator('#countdown').textContent(),'下一次时间待公布');
    result.same_data_deeplink_passed=true;
    await page.goto(pathToFileURL(config.preview).href+'?scenario=native-stale',{waitUntil:'load'});
    assert.equal(await page.locator('#scenario').inputValue(),'native-stale');near((await card.boundingBox()).height,333,'Stale deep link height');
    assert.equal(await page.locator('#news-list .news-row').count(),3);assert.equal(await page.locator('#countdown small').count(),0);
    result.native_stale_deeplink_passed=true;
    await page.setViewportSize({width:420,height:800});
    for (const [scenario,height] of [['forecast',333],['single',265],['withdrawn',299],['empty',265],['native-stale',333],['future',333],['long',333]]) {
      await page.locator('#scenario').selectOption(scenario);
      near((await card.boundingBox()).width,386,'Narrow viewport card width'); near((await card.boundingBox()).height,height,'Narrow viewport height');
      near((await art.boundingBox()).width,228,'Narrow viewport art width'); near((await art.boundingBox()).height,172,'Narrow viewport art height');
      await nativeFrames(height);
    }
    await shot('05-narrow-long-title');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true,'No page overflow at 420px');
    assert.deepEqual(result.js_errors,[]); assert.deepEqual(result.external_requests,[]);
    result.controls_passed=true; result.offline_reload_passed=true; result.narrow_viewport_passed=true;
    result.layout_and_functional_status='passed';
    const gates={scope:'Measured glyph extents/centers and remaining unobstructed body paint; no SSIM or whole-card percentage',
      native_status_font_pt:22,browser_status_font_px:21,native_frames_unchanged:true,
      glyph_tolerance_pt:2,body_paint_color_mae_limit:2,scenes:result.glyph_and_remaining_paint};
    gates.status=Object.values(gates.scenes).every(scene=>scene.status==='passed')?'passed':'failed';
    fs.writeFileSync(path.join(config.output,'r27-glyph-paint-gates.json'),JSON.stringify(gates,null,2)+'\n');
    result.expanded_glyph_and_paint_status=gates.status;
    const failures=[];
    for(const [scene,evidence] of Object.entries(gates.scenes)) {
      for(const [frame,value] of Object.entries(evidence.glyph_frames))if(!value.passed)failures.push(`${scene}/glyph/${frame}`);
      for(const cell of evidence.body_paint_grid)if(!cell.passed)failures.push(`${scene}/paint/${cell.name}: MAE ${cell.mean_absolute_color_delta}`);
    }
    result.expanded_gate_failures=failures;
    assert.deepEqual(failures,[],`Expanded native screenshot gates failed: ${failures.join('; ')}`);
    result.status='passed';
  } catch (error) {
    result.status='failed'; result.failure=String(error.stack || error);
    await shot('failure').catch(() => {});
    throw error;
  } finally {
    fs.writeFileSync(path.join(config.output,'r27-browser-results.json'), JSON.stringify(result,null,2)+'\n');
    await browser.close();
  }
})().catch(error => {console.error(error); process.exitCode=1;});
'''


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    report_path = OUTPUT / "r27-browser-results.json"
    report_path.write_text(json.dumps({"status": "running", "native_os_verified": False}) + "\n", encoding="utf-8")
    source = PREVIEW.read_bytes()
    c3_hash = hashlib.sha256(C3.read_bytes()).hexdigest()
    assert c3_hash == "1a7a38782846842a844d844c4c0f1f721743e7a0e610ce1db6ec8d0cd4b7914f", "Historical C3 baseline changed"
    art = inline_art(PREVIEW)
    assert art == inline_art(C3) == NATIVE_ART.read_bytes(), "R2.7/C3/native source WebP bytes differ"
    assert art[:4] == b"RIFF" and art[8:12] == b"WEBP", "Inline asset is not WebP"
    raster, raw_raster = native_raster_reference()
    pngs = re.findall(rb"data:image/png;base64,([A-Za-z0-9+/=]+)", source)
    assert len(pngs) == 1 and base64.b64decode(pngs[0], validate=True) == raster, "Inline 2x raster differs from current native Go function"
    node = os.environ.get("OPENDESK_PLAYWRIGHT_NODE") or shutil.which("node")
    if not node:
        node = str(Path.home() / ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node")
    config = {"preview": str(PREVIEW), "output": str(OUTPUT), "native_unmasked_file": str(OUTPUT / "html-parity/native-unmasked-2x.png")}
    reference_state = OUTPUT / "visual-state.json"
    if reference_state.exists():
        reference = json.loads(reference_state.read_text())
        config["native_reference_titles"] = [item["title"] for item in sorted(reference["snapshot"]["news"], key=lambda item: item["updated_at"], reverse=True)[:3]]
    reference_screenshot = OUTPUT / "after-native-cached-three.png"
    if reference_screenshot.exists():
        config["native_reference_screenshot"] = str(reference_screenshot)
    stale_screenshot = OUTPUT / "native-stale.png"
    if stale_screenshot.exists():
        config["native_stale_reference_screenshot"] = str(stale_screenshot)
    previous_colors = ROOT / ".runtime/html-parity/r27-before-same-data-card-2x.png"
    if previous_colors.exists():
        config["pre_conversion_screenshot"] = str(previous_colors)
    env = dict(os.environ, R27_BROWSER_CONFIG=json.dumps(config))
    run = subprocess.run([node, "-"], input=BROWSER_TEST, text=True, capture_output=True, env=env, cwd=ROOT)
    (OUTPUT / "playwright-run.log").write_text(run.stdout + run.stderr, encoding="utf-8")

    assert hashlib.sha256(C3.read_bytes()).hexdigest() == c3_hash, "Historical C3 changed during validation"
    assert PREVIEW.read_bytes() == source, "R2.7 changed during validation; rerun against current source"
    report = json.loads(report_path.read_text())
    report.update({
        "source": str(PREVIEW.relative_to(ROOT)),
        "source_sha256": hashlib.sha256(source).hexdigest(),
        "test_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "c3_source_sha256": c3_hash,
        "c3_unchanged": True,
        "art_source": str(NATIVE_ART.relative_to(ROOT)),
        "art_bytes": len(art), "art_sha256": hashlib.sha256(art).hexdigest(),
        "r27_c3_native_asset_bytes_identical": True,
        "rendered_png_matches_native_go_bytes": True,
        "native_raster_source_sha256": hashlib.sha256(NATIVE_RASTER_SOURCE.read_bytes()).hexdigest(),
        "native_masked_png_sha256": hashlib.sha256(raster).hexdigest(),
        "native_unmasked_png_sha256": hashlib.sha256(raw_raster).hexdigest(),
        "saved_native_feed_checked": "native_reference_titles" in config,
        "native_reference_screenshot_sha256": hashlib.sha256(reference_screenshot.read_bytes()).hexdigest() if reference_screenshot.exists() else None,
        "command": "python3 examples/desktop-reset-clock/tests/r27_native_visual_parity_test.py",
        "native_source_sha256": hashlib.sha256((NATIVE_ART.parent.parent / "native_darwin.m").read_bytes()).hexdigest(),
        "native_stale_reference_screenshot_sha256": hashlib.sha256(stale_screenshot.read_bytes()).hexdigest() if stale_screenshot.exists() else None,
        "whole_card_visual_parity": "not claimed; checked geometry, assets, fixture strings, upcoming-only shadow and four non-text pixel regions",
    })
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    assert run.returncode == 0, f"Playwright failed; see {OUTPUT / 'playwright-run.log'}\n{run.stderr}"
    print("R27_NATIVE_VISUAL_PARITY_BROWSER_PASS", len(report["states"]), "states;", len(report["screenshots"]), "screenshots; art_sha256", report["art_sha256"])


if __name__ == "__main__":
    main()
