// Pure, app-owned adapter. Query API remains in its separate (private) repository.
// No untrusted UI data chooses the backend, project or query text.
(function(root){
  'use strict';
  const projectRE=/^[a-z0-9][a-z0-9_-]{0,63}$/;
  const requestRE=/^[A-Za-z0-9_-]{1,40}$/;
  const providers=new Set(['auto','http','codex_cli']);
  const text=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max?v:'';
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  function config(raw){
    if(!object(raw)||!Number.isSafeInteger(raw.port)||raw.port<1||raw.port>65535||
       !text(raw.projectId,64)||!projectRE.test(raw.projectId)||!providers.has(raw.modelProvider))return null;
    return {url:'http://127.0.0.1:'+raw.port+'/api/query',projectId:raw.projectId,modelProvider:raw.modelProvider};
  }
  function request(c,ctx){
    if(!c||!requestRE.test(ctx.requestId)||!text(ctx.question,4000))throw Error('INVALID_AI_REQUEST');
    const strategy=c.modelProvider==='http'?'context_http':
      c.modelProvider==='codex_cli'?'context_codex_cli':'auto';
    // draft does not grant any channel send/asset/action authority.
    return {request_id:ctx.requestId,product_slug:c.projectId,query:ctx.question,
      channel:'generic',delivery_mode:'draft',answer_strategy:strategy};
  }
  function base(c,ctx,status,errorCode){
    return {type:'support.aiResult',requestId:ctx.requestId,binding:ctx.binding,
      projectId:c?.projectId||'unconfigured',knowledgeBackend:'query_api',modelProvider:'none',
      retrievalStatus:'unavailable',status,evidencePack:{projectId:c?.projectId||'unconfigured',coverage:'unknown',items:[]},
      candidates:[],requiresHumanReview:true,errorCode};
  }
  function failed(c,ctx,code='QUERY_UNAVAILABLE'){
    return base(c,ctx,'error',code);
  }
  function convert(c,ctx,httpResult){
    if(!c||!httpResult||httpResult.status!==200)return failed(c,ctx,'QUERY_HTTP_FAILED');
    let v=httpResult.data;
    // Old Query API returns {code,message,data}; a raw DTO is not an approved transport.
    if(!object(v)||v.code!==0||typeof v.message!=='string'||!object(v.data))return failed(c,ctx,'QUERY_ENVELOPE_INVALID');
    v=v.data;
    if(v.request_id!==ctx.requestId||v.product_slug!==c.projectId||
      (v.actual_product_slug!==undefined&&v.actual_product_slug!==c.projectId)||
      (v.requested_product_slug!==undefined&&v.requested_product_slug!==c.projectId)||
      v.delivery_mode_applied!=='draft'||v.delivery_status!=='draft_only'||
      v.direct_reply_allowed!==false)return failed(c,ctx,'QUERY_CONTRACT_MISMATCH');
    const selected=text(v.selected_answer_strategy,40);
    if((c.modelProvider==='http'&&selected!=='context_http')||
       (c.modelProvider==='codex_cli'&&selected!=='context_codex_cli'))
      return failed(c,ctx,'PROVIDER_MISMATCH');
    const declaredCoverage=object(v.coverage)?v.coverage.status:undefined;
    if(declaredCoverage!==undefined&&v.coverage_status!==undefined&&declaredCoverage!==v.coverage_status)
      return failed(c,ctx,'QUERY_COVERAGE_MISMATCH');
    const coverage=object(v.coverage)&&['full','partial','unknown','conflict'].includes(v.coverage.status)?
      v.coverage.status:['full','partial','unknown','conflict'].includes(v.coverage_status)?v.coverage_status:'unknown';
    const result=base(c,ctx,'ready',null);
    result.evidencePack.coverage=coverage;
    const hits=object(v.coverage)&&Array.isArray(v.coverage.locked_hits)?v.coverage.locked_hits:[];
    const seen=new Set();
    for(const h of hits){
      if(!object(h)||!text(h.knowledge_id,160)||!text(h.answer_hash,128)||seen.has(h.knowledge_id))continue;
      if(!/^[a-f0-9]{32,128}$/i.test(h.answer_hash))continue;
      seen.add(h.knowledge_id);
      result.evidencePack.items.push({id:'e'+result.evidencePack.items.length,
        sourceType:'knowledge_base',sourceRef:h.knowledge_id,answerHash:h.answer_hash});
      if(result.evidencePack.items.length===8)break;
    }
    result.retrievalStatus=coverage==='conflict'?'conflict':coverage==='partial'?'partial':
      coverage==='full'&&result.evidencePack.items.length?'supported':'unverified';
    if(coverage==='conflict'||v.delivery_status==='blocked'){
      result.status='blocked';result.errorCode='EVIDENCE_CONFLICT';return result;
    }
    if(!result.evidencePack.items.length||coverage==='unknown'){
      result.status='blocked';result.errorCode='EVIDENCE_UNVERIFIED';return result;
    }
    const answer=text(v.review_answer,2000);
    if(!answer||!answer.trim())return failed(c,ctx,'EMPTY_AI_REPLY');
    // One legacy API reply -> one candidate. reply_segments are NOT strategies.
    const calls=object(v.model_call_counts)?v.model_call_counts:{};
    const count=calls.total_provider_requests;
    if(!['rag_raw','rag_rewrite','context_http','context_codex_cli'].includes(selected))
      return failed(c,ctx,'PROVIDER_MISMATCH');
    if(selected!=='rag_raw'&&(!Number.isSafeInteger(count)||count<=0))
      return failed(c,ctx,'PROVIDER_MISMATCH');
    if(selected==='rag_raw'&&(count!==0||!['none','',null,undefined].includes(v.model_provider)))
      return failed(c,ctx,'PROVIDER_MISMATCH');
    if(typeof count==='number'&&Number.isSafeInteger(count)&&count>0){
      // Counts and a strategy name alone do not establish the actual route.
      // Keep unknown/mock/fallback claims from becoming an HTTP-model badge.
      const provider=text(v.model_provider,100);
      const httpProviders=new Set(['http','openai','openai-compatible','openai_compatible']);
      if(selected==='context_codex_cli'&&provider==='codex_cli')result.modelProvider='codex_cli';
      else if(['context_http','rag_rewrite'].includes(selected)&&httpProviders.has(provider))result.modelProvider='http';
      else return failed(c,ctx,'PROVIDER_MISMATCH');
    }
    result.candidates=[{id:'query',name:'知识建议',symbol:'✦',text:answer,
      evidenceIds:result.evidencePack.items.map(item=>item.id)}];
    result.requiresHumanReview=true;
    return result;
  }
  root.OpenDeskSupportQueryAPI={config,request,convert,failed};
})(globalThis);
