// Script-local target adapters. No enumeration, input, or desktop side effects.
(function(root){
  'use strict';

  const layoutKeys=['sidebarWidth','gap','top','bottom','right'];
  const defaultLayout=Object.freeze({sidebarWidth:300,gap:16,top:16,bottom:16,right:16});
  const fallbackLayout=Object.freeze({sidebarWidth:0,gap:16,top:16,bottom:16,right:16});

  function contentAreaFor(layout,source){
    // Logical pt, relative to the window. These are user-accepted placement
    // defaults, not AX measurements or input-readiness evidence. main clips
    // against the screen frame; keep the full height here for vertical centering.
    const {sidebarWidth,gap,top,bottom,right}=layout;
    const x=sidebarWidth+gap;
    return function(win){
      if(!win||!Number.isFinite(win.width)||!Number.isFinite(win.height))return null;
      const width=win.width-x-right,height=win.height-top-bottom;
      if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return null;
      return {x,y:top,width,height,source,composerMeasured:false};
    };
  }

  const windowFallback=contentAreaFor(fallbackLayout,'window-relative-fallback');
  // Serializable descriptors; createRegistry compiles layout into a pure function.
  // Additional configured identities do not imply live application qualification.
  const defaultProfiles=Object.freeze([Object.freeze({
    id:'codex',name:'ChatGPT（Codex）桌面应用',app:Object.freeze({bundleId:'com.openai.codex'}),
    layout:defaultLayout,inputMode:'strict',
  }),Object.freeze({
    id:'claude-code',name:'Claude Code',app:Object.freeze({bundleId:'com.anthropic.claudefordesktop'}),
    layout:fallbackLayout,scene:'claude-code',inputMode:'paste',
    editorSelector:Object.freeze({role:'textField',name:'Prompt'}),
  }),Object.freeze({
    id:'opencode',name:'OpenCode',app:Object.freeze({bundleId:'ai.opencode.desktop'}),
    layout:fallbackLayout,inputMode:'paste',
    // OpenCode 2.2.0 exposes one AXTextArea; its name varies with locale.
    editorDiscovery:Object.freeze({role:'textField',nativeRole:'AXTextArea',maxDepth:24}),
  })]);
  const text=value=>typeof value==='string'&&value.length>0&&
    value===value.trim()&&!/[\u0000-\u001f\u007f]/.test(value);

  function validApp(app){
    if(!app||typeof app!=='object'||Array.isArray(app))return false;
    const keys=Reflect.ownKeys(app);
    if(keys.length!==1||Object.keys(app).length!==1||
        typeof keys[0]!=='string'||!text(app[keys[0]]))return false;
    if(keys[0]==='bundleId')return !/[\s/\\]/.test(app.bundleId);
    return keys[0]==='path'&&(/^(\/|[A-Za-z]:[\\/])/.test(app.path)||
      /^\\\\[^\\]+\\[^\\]+/.test(app.path));
  }

  function validLayout(layout){
    return !!layout&&typeof layout==='object'&&!Array.isArray(layout)&&
      Reflect.ownKeys(layout).length===layoutKeys.length&&
      Object.keys(layout).length===layoutKeys.length&&
      layoutKeys.every(k=>Object.prototype.hasOwnProperty.call(layout,k)&&
        Number.isFinite(layout[k])&&layout[k]>=0)&&
      Number.isFinite(layout.sidebarWidth+layout.gap+layout.right)&&
      Number.isFinite(layout.top+layout.bottom);
  }

  function validEditor(selector){
    return !!selector&&typeof selector==='object'&&!Array.isArray(selector)&&
      selector.role==='textField'&&Reflect.ownKeys(selector).length===Object.keys(selector).length&&
      Object.keys(selector).every(k=>['role','name','identifier'].includes(k)&&text(selector[k]))&&
      ['name','identifier'].some(k=>text(selector[k]));
  }

  function validEditorDiscovery(discovery){
    const keys=['role','nativeRole','maxDepth'];
    return !!discovery&&typeof discovery==='object'&&!Array.isArray(discovery)&&
      Reflect.ownKeys(discovery).length===keys.length&&Object.keys(discovery).length===keys.length&&
      keys.every(k=>Object.prototype.hasOwnProperty.call(discovery,k))&&
      discovery.role==='textField'&&text(discovery.nativeRole)&&
      Number.isInteger(discovery.maxDepth)&&discovery.maxDepth>=1&&discovery.maxDepth<=32;
  }

  function createRegistry({App,profiles=defaultProfiles,scope,scopes}){
    if(scope!==undefined&&scopes!==undefined)throw new TypeError('scope and scopes are mutually exclusive');
    const explicit=scope!==undefined||scopes!==undefined;
    if(!explicit&&(!App||typeof App.get!=='function'))throw new TypeError('App.get is required');
    if(!Array.isArray(profiles))throw new TypeError('profiles must be an array');
    const inputs=scope!==undefined?[scope]:scopes;
    if(explicit&&(!Array.isArray(inputs)||inputs.length<1||inputs.length>16))
      throw new TypeError('scopes must contain 1..16 entries');
    const allowed=new Map();
    const snapshots=[];
    for(const entry of inputs||[]){
      if(!entry||typeof entry!=='object'||Array.isArray(entry)||
          Object.keys(entry).length!==3||Reflect.ownKeys(entry).length!==3||
          !['pid','exePath','profile'].every(k=>Object.prototype.hasOwnProperty.call(entry,k))||
          !Number.isInteger(entry.pid)||entry.pid<=0||entry.pid>2147483647||
          !text(entry.exePath)||!validApp({path:entry.exePath})||!text(entry.profile)||
          allowed.has(entry.pid))
        throw new TypeError('Invalid or duplicate target scope');
      const saved=Object.freeze({pid:entry.pid,exePath:entry.exePath,profile:entry.profile});
      allowed.set(saved.pid,saved);
      snapshots.push(saved);
    }
    const scopedList=Object.freeze(snapshots);
    const scoped=scope===undefined?null:scopedList[0];
    // Scope binds the exact executable while retaining each built-in layout
    // and input policy. Placement defaults are not composer evidence.
    for(const builtin of defaultProfiles){
      const selected=scopedList.find(entry=>entry.profile===builtin.id);
      if(selected&&!profiles.some(p=>p?.id===builtin.id))
        profiles=[...profiles,{...builtin,app:{path:selected.exePath}}];
    }
    const byId=new Map();
    // Snapshot stable identities so caller edits cannot silently retarget a registry.
    for(const profile of profiles){
      if(!profile||typeof profile!=='object'||Array.isArray(profile)||!text(profile.id)||profile.id==='configured'||byId.has(profile.id)||
          !text(profile.name)||!validApp(profile.app)||
          (profile.inputMode!==undefined&&!['paste','strict'].includes(profile.inputMode))||
          (profile.layout!==undefined&&!validLayout(profile.layout))||
          (profile.editorSelector!==undefined&&!validEditor(profile.editorSelector))||
          (profile.editorDiscovery!==undefined&&!validEditorDiscovery(profile.editorDiscovery))||
          (profile.scene!==undefined&&profile.scene!=='claude-code')||
          (profile.id==='claude-code'&&profile.scene!=='claude-code')||
          (profile.contentArea!==undefined&&typeof profile.contentArea!=='function')||
          (profile.contentArea===undefined&&!validLayout(profile.layout)))
        throw new TypeError('Invalid or duplicate target profile');
      const layout=profile.layout===undefined?undefined:Object.freeze({...profile.layout});
      const contentArea=profile.contentArea||contentAreaFor(layout,'window-relative-default');
      byId.set(profile.id,Object.freeze({id:profile.id,name:profile.name,
        // Script-level append policy only; no atomicity or IME guarantee.
        inputMode:profile.inputMode===undefined?'strict':profile.inputMode,
        app:Object.freeze({...profile.app}),...(layout?{layout}:{}),
        // Script-local read-only candidate discovery, not input qualification.
        ...(profile.editorDiscovery?{editorDiscovery:Object.freeze({...profile.editorDiscovery})}:{}),
        ...(profile.editorSelector?{editorSelector:Object.freeze({...profile.editorSelector})}:{}),
        ...(profile.scene||profile.app.bundleId==='com.anthropic.claudefordesktop'||
          /\/Claude\.app(?:\/Contents\/MacOS\/Claude)?$/.test(profile.app.path||'')?{scene:'claude-code'}:{}),contentArea}));
    }

    for(const entry of scopedList){
      const profile=byId.get(entry.profile);
      if(!profile)throw new TypeError('Unknown scoped profile');
      const appPath=profile.app.path;
      // A bundle path may own its executable; titles never establish identity.
      const bundleExecutable=appPath&&appPath.endsWith('.app')&&
        entry.exePath.startsWith(appPath+'/Contents/MacOS/')&&
        /^[^/\\]+$/.test(entry.exePath.slice((appPath+'/Contents/MacOS/').length))&&
        !['.','..'].includes(entry.exePath.slice((appPath+'/Contents/MacOS/').length));
      if(appPath&&appPath!==entry.exePath&&!bundleExecutable)
        throw new TypeError('Scoped executable conflicts with profile identity');
      allowed.set(entry.pid,Object.freeze({profileId:entry.profile,
        identity:Object.freeze({kind:'path',value:entry.exePath}),profile}));
    }
    function matchPid(pid,overrideBundleId=''){
      if(explicit)return allowed.get(pid)||null;
      if(!Number.isSafeInteger(pid)||pid<=0||typeof overrideBundleId!=='string')return null;
      let candidates=Array.from(byId.values());
      if(overrideBundleId!==''){
        const app={bundleId:overrideBundleId};
        if(!validApp(app))return null;
        // Select only the configured identity, retaining its known layout rules.
        // Two profiles for that identity still require an explicit layout choice.
        const known=candidates.filter(profile=>profile.app.bundleId===overrideBundleId);
        if(known.length>1)return null;
        candidates=[Object.freeze({...known[0],id:'configured',
          name:known[0]?.name||'Configured application',app:Object.freeze(app),
          inputMode:known[0]?.inputMode||'strict',
          ...(overrideBundleId==='com.anthropic.claudefordesktop'?{scene:'claude-code'}:{}),
          layout:known[0]?.layout||fallbackLayout,
          contentArea:known[0]?.contentArea||windowFallback})];
      }
      let match=null;
      for(const profile of candidates){
        // A read error must escape before any partial match can be returned.
        const group=App.get(profile.app);
        if(!group)continue;
        const member=(Array.isArray(group.pids)&&group.pids.includes(pid))||
          (Array.isArray(group.instances)&&group.instances.some(p=>p&&p.pid===pid));
        if(!member)continue;
        const kind=Object.keys(profile.app)[0];
        // Retain the Runtime's actual stable identity, never a title or PID alias.
        if(!group.identity||group.identity.kind!==kind||
            group.identity.value!==profile.app[kind])return null;
        if(match)return null;
        match={profileId:profile.id,identity:group.identity,group,profile};
      }
      return match;
    }
    // Configured profiles are per-match settings, not a cached registry entry.
    return {scope:scoped,scopes:scopedList,matchPid,getProfile(id){return byId.get(id)||null;}};
  }

  // Read-only measurement, not composer/input readiness or content calibration.
  function createComposerTracker(options){
    const stop=code=>{throw Object.assign(new Error(code),{code});};
    const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
    const identityKeys=['id','pid','handle','exePath'];
    const geometryKeys=['x','y','width','height'];
    const validIdentity=win=>object(win)&&typeof win.id==='string'&&win.id.length>0&&
      !win.id.endsWith(':unresolved')&&Number.isSafeInteger(win.pid)&&win.pid>0&&
      Number.isSafeInteger(win.handle)&&win.handle>0&&
      typeof win.exePath==='string'&&win.exePath.length>0;
    const dimensions=win=>object(win)&&Number.isFinite(win.width)&&win.width>0&&
      Number.isFinite(win.height)&&win.height>0;
    const geometry=win=>dimensions(win)&&geometryKeys.every(k=>Number.isFinite(win[k]))&&
      Number.isFinite(win.x+win.width)&&Number.isFinite(win.y+win.height);
    if(!object(options))stop('INVALID_ARGUMENT');
    const {Accessibility,editorSelector,layout}=options;
    if(!Accessibility||typeof Accessibility.snapshot!=='function'||
        !object(editorSelector)||editorSelector.role!=='textField'||
        !Object.keys(editorSelector).includes('role')||
        Reflect.ownKeys(editorSelector).length!==Object.keys(editorSelector).length||
        Reflect.ownKeys(editorSelector).some(k=>!['role','name','identifier'].includes(k))||
        Object.keys(editorSelector).some(k=>typeof editorSelector[k]!=='string'||
          editorSelector[k].length===0)||
        !['name','identifier'].some(k=>typeof editorSelector[k]==='string'&&editorSelector[k].length>0)||
        !object(layout)||!validIdentity(layout.window)||!dimensions(layout.window))
      stop('INVALID_ARGUMENT');
    const identity=Object.fromEntries(identityKeys.map(k=>[k,layout.window[k]]));
    const selector={...editorSelector},selectorKeys=Object.keys(selector);
    const snapshot=Accessibility.snapshot.bind(Accessibility);
    return {async measure(win){
      if(!validIdentity(win)||!geometry(win))stop('INVALID_ARGUMENT');
      if(identityKeys.some(k=>win[k]!==identity[k]))stop('STALE_TARGET');
      const frame=Object.fromEntries(geometryKeys.map(k=>[k,win[k]]));
      let result;
      try{
        result=await snapshot({within:win,
          properties:['role','name','identifier','enabled','bounds'],
          timeout:250,maxDepth:16,maxNodes:2000});
      }catch(error){
        const failure=Object.assign(new Error('Composer snapshot failed'),{
          code:typeof error?.code==='string'&&error.code?error.code:'BACKEND_FAILED'});
        throw failure;
      }
      if(identityKeys.some(k=>win[k]!==identity[k])||
          geometryKeys.some(k=>win[k]!==frame[k]))stop('STALE_TARGET');
      if(!result||result.complete!==true||result.truncated!==false||!result.root)
        stop('SEARCH_INCOMPLETE');
      const stack=[{node:result.root,depth:0}],seen=new Set(),matches=[];
      while(stack.length){
        const {node,depth}=stack.pop();
        if(!object(node)||seen.has(node)||seen.size>=2000||depth>16||
            !Array.isArray(node.children))stop('SEARCH_INCOMPLETE');
        seen.add(node);
        if(selectorKeys.every(k=>node[k]===selector[k]))matches.push(node);
        if(node.children.length>2000-seen.size-stack.length)stop('SEARCH_INCOMPLETE');
        for(const child of node.children)stack.push({node:child,depth:depth+1});
      }
      if(matches.length!==1)stop(matches.length?'AMBIGUOUS_TARGET':'TARGET_NOT_FOUND');
      const field=matches[0],bounds=field.bounds;
      if(field.enabled!==true)stop(field.enabled===false?'ELEMENT_DISABLED':'STATE_UNKNOWN');
      if(!geometry(bounds)||bounds.coordinateSpace!=='screen'||
          bounds.x<frame.x||bounds.y<frame.y||
          bounds.x+bounds.width>frame.x+frame.width||
          bounds.y+bounds.height>frame.y+frame.height)stop('STATE_UNKNOWN');
      return {x:bounds.x-frame.x,y:bounds.y-frame.y,width:bounds.width,height:bounds.height,
        source:'accessibility',composerMeasured:true};
    }};
  }

  // Claude 4.29 desktop Code evidence. All predicates belong to the same
  // complete native window tree. A title, Code navigation button, or generic
  // text area alone cannot qualify Chat/Cowork/setup as a Code workspace.
  async function inspectClaudeCode({Accessibility,window:win,measure=true}){
    const stop=code=>{throw Object.assign(new Error(code),{code});};
    const result=await Accessibility.snapshot({within:win,maxDepth:64,maxNodes:2000,timeout:1500,
      properties:['role','nativeRole','name','identifier','enabled',...(measure?['bounds']:[])]});
    if(result?.complete!==true||result.truncated!==false||!result.root)stop('SEARCH_INCOMPLETE');
    const entries=[],seen=new Set(),stack=[{node:result.root,parent:null,depth:0}];
    while(stack.length){
      const entry=stack.pop(),{node,depth}=entry;
      if(!node||seen.has(node)||seen.size>=2000||depth>64||!Array.isArray(node.children))stop('SEARCH_INCOMPLETE');
      seen.add(node);entries.push(entry);
      for(const child of node.children)stack.push({node:child,parent:entry,depth:depth+1});
    }
    const matches=(role,name)=>entries.filter(e=>e.node.role===role&&e.node.name===name);
    const headings=entries.filter(e=>e.node.nativeRole==='AXHeading'&&e.node.name==='Claude Code');
    const panes=matches('group','Primary pane');
    const editors=matches('textField','Prompt');
    if(headings.length!==1||panes.length!==1||editors.length!==1)return null;
    const pane=panes[0],editor=editors[0];
    const inside=(entry,ancestor)=>{for(let e=entry;e;e=e.parent)if(e===ancestor)return true;return false;};
    const control=name=>entries.filter(e=>inside(e,pane)&&e.node.name===name&&
      ['button','checkbox'].includes(e.node.role)&&e.node.enabled===true).length===1;
    const document=entry=>{for(let e=entry;e;e=e.parent)if(e.node.nativeRole==='AXWebArea')return e;return null;};
    const doc=document(editor);
    if(!doc||!inside(editor,pane)||document(headings[0])!==doc||
        !control('Terminal')||!control('Files'))return null;
    const field=editor.node,b=field.bounds;
    const sceneKey=JSON.stringify([doc.node.name,field.identifier]);
    if(field.nativeRole!=='AXTextArea'||field.enabled!==true)stop('COMPOSER_UNAVAILABLE');
    // A final complete structural read rejects late Code -> Chat/Cowork
    // transitions without paying to query every node's two geometry fields.
    // This carries no editor ref, placement or permission to write.
    if(!measure)return {sceneKey};
    const p=pane.node.bounds;
    const within=b=>b&&b.coordinateSpace==='screen'&&
      ['x','y','width','height'].every(k=>Number.isFinite(b[k])&&Number.isFinite(win[k]))&&
      b.width>0&&b.height>0&&b.x>=win.x&&b.y>=win.y&&
      b.x+b.width<=win.x+win.width&&b.y+b.height<=win.y+win.height;
    if(field.nativeRole!=='AXTextArea'||field.enabled!==true||!b||b.coordinateSpace!=='screen'||
        !within(b)||!within(p)||p.width<=32||p.height<=32||b.x<p.x||b.y<p.y||
        b.x+b.width>p.x+p.width||b.y+b.height>p.y+p.height)stop('COMPOSER_UNAVAILABLE');
    return {sceneKey,signature:JSON.stringify([doc.node.name,field.identifier,b.x,b.y,b.width,b.height]),
      editorSelector:{role:'textField',name:'Prompt',...(field.identifier?{identifier:field.identifier}:{})},
      contentArea:{x:p.x-win.x+16,y:p.y-win.y+16,width:p.width-32,height:p.height-32,
        source:'accessibility-code-pane',composerMeasured:false},
      composer:{x:b.x-win.x,y:b.y-win.y,width:b.width,height:b.height,
        source:'accessibility',composerMeasured:true}};
  }

  root.OpenDeskPromptTargets={createRegistry,defaultProfiles,createComposerTracker,inspectClaudeCode};
})(globalThis);
