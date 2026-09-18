(function installOpenDeskProductLocalization(global) {
  'use strict';

  // This is a product adapter, not another i18n implementation. The native
  // bridge resolves every key through pkg/localization using the official App
  // package catalogs and its existing fallback rules.
  const locale = global.System && global.System.product && global.System.product.locale;
  const entries = [
    ['common.close', '关闭'], ['common.cancel', '取消'], ['common.refresh', '刷新'],
    ['common.open', '打开'], ['common.delete', '删除'], ['common.restore', '恢复'],
    ['common.save', '保存'], ['common.stop', '停止'], ['common.run', '运行'],
    ['common.status', '状态'], ['common.loading', '正在加载…'], ['common.error', '失败'],
    ['assistant.title', 'AI 助手'], ['assistant.newConversation', '新建对话'],
    ['assistant.recent', '最近对话'], ['assistant.archived', '已归档'],
    ['assistant.noArchived', '暂无已归档对话'], ['assistant.more', '查看更多'],
    ['assistant.newTitle', '新对话'], ['assistant.localSession', '本地会话'],
    ['assistant.titlePlaceholder', '对话标题'], ['assistant.saveTitle', '保存标题'],
    ['assistant.archiveCurrent', '归档当前对话'], ['assistant.archive', '归档'],
    ['assistant.modelLoading', '正在读取模型配置…'], ['assistant.historyLocal', '会话历史保存在本地。'],
    ['assistant.refreshModel', '刷新模型配置状态'], ['assistant.connectionHelp', '查看连接说明'],
    ['assistant.messageEmpty', '这是一个新对话。输入消息后才会调用模型；打开历史不会自动重发。'],
    ['assistant.chatHistory', '聊天记录'], ['assistant.message', '聊天消息'],
    ['assistant.messagePlaceholder', '输入消息。发送只由按钮触发，输入法确认不会自动发送。'],
    ['assistant.noActions', '普通聊天不会运行脚本、命令或桌面动作。'],
    ['assistant.stopRequest', '停止当前请求'], ['assistant.send', '发送消息'],
    ['assistant.sendShort', '发送'], ['assistant.stopShort', '停止'],
    ['assistant.pending', '处理中'], ['assistant.stopping', '正在停止'],
    ['assistant.stopped', '已停止'], ['assistant.interrupted', '已中断'],
    ['assistant.generating', '正在生成回复…'], ['assistant.user', '你'],
    ['scheduler.title', '计划中心'], ['scheduler.connecting', '正在连接计划服务…'],
    ['scheduler.loading', '正在加载计划…'], ['scheduler.create', '创建计划'],
    ['scheduler.createHint', '创建计划，展开表单'], ['scheduler.refreshList', '刷新计划列表'],
    ['scheduler.createDescription', '设置要运行的脚本与执行时间。'],
    ['scheduler.required', '名称、脚本来源、类型和表达式为必填'],
    ['scheduler.cancelCreate', '取消创建并收起表单'], ['scheduler.execution', '执行内容'],
    ['scheduler.executionDescription', '可选择脚本目录中的文件，或直接保存脚本文本。'],
    ['scheduler.notifyTemplate', '通知测试模板'], ['scheduler.fillFile', '填入通知文件示例'],
    ['scheduler.fillInline', '填入 ui.toast 文本示例'], ['scheduler.name', '计划名称'],
    ['scheduler.namePlaceholder', '例如：每日数据整理'], ['scheduler.source', '脚本来源'],
    ['scheduler.file', '脚本文件'], ['scheduler.inline', '脚本文本'],
    ['scheduler.sourceHelp', '选择脚本目录中的 JavaScript 文件，或直接填写脚本文本。'],
    ['scheduler.path', '脚本路径'], ['scheduler.pathPlaceholder', '例如：notify-and-log.js'],
    ['scheduler.inlineScript', 'JavaScript 脚本文本'],
    ['scheduler.inlinePlaceholder', "console.log('计划开始'); await ui.toast({message: '计划已运行', timeoutMs: 2500});"],
    ['scheduler.inlineHelp', '最多 256 KiB；列表与接口不会回传脚本文本正文。'],
    ['scheduler.rule', '执行规则'], ['scheduler.ruleDescription', '定义触发方式、时区与错过执行策略。'],
    ['scheduler.type', '调度类型'], ['scheduler.every', '间隔执行'], ['scheduler.cron', 'Cron 表达式'],
    ['scheduler.once', '单次执行'], ['scheduler.expression', '执行表达式'], ['scheduler.timezone', '时区'],
    ['scheduler.misfire', '错过执行'], ['scheduler.runOnce', '补跑一次'], ['scheduler.skipMissed', '跳过错过执行'],
    ['scheduler.list', '计划列表'], ['scheduler.empty', '暂无计划。使用右上角“创建计划”按钮添加第一个计划。'],
    ['scheduler.next', '下次运行'], ['scheduler.last', '最近运行'], ['scheduler.enabled', '状态'],
    ['scheduler.history', '查看运行历史'], ['scheduler.pause', '暂停计划'], ['scheduler.runNow', '立即运行'],
    ['scheduler.deletePlan', '删除计划'], ['scheduler.queued', '排队中'], ['scheduler.running', '运行中'],
    ['scheduler.succeeded', '成功'], ['scheduler.failed', '失败'], ['scheduler.canceled', '已取消'],
    ['scheduler.skipped', '已跳过'], ['scheduler.notRun', '尚未运行'], ['scheduler.unknown', '未知'],
    ['permissions.title', '系统权限'], ['permissions.refresh', '重新检查'],
    ['permissions.scope', '这里只检查系统授权。具体能否开始录制，请以录制器的检查结果为准。'],
    ['permissions.request', '请求授权'], ['permissions.retry', '重新尝试'], ['permissions.openSettings', '打开系统设置'],
    ['runtimeLog.title', '运行日志'], ['runtimeLog.locating', '正在定位最近一次自动化…'],
    ['runtimeLog.autoScrollOn', '自动滚动：开'], ['runtimeLog.autoScrollOff', '自动滚动：关'],
    ['runtimeLog.openFolder', '打开日志目录'], ['runtimeLog.automation', '自动化'],
    ['runtimeLog.started', '开始'], ['runtimeLog.finished', '结束 / 结果'],
    ['runtimeLog.notLoaded', '尚未加载运行日志。'], ['runtimeLog.scriptOutput', '脚本输出'],
    ['runtimeLog.errors', '错误'], ['runtimeLog.summary', '摘要'], ['runtimeLog.none', '尚未运行'],
    ['developer.statusTitle', 'OpenDesk 运行状态'], ['developer.statusDescription', '同一 Runtime 内的产品能力状态'],
    ['developer.runtimeStatus', '运行状态来自当前 OpenDesk App Execution。'],
    ['developer.runtimeState', '运行中 / 已隐藏'], ['developer.shown', '已显示'], ['developer.unavailable', '不可用'],
    ['developer.localOnly', '仅本机 loopback'], ['developer.permissionsUnavailable', '权限或平台不可用'],
    ['product.mainTitle', 'OpenDesk — Script Runner'], ['product.automation', '自动化'],
    ['product.noScript', '暂无脚本'], ['product.scriptList', '脚本列表'],
    ['product.customize', '定制'], ['product.help', '帮助'],
    // Product Runner: list states, actions, and execution feedback.
    ['runner.title', 'OpenDesk Script Runner'], ['runner.directory', '脚本目录'],
    ['runner.directoryUnavailable', '脚本目录不可用'], ['runner.loadingScripts', '正在读取脚本目录…'],
    ['runner.loading', '正在加载脚本…'], ['runner.loadingHelp', '正在读取脚本目录，请稍候。'],
    ['runner.empty', '暂无可运行脚本'], ['runner.emptyHelp', '将 JavaScript Recipe 添加到脚本目录后，可以在这里直接运行。'],
    ['runner.openDirectory', '打开自动化目录'], ['runner.refreshList', '刷新自动化列表'],
    ['runner.listLoadFailed', '脚本列表加载失败'], ['runner.rescan', '重新扫描自动化目录'],
    ['runner.script', '脚本'], ['runner.action', '操作'], ['runner.order', '排序'],
    ['runner.runSelected', '运行选中的自动化'], ['runner.stopRun', '停止运行'],
    ['runner.restoreOrder', '恢复默认排序'], ['runner.closeList', '关闭自动化列表'],
    ['runner.noScripts', '当前没有可运行脚本。'], ['runner.running', '正在运行'],
    ['runner.completed', '运行完成'], ['runner.runFailed', '运行失败'], ['runner.stopped', '已停止'],
    ['runner.rescanning', '正在重新扫描脚本目录…'], ['runner.rescanned', '已重新扫描'],
    ['runner.unknownError', '未知错误'], ['runner.permissionRequired', '所需系统'],
    ['runner.startedCaption', 'OpenDesk 已开始执行，可随时点击停止。'],
    ['runner.permissionsCaption', '请打开菜单“系统权限…”处理后重试。'],
    ['runner.logSaved', '执行日志已保存。'], ['runner.remainingStopped', '剩余脚本不会继续执行。'],
    // Assistant chrome and state that is populated after the initial page HTML.
    ['assistant.openConversation', '打开对话'], ['assistant.restoreConversation', '恢复对话'],
    ['assistant.restoreAndOpen', '恢复并打开对话'], ['assistant.conversation', '对话'],
    ['assistant.recentMore', '查看更多最近对话'], ['assistant.earlierRecent', '更早的最近对话'],
    ['assistant.earlierConversation', '更早的对话…'], ['assistant.archivedMore', '查看更多已归档对话'],
    ['assistant.earlierArchived', '更早的已归档对话'], ['assistant.earlierArchive', '更早的归档…'],
    ['assistant.oneRequest', '当前仅允许一个在途模型请求；仍可切换会话并编辑、保存其他草稿。'],
    ['assistant.hideConnectionHelp', '隐藏连接说明'], ['assistant.modelUnknown', '模型状态未知'],
    ['assistant.historyNeverResends', '会话历史保存在本地；查看历史不会自动重新发送。'],
    ['assistant.requestStopping', '正在停止此对话的请求'], ['assistant.requestGettingReply', '此对话正在获取回复'],
    ['assistant.otherConversation', '其他对话'], ['assistant.saveFailed', '保存失败：'],
    ['assistant.requestStopped', '请求已停止。'], ['assistant.requestStoppedLateDropped', '请求已停止；迟到回复已丢弃。'],
    ['assistant.requestFailed', '请求失败：'], ['assistant.noConversation', '没有可发送的当前会话'],
    ['assistant.requestBusy', '已有请求正在处理；可以切换会话或编辑其他草稿，但不能创建隐形队列。'],
    ['assistant.recoveredInterrupted', '个上次未完成请求标记为中断；没有自动重发。'],
    ['assistant.recoveredPrefix', '已将 '],
    // Scheduler dynamic labels, validation, and history page.
    ['scheduler.oneTime', '单次'], ['scheduler.intervalShort', '间隔'],
    ['scheduler.scriptSource', '脚本来源'], ['scheduler.schedule', '计划'],
    ['scheduler.enabledOn', '已启用'], ['scheduler.paused', '已暂停'], ['scheduler.resume', '恢复计划'],
    ['scheduler.confirmDelete', '确认删除'], ['scheduler.retryRefresh', '重试连接并刷新计划列表'],
    ['scheduler.refreshing', '正在刷新计划…'], ['scheduler.serviceUnavailable', '计划服务暂不可用：'],
    ['scheduler.serviceConnectionFailed', '计划服务连接失败'], ['scheduler.serviceStateUnknown', '计划服务状态未知'],
    ['scheduler.localOwner', '本机负责执行计划'], ['scheduler.remoteOwner', '由其他 OpenDesk Runtime 执行计划'],
    ['scheduler.scriptDirectory', '脚本目录：'], ['scheduler.countSuffix', '个计划'],
    ['scheduler.createFormOpened', '创建表单已展开。填写必填项后即可创建计划。'],
    ['scheduler.createFormClosed', '创建表单已收起；已填写内容仍会保留。'],
    ['scheduler.created', '已创建'], ['scheduler.updated', '计划已更新。'],
    ['scheduler.listRefreshed', '计划列表已刷新。'], ['scheduler.historyTitle', '计划历史 · '],
    ['scheduler.historyStatus', '状态'], ['scheduler.historyScheduledAt', '计划时间'],
    ['scheduler.historyFinishedAt', '完成时间'], ['scheduler.historyError', '错误'],
    ['scheduler.noHistory', '暂无运行记录'], ['scheduler.inlineHint', '可直接输入脚本文本，或点击“填入 ui.toast 示例”。'],
    ['scheduler.fileHint', '脚本路径相对于上方显示的脚本目录。'],
    // Permissions presentation including per-row values.
    ['permissions.accessibility', '辅助功能'], ['permissions.screenCapture', '屏幕录制'],
    ['permissions.inputMonitoring', '输入监控'], ['permissions.automation', '自动化'],
    ['permissions.checking', '正在检查…'], ['permissions.granted', '✓ 已授权'],
    ['permissions.notRequired', '✓ 无需额外系统授权'], ['permissions.denied', '⚠ 未授权'],
    ['permissions.notDetermined', '○ 尚未决定'], ['permissions.restricted', '⚠ 受系统限制'],
    ['permissions.unsupported', '— 当前平台不适用'], ['permissions.unavailable', '⚠ 当前不可用'],
    ['permissions.needsConfirmation', '? 需要确认'], ['permissions.available', '可用'],
    ['permissions.limited', '部分功能受限'], ['permissions.blocked', '需要处理'],
    ['permissions.required', '当前功能需要'], ['permissions.optional', '可选能力'],
    ['permissions.onDemand', '按需使用'], ['permissions.checkAgain', '手动重新检查'],
    // Runtime Log, Developer Status, Inspector and Official Shell notifications.
    ['runtimeLog.largeReadFailed', '日志文件较大，尾部读取失败。请使用“打开日志目录”查看完整日志。'],
    ['runtimeLog.reading', '正在读取最近一次自动化日志…'], ['runtimeLog.root', '日志根目录：'],
    ['runtimeLog.noneArtifacts', '尚无自动化运行 artifacts。运行一个 Recipe 后再刷新。'],
    ['runtimeLog.noStdout', '（无 stdout）'], ['runtimeLog.noStderr', '（无 stderr / Errors）'],
    ['runtimeLog.noSummary', '（暂无 summary）'], ['runtimeLog.refreshed', '已刷新最近一次自动化。'],
    ['runtimeLog.readFailed', '运行日志读取失败：'], ['runtimeLog.debugChanged', '调试信息已切换'],
    ['runtimeLog.manualRefresh', '手动刷新'], ['runtimeLog.reopened', '重新打开'],
    ['developer.mainUI', 'OpenDesk 主界面'], ['developer.schedulerService', '计划服务'],
    ['developer.recorderCapability', '录制能力'], ['developer.inspectorScope', 'Inspector 网络范围'],
    ['developer.logsDirectory', '日志目录'], ['developer.notStarted', '未启动'],
    ['developer.available', '可用'], ['developer.frameworkAvailable', 'Framework-owned / 可用'],
    ['inspector.unavailable', 'Inspector 暂时不可用，请查看运行日志。'],
    ['inspector.openFailed', 'Inspector 打开失败，请查看运行日志。'],
    ['official.unavailable', '暂未开放。'], ['official.openedPrefix', '已打开'],
    ['official.openFailed', '打开失败：'], ['official.websiteTitle', 'OpenDesk 官网'],
    ['official.websiteUnavailable', 'OpenDesk 官网暂不可用。'], ['official.helpSupport', '帮助与支持'],
    ['official.helpPending', '帮助中心待开放。'], ['official.examples', '示例代码'],
    ['official.examplesPending', '示例代码暂不可用。'], ['official.apiDocs', 'API 文档'],
    ['official.apiDocsPending', 'API 文档暂不可用。'], ['official.customizeTitle', '定制自动化'],
    ['official.customizePending', '定制自动化服务待开放。'], ['official.marketplace', '商店'],
    ['official.marketplaceTitle', '自动化市场'], ['official.marketplacePending', '自动化市场待开放。'],
    ['official.upgrade', '专业版'], ['official.upgradeTitle', '升级专业版'],
    ['official.upgradePending', '专业版服务待开放。'],
    // Recorder toolbar, dialogs, history and dynamic status. These strings are
    // deliberately kept in this official registry rather than a Recorder-only
    // catalog so the separate Recorder Execution uses the same Locale Core.
    ['recorder.title', 'OpenDesk — Recorder'], ['recorder.home', '打开 OpenDesk 官网'],
    ['recorder.start', '开始录制'], ['recorder.stop', '停止录制'], ['recorder.pause', '暂停录制'],
    ['recorder.resume', '继续录制'], ['recorder.restart', '重新录制'], ['recorder.measure', '测量'],
    ['recorder.measuring', '桌面测量中'], ['recorder.replay', '重放'], ['recorder.cancelReplay', '取消重放'],
    ['recorder.cancelStart', '取消开始'], ['recorder.generate', '正在自动生成脚本'],
    ['recorder.generationRetry', '自动生成失败，点击重试'], ['recorder.copyPrompt', '复制 Agent 优化脚本'],
    ['recorder.details', '查看详情'], ['recorder.history', '历史录制'],
    ['recorder.openRecordingDir', '在 Finder 打开录制目录'], ['recorder.revealGenerated', '在 Finder 显示生成脚本'],
    ['recorder.pointerMode', '兼容物理回放（开：录制坐标；关：语义生成）'],
    ['recorder.detailTitle', '录制详情'], ['recorder.automationTitle', '录制自动化'],
    ['recorder.close', '关闭'], ['recorder.noValue', '无'], ['recorder.notGenerated', '尚未生成'],
    ['recorder.historyTitle', '历史录制'], ['recorder.historyEmpty', '还没有可显示的 Recorder 录制。'],
    ['recorder.name', '名称'], ['recorder.time', '时间'], ['recorder.actions', '操作'],
    ['recorder.rename', '改名'], ['recorder.openDirectory', '打开目录'],
    ['recorder.firstPage', '首页'], ['recorder.previousPage', '上一页'], ['recorder.nextPage', '下一页'],
    ['recorder.lastPage', '尾页'], ['recorder.renameTitle', '重命名录制'],
    ['recorder.renameMessage', '只修改历史列表显示名称，不修改 recordingId、目录或 Recorder 原始事实。'],
    ['recorder.renamePlaceholder', '例如：计算器 25×4+10'], ['recorder.deleteTitle', '删除历史录制'],
    ['recorder.deleteForever', '永久删除'], ['recorder.cannotRun', '无法运行'],
    ['recorder.noGeneratedScript', '该录制还没有 generated/*.recipe.js。'],
    ['recorder.running', '正在运行'], ['recorder.runComplete', '运行完成：'],
    ['recorder.runFailed', '历史重放失败：'], ['recorder.runCanceled', '历史重放已取消；录制和生成脚本保持不变。'],
    ['recorder.cancelingReplay', '正在取消历史重放…'], ['recorder.finderFailed', 'Finder 打开失败'],
    ['recorder.detailsFailed', '打开详情失败'], ['recorder.startFailed', '开始录制失败'],
    ['recorder.stopFailed', '停止或整理录制失败'], ['recorder.pauseFailed', '暂停失败'],
    ['recorder.resumeFailed', '继续失败'], ['recorder.replayFailed', '重放失败'],
    ['recorder.measureFailed', '打开桌面测量失败'], ['recorder.copyFailed', '复制 Agent 脚本优化任务失败'],
    ['recorder.permissionUnavailable', '录制需要授权（查看详情）'], ['recorder.captureUnavailable', '暂不能录制，请查看详情'],
    ['recorder.starting', '正在开始录制'], ['recorder.stopping', '正在停止 native listener 并完整保存录制事实…'],
    ['recorder.startCountdownSuffix', '秒后开始录制'], ['recorder.replayCountdown', '重放将在 '],
    ['recorder.replayCountdownSuffix', ' 秒后开始'], ['recorder.recordingSaved', '录制事实已保存；未自动生成或重放。'],
    ['recorder.actionsBuilding', '正在校验并整理已保存的录制动作…'], ['recorder.actionsBlocked', '录制结果暂不可生成'],
    ['recorder.recordingActive', '录制中；可切换窗口或应用，也可暂停、停止或关闭工具条。'],
    ['recorder.recordingPaused', '已暂停；可在任意窗口继续录制。'], ['recorder.recordingResumed', '已继续录制。'],
    ['recorder.generatedNotReplayed', '脚本已自动生成但尚未重放；重放需要单独点击。'],
    ['recorder.replayFinished', '重放已以 exit code 0 结束；业务结果仍需独立确认。'],
    ['recorder.replayPreparationCanceled', '重放准备已取消；生成脚本仍保留。'],
    ['recorder.toolbarClosed', '工具条已关闭；不会自动重放。'],
    ['recorder.openedDirectory', '已在 Finder 打开录制目录。'], ['recorder.revealedGenerated', '已在 Finder 显示生成文件。'],
    ['recorder.deleteMessage', '此操作不能撤销。'], ['recorder.pagePrefix', '第 '], ['recorder.pageJoin', ' / '],
    ['recorder.pageSuffix', ' 页 · 共 '], ['recorder.rowsSuffix', ' 条'],
  ];
  const byText = new Map(entries.map(([key, fallback]) => [fallback, key]));
  const ordered = entries.slice().sort((a, b) => b[1].length - a[1].length);

  function translate(key, fallback, params) {
    if (!locale || typeof locale.translate !== 'function') return String(fallback == null ? '' : fallback);
    return locale.translate(String(key), String(fallback == null ? '' : fallback), params || undefined);
  }

  function text(value) {
    if (typeof value !== 'string' || !value) return value;
    let result = value;
    for (const [key, fallback] of ordered) {
      if (result.includes(fallback)) result = result.split(fallback).join(translate(key, fallback));
    }
    return result;
  }

  const nestedPresentationKeys = new Set(['content', 'options', 'items', 'segments', 'choices', 'buttons', 'fields']);

  function patch(value) {
    if (Array.isArray(value)) return value.map(patch);
    if (!value || typeof value !== 'object') return value;
    const result = Object.assign({}, value);
    for (const key of ['title', 'label', 'text', 'placeholder', 'caption', 'message', 'html', 'okText', 'confirmText', 'cancelText']) {
      if (typeof result[key] === 'string') result[key] = text(result[key]);
    }
    // Custom UI specs nest the user-visible markup under content. Keep this
    // intentionally narrow so machine IDs, actions, and arbitrary runtime
    // payloads never become translation candidates.
    for (const key of nestedPresentationKeys) {
      if (result[key] && typeof result[key] === 'object') result[key] = patch(result[key]);
    }
    return result;
  }

  function adaptControl(control) {
    if (!control || typeof control.update !== 'function') return control;
    return new Proxy(control, {get(target, name) {
      const value = target[name];
      if (name === 'update') return input => value.call(target, patch(input));
      return typeof value === 'function' ? value.bind(target) : value;
    }});
  }

  function adaptWindow(window) {
    if (!window) return window;
    return new Proxy(window, {get(target, name) {
      const value = target[name];
      if (name === 'control') return id => adaptControl(value.call(target, id));
      return typeof value === 'function' ? value.bind(target) : value;
    }});
  }

  function install() {
    if (!locale || global.__openDeskProductLocaleInstalled) return false;
    global.__openDeskProductLocaleInstalled = true;
    const nativeUI = global.ui;
    if (nativeUI && typeof nativeUI.createWindow === 'function') {
      global.ui = new Proxy(nativeUI, {get(target, name) {
        const value = target[name];
        if (name === 'createWindow') return async spec => adaptWindow(await value.call(target, patch(spec)));
        if (name === 'toast' || name === 'notify') return input => value.call(target, typeof input === 'string' ? text(input) : patch(input));
        return typeof value === 'function' ? value.bind(target) : value;
      }});
    }
    const nativeAutomationUI = global.automation && global.automation.ui;
    if (nativeAutomationUI && typeof nativeAutomationUI === 'object') {
      global.automation.ui = new Proxy(nativeAutomationUI, {get(target, name) {
        const value = target[name];
        if (name === 'toast' || name === 'notify') return input => value.call(target, typeof input === 'string' ? text(input) : patch(input));
        return typeof value === 'function' ? value.bind(target) : value;
      }});
    }
    const NativeDialog = global.Dialog;
    if (NativeDialog && typeof NativeDialog === 'object') {
      global.Dialog = new Proxy(NativeDialog, {get(target, name) {
        const value = target[name];
        if (name === 'alert' || name === 'confirm' || name === 'prompt') {
          return spec => value.call(target, patch(spec));
        }
        return typeof value === 'function' ? value.bind(target) : value;
      }});
    }
    const NativeFloatingWindow = global.FloatingWindow;
    if (typeof NativeFloatingWindow === 'function') {
      global.FloatingWindow = function LocalizedFloatingWindow(spec) {
        const inner = new NativeFloatingWindow(patch(spec));
        return new Proxy(inner, {get(target, name) {
          const value = target[name];
          if (name === 'addButton') return (id, label, icon, callback) => value.call(target, id, text(label), icon, callback);
          if (name === 'addLabel') return (id, label, options) => value.call(target, id, text(label), patch(options));
          if (name === 'addSwitch' || name === 'addCheckbox' || name === 'addInput' || name === 'addSelect' || name === 'addSegmentedControl') {
            return (id, label, options, callback) => value.call(target, id, text(label), patch(options), callback);
          }
          if (name === 'updateButton' || name === 'updateLabel' || name === 'updateControl') return (id, value) => target[name](id, patch(value));
          return typeof value === 'function' ? value.bind(target) : value;
        }});
      };
    }
    return true;
  }

  global.OpenDeskProductI18n = Object.freeze({translate, text, patch, install, keys: () => entries.map(([key]) => key)});
})(globalThis);
