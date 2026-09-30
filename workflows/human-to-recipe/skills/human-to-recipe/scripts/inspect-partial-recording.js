#!/usr/bin/env node
'use strict';

// Read-only intake diagnostics. This is neither a production gate nor a semantic compiler.
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function readBoundFile(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)
      || /[\\\x00-\x1f]/.test(relative) || relative.split('/').some(p => !p || p === '.' || p === '..')) {
    throw new Error('Material must be a relative path within the approved root');
  }
  const approved = fs.realpathSync(root);
  let filename = approved;
  for (const part of relative.split('/')) {
    filename = path.join(filename, part);
    if (fs.lstatSync(filename).isSymbolicLink()) throw new Error('Material symlinks are unsupported');
  }
  const bytes = fs.readFileSync(filename);
  return {filename, bytes, sha256: digest(bytes)};
}

function inspectPartialRecording({recordingDir, taskFile} = {}) {
  const report = {packageIntegrity:'unknown', businessCoverage:'unknown', evidenceScope:'recorded-actions-only',
    checksScope:'Stopped/saved, bound bytes, IDs and pairing; native Recorder remains authoritative for the complete format/readiness contract',
    candidateRequired:false, productionReady:false, materials:[], facts:[], unknowns:[], blockers:[], next:[]};
  try {
    const manifestFile = readBoundFile(recordingDir, 'manifest.json');
    const manifest = JSON.parse(manifestFile.bytes.toString('utf8'));
    if (manifest.formatVersion !== 'opendesk.recorder.recording/v2'
      || manifest.recordingId !== path.basename(path.resolve(recordingDir))
      || manifest.state !== 'stopped' || manifest.storage?.state !== 'saved') {
      throw new Error('Recording is not stopped and saved; verify the native control boundary before input');
    }
    report.materials.push({path:manifestFile.filename,sha256:manifestFile.sha256});
    const actions = readBoundFile(recordingDir, 'actions.json');
    const document = JSON.parse(actions.bytes.toString('utf8'));
    report.materials.push({path:actions.filename,sha256:actions.sha256});
    if (document.formatVersion !== 'opendesk.recorder.actions/v2') throw new Error('Unsupported actions version');
    if (!Number.isInteger(document.revision) || document.revision < 1
        || document.recordingId !== path.basename(path.resolve(recordingDir))) throw new Error('Recording identity/revision mismatch');
    if (document.readiness !== 'ready') throw new Error('Actions are not ready; damaged/omitted input needs native Recorder diagnosis');
    const raw = readBoundFile(recordingDir, document.raw?.file);
    if (raw.sha256 !== document.raw.sha256 || raw.bytes.length !== document.raw.bytes) throw new Error('Raw bytes/hash mismatch');
    report.materials.push({path:raw.filename,sha256:raw.sha256});
    const events = raw.bytes.toString('utf8').trim().split('\n').map(line => JSON.parse(line));
    const eventIds = new Set(), actionIds = new Set(), consumed = new Set();
    for (const event of events) {
      if (event.formatVersion !== 'opendesk.recorder.raw-event/v2' || !event.eventId || eventIds.has(event.eventId)) {
        throw new Error('Raw event identity/version conflict');
      }
      eventIds.add(event.eventId);
    }
    if (!Array.isArray(document.actions) || !document.actions.length) throw new Error('No recorded actions');
    for (const action of document.actions) {
      if (!action.id || actionIds.has(action.id)) throw new Error('Duplicate action identity');
      actionIds.add(action.id);
      const ids = action.source?.eventIds;
      if (!Array.isArray(ids) || !ids.length || ids.some(id => !eventIds.has(id) || consumed.has(id))) {
        throw new Error('Missing or multiply consumed source events');
      }
      const sourceEvents = ids.map(id => events.find(event => event.eventId === id));
      if (action.kind === 'click') {
        const press = sourceEvents.find(e => e.libraryEvent === 'MOUSE_PRESSED');
        const release = sourceEvents.find(e => e.libraryEvent === 'MOUSE_RELEASED');
        let jitter = false;
        if (press && release && action.source.basis === 'libuiohook press/release with bounded drag jitter and no CLICKED event') {
          const time = e => /^\d+$/.test(String(e.nativeTime)) ? BigInt(e.nativeTime) : null;
          const begin = time(press), end = time(release);
          jitter = begin !== null && end !== null && end >= begin && end-begin <= 2000000000n
            && press.nativeUnit === 'nanoseconds' && release.nativeUnit === 'nanoseconds'
            && sourceEvents.length >= 3 && sourceEvents.every(e => e.coordinateVerified === true
              && e.coordinateSpace === 'screen-logical' && e.displayRef === press.displayRef
              && Number.isFinite(e.x) && Number.isFinite(e.y)
              && (e.x-press.x)**2+(e.y-press.y)**2 <= 16);
        }
        if (!press || !release || (!sourceEvents.some(e => e.libraryEvent === 'MOUSE_CLICKED') && !jitter)) {
          throw new Error('Incomplete click input pairing');
        }
      }
      ids.forEach(id => consumed.add(id));
      report.facts.push({actionId:action.id, kind:action.kind, sourceEventIds:ids,
        executor:sourceEvents.every(event => event.source === 'agent') ? 'agent' : 'unknown', collector:'Recorder',
        semantic:action.semantic || (action.target ? {status:action.target.semanticStatus,element:action.target.element} : null)});
    }
    report.packageIntegrity = 'verified';
    report.unknowns.push('Recorder capture alone does not identify a human executor.',
      'Recorded buttons do not establish current runtime reads or producer/consumer data flow.',
      'Business coverage requires the Human intent/plan owner to compare the full task with these facts.');
    report.next.push('Keep raw/actions read-only; review coverage and request only blocking missing evidence in the original Human work package.');
  } catch (error) {
    report.packageIntegrity = error.code === 'ENOENT' || error.code === 'EACCES' ? 'unreadable' : 'failed';
    report.blockers.push({owner:'Human H2 / native Recorder',reason:error.message});
    report.next.push('Provide the inaccessible material, or diagnose the original native recording; do not relabel damaged input as a valid partial demonstration.');
  }
  if (taskFile) {
    try {
      const material = readBoundFile(recordingDir, taskFile);
      const task = JSON.parse(material.bytes.toString('utf8'));
      if (task.schemaVersion !== 'recorder-task/v1' || typeof task.description !== 'string' || !task.description.trim()
          || typeof task.successConditions !== 'string' || typeof task.allowedSideEffects !== 'string'
          || typeof task.declaredAt !== 'string' || !Number.isFinite(Date.parse(task.declaredAt))) throw new Error('Unsupported or malformed Recorder task declaration');
      const keys = ['schemaVersion','description','successConditions','allowedSideEffects','declaredAt'];
      if (Object.keys(task).some(key => !keys.includes(key))) throw new Error('Unknown Recorder task field');
      report.materials.push({path:material.filename,sha256:material.sha256});
      report.task = task; // Data, never instructions to the intake program.
      for (const key of ['successConditions','allowedSideEffects']) {
        if (!task[key].trim()) report.blockers.push({owner:'Human H1',reason:key + ' remains unknown'});
      }
    } catch (error) { report.blockers.push({owner:'Human H1',reason:'Task material: ' + error.message}); }
  } else {
    report.blockers.push({owner:'Human H1',reason:'Missing full task, success conditions and side-effect authorization'});
    report.next.push('Obtain only the missing task declaration; existing readable recording facts remain usable for analysis.');
  }
  return report;
}

if (require.main === module) {
  const [recordingDir, taskFile] = process.argv.slice(2);
  if (!recordingDir) { process.stderr.write('Usage: node inspect-partial-recording.js <recording-dir> [task-file-relative-to-recording]\n'); process.exitCode = 2; }
  else { const report = inspectPartialRecording({recordingDir,taskFile}); process.stdout.write(JSON.stringify(report,null,2)+'\n');
    if (report.packageIntegrity !== 'verified') process.exitCode = 1; }
}
module.exports = {inspectPartialRecording,readBoundFile};
