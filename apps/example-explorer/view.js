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

  function buildHTML(model) {
    const categoryOptions = categories(model.allEntries).map(name =>
      `<option value="${escapeHTML(name)}"${name === model.category ? ' selected' : ''}>${escapeHTML(name)}</option>`
    ).join('');
    const rows = [];
    for (let index = 0; index < PAGE_SIZE; index++) {
      const entry = model.pageEntries[index] || null;
      rows.push(`<button id="example${index}" class="example-row${entry && model.selected && entry.relativePath === model.selected.relativePath ? ' is-active' : ''}${entry ? '' : ' is-hidden'}"${entry ? '' : ' disabled'}>
        <span class="row-copy"><span id="exampleTitle${index}" class="row-title">${entry ? escapeHTML(entry.title) : ''}</span><span id="examplePath${index}" class="row-path">${entry ? escapeHTML(entry.relativePath) : ''}</span></span>
        <span id="exampleBadge${index}" class="badge ${entry && entry.runnable ? 'safe' : 'unregistered'}">${entry ? escapeHTML(entry.runnable ? 'safe' : entry.runPolicy) : ''}</span>
      </button>`);
    }
    return `<!doctype html><html><head><meta charset="utf-8"></head><body><div class="app">
      <header class="topbar"><div class="brand"><strong>OpenDesk Examples</strong><span>Learn · inspect · run</span></div><div class="filters"><input id="search" type="text" placeholder="Search title, path, tag..." value="${escapeHTML(model.query)}"><select id="category">${categoryOptions}</select><button id="applyFilters">Apply</button><button id="refresh">Refresh</button></div></header>
      <main class="workspace"><aside class="sidebar"><div class="sidebar-head"><strong>Examples</strong><span id="resultCount" class="muted">${model.filtered.length} found</span></div><div class="list">${rows.join('')}<p id="emptyList" class="empty${model.filtered.length ? ' is-hidden' : ''}">No examples match this filter.</p></div><div class="pager"><button id="previousPage">Previous</button><span id="pageLabel" class="muted">${model.page + 1} / ${model.pageCount}</span><button id="nextPage">Next</button></div></aside>
      <section class="detail"><div class="detail-head"><div class="detail-title-line"><h1 id="detailTitle" class="detail-title">${escapeHTML(model.selected ? model.selected.title : 'Select an example')}</h1><span id="detailPolicy" class="badge ${model.selected && model.selected.runnable ? 'safe' : 'unregistered'}">${escapeHTML(model.selected ? (model.selected.runnable ? 'safe' : model.selected.runPolicy) : '')}</span></div><p id="detailDescription" class="detail-description">${escapeHTML(model.selected ? model.selected.description : 'Choose an example from the list to inspect source and execution metadata.')}</p><div class="facts"><span id="detailPath" class="fact">${escapeHTML(model.selected ? model.selected.relativePath : '—')}</span><span id="detailCategory" class="fact">${escapeHTML(model.selected ? model.selected.category : '—')}</span><span id="detailLevel" class="fact">${escapeHTML(model.selected ? model.selected.level : '—')}</span></div></div>
      <div class="tabs"><button id="tabOverview" class="tab is-active">Overview</button><button id="tabSource" class="tab">Source</button><button id="tabOutput" class="tab">Output</button></div>
      <div class="detail-body"><div id="overview" class="overview-grid"><div class="section"><h3>Documentation</h3><p id="overviewDocs">${escapeHTML(model.selected && model.selected.docs ? model.selected.docs : 'Not registered')}</p></div><div class="section"><h3>Prerequisites</h3><p id="overviewPrerequisites">${escapeHTML(model.selected && model.selected.prerequisites.length ? model.selected.prerequisites.join('\n') : 'None declared')}</p></div><div class="section"><h3>Expected result</h3><p id="overviewExpected">${escapeHTML(model.selected && model.selected.expected ? model.selected.expected : 'Not declared')}</p></div></div><pre id="source" class="code is-hidden"></pre><pre id="output" class="code is-hidden">No run yet.</pre></div>
      <div class="actions"><button id="run" class="primary">Run</button><button id="stop" class="stop">Stop</button><span class="spacer"></span><span id="runHint" class="muted">${escapeHTML(model.selected && model.selected.runnable ? 'Approved safe example' : 'Read-only until catalog approval')}</span></div></section></main>
      <footer class="statusbar"><span id="status">${escapeHTML(model.status)}</span><span class="grow"></span><span id="missingCount">${model.missing.length} missing catalog entries</span><span id="totalCount">${model.allEntries.length} discovered</span></footer>
    </div></body></html>`;
  }

  global.OpenDeskExampleView = {PAGE_SIZE, buildHTML};
})(globalThis);
