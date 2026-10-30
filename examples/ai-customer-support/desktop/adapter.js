// A transport/lifecycle adapter around the shared reducer, not another policy engine.
(function(root){
  'use strict';
  function create(core,saved){
    let state=core.createDesktopState(),generation=0;
    const ui={profile:'t1',theme:'light',zoom:'100',knowledgeQuery:'',knowledgeCategory:'all',
      productQuery:'',productCategory:'all',orderQuery:'',orderStatus:'all',knowledgeId:null,factId:null};
    if(saved!==undefined){
      if(!saved||typeof saved!=='object'||saved.schemaVersion!==1||!Array.isArray(saved.threads)||saved.threads.length!==3||
        saved.threads.some((t,i)=>t.id!==state.threads[i].id||typeof t.draft!=='string'||t.draft.length>4000||
          !Array.isArray(t.messages)||t.messages.length>100||t.messages.some(m=>
            !m||!['customer','agent'].includes(m.who)||typeof m.id!=='string'||m.id.length>100||
            typeof m.text!=='string'||m.text.length>4000)))throw Error('保存状态无效，未覆盖原文件');
      state={...state,threads:state.threads.map((t,i)=>({...t,draft:saved.threads[i].draft,messages:saved.threads[i].messages})),
        threadId:core.isCustomerId(saved.threadId)?saved.threadId:'t1',
        tab:core.tabs.includes(saved.tab)?saved.tab:'reply',permission:false,paused:true,
        counter:Math.max(state.counter,...saved.threads.flatMap(t=>t.messages.map(m=>Number(m.id.replace(/^[mr]/,''))||0)))};
      ui.theme=saved.theme==='dark'?'dark':'light';ui.zoom=saved.zoom==='200'?'200':'100';
    }
    function token(){return {generation,id:state.threadId,messageId:core.latestCustomerMessage(core.currentThread(state))?.id};}
    function current(t){const now=token();return !!t&&t.generation===now.generation&&t.id===now.id&&t.messageId===now.messageId;}
    function dispatch(action){
      if(action.type==='SEND'||action.type.startsWith('AUTO_'))throw Error('Desktop 模拟助手不提供发送或托管入口');
      if(['SET_THREAD','RECEIVE','RESET'].includes(action.type)||
        (action.type==='SETTING'&&['permission','paused'].includes(action.key)))generation++;
      state=core.reducer(state,action);
      // This surface has no send/auto controls and never enables those reducer paths.
      state={...state,auto:false,consented:false,consentPending:false};
      return state;
    }
    return {ui,get state(){return state;},token,current,dispatch,
      fill(text,identity){
        if(!current(identity))return dispatch({type:'RECORD',message:'未填入：迟到事件或会话已变化'});
        return dispatch({type:'FILL',id:identity.id,messageId:identity.messageId,text,replace:false});
      },
      save(){return {schemaVersion:1,threadId:state.threadId,tab:state.tab==='settings'?state.settingsOrigin:state.tab,
        threads:state.threads.map(t=>({id:t.id,messages:t.messages.slice(-100),draft:t.draft})),theme:ui.theme,zoom:ui.zoom};}
    };
  }
  root.OpenDeskSupportAdapter={create};
})(globalThis);
