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
const coreOnly = process.argv.includes('--core');
let passed = 0;
async function scenario(name, exercise) {
  if (coreOnly && ['short-window-keeps-navigation-visible','responsive-and-zoom'].includes(name)) return;
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
  await scenario('demo-product-link-message-and-customer-switch', async page => {
    await page.getByRole('tab',{name:'商品',exact:true}).click();
    const search=page.getByRole('searchbox',{name:'搜索商品名称型号和规格'});
    const link='https://catalog.opendesk.example/products/demo-jacket';
    await search.fill(link);
    assert.equal(await page.locator('#odiv-products .product-row').count(),1);
    await search.fill('https://catalog.opendesk.example.evil.test/products/demo-jacket');
    assert.equal(await page.locator('#odiv-products .product-row').count(),0,'spoofed domain is not accepted');
    await search.fill('OD-JK-101');
    assert.equal(await page.locator('#odiv-products .product-row').count(),1,'SKU search remains available');
    await page.getByRole('textbox',{name:'自定义客户提问'}).fill('请问 OD-JK-101 的尺码？');
    await page.getByRole('button',{name:'发送问题'}).click();
    await page.getByRole('tab',{name:'推荐回复',exact:true}).click();
    await page.getByRole('button',{name:'查看关联商品：轻量连帽外套'}).click();
    assert.equal(await page.locator('#odiv-products .product-detail-name').innerText(),'轻量连帽外套');
    await page.getByRole('button',{name:'查看关联图片'}).click();
    assert.equal(await page.locator('#odiv-images .product-lightbox-image').count(),1);
    await page.locator('#od-contacts button').filter({hasText:'陈先生'}).click();
    await page.getByRole('tab',{name:'推荐回复',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'查看关联商品：轻量连帽外套'}).count(),0,
      'product clue must follow the current customer message');
  });
  await scenario('knowledge-conflict-diagnostic', async page => {
    await page.getByRole('tab',{name:'知识库',exact:true}).click();
    await page.getByRole('button',{name:'导入知识'}).click();
    const entries=[
      {question:'冲突演示问题',answer:'结果甲',keywords:['冲突演示']},
      {question:'冲突演示问题',answer:'结果乙',keywords:['冲突演示']}
    ];
    await page.locator('#odiv-knowledge input[type="file"]').setInputFiles({
      name:'conflict.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({entries}))
    });
    await page.getByRole('status').filter({hasText:'导入 2 条'}).waitFor();
    await page.getByRole('textbox',{name:'自定义客户提问'}).fill('冲突演示问题');
    await page.getByRole('button',{name:'发送问题'}).click();
    await page.getByRole('status').filter({hasText:'当前消息：知识冲突'}).waitFor();
    await page.getByRole('tab',{name:'推荐回复',exact:true}).click();
    assert.match(await page.locator('#odiv-reply .hit').first().innerText(),/知识冲突/);
    assert.equal(await page.locator('#odiv-options .option-wrap').count(),2,
      'conflicting knowledge only yields clarification and handoff');
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
  await scenario('draft-overwrite-cancel-and-accept', async page => {
    const draft=page.getByRole('textbox',{name:'模拟聊天草稿',exact:true});
    const fill=page.getByRole('button',{name:'→ 填入聊天草稿',exact:true});
    await draft.fill('人工保留草稿');
    page.once('dialog',dialog=>dialog.dismiss());
    await fill.click();
    assert.equal(await draft.inputValue(),'人工保留草稿');
    page.once('dialog',dialog=>dialog.accept());
    await fill.click();
    assert.match(await draft.inputValue(),/签收后 7 天/);
    await page.locator('#od-contacts button').filter({hasText:'陈先生'}).click();
    assert.equal(await draft.inputValue(),'');
    await page.getByRole('tab',{name:'订单',exact:true}).click();
    await page.getByRole('button',{name:'查看订单 OD-DEMO-2001'}).click();
    await draft.fill('陈先生自己的草稿');
    page.once('dialog',dialog=>dialog.dismiss());
    await page.locator('#odiv-orders .product-actions .primary').click();
    assert.equal(await draft.inputValue(),'陈先生自己的草稿');
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('#odiv-orders .product-actions .primary').click();
    assert.match(await draft.inputValue(),/OD-DEMO-2001/);
    assert.doesNotMatch(await draft.inputValue(),/OD-DEMO-1001/);
  });
  await scenario('knowledge-markdown-and-rejected-files', async page => {
    await page.getByRole('tab',{name:'知识库',exact:true}).click();
    await page.getByRole('button',{name:'导入知识',exact:true}).click();
    const input=page.locator('#odiv-knowledge input[type="file"]');
    await input.setInputFiles({name:'care.md',mimeType:'text/markdown',buffer:Buffer.from('## 清洗方法\n请手洗并自然晾干。')});
    await page.getByRole('button',{name:/清洗方法/}).click();
    assert.match(await page.locator('#odiv-knowledge .kb-rich-detail').innerText(),/care.md/);
    assert.match(await page.locator('#odiv-knowledge .kb-rich-detail').innerText(),/默认只提供推荐/);
    for(const [name,body,reason] of [['bad-types.json',JSON.stringify([{question:{x:1},answer:'答案'}]),'字段类型不符合要求'],
      ['too-large.json','x'.repeat(262145),'文件超过 256KB'],
      ['unsupported.txt','## 应被拒绝的问题\n这是有效的 Markdown 答案。','仅支持 256KB 内的 JSON / Markdown']]){
      await input.setInputFiles({name,mimeType:'text/plain',buffer:Buffer.from(body)});
      await page.getByRole('status').filter({hasText:reason}).waitFor();
      assert.equal(await page.locator('#odiv-knowledge .kb-rich-entry').count(),8,'rejected file must not change accepted knowledge');
    }
  });
  await scenario('history-conflict-keeps-reviewed-evidence', async page => {
    await page.getByRole('tab',{name:'客户档案',exact:true}).click();
    await page.getByRole('button',{name:'导入历史会话',exact:true}).click();
    const input=page.locator('#odiv-customer input[type="file"]');
    const file=text=>({name:'review.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({
      schemaVersion:1,format:'opendesk.ai-customer-support.customer-history-demo',demo:true,
      customers:[{customerId:'t1',sessions:[{sessionId:'review',messages:[{messageId:'review-1',role:'customer',text}]}]}]
    }))});
    await input.setInputFiles(file('我更喜欢黑色。'));
    await page.locator('.profile-import-result').filter({hasText:'已导入'}).waitFor();
    await page.getByRole('button',{name:'根据演示规则提取关键语料'}).click();
    const fact=page.locator('.profile-md-fact').filter({hasText:'偏好黑色'});
    await fact.getByRole('button',{name:'查看原话与来源'}).click();
    await fact.getByRole('button',{name:'确认信息'}).click();
    assert.match(await fact.innerText(),/已确认/);
    await input.setInputFiles(file('我更喜欢蓝色。'));
    await page.locator('.profile-import-result').filter({hasText:'导入失败'}).waitFor();
    assert.match(await fact.innerText(),/我更喜欢黑色/);
    assert.match(await fact.innerText(),/已确认/);
    await page.locator('#od-contacts button').filter({hasText:'陈先生'}).click();
    await page.locator('.profile-who').filter({hasText:'#t2'}).waitFor();
    await fact.waitFor({state:'detached'});
    assert.equal(await page.locator('.profile-md-fact').filter({hasText:'偏好黑色'}).count(),0);
    await page.screenshot({path:join(screenshots,'history-import-isolation.png')});
    await page.locator('#od-contacts button').filter({hasText:'林女士'}).click();
    await page.locator('.profile-who').filter({hasText:'#t1'}).waitFor();
    await fact.waitFor();
    assert.match(await fact.innerText(),/已确认/,'switching customers must preserve the original reviewed fact');
  });
  await scenario('automatic-unknown-readback-stops-session', async page => {
    await page.getByRole('button',{name:'打开设置'}).click();
    await page.getByRole('checkbox',{name:'发送后模拟回读验证',exact:true}).uncheck();
    await page.getByRole('checkbox',{name:'智能托管',exact:true}).click();
    await page.getByRole('button',{name:'理解并启用',exact:true}).click();
    await page.getByRole('button',{name:'← 返回'}).click();
    await page.getByRole('button',{name:'发票 · 精确',exact:true}).click();
    assert.match(await page.locator('#odiv-reply .receipt').innerText(),/未确认/);
    assert.equal(await page.getByRole('button',{name:'恢复托管',exact:true}).isVisible(),true);
    await page.getByRole('button',{name:'发票 · 精确',exact:true}).click();
    assert.equal(await page.locator('#od-messages .bubble.outgoing').count(),1,'unknown receipt does not permit more automatic sends');
    await page.screenshot({path:join(screenshots,'automatic-readback-unknown.png')});
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
  console.log('BROWSER_SMOKE_PASSED=' + passed + '; scope='+(coreOnly?'core':'all')+'; environment=CI headless Chromium (not local Mac Chrome; CSS zoom is not browser zoom)');
} finally {
  await browser.close();
}
