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
export function reviewClaims(text:string,items:EvidenceItem[]) {
  return text.split(/[。！？；\n]+/u).map(s=>s.trim()).filter(Boolean).slice(0,24).map(claim=>({
    text:claim,evidenceIds:items.filter(e=>claim.length>=6&&e.source?.text.includes(claim)).map(e=>e.id)
  }));
}
