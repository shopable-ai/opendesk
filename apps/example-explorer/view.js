(function installOpenDeskExampleView(global) {
  'use strict';
  const PAGE_SIZE = 20;

  function escapeHTML(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function categories(entries) {
    return ['All'].concat(Array.from(new Set(entries.map(entry => entry.category))).sort());
  }

  function fact(label, id, value) {
    return `<span class="fact"><span class="fact-label">${label}</span><span id="${id}">${escapeHTML(value || '—')}</span></span>`;
  }

  function section(title, id, value) {
    return `<div class="section"><strong class="section-title">${title}</strong><p id="${id}">${escapeHTML(value || '—')}</p></div>`;
  }

  function availabilityFor(entry) {
    if (entry && entry.runAvailability) {
      return {
        state: entry.runAvailability,
        label: entry.runAvailabilityLabel || '',
        reason: entry.runAvailabilityReason || '',
      };
    }
    if (!entry) {
      return {
        state: 'manual',
        label: 'Select an example',
        reason: 'Choose an example to inspect its launch contract.',
      };
    }
    if (entry.platformSupported === false) {
      return {
        state: 'unsupported',
        label: 'Unsupported on this platform',
        reason: 'Copy Run Command remains available for manual review.',
      };
    }
    if (entry.runnable) {
      return {
        state: 'direct',
        label: 'Direct run available',
        reason: 'Safe policy and platform support allow one-click execution.',
      };
    }
    return {
      state: 'manual',
      label: 'Manual run required',
      reason: 'This example needs manual review before running; use Copy Run Command to launch it yourself.',
    };
  }

  function policyClass(entry) {
    return entry && entry.platformSupported === false
      ? 'unsupported'
      : entry && entry.runPolicy === 'manual'
        ? 'manual'
        : entry && entry.runnable
          ? 'safe'
          : 'unregistered';
  }

  function buildHTML(model) {
    const categoryOptions = categories(model.allEntries).map(name =>
      `<option value="${escapeHTML(name)}"${name === model.category ? ' selected' : ''}>${escapeHTML(name)}</option>`
    ).join('');
    const rows = [];
    for (let index = 0; index < PAGE_SIZE; index++) {
      const entry = model.pageEntries[index] || null;
      rows.push(`<button id="example${index}" class="example-row${entry && model.selected && entry.relativePath === model.selected.relativePath ? ' is-active' : ''}${entry ? '' : ' is-hidden'}"${entry ? '' : ' disabled'}>
        <span class="row-copy"><span id="exampleTitle${index}" class="row-title">${entry ? escapeHTML(entry.title) : ''}</span><span id="examplePath${index}" class="row-path">${entry ? escapeHTML(entry.relativePath) : ''}</span></span>
        <span id="exampleBadge${index}" class="badge ${policyClass(entry)}">${entry ? escapeHTML(entry.runPolicy) : ''}</span>
      </button>`);
    }
    const entry = model.selected;
    const selectedPolicy = entry ? entry.runPolicy : '';
    const selectedAvailability = availabilityFor(entry);
    const runDisabled = !entry || selectedAvailability.state !== 'direct';
    const copyDisabled = !entry;
    const selectedPlatform = entry && Array.isArray(entry.platforms) ? entry.platforms.join(', ') : '—';
    const selectedLaunch = entry && entry.launch ? (entry.launch.kind === 'ai-run' ? 'ai run' : 'script') : '—';
    return `<!doctype html><html><head><meta charset="utf-8"></head><body><div class="app">
      <header class="topbar"><div class="brand"><span class="brand-mark" aria-hidden="true">◈</span><div><strong>OpenDesk Examples</strong><span>Learn · inspect · run</span></div></div><div class="filters"><div class="search-field"><span class="search-icon" aria-hidden="true">⌕</span><input id="search" type="text" placeholder="Search title, path, tag..." aria-label="Search examples" value="${escapeHTML(model.query)}"></div><div class="select-wrap"><select id="category" aria-label="Filter by category">${categoryOptions}</select></div><button id="applyFilters" class="filter-submit">Apply filters</button><button id="refresh" class="quiet">Refresh</button></div></header>
      <main class="workspace"><div class="sidebar"><div class="sidebar-head"><strong>Curated examples</strong><span id="resultCount" class="muted">${model.filtered.length} found</span></div><div class="list">${rows.join('')}<p id="emptyList" class="empty${model.filtered.length ? ' is-hidden' : ''}">No catalog examples match this filter.</p></div><div class="pager"><button id="previousPage">Previous</button><span id="pageLabel" class="muted">${model.page + 1} / ${model.pageCount}</span><button id="nextPage">Next</button></div></div>
      <section class="detail"><div class="detail-head"><div class="detail-title-line"><strong id="detailTitle" class="detail-title">${escapeHTML(entry ? entry.title : 'Select an example')}</strong><span id="detailPolicy" class="badge ${policyClass(entry)}">${escapeHTML(selectedPolicy)}</span></div><p id="detailDescription" class="detail-description">${escapeHTML(entry ? entry.description : 'Choose a curated example from the list.')}</p><div class="facts">${fact('Source', 'detailPath', entry ? entry.relativePath : '—')}${fact('Category', 'detailCategory', entry ? entry.category : '—')}${fact('Level', 'detailLevel', entry ? entry.level : '—')}${fact('Platform', 'detailPlatform', selectedPlatform)}${fact('Launch', 'detailLaunchMode', selectedLaunch)}${fact('UI required', 'detailUIRequired', entry && entry.launch ? (entry.launch.ui ? 'Yes' : 'No') : '—')}</div><div id="platformStatus" class="platform-status${entry && !entry.platformSupported ? ' unsupported' : ' supported'}">${entry && !entry.platformSupported ? 'Unsupported on this platform' : entry ? 'Supported on this platform' : '—'}</div></div>
      <div class="tabs"><button id="tabOverview" class="tab is-active">Overview</button><button id="tabSource" class="tab">Source</button><button id="tabOutput" class="tab">Output</button></div>
      <div class="detail-body"><div id="overview" class="overview-grid">${section('Documentation', 'overviewDocs', entry && entry.docs ? entry.docs : 'No API link registered')}${section('Prerequisites', 'overviewPrerequisites', entry && entry.prerequisites.length ? entry.prerequisites.join('\n') : 'None declared')}${section('Run policy', 'overviewRunPolicy', entry ? entry.runPolicy : '—')}${section('Launch command', 'overviewCommand', entry ? (entry.command || 'See Copy Run Command') : '—')}${section('Required environment', 'overviewRequiredEnv', entry && entry.requiredEnv && entry.requiredEnv.length ? entry.requiredEnv.join('\n') : 'None declared')}${section('Input', 'overviewInput', entry && entry.launch && entry.launch.input === 'required' ? 'Required: add --input-file <path-to-input.json>' : 'None')}${section('Expected result', 'overviewExpected', entry && entry.expected ? entry.expected : 'Not declared')}</div><p id="source" class="code is-hidden"></p><p id="output" class="code is-hidden">No run yet.</p></div>
      <div class="actions"><div class="action-controls"><button id="run" class="primary"${runDisabled ? ' disabled' : ''}>Run</button><button id="stop" class="stop" disabled>Stop</button><button id="copyRunCommand" title="Copy the command used to launch OpenDesk Examples"${copyDisabled ? ' disabled' : ''}>Copy Run Command</button></div><div id="runAvailability" class="run-availability ${selectedAvailability.state}"><span class="availability-mark" aria-hidden="true"></span><span class="availability-copy"><strong id="runAvailabilityLabel">${escapeHTML(selectedAvailability.label)}</strong><span id="runAvailabilityReason">${escapeHTML(selectedAvailability.reason)}</span></span></div></div></section></main>
      <footer class="statusbar"><span id="status">${escapeHTML(model.status)}</span><span class="grow"></span><span id="catalogHealth">${model.missing.length} missing · ${model.unregistered.length} hidden internal/unregistered</span><span id="totalCount">${model.allEntries.length} catalog examples</span></footer>
    </div></body></html>`;
  }

  global.OpenDeskExampleView = {PAGE_SIZE, buildHTML};
})(globalThis);
