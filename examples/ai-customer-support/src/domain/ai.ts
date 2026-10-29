import type { Binding } from '../desktop';

export type RetrievalStatus='supported'|'partial'|'unverified'|'conflict'|'unavailable';
export type AiResultStatus='ready'|'blocked'|'error';
export interface EvidenceItem {
  id:string; sourceType:'knowledge_base'; sourceRef:string; answerHash:string;
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
