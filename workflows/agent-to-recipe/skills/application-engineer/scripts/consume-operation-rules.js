'use strict';
// Limited harden reuse check, not discovery, inference or a workflow adapter.
// Both native inputs consume the same already-authored AppProfile operations.
const crypto=require('node:crypto');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function consumeOperationRules({sourceBytes,sourceRef,profileBytes,profileRef,operationIds}) {
  for(const ref of [sourceRef,profileRef]){
    if(!ref||typeof ref.rootId!=='string'||!ref.rootId||typeof ref.path!=='string'||!ref.path
      ||ref.path.split('/').some(part=>!part||part==='.'||part==='..')||/[\\:\x00-\x1f]/.test(ref.path))throw new Error('Complete portable fixed-input ref required');
  }
  if(hash(sourceBytes)!==sourceRef?.sha256||hash(profileBytes)!==profileRef?.sha256)throw new Error('Fixed input hash mismatch');
  const source=JSON.parse(sourceBytes),profile=JSON.parse(profileBytes);
  if(profile.schemaVersion!=='agent-to-recipe/app-profile/v1.1'||profileRef.schemaVersion!==profile.schemaVersion)throw new Error('Unsupported AppProfile version');
  let lineage;
  if(source.schemaVersion==='semantic-build-plan/v2'&&sourceRef.schemaVersion===source.schemaVersion){
    lineage='Human';
    if(!source.intent?.businessGoal||!Array.isArray(source.completion?.requirements))throw new Error('Human intent/process missing');
  }else if(source.schemaVersion==='agent-to-recipe/v1'&&sourceRef.schemaVersion===source.schemaVersion){
    lineage='Agent';
    if(!Array.isArray(source.businessSteps)||!source.businessSteps.length)throw new Error('Agent confirmed process missing');
  }else throw new Error('Unsupported native input version');
  if(!Array.isArray(operationIds)||!operationIds.length||new Set(operationIds).size!==operationIds.length)throw new Error('Explicit unique operation scope required');
  if(!Array.isArray(profile.operations))throw new Error('AppProfile operation rules missing');
  const required=['target','locator','actionStrategy','runtimeGuards','recoveryRule','qualificationClaims','sourceRefs','unknowns'];
  const operations=operationIds.map(id=>{
    const matches=profile.operations.filter(op=>op.id===id);if(matches.length!==1)throw new Error('Operation missing/ambiguous: '+id);
    const op=matches[0];if(required.some(k=>!Object.prototype.hasOwnProperty.call(op,k)))throw new Error('Incomplete operation rule: '+id);
    if(!Array.isArray(op.sourceRefs)||!op.sourceRefs.length||!Array.isArray(op.unknowns))throw new Error('Operation provenance/unknowns missing');
    return JSON.parse(JSON.stringify(op)); // Unknowns, qualifications and sources are not upgraded.
  });
  return {mode:'harden',scope:'read-only reuse of the requested fixed operations',lineage,sourceRef,appProfileRef:profileRef,
    applicationIdentity:profile.applicationIdentity,environmentScope:profile.environmentScope,operations,
    productionUnknowns:lineage==='Human'
      ? source.completion.gaps.filter(g=>g.status==='unknown').map(g=>({id:g.id,owner:g.owner,reason:g.reason}))
      : (source.unresolved||[]),
    sourceRefs:[sourceRef,profileRef],liveVerified:false,qualified:false};
}
module.exports={consumeOperationRules};
