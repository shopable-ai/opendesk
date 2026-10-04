'use strict';

// Minimal source projection into the existing v1 artifact contract. This does
// not capture/replay actions, choose steps, or create another canonical truth.
const fs = require('node:fs');
const path = require('node:path');
const {
  SCHEMA, FILE_LIMIT, JSON_LIMIT, hash, makeRoots, resolveFile, readBytes, parseJson,
  object, text, requireCheck,
} = require('./artifact-validation.js');

function adaptBrowserSource(options) {
  const roots = makeRoots(options.roots), budget = {bytes:0};
  function read(ref) {
    requireCheck(object(ref) && text(ref.rootId) && text(ref.path) && /^[a-f0-9]{64}$/.test(ref.sha256), 'INVALID_REF', 'Browser source must be content-bound.');
    const filename = resolveFile(roots, ref.rootId, ref.path), bytes = readBytes(filename, FILE_LIMIT, budget);
    requireCheck(hash(bytes) === ref.sha256, 'HASH_MISMATCH', 'Browser source bytes changed.');
    return bytes;
  }
  const dossier = parseJson(read(options.dossierRef));
  const traceBytes = read(options.canonicalTraceRef);
  const rows = traceBytes.toString('utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  const ids = new Set(), applicationId = 'browser-order-fixture';
  const amountValue = dossier.runtimeValues.find(value => value.name === 'amount');
  requireCheck(amountValue && rows.length && dossier.taskId, 'SOURCE_REQUIRED', 'Real Browser Dossier and amount facts are required.');
  const actions = rows.map(row => {
    requireCheck(row.source === 'agent' && row.surface === 'browser' && row.canonical === true &&
      text(row.actionId) && !ids.has(row.actionId), 'SOURCE_IDENTITY', 'Only unique canonical Agent Browser actions may be projected.');
    ids.add(row.actionId);
    const targetId = row.afterObservation?.testId || row.beforeObservation?.testId ||
      (row.operation === 'status' ? 'connection-status' : row.operation === 'tabs' ? 'tab-inventory' : 'document');
    const input = ['fill','click'].includes(row.operation);
    const kind = input ? 'actual-input' : row.operation === 'read' ? 'actual-read' : 'actual-observation';
    const receipt = input ? {ok:row.status === 'SUCCESS' && row.outcome === 'SUCCEEDED',
      completed:[{ok:row.status === 'SUCCESS' && row.outcome === 'SUCCEEDED',actionState:'acknowledged',sourceOutcome:row.outcome,requestId:row.requestId}]} : null;
    return {actionId:row.actionId, sequence:ids.size, source:'agent', surface:'browser', canonical:false,
      kind, applicationId, targetId, operation:'BrowserDOM.' + (input ? 'act' : row.operation), sourceOperation:row.operation,
      actual:row.operation === 'read' ? row.runtimeOutput : null,
      data:{value:row.operation === 'read' ? row.runtimeOutput : row.runtimeInput,receipt},
      runtimeInput:row.runtimeInput, sourceReadRequestId:row.sourceReadRequestId,
      actualObservation:row.afterObservation, verification:row.verification,
      sourceActionRef:{canonicalTraceRef:options.canonicalTraceRef,actionId:row.actionId,requestId:row.requestId},
      evidenceReferences:row.evidenceReferences};
  });
  const readRow = rows.find(row => row.actionId === amountValue.origin.actionId);
  requireCheck(readRow && readRow.operation === 'read' && readRow.runtimeOutput === amountValue.observedValue,
    'READ_SOURCE_MISMATCH', 'Dossier amount must equal the canonical Browser read.');
  const consumers = amountValue.consumers.map(binding => {
    const row = rows.find(item => item.actionId === binding.actionId);
    requireCheck(row && row.operation === 'fill' && row.sourceReadRequestId === readRow.requestId &&
      row.runtimeInput === readRow.runtimeOutput, 'DATA_DEPENDENCY_BROKEN', 'Amount consumer must bind actual Core read→fill.');
    return row.actionId;
  });
  const raw = {schemaVersion:SCHEMA, taskId:dossier.taskId, canonical:false, source:'agent', surface:'browser',
    canonicalActionsRef:options.canonicalTraceRef, sourceDossierRef:options.dossierRef, actions,
    adapterScope:'Fixed-reference semantic/receipt projection only; Core response bytes and canonical identities unchanged'};
  const projected = {...dossier, sourceDossierRef:options.dossierRef, sourceSurface:'browser',
    runtimeValues:dossier.runtimeValues.map(value => value.name === 'amount' ? {...value,
      origin:{actionRef:readRow.actionId,applicationId,targetId:'amount',canonicalTraceRef:options.canonicalTraceRef},
      consumers} : value),
    sideEffects:actions.filter(action => action.kind === 'actual-input').map(action => ({
      actionRef:action.actionId,state:'confirmed',receiptState:'acknowledged',sourceOutcome:'SUCCEEDED',
      sourceActionRef:action.sourceActionRef})),
    adapterScope:'Existing v1 shape only; original immutable Dossier and Browser execution trace remain authoritative'};
  return {raw, dossier:projected};
}

module.exports = {adaptBrowserSource};
