/* Session collection for the executable Oracle; uses the existing geometry model. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./model.js'));
  else root.MeasureRecords = factory(root.MeasureModel);
})(globalThis, function (M) {
  'use strict';
  const copy = value => structuredClone(value);
  const LIMITS = Object.freeze({maxRecords: 100, maxSnapshots: 16, maxSnapshotBytes: 20*1024*1024});
  function sameToken(a,b) { return !!(a && b && a.sessionId === b.sessionId && a.generation === b.generation && a.snapshotId === b.snapshotId); }
  function create(sessionId) {
    if (typeof sessionId !== 'string' || !sessionId) throw new TypeError('sessionId');
    let measurements = [], snapshots = [], revision = 0;
    function add(result, snapshot, currentToken) {
      if (!result || result.status !== 'confirmed' || !sameToken(result.token, currentToken)
        || !sameToken(snapshot && snapshot.token, currentToken) || currentToken.sessionId !== sessionId
        || !currentToken.snapshotId || snapshot.snapshotId !== currentToken.snapshotId
        || !Number.isSafeInteger(currentToken.generation) || currentToken.generation < 1) throw new Error('Only current confirmed measurement can be recorded');
      if (measurements.length >= LIMITS.maxRecords) throw new Error('Session record limit reached; save and start a new session');
      const g = result.geometry;
      if (result.type === 'region') M.rect(g);
      else if (result.type === 'point') M.pointRelative(g, snapshot.referenceWindow.bounds);
      else if (result.type === 'pp') M.points(g.a, g.b);
      else if (result.type === 'rr') M.rectangles(g.a, g.b);
      else throw new TypeError('Unsupported measurement type');
      const previous = snapshots.find(s => s.snapshotId === snapshot.snapshotId);
      if (previous && !sameToken(previous.token, snapshot.token)) throw new Error('Snapshot identity collision');
      if (!previous) {
        if (snapshots.length >= LIMITS.maxSnapshots) throw new Error('Snapshot retention limit reached; save and start a new session');
        const size = new TextEncoder().encode(JSON.stringify([...snapshots, snapshot])).length;
        if (size > LIMITS.maxSnapshotBytes) throw new Error('Snapshot byte budget exceeded; save and start a new session');
      }
      const record = copy({...result, id: `m${measurements.length+1}`, snapshotId: currentToken.snapshotId,
        label: String(result.label || `${result.type} ${measurements.length+1}`).trim().slice(0,120),
        confirmation: 'user-confirmed', persistence: {status: 'memory'}, createdAt: new Date().toISOString()});
      if (!previous) snapshots.push(copy(snapshot));
      measurements.push(record); revision++;
      return copy(record);
    }
    function data() {
      return copy({schemaVersion: 'desktop-measurement-session/v1', prototypeOnly: true, sessionId, revision,
        referenceWindow: snapshots.length ? snapshots[snapshots.length-1].referenceWindow : null,
        coordinateSpace: {screen: 'screen-logical', image: 'capture-pixel', percentage: 'percentage-0-100'},
        snapshots, measurements});
    }
    function markSaved(ids, destination) {
      const known = new Set(measurements.map(m => m.id));
      if (!Array.isArray(ids) || ids.some(id => !known.has(id)) || !destination) throw new Error('Invalid save acknowledgement');
      for (const m of measurements) if (ids.includes(m.id)) {
        m.status = 'saved'; m.persistence = {status: 'saved', destination: String(destination)};
      }
      revision++;
    }
    return {add, data, markSaved, get count() { return measurements.length; }, get revision() { return revision; }};
  }
  return Object.freeze({LIMITS, create, sameToken});
});
