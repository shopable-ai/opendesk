import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const url = pathToFileURL(join(root, 'preview', 'index.html')).href;
const screenshots = join(root, '.runtime', 'tests', 'ai-customer-support');
await mkdir(screenshots, { recursive: true });
const browser = await chromium.launch({ headless: true });
let passed = 0;
async function scenario(name, exercise) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();
  const faults = [];
  page.on('pageerror', error => faults.push(error.message));
  try {
    await page.goto(url, { waitUntil: 'load' });
    await page.locator('#od-r12').waitFor({ state: 'visible' });
    await exercise(page);
    assert.deepEqual(faults, [], 'No uncaught browser exceptions: ' + name);
    passed++;
    console.log('PASS browser: ' + name);
  } catch (error) {
    await page.screenshot({ path: join(screenshots, 'FAIL-' + name.replace(/[^a-z0-9-]/gi, '-') + '.png'), fullPage: true });
    throw error;
  } finally {
    await context.close();
  }
}
try {
  await scenario('six-tab-navigation-settings-keyboard', async page => {
    const labels = ['推荐回复', '知识库', '客户档案', '商品', '图片', '订单'];
    const ids = ['reply', 'knowledge', 'customer', 'products', 'images', 'orders'];
    assert.equal(await page.locator('#odiv-tabs [role="tab"]').count(), 6);
    for (let i=0; i<labels.length; i++) {
      await page.getByRole('tab', { name:labels[i], exact:true }).click();
      assert.equal(await page.locator('#odiv-' + ids[i]).isVisible(), true, labels[i] + ' active panel');
      for (let k=0; k<ids.length; k++) if (i!==k) {
        assert.equal(await page.locator('#odiv-' + ids[k]).isVisible(), false, 'inactive panel ' + ids[k]);
      }
    }
    await page.getByRole('button', { name:'打开设置' }).click();
    assert.equal(await page.locator('#odiv-settings').isVisible(), true);
    assert.equal(await page.locator('#odiv-tabs').isVisible(), false);
    await page.getByRole('button', { name:'← 返回' }).click();
    assert.equal(await page.locator('#odiv-orders').isVisible(), true, 'return to previous business page');
    await page.getByRole('tab', { name:'推荐回复' }).focus();
    await page.keyboard.press('End');
    assert.equal(await page.getByRole('tab', { name:'订单' }).getAttribute('aria-selected'), 'true');
  });
  await scenario('customer-order-draft-isolation', async page => {
    await page.getByRole('tab', { name:'订单' }).click();
    assert.equal(await page.locator('#odiv-orders .order-row').count(), 3);
    await page.getByRole('button', { name:'查看订单 OD-DEMO-1001' }).click();
    await page.locator('#odiv-orders .product-actions .primary').click();
    const draft = page.getByRole('textbox', { name:'模拟聊天草稿' });
    assert.match(await draft.inputValue(), /OD-DEMO-1001/);
    await page.locator('#od-contacts button').filter({ hasText:'陈先生' }).click();
    assert.equal(await page.locator('#odiv-orders .order-row').count(), 3);
    assert.equal(await page.getByRole('button', { name:'查看订单 OD-DEMO-1001' }).count(), 0);
    assert.equal(await draft.inputValue(), '');
    await page.locator('#od-contacts button').filter({ hasText:'周女士' }).click();
    assert.equal(await page.locator('#odiv-orders .order-row').count(), 2);
    await page.locator('#od-contacts button').filter({ hasText:'林女士' }).click();
    assert.match(await draft.inputValue(), /OD-DEMO-1001/);
    await page.getByRole('button', { name:'查看订单 OD-DEMO-1002' }).click();
    await page.locator('#odiv-orders .product-actions .primary').click();
    assert.match(await draft.inputValue(), /OD-DEMO-1001/, 'existing draft not overwritten after cancel');
  });
  await scenario('product-image-roundtrip', async page => {
    await page.getByRole('tab', { name:'商品', exact:true }).click();
    assert.equal(await page.locator('#odiv-products .product-row').count(), 6);
    await page.locator('#odiv-products .product-row').first().click();
    await page.getByRole('button', { name:'查看关联图片' }).click();
    assert.equal(await page.locator('#odiv-images .product-lightbox-image').count(), 1);
    await page.getByRole('button', { name:'查看关联商品' }).click();
    assert.equal(await page.locator('#odiv-products .product-detail').count(), 1);
    await page.getByRole('tab', { name:'图片', exact:true }).click();
    await page.getByRole('button', { name:'← 返回图库' }).click();
    assert.equal(await page.locator('#odiv-images .product-gallery-tile').count(), 12);
  });
  await scenario('knowledge-history-import-and-theme', async page => {
    await page.getByRole('tab', { name:'知识库' }).click();
    await page.getByRole('button', { name:'导入知识' }).click();
    await page.locator('#odiv-knowledge input[type="file"]').setInputFiles(join(root, 'fixtures', 'knowledge-demo.json'));
    assert.equal(await page.locator('#odiv-knowledge .kb-rich-entry').count(), 15);
    await page.getByRole('tab', { name:'客户档案' }).click();
    await page.getByRole('button', { name:'导入历史会话' }).click();
    await page.locator('#odiv-customer input[type="file"]').setInputFiles(join(root, 'fixtures', 'customer-history-demo.json'));
    await page.getByRole('button', { name:'根据演示规则提取关键语料' }).click();
    assert.equal(await page.locator('#odiv-customer .profile-markdown').isVisible(), true);
    await page.getByRole('button', { name:'切换明暗主题' }).click();
    assert.equal(await page.locator('#od-r12').getAttribute('data-theme'), 'dark');
  });
  await scenario('responsive-and-zoom', async page => {
    for (const width of [320,360,380,400,440,520,1280]) {
      await page.setViewportSize({ width, height: 880 });
      assert.equal(await page.locator('#odiv-tabs [role="tab"]').count(), 6);
      assert.equal(await page.locator('.merge-assistant').isVisible(), true);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 2, 'body horizontal overflow at ' + width + ' px: ' + overflow);
      if ([320,380,520,1280].includes(width)) {
        await page.screenshot({path:join(screenshots,'preview-' + width + '-light.png'),fullPage:true});
      }
    }
    await page.setViewportSize({ width: 960, height: 900 });
    await page.evaluate(() => {document.body.style.zoom='2';});
    assert.equal(await page.locator('#odiv-tabs [role="tab"]').count(), 6);
    const width = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(width <= 2, '200% zoom body overflow: ' + width);
    await page.screenshot({path:join(screenshots,'preview-200pct.png'),fullPage:true});
  });
  console.log('BROWSER_SMOKE_PASSED=' + passed + '/5; environment=CI headless Chromium (not local Mac Chrome)');
} finally {
  await browser.close();
}
