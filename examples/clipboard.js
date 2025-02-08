
// 2. 测试复制文本到剪贴板
const testText = '这是一个测试剪贴板的文本 - ' + new Date().toLocaleString();
console.log('准备复制文本到剪贴板:', testText);
copyToClipboard(testText);
console.log('文本已成功复制到剪贴板');

// 3. 等待1秒
await sleep(1000);

// 4. 获取剪贴板内容并验证
const clipboardContent = getClipboard();
console.log('剪贴板内容:', clipboardContent);

// 5. 验证复制的内容是否正确
if (clipboardContent === testText) {
    console.log('✅ 剪贴板操作成功：文本完全匹配');
} else {
    console.warn('❌ 剪贴板内容不匹配');
    console.warn('预期:', testText);
    console.warn('实际:', clipboardContent);
}

// 6. 清空剪贴板
clipboard.clear();
console.log('剪贴板已清空');

// 7. 验证剪贴板是否为空
const emptyClipboard = getClipboard();
console.log('清空后的剪贴板内容:', emptyClipboard);