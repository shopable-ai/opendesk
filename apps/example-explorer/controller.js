(function installOpenDeskExampleExplorer(global) {
  'use strict';

  function createApp(options) {
    const file = options.file;
    const execution = options.execution;
    const ui = options.ui;
    const catalogApi = global.OpenDeskExampleCatalog;
    const viewApi = global.OpenDeskExampleView;
    const runner = global.OpenDeskExampleRunner.createRunner(options);
    const examplesRoot = options.examplesRoot;
    const catalogPath = file.join(examplesRoot, 'catalog.json');
    const css = file.read(options.stylesPath);
    let scanResult = {entries: [], missing: []};
    let signature = '';
    let window = null;
    let query = '';
    let category = 'All';
    let page = 0;
    let selectedPath = '';
    let tab = 'overview';
    let status = 'Loading examples…';
    let outputText = 'No run yet.';
    let pollTimer = null;
    let closed = false;

    function filteredEntries() {
      const needle = query.trim().toLowerCase();
      return scanResult.entries.filter(entry => {
        if (category !== 'All' && entry.category !== category) return false;
        if (!needle) return true;
        const haystack = [entry.title, entry.relativePath, entry.description, entry.category]
          .concat(entry.tags || []).join(' ').toLowerCase();
        return haystack.includes(needle);
      });
    }

    function model() {
      const filtered = filteredEntries();
      const pageCount = Math.max(1, Math.ceil(filtered.length / viewApi.PAGE_SIZE));
      if (page >= pageCount) page = pageCount - 1;
      if (page < 0) page = 0;
      const start = page * viewApi.PAGE_SIZE;
      const pageEntries = filtered.slice(start, start + viewApi.PAGE_SIZE);
      let selected = scanResult.entries.find(entry => entry.relativePath === selectedPath) || null;
      if (!selected || !filtered.some(entry => entry.relativePath === selected.relativePath)) {
        selected = pageEntries[0] || null;
        selectedPath = selected ? selected.relativePath : '';
      }
      return {allEntries: scanResult.entries, missing: scanResult.missing, filtered, pageEntries, page, pageCount, selected, query, category, status};
    }

    function current() {
      return model().selected;
    }

    async function safeUpdate(id, patch) {
      if (!window) return;
      try { await window.control(id).update(patch); } catch (_) {}
    }

    function policyClass(entry) {
      return ['badge', entry && entry.runnable ? 'safe' : 'unregistered'];
    }

    async function syncListAndDetail() {
      if (!window) return;
      const state = model();
      await safeUpdate('resultCount', {text: `${state.filtered.length} found`});
      await safeUpdate('pageLabel', {text: `${state.page + 1} / ${state.pageCount}`});
      await safeUpdate('previousPage', {disabled: state.page <= 0});
      await safeUpdate('nextPage', {disabled: state.page >= state.pageCount - 1});
      await safeUpdate('emptyList', {visible: state.filtered.length === 0, classes: ['empty']});
      await safeUpdate('missingCount', {text: `${state.missing.length} missing catalog entries`});
      await safeUpdate('totalCount', {text: `${state.allEntries.length} discovered`});
      await safeUpdate('status', {text: status});

      for (let index = 0; index < viewApi.PAGE_SIZE; index++) {
        const entry = state.pageEntries[index] || null;
        const active = !!(entry && state.selected && entry.relativePath === state.selected.relativePath);
        await safeUpdate(`example${index}`, {visible: !!entry, disabled: !entry, classes: active ? ['example-row', 'is-active'] : ['example-row']});
        await safeUpdate(`exampleTitle${index}`, {text: entry ? entry.title : ''});
        await safeUpdate(`examplePath${index}`, {text: entry ? entry.relativePath : ''});
        await safeUpdate(`exampleBadge${index}`, {text: entry ? (entry.runnable ? 'safe' : entry.runPolicy) : '', classes: policyClass(entry)});
      }

      const entry = state.selected;
      await safeUpdate('detailTitle', {text: entry ? entry.title : 'Select an example'});
      await safeUpdate('detailDescription', {text: entry ? entry.description : 'Choose an example from the list to inspect source and execution metadata.'});
      await safeUpdate('detailPolicy', {text: entry ? (entry.runnable ? 'safe' : entry.runPolicy) : '', classes: policyClass(entry)});
      await safeUpdate('detailPath', {text: entry ? entry.relativePath : '—'});
      await safeUpdate('detailCategory', {text: entry ? entry.category : '—'});
      await safeUpdate('detailLevel', {text: entry ? entry.level : '—'});
      await safeUpdate('overviewDocs', {text: entry && entry.docs ? entry.docs : 'Not registered'});
      await safeUpdate('overviewPrerequisites', {text: entry && entry.prerequisites.length ? entry.prerequisites.join('\n') : 'None declared'});
      await safeUpdate('overviewExpected', {text: entry && entry.expected ? entry.expected : 'Not declared'});
      await safeUpdate('runHint', {text: entry && entry.runnable ? 'Approved safe example' : 'Read-only until catalog approval'});
      await safeUpdate('run', {disabled: !entry || !entry.runnable || runner.isRunning()});
      await safeUpdate('stop', {disabled: !runner.isRunning()});
      await syncTab();
    }

    async function syncTab() {
      const entry = current();
      await safeUpdate('tabOverview', {classes: tab === 'overview' ? ['tab', 'is-active'] : ['tab']});
      await safeUpdate('tabSource', {classes: tab === 'source' ? ['tab', 'is-active'] : ['tab']});
      await safeUpdate('tabOutput', {classes: tab === 'output' ? ['tab', 'is-active'] : ['tab']});
      await safeUpdate('overview', {visible: tab === 'overview', classes: ['overview-grid']});
      await safeUpdate('source', {visible: tab === 'source', classes: ['code']});
      await safeUpdate('output', {visible: tab === 'output', classes: ['code'], text: outputText});
      if (tab === 'source') {
        let source = 'No example selected.';
        if (entry) {
          try { source = String(file.read(entry.absolutePath)); }
          catch (error) { source = 'Unable to read source: ' + (error && error.message ? error.message : String(error)); }
        }
        await safeUpdate('source', {text: source});
      }
    }

    function rescan() {
      scanResult = catalogApi.scan({file, examplesRoot, catalogPath});
      signature = catalogApi.signature(file, examplesRoot);
      status = `Loaded ${scanResult.entries.length} JavaScript examples; ${scanResult.entries.filter(entry => entry.runnable).length} approved for one-click run.`;
    }

    async function applyFilters() {
      try {
        const searchState = await window.control('search').getState();
        const categoryState = await window.control('category').getState();
        query = searchState && typeof searchState.value === 'string' ? searchState.value : '';
        category = categoryState && typeof categoryState.value === 'string' && categoryState.value ? categoryState.value : 'All';
      } catch (_) {}
      page = 0;
      await syncListAndDetail();
    }

    function bind(id, event, handler) {
      window.control(id).on(event || 'click', async () => {
        try { await handler(); }
        catch (error) {
          status = 'Action failed: ' + (error && error.message ? error.message : String(error));
          await syncListAndDetail();
        }
      });
    }

    async function selectIndex(index) {
      const state = model();
      const entry = state.pageEntries[index];
      if (!entry) return;
      selectedPath = entry.relativePath;
      tab = 'overview';
      await syncListAndDetail();
    }

    function formatOutcome(entry, outcome) {
      const lines = [`$ ${entry.relativePath}`, ''];
      if (outcome.stdout) lines.push(outcome.stdout.replace(/\s+$/, ''));
      if (outcome.stderr) {
        if (lines[lines.length - 1] !== '') lines.push('');
        lines.push('[stderr]', outcome.stderr.replace(/\s+$/, ''));
      }
      lines.push('', '────────────────────');
      if (outcome.status === 'succeeded') lines.push(`✓ Completed · exit ${outcome.exitCode} · ${outcome.durationMs} ms`);
      else if (outcome.status === 'canceled') lines.push(`■ Stopped · ${outcome.durationMs} ms`);
      else lines.push(`✕ Failed · ${outcome.error ? outcome.error.message : 'unknown error'} · ${outcome.durationMs} ms`);
      return lines.join('\n');
    }

    async function runSelected() {
      const entry = current();
      if (!entry || !entry.runnable || runner.isRunning()) return;
      status = `Running ${entry.relativePath}…`;
      outputText = `$ ${entry.relativePath}\n\nRunning…\n\nCommand.run() output appears here when the child process exits.`;
      tab = 'output';
      await syncListAndDetail();
      const outcome = await runner.run(entry);
      outputText = formatOutcome(entry, outcome);
      status = outcome.status === 'succeeded'
        ? `Completed ${entry.relativePath}`
        : outcome.status === 'canceled'
          ? `Stopped ${entry.relativePath}`
          : `Failed ${entry.relativePath}`;
      await syncListAndDetail();
    }

    async function start() {
      rescan();
      const initial = model();
      window = await ui.createWindow({
        id: 'openDeskExampleExplorer',
        kind: 'floating',
        title: 'OpenDesk Examples',
        position: {mode: 'anchor', size: {width: 1100, height: 720}, horizontal: 'center', vertical: 'center', margin: 0, display: 'active'},
        alwaysOnTop: false,
        draggable: true,
        theme: 'dark',
        content: {html: viewApi.buildHTML(initial), css},
      });

      bind('applyFilters', 'click', applyFilters);
      bind('refresh', 'click', async () => { rescan(); page = 0; await syncListAndDetail(); });
      bind('previousPage', 'click', async () => { page = Math.max(0, page - 1); await syncListAndDetail(); });
      bind('nextPage', 'click', async () => { page += 1; await syncListAndDetail(); });
      bind('tabOverview', 'click', async () => { tab = 'overview'; await syncTab(); });
      bind('tabSource', 'click', async () => { tab = 'source'; await syncTab(); });
      bind('tabOutput', 'click', async () => { tab = 'output'; await syncTab(); });
      bind('run', 'click', runSelected);
      bind('stop', 'click', async () => {
        if (runner.stop()) {
          status = 'Stopping current example…';
          await syncListAndDetail();
        }
      });
      for (let index = 0; index < viewApi.PAGE_SIZE; index++) bind(`example${index}`, 'click', () => selectIndex(index));

      window.on('close', () => {
        closed = true;
        if (pollTimer) clearInterval(pollTimer);
        runner.stop();
      });

      await window.show();
      await syncListAndDetail();
      pollTimer = setInterval(async () => {
        if (closed || runner.isRunning()) return;
        try {
          const next = catalogApi.signature(file, examplesRoot);
          if (next !== signature) {
            rescan();
            status = 'Examples changed on disk; list refreshed automatically.';
            await syncListAndDetail();
          }
        } catch (error) {
          status = 'Automatic scan failed: ' + (error && error.message ? error.message : String(error));
          await syncListAndDetail();
        }
      }, 5000);
      await window.waitUntilClosed();
    }

    return {start};
  }

  global.OpenDeskExampleExplorer = {createApp};
})(globalThis);
