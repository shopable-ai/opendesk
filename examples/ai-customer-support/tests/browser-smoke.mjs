import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const url = pathToFileURL(join(root, 'preview', 'index.html')).href;
const screenshots = resolve(root, '..', '..', '.runtime', 'tests', 'ai-customer-support');
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
    assert.equal(await page.locator('#od-contacts .contactbtn .avatar').count(), 3, 'R1.9.1 contact cards and avatars');
    assert.equal(await page.locator('#od-messages .bubble .bubble-text').count(), 1, 'R1.9.1 message bubbles');
    const messageStyle = await page.locator('#od-messages .bubble-text').first().evaluate(node => {
      const style = getComputedStyle(node);
      return { backgroundColor:style.backgroundColor, borderRadius:style.borderTopRightRadius };
    });
    assert.notEqual(messageStyle.backgroundColor, 'rgba(0, 0, 0, 0)', 'chat bubble must not be transparent');
    assert.notEqual(messageStyle.borderRadius, '0px', 'chat bubble must keep rounded styling');
    const overlap = await page.evaluate(() =>
      document.querySelector('.chat-body .contactlist').getBoundingClientRect().right -
      document.querySelector('.chat-body .conversation').getBoundingClientRect().left
    );
    assert.ok(overlap <= 1, 'R1.9.1 contact cards must not overlap the message column: ' + overlap);
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
    await page.waitForFunction(() => document.querySelectorAll('#odiv-knowledge .kb-rich-entry').length === 15);
    assert.equal(await page.locator('#odiv-knowledge .kb-rich-entry').count(), 15);
    await page.getByRole('tab', { name:'客户档案' }).click();
    await page.getByRole('button', { name:'导入历史会话' }).click();
    await page.locator('#odiv-customer input[type="file"]').setInputFiles(join(root, 'fixtures', 'customer-history-demo.json'));
    await page.getByText('已导入，请点击 ✦ 提取关键信息').waitFor();
    await page.getByRole('button', { name:'根据演示规则提取关键语料' }).click();
    assert.equal(await page.locator('#odiv-customer .profile-markdown').isVisible(), true);
    await page.getByRole('button', { name:'切换明暗主题' }).click();
    assert.equal(await page.locator('#od-r12').getAttribute('data-theme'), 'dark');
  });
  await scenario('auth-pause-invalid-file-empty-and-refresh', async page => {
    await page.getByRole('button', { name:'打开设置' }).click();
    const granted = page.getByRole('checkbox', { name:'模拟窗口授权' });
    await granted.uncheck();
    await page.getByRole('button', { name:'← 返回' }).click();
    await page.getByRole('tab', { name:'订单' }).click();
    assert.equal(await page.locator('#odiv-orders .order-row').count(), 0, 'permission revoked hides customer orders');
    await page.getByRole('tab', { name:'推荐回复' }).click();
    assert.equal(await page.locator('#odiv-reply .compact-actions button.primary').isDisabled(), true);
    await page.getByRole('button', { name:'打开设置' }).click();
    await granted.check();
    await page.getByRole('checkbox', { name:'继续观察新消息' }).uncheck();
    await page.getByRole('button', { name:'← 返回' }).click();
    assert.equal(await page.locator('#odiv-reply .compact-actions button.primary').isDisabled(), true, 'pause gates fill');
    await page.getByRole('button', { name:'打开设置' }).click();
    await page.getByRole('checkbox', { name:'继续观察新消息' }).check();
    await page.getByRole('button', { name:'← 返回' }).click();
    await page.getByRole('tab', { name:'知识库' }).click();
    await page.getByRole('button', { name:'导入知识' }).click();
    await page.locator('#odiv-knowledge input[type="file"]').setInputFiles({
      name:'invalid.json', mimeType:'application/json', buffer:Buffer.from('{"entries":[')
    });
    assert.equal(await page.locator('#odiv-knowledge').isVisible(), true, 'invalid file does not blank panel');
    assert.match(await page.getByRole('status').last().innerText(), /导入失败/);
    await page.getByRole('tab', { name:'商品' }).click();
    await page.getByRole('searchbox', { name:'搜索商品名称型号和规格' }).fill('THIS-DOES-NOT-EXIST');
    assert.equal(await page.locator('#odiv-products .product-row').count(), 0);
    await page.reload();
    await page.locator('#od-r12').waitFor({state:'visible'});
    assert.equal(await page.locator('#odiv-tabs [role="tab"]').count(), 6, 'refresh reinitializes a valid app');
  });
  await scenario('manual-send-readback-and-idempotence', async page => {
    await page.locator('#odiv-reply .compact-actions button.primary').click();
    const send = page.locator('.chat-send button.primary');
    assert.equal(await send.isEnabled(), true);
    await send.click();
    assert.equal(await page.locator('#od-messages .bubble.outgoing').count(), 1);
    assert.equal(await send.isDisabled(), true, 'same customer message cannot be resent');
    await page.locator('#od-contacts button').filter({ hasText:'陈先生' }).click();
    assert.equal(await page.locator('#od-messages .bubble.outgoing').count(), 0, 'other customer still has no agent reply');
    await page.locator('#od-contacts button').filter({ hasText:'林女士' }).click();
    assert.equal(await page.locator('#od-messages .bubble.outgoing').count(), 1, 'reply belongs only to original customer');
    await page.getByRole('textbox', { name:'自定义客户提问' }).fill('测试长文本：' + 'A'.repeat(1000));
    await page.getByRole('button', { name:'发送问题' }).click();
    assert.equal(await page.locator('#od-messages .bubble.outgoing').count(), 1, 'new customer question does not duplicate agent send');
    const last = await page.locator('#od-messages .bubble .bubble-text').last().innerText();
    assert.ok(last.length <= 400, 'new customer text bounded safely');
  });
  await scenario('short-window-keeps-navigation-visible', async page => {
    await page.getByRole('textbox', {name:'自定义客户提问'}).fill('长文本：'+'售后说明'.repeat(100));
    await page.getByRole('button', {name:'发送问题',exact:true}).click();
    for (const size of [{width:320,height:640},{width:960,height:408}]) {
      await page.setViewportSize(size);
      await page.getByRole('button', {name:'编辑选中回复'}).click();
      const bounds = await page.locator('#odiv-tabs').boundingBox();
      assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= size.height, 'tabs remain in viewport after focusing a bottom action');
      assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 2), 'long content must not scroll the outer page');
      await page.getByRole('button', {name:'打开设置'}).click();
      await page.getByRole('button', {name:'重置跟随位置'}).click();
      const back = await page.getByRole('button', {name:'← 返回'}).boundingBox();
      assert.ok(back.y >= 0 && back.y + back.height <= size.height, 'settings return stays visible after scrolling settings');
      await page.getByRole('button', {name:'← 返回'}).click();
      await page.screenshot({path:join(screenshots,`short-${size.width}x${size.height}.png`)});
    }
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
  console.log('BROWSER_SMOKE_PASSED=' + passed + '/8; environment=CI headless Chromium (not local Mac Chrome; CSS zoom is not browser zoom)');
} finally {
  await browser.close();
}
