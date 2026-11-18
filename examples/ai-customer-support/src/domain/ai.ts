import type { Binding } from '../desktop';

export type RetrievalStatus='supported'|'partial'|'unverified'|'conflict'|'unavailable';
export type AiResultStatus='ready'|'blocked'|'error';
export interface EvidenceItem {
  id:string; sourceType:'knowledge_base'; sourceRef:string; answerHash:string;
  // Service-declared association, not independent business approval or freshness.
  source?:{text:string; title:string; document:string; association:'service_declared'};
}
export interface EvidencePack {
  projectId:string; coverage:'full'|'partial'|'unknown'|'conflict'; items:EvidenceItem[];
}
export interface ReplyCandidate {
  id:string; name:string; symbol:string; text:string; evidenceIds:string[];
}
export interface AiResult {
  type:'support.aiResult';requestId:string;binding:Binding;projectId:string;
  knowledgeBackend:'query_api'|'mock'; modelProvider:'http'|'codex_cli'|'none';
  retrievalStatus:RetrievalStatus;status:AiResultStatus;
  evidencePack:EvidencePack;candidates:ReplyCandidate[];
  requiresHumanReview:boolean;errorCode:string|null;
}
export interface AiQueryRequest {
  type:'support.aiQuery';requestId:string;binding:Binding;
}
export interface AiState {
  status:'loading'|AiResultStatus;requestId:string;binding:Binding;result:AiResult|null;
}

// Exact textual support is deliberately narrower than semantic entailment.
// A citation alone never verifies a paraphrase, applicability or dynamic facts.
function clauses(text:string):string[] {
  return text.split(/[。！？；\n]+/u).map(s=>s.trim()).filter(Boolean);
}

export function reviewClaims(text:string,items:EvidenceItem[]) {
  const sources=items.map(item=>({id:item.id,claims:new Set(clauses(item.source?.text??''))}));
  return clauses(text).map(claim=>({
    text:claim,evidenceIds:sources.filter(source=>source.claims.has(claim)).map(source=>source.id)
  }));
}

export function reviewCandidate(text:string,result:AiResult|null,candidateId:string):{
  items:EvidenceItem[];claims:{text:string;evidenceIds:string[]}[];unverifiedCount:number;warnings:string[];
} {
  const warnings:string[]=[];
  const items:EvidenceItem[]=[];
  if(!result)warnings.push('当前 AI 结果不可用，无法取得候选引用证据。');
  else {
    const candidate=result.candidates.find(c=>c.id===candidateId);
    if(!candidate)warnings.push('所选候选不存在，无法取得其引用证据。');
    else {
      if(!candidate.evidenceIds.length)warnings.push('所选候选未引用任何证据。');
      for(const id of new Set(candidate.evidenceIds)) {
        const item=result.evidencePack.items.find(e=>e.id===id);
        if(!item)warnings.push(`候选引用证据缺失：${id}。`);
        else {
          items.push(item);
          if(!item.source?.text.trim())warnings.push(`引用证据原文不可用：${id}，无法比对主张。`);
        }
      }
    }
    const retrievalWarnings:Partial<Record<RetrievalStatus,string>>={
      partial:'检索仅部分覆盖当前问题，遗漏部分待人工核实。',
      conflict:'检索结果存在冲突，待人工核实。',
      unverified:'检索结果未核实，待人工核实。',
      unavailable:'检索不可用，待人工核实。'
    };
    const coverageWarnings:Partial<Record<EvidencePack['coverage'],string>>={
      partial:'证据仅部分覆盖当前问题，遗漏部分待人工核实。',
      conflict:'证据覆盖存在冲突，待人工核实。',
      unknown:'证据覆盖范围未知，待人工核实。'
    };
    const retrievalWarning=retrievalWarnings[result.retrievalStatus];
    const coverageWarning=coverageWarnings[result.evidencePack.coverage];
    if(retrievalWarning)warnings.push(retrievalWarning);
    if(coverageWarning)warnings.push(coverageWarning);
    if(result.status!=='ready')warnings.push('当前 AI 结果尚不可用于回复，待人工核实。');
  }
  const claims=reviewClaims(text,items);
  const unverifiedCount=claims.filter(claim=>!claim.evidenceIds.length).length;
  if(unverifiedCount)warnings.push(`当前编辑稿有 ${unverifiedCount} 条主张未匹配引用原文，待人工核实。`);
  if(!claims.length)warnings.push('当前编辑稿为空，暂无可审核主张。');
  warnings.push('仅按完整分句文字相同比对，不做语义蕴含；即使文字相同，适用范围及版本仍待人工核实。');
  return {items,claims,unverifiedCount,warnings};
}

export function buildReplyHandoff(input:{
  customerName:string;question:string;text:string;result:AiResult|null;candidateId:string;
}):string {
  const review=reviewCandidate(input.text,input.result,input.candidateId);
  const unverified=review.claims.filter(claim=>!claim.evidenceIds.length);
  return [
    '人工交接摘要',
    '状态：待人工核实，未发送',
    `当前客户：${input.customerName}`,
    `当前问题：\n${input.question}`,
    `当前编辑稿：\n${input.text}`,
    ...(input.result?[`项目：${input.result.projectId}`,`request：${input.result.requestId}`]:[]),
    `候选 ID：${input.candidateId}`,
    '候选自身引用证据（仅服务声明的关联）：',
    ...(review.items.length?review.items.map(item=>`- ${item.id} | ref：${item.sourceRef} | Hash：${item.answerHash}`):['- 无可用引用证据']),
    `未核实主张（${review.unverifiedCount} 条未匹配引用原文）：`,
    ...(unverified.length?unverified.map(claim=>`- ${claim.text}`):['- 无未匹配分句；适用范围及版本仍待人工核实']),
    '审核提醒：',
    ...review.warnings.map(warning=>`- ${warning}`)
  ].join('\n');
}
