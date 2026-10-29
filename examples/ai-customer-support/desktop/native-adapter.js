// App-specific parsing and identity/deduplication. No UI or business reducer.
(function(root) {
  'use strict';
  const names = {t1:'林女士',t2:'陈先生',t3:'周女士'};
  function nodes(snapshot) {
    if (!snapshot || !snapshot.complete || snapshot.truncated || !snapshot.root) throw Error('AX snapshot incomplete');
    const out=[];
    (function visit(n){out.push(n);for(const child of n.children||[])visit(child);})(snapshot.root);
    return out;
  }
  function parse(snapshot) {
    const all=nodes(snapshot), sessions=all.filter(n=>n.identifier==='support.session');
    if(sessions.length!==1||typeof sessions[0].value!=='string')throw Error('Session missing or ambiguous');
    const match=/^(t[123]) · (.+)$/.exec(sessions[0].value);
    if(!match||names[match[1]]!==match[2])throw Error('Session identity not recognized');
    const customerId=match[1], draftNodes=all.filter(n=>n.identifier==='support.draft.'+customerId);
    if(draftNodes.length!==1||typeof draftNodes[0].value!=='string')throw Error('Draft missing or ambiguous');
    const messages=[],seen=new Set();
    for(const n of all.filter(n=>typeof n.identifier==='string'&&n.identifier.startsWith('support.message.'))){
      const id=/^support\.message\.(t[123]-m[1-9]\d*)\.(customer|agent)$/.exec(n.identifier);
      if(!id||!id[1].startsWith(customerId+'-')||seen.has(id[1]))throw Error('Cross-session or duplicate message identity');
      const prefix=(id[2]==='customer'?'客户':'客服')+' · '+id[1]+'\n';
      if(typeof n.value!=='string'||!n.value.startsWith(prefix))throw Error('Message metadata/body disagree');
      const text=n.value.slice(prefix.length);
      if(!text.trim()||text.length>4000)throw Error('Message body invalid');
      seen.add(id[1]);messages.push({id:id[1],who:id[2],text});
    }
    messages.sort((a,b)=>Number(a.id.split('-m')[1])-Number(b.id.split('-m')[1]));
    return {customerId,name:names[customerId],messages,draft:draftNodes[0].value};
  }
  function create(target) {
    let generation=0,revision=0,current=null,fingerprint='',enabled=true;
    const seen=new Map();
    return {
      get current(){return current;},
      invalidate(reason){
        generation++;fingerprint='';
        if(!current)return null;
        current={...current,revision:++revision,binding:{...current.binding,generation},observing:false,reason};
        return current;
      },
      revoke(){enabled=false;return this.invalidate('观察授权已撤销');},
      accept(win,snapshot){
        if(!enabled)throw Error('Observation authorization revoked');
        if(win.pid!==target.pid||win.exePath!==target.exePath||!win.handle||!win.isForeground)throw Error('Unverified target');
        const conversation=parse(snapshot),latest=conversation.messages.filter(m=>m.who==='customer').at(-1);
        const identity=[win.pid,win.handle,conversation.customerId,latest?.id||'none'].join(':');
        const last=current?.binding;
        if(!last||last.windowId!==win.handle||last.customerId!==conversation.customerId||last.messageId!==(latest?.id||'none')||!current.observing)generation++;
        const events=[];
        for(const m of conversation.messages){
          const key=win.pid+':'+win.handle+':'+conversation.customerId+':'+m.id,old=seen.get(key);
          if(old!==undefined&&old!==m.text)throw Error('Same message identity changed body');
          if(old===undefined){seen.set(key,m.text);events.push({...m,customerId:conversation.customerId,source:{backend:snapshot.backend,requestId:snapshot.requestId,pid:win.pid,windowId:win.handle,identifier:'support.message.'+m.id+'.'+m.who}});}
        }
        const key=JSON.stringify([identity,conversation]);
        const changed=key!==fingerprint;fingerprint=key;
        if(changed)current={type:'support.observation',revision:++revision,
          binding:{generation,pid:win.pid,windowId:win.handle,customerId:conversation.customerId,messageId:latest?.id||'none'},
          conversation:{name:conversation.name,messages:conversation.messages,draft:conversation.draft},observing:true};
        return {observation:current,changed,events};
      },
      matches(binding){return !!current&&current.observing&&!!binding&&['generation','pid','windowId','customerId','messageId'].every(k=>current.binding[k]===binding[k]);},
      validateFill(request){
        if(!request||request.type!=='support.fillDraft'||typeof request.requestId!=='string'||!request.requestId||request.requestId.length>100||!this.matches(request.binding))throw Error('Stale draft request');
        if(typeof request.text!=='string'||!request.text.trim()||request.text.length>4000||typeof request.expectedDraft!=='string')throw Error('Invalid draft request');
        if(current.conversation.draft!==request.expectedDraft)throw Error('Draft changed since selection');
        if(request.expectedDraft!==''&&request.expectedDraft!==request.text)throw Error('Existing manual draft preserved');
        return request.text;
      }
    };
  }
  root.OpenDeskSupportNative={nodes,parse,create};
})(globalThis);
