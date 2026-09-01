const entry = File.read('examples/mac/wechat_steps/main.js');
if (!entry) {
  throw new Error('缺少入口脚本: examples/mac/wechat_steps/main.js');
}

const patchedEntry = entry.replace('await shared.main();', '');
const probeCode = `
shared.writeSearchResultProbeReport = async function writeSearchResultProbeReport(context) {
  const scan = context.conversationScan || null;
  const ranked = (scan?.rows || [])
    .map((row) => ({
      text: row?.text || '',
      compactText: row?.compactText || '',
      bbox: row?.bbox || null,
      score: shared.matchTargetTextScore(row?.text || '', shared.runtimeConfig.targetChatName),
      hasBBox: Boolean(row?.bbox),
    }))
    .sort((a, b) => b.score - a.score);
  const out = {
    timestamp: new Date().toISOString(),
    mode: 'search_result_row_probe',
    config: shared.runtimeConfig,
    auditPath: shared.runtimeConfig.sendAuditPath,
    window: context.win,
    searchResolved: context.searchResolved || null,
    conversationResolved: context.conversationResolved || null,
    searchInputMode: context.searchInputMode || null,
    searchQueryVisibleCheck: context.searchQueryVisibleCheck || null,
    conversationScan: {
      shotPath: scan?.shot?.path || null,
      text: scan?.text || '',
      lineCount: scan?.lineCount || 0,
      rowCount: Array.isArray(scan?.rows) ? scan.rows.length : 0,
      rows: ranked,
    },
    topClickableTarget: ranked.find((item) => item.hasBBox && item.score >= 0.6) || null,
    topTextOnlyTarget: ranked.find((item) => !item.hasBBox && item.score >= 0.6) || null,
  };
  const reportPath = '.runtime/temp/mac/wechat_v1_search_result_row_probe_' + Date.now() + '.json';
  await File.write(reportPath, JSON.stringify(out, null, 2));
  console.log('search_result_probe_report:', reportPath);
  return reportPath;
};

shared.searchResultRowProbeMain = async function searchResultRowProbeMain() {
  const context = await shared.buildInitialContext();
  await shared.locate_search_area(context);
  await shared.focus_search_input(context);
  await shared.type_search_query(context);
  await shared.locate_conversation_list(context);
  await shared.scan_conversation_list(context, 'conversation_search_results_probe');
  return shared.writeSearchResultProbeReport(context);
};

await shared.searchResultRowProbeMain();
`;

await eval(`(async () => {\n${patchedEntry}\n${probeCode}\n})()`);
