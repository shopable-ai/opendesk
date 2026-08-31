const helper = {};
const common = File.read('tests/locateanything/scripts/common.js');
const inject = File.read('tests/locateanything/scripts/wechat_inject.js');
const mainEntry = File.read('examples/mac/wechat_steps/main.js');
const regionMapEntry = File.read('examples/mac/wechat_region_map.js');

if (!common) throw new Error('missing tests/locateanything/scripts/common.js');
if (!inject) throw new Error('missing tests/locateanything/scripts/wechat_inject.js');
if (!mainEntry) throw new Error('missing examples/mac/wechat_steps/main.js');
if (!regionMapEntry) throw new Error('missing examples/mac/wechat_region_map.js');

new Function('shared', common)(helper);

const patchedEntry = mainEntry.replace('await shared.main();', '');
const config = helper.loadLocateAnythingConfig();
const manifest = helper.loadManifest('tests/locateanything/manifests/stage_03_workflow_cases.json');
const outputRoot = `${config.artifactRoot}/stage_03_script_assisted`;
const reportPath = '.runtime/tests/locateanything/reports/STAGE_03_SCRIPT_ASSISTED_REPORT.md';
const summaryPath = `${outputRoot}/summary.json`;
const regionReportPath = '.runtime/temp/mac/wechat_region_map_latest.json';

await helper.ensureDir(outputRoot);
await helper.ensureDir('.runtime/temp/mac');
const health = await helper.healthCheck(config.serviceUrl, config.requestTimeoutMs);
if (!health.ok) {
  throw new Error(`LocateAnything bridge health check failed for ${config.serviceUrl}: ${health.error || 'unknown error'}`);
}
const bridgeHealth = helper.describeBridgeHealth(health);

const tempConfigPath = '.runtime/temp/mac/wechat_structured_send_v2.config.json';
const previousTempConfig = File.exists(tempConfigPath) ? File.read(tempConfigPath) : '';
const hadPreviousTempConfig = File.exists(tempConfigPath);

function mergeDeep(base, override) {
  return helper.mergeDeep(base, override);
}

async function refreshWechatRegionReport() {
  const startedAt = Date.now();
  try {
    await eval([
      '(async () => {',
      regionMapEntry,
      '})()'
    ].join('\n'));
    if (!File.exists(regionReportPath)) {
      throw new Error(`region report was not generated at ${regionReportPath}`);
    }
    return {
      ok: true,
      reportPath: regionReportPath,
      durationMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      ok: false,
      reportPath: regionReportPath,
      durationMs: Date.now() - startedAt,
      error: error && error.message ? error.message : String(error)
    };
  }
}

const regionReportPreparation = await refreshWechatRegionReport();

async function collectWorkflowPreflight(caseDef, scenarioConfig) {
  const issues = [];
  try {
    await page.ensureMacPermissions({
      openSettingsOnFail: false,
      section: 'screenCapture',
      strict: true,
    });
  } catch (error) {
    issues.push(`macOS permissions not ready: ${error && error.message ? error.message : String(error)}`);
  }

  if (!regionReportPreparation.ok) {
    issues.push(`region report refresh failed: ${regionReportPreparation.error || 'unknown error'}`);
  }

  if (!File.exists(regionReportPath)) {
    issues.push(`missing region report: ${regionReportPath}`);
  }

  if (!scenarioConfig.targetChatName) {
    issues.push('missing targetChatName in LocateAnything config override');
  }

  if (caseDef.sendAllowed && !scenarioConfig.replyMessage) {
    issues.push('missing replyMessage for guarded send scenario');
  }

  return issues;
}

async function runScenario(caseDef) {
  const scenarioDir = `${outputRoot}/${helper.slugify(caseDef.id)}`;
  await helper.ensureDir(scenarioDir);
  const scenarioConfig = mergeDeep(config, caseDef.workflowConfig || {});
  scenarioConfig.workflowLane = caseDef.lane;
  scenarioConfig.enableSend = Boolean(caseDef.sendAllowed && scenarioConfig.enableSend);
  scenarioConfig.locateAnythingStageRoot = scenarioDir;
  scenarioConfig.locateAnythingScenarioResultPath = `${scenarioDir}/report.json`;
  scenarioConfig.sendAuditPath = `${scenarioDir}/audit.jsonl`;
  scenarioConfig.serviceUrl = config.serviceUrl;
  scenarioConfig.requestTimeoutMs = config.requestTimeoutMs;
  scenarioConfig.permissionSection = 'screenCapture';
  await File.write(tempConfigPath, JSON.stringify(scenarioConfig, null, 2));

  const preflightIssues = await collectWorkflowPreflight(caseDef, scenarioConfig);
  if (preflightIssues.length > 0) {
    const report = {
      stageCase: caseDef,
      scenarioStatus: {
        ok: false,
        failureMessage: preflightIssues.join(' | ')
      },
      locateAnything: {
        lane: caseDef.lane,
        maxModelSteps: helper.LANE_POLICIES[caseDef.lane]?.maxModelSteps || 0,
        totalResolutionSteps: 0,
        modeledResolutionSteps: 0,
        modeledResolutionRatio: 0,
        trace: [],
        surfacesVisited: [],
        surfacesModeled: []
      }
    };
    const reportPath = `${scenarioDir}/report.json`;
    await File.write(reportPath, JSON.stringify(report, null, 2));
    return {
      id: caseDef.id,
      lane: caseDef.lane,
      scene: caseDef.scene,
      sendAllowed: Boolean(caseDef.sendAllowed),
      requiresLiveWechat: Boolean(caseDef.requiresLiveWechat),
      durationMs: 0,
      ok: false,
      failureMessage: preflightIssues.join(' | '),
      statusSummary: null,
      locateAnything: report.locateAnything,
      reportPath
    };
  }

  const code = [
    '(async () => {',
    patchedEntry,
    `const LOCATEANYTHING_STAGE_CASE = ${JSON.stringify(caseDef)};`,
    common,
    inject,
    'return await shared.locateAnythingScenarioMain(LOCATEANYTHING_STAGE_CASE);',
    '})()'
  ].join('\n');

  const startedAt = Date.now();
  let resultPath = '';
  let ok = false;
  let failure = '';
  try {
    resultPath = await eval(code);
    ok = true;
  } catch (error) {
    ok = false;
    failure = error && error.message ? error.message : String(error);
    resultPath = `${scenarioDir}/report.json`;
    if (!File.exists(resultPath)) {
      await File.write(resultPath, JSON.stringify({
        stageCase: caseDef,
        scenarioStatus: {
          ok: false,
          failureMessage: failure
        }
      }, null, 2));
    }
  }

  const report = File.exists(resultPath) ? helper.parseJson(File.read(resultPath), resultPath) : {};
  return {
    id: caseDef.id,
    lane: caseDef.lane,
    scene: caseDef.scene,
    sendAllowed: Boolean(caseDef.sendAllowed),
    requiresLiveWechat: Boolean(caseDef.requiresLiveWechat),
    durationMs: Date.now() - startedAt,
    ok: ok && Boolean(report?.scenarioStatus?.ok !== false),
    failureMessage: failure || report?.scenarioStatus?.failureMessage || '',
    statusSummary: report?.statusSummary || null,
    locateAnything: report?.locateAnything || null,
    reportPath: resultPath
  };
}

const results = [];
try {
  for (const caseDef of manifest) {
    results.push(await runScenario(caseDef));
  }
} finally {
  if (hadPreviousTempConfig) {
    await File.write(tempConfigPath, previousTempConfig);
  } else {
    await File.write(tempConfigPath, '{}\n');
  }
}

const summary = {
  stage: 'stage_03_script_assisted',
  generatedAt: new Date().toISOString(),
  serviceUrl: config.serviceUrl,
  health,
  bridgeBackend: bridgeHealth.backend,
  inlineImageTransport: bridgeHealth.acceptsBase64,
  regionReportPreparation,
  totalCases: results.length,
  passedCases: results.filter((item) => item.ok).length,
  failedCases: results.filter((item) => !item.ok).length,
  results
};
await File.write(summaryPath, JSON.stringify(summary, null, 2));

const lines = [
  '# Stage 03 Script Assisted Report',
  '',
  `- Generated at: ${summary.generatedAt}`,
  `- Service URL: \`${summary.serviceUrl}\``,
  `- Bridge backend: \`${summary.bridgeBackend || 'unknown'}\``,
  `- Inline image transport: \`${summary.inlineImageTransport ? 'enabled' : 'disabled'}\``,
  `- Region report preparation: \`${summary.regionReportPreparation.ok ? 'ok' : 'failed'}\` (${summary.regionReportPreparation.durationMs}ms)`,
  `- Cases: ${summary.totalCases}`,
  `- Passed: ${summary.passedCases}`,
  `- Failed: ${summary.failedCases}`,
  '',
  '| Case | Lane | Send | Result | Modeled ratio | Notes |',
  '| --- | --- | --- | --- | --- | --- |'
];
for (const item of results) {
  const note = String(item.failureMessage || 'ok').replace(/\s+/g, ' ');
  const shortNote = note.length > 180 ? `${note.slice(0, 177)}...` : note;
  lines.push(
    `| ${item.id} | ${item.lane} | ${item.sendAllowed ? 'yes' : 'no'} | ${item.ok ? 'PASS' : 'FAIL'} | ${item.locateAnything ? item.locateAnything.modeledResolutionRatio : 'n/a'} | ${shortNote} |`
  );
}
lines.push('');
lines.push('## Scenario Reports');
lines.push('');
for (const item of results) {
  lines.push(`- \`${item.id}\`: \`${item.reportPath}\``);
}
await File.write(reportPath, lines.join('\n'));
console.log(JSON.stringify(summary, null, 2));
