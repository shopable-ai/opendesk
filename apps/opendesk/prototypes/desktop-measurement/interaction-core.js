'use strict';
// Review-only UI; native hit testing and screenshot capture are NOT implemented here.
const $=id=>document.getElementById(id), M=MeasureModel;
const stage=$('stage'), overlay=$('overlay'), NS='http://www.w3.org/2000/svg';
const fmt=n=>Number.isFinite(n)?Number(n.toFixed(2)).toString():'—';
const inside=(p,r)=>p&&r&&p.x>=r.x&&p.x<r.x+r.width&&p.y>=r.y&&p.y<r.y+r.height;
const clone=o=>o==null?null:structuredClone(o);
const E={active:false,adjusting:false,session:0,snapshotRevision:0,mode:'point',locked:false,p:null,region:null,stack:[],layer:0,alt:false,pending:false,targets:[],drag:null,generation:0,timer:null,frame:null,corner:'tr',source:'',detected:0,pixelRuns:0,pixelCache:[],lastQuery:null,status:'',lastCopy:null,marginView:'window'};
let W=0,H=0,origin={x:0,y:0},win,byId=new Map(),nodes=[],tiles=[],rawCanvases=new Map(),pixels,analysisCanvas,snapshotId,toastTimer;
function restorePrefs(){try{const p=JSON.parse(localStorage.getItem('opendesk-measurement-review-v2')||'{}');['magnet','show-edges'].forEach(id=>{if(typeof p[id]==='boolean')$(id).checked=p[id];});['panel-position'].forEach(id=>{if([...$(id).options].some(o=>o.value===p[id]))$(id).value=p[id];});}catch{}}
function savePrefs(){try{localStorage.setItem('opendesk-measurement-review-v2',JSON.stringify(Object.fromEntries(['magnet','show-edges','panel-position'].map(id=>[id,$(id).type==='checkbox'?$(id).checked:$(id).value]))));}catch{}}
function setHidden(id,value){const el=$(id);if(id==='overlay'){if(value)el.setAttribute('hidden','');else el.removeAttribute('hidden');}else el.hidden=value;}
function notify(s){$('toast').textContent=s;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,2600);}
function cancelDetection(){clearTimeout(E.timer);E.timer=null;E.pending=false;E.generation++;}
const abs=p=>({x:p.x+origin.x,y:p.y+origin.y});
const local=p=>({x:p.x-origin.x,y:p.y-origin.y});
const locRect=r=>({...r,...local(r)});
function rr(ctx,r,fill,rad=7){ctx.beginPath();ctx.roundRect(r.x,r.y,r.width,r.height,rad);ctx.fillStyle=fill;ctx.fill();}
function txt(ctx,s,x,y,size=13,color='#657783',weight=400){ctx.font=`${weight} ${size}px -apple-system, "Segoe UI", "Noto Sans CJK SC", sans-serif`;ctx.fillStyle=color;ctx.fillText(s,x,y);}
function node(id,label,r,parentId,role='group'){return {id,label,rect:{...r,...abs(r)},parentId,role,provider:'synthetic-ui-tree',reliability:'fixture-not-native'};}
function defineScene(){
 const wx=W>1000?62:24, wy=66, ww=Math.max(330,Math.min(1032,W-(W>1120?366:68))), wh=Math.max(260,Math.min(610,H-154));
 const listW=ww>730?224:ww>500?158:90, navW=56, chatX=wx+navW+listW, chatW=ww-navW-listW;
 const wr={x:wx,y:wy,width:ww,height:wh};
 const chat={x:chatX,y:wy+44,width:chatW,height:wh-44};
 const inputH=Math.min(164,wh*.30), composer={x:chatX+18,y:wy+wh-inputH-14,width:chatW-36,height:inputH};
 const input={x:composer.x+12,y:composer.y+38,width:composer.width-24,height:Math.max(34,composer.height-94)};
 const send={x:composer.x+composer.width-100,y:composer.y+composer.height-43,width:86,height:29};
 const bubble={x:chatX+52,y:wy+140,width:Math.max(100,Math.min(320,chatW-88)),height:76};
 nodes=[node('window','微信',wr,null,'window'),node('chat','聊天区',chat,'window'),node('composer','输入区',composer,'chat'),node('input','文本输入框',input,'composer','textField'),node('send','发送按钮',send,'composer','button'),node('bubble','消息气泡',bubble,'chat'),node('conversations','会话列表',{x:wx+navW,y:wy+44,width:listW,height:wh-44},'window','list')];
 byId=new Map(nodes.map(n=>[n.id,n]));win=byId.get('window');
}
function drawScene(ctx){
 const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#e9eef1');bg.addColorStop(.62,'#dce6ed');bg.addColorStop(1,'#c8dae5');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
 ctx.strokeStyle='#ffffff25';for(let x=0;x<W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}for(let y=0;y<H;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
 txt(ctx,'示例桌面',24,27,10,'#688593',500);txt(ctx,'测量层不向下方应用发送点击',90,27,10,'#87a0ac');
 const r=locRect(win.rect), chat=locRect(byId.get('chat').rect), list=locRect(byId.get('conversations').rect), comp=locRect(byId.get('composer').rect), input=locRect(byId.get('input').rect), send=locRect(byId.get('send').rect), bubble=locRect(byId.get('bubble').rect);
 ctx.shadowColor='#365a7533';ctx.shadowBlur=32;ctx.shadowOffsetY=16;rr(ctx,r,'#f7f8fa',11);ctx.shadowBlur=0;ctx.shadowOffsetY=0;
 ctx.save();ctx.beginPath();ctx.roundRect(r.x,r.y,r.width,r.height,11);ctx.clip();
 ctx.fillStyle='#f8f9fa';ctx.fillRect(r.x,r.y,r.width,44);['#e68c84','#e8c577','#95bca7'].forEach((c,i)=>{ctx.fillStyle=c;ctx.beginPath();ctx.arc(r.x+18+i*16,r.y+21,4.5,0,Math.PI*2);ctx.fill();});txt(ctx,'微信',r.x+82,r.y+26,12,'#526b79',550);txt(ctx,'合成场景 / 非真实账号',r.x+r.width-142,r.y+26,10,'#91a3ad');
 ctx.fillStyle='#e4eaf0';ctx.fillRect(r.x,r.y+44,56,r.height-44);rr(ctx,{x:r.x+12,y:r.y+65,width:32,height:32},'#91b5b8',8);txt(ctx,'林',r.x+21,r.y+87,14,'#f6ffff',500);
 ['◉','☷','▣','⋯'].forEach((v,i)=>txt(ctx,v,r.x+20,r.y+142+i*48,21,i?'#8196a4':'#3b917e'));txt(ctx,'☰',r.x+20,r.y+r.height-25,19,'#8196a4');
 ctx.fillStyle='#f0f3f6';ctx.fillRect(list.x,list.y,list.width,list.height);rr(ctx,{x:list.x+12,y:list.y+13,width:list.width-24,height:27},'#e3e9ed',6);txt(ctx,'⌕  搜索',list.x+23,list.y+31,11,'#91a5b0');
 const people=[['陈','陈一 · 产品讨论','新的样机可以先看一下','#92aaa8'],['设','设计讨论组','输入区需要显示相对坐标','#9daebf'],['林','林晓','收到，谢谢','#c1b1a2'],['文','文件传输助手','measurement.json','#84b2a4']];
 people.forEach((a,i)=>{const yy=list.y+53+i*74;if(i===0){ctx.fillStyle='#dce8ed';ctx.fillRect(list.x,yy-4,list.width,70);}rr(ctx,{x:list.x+12,y:yy+6,width:34,height:34},a[3],7);txt(ctx,a[0],list.x+22,yy+29,14,'#fff',500);if(list.width>120){txt(ctx,a[1],list.x+57,yy+20,11,'#516c7d',500);ctx.save();ctx.beginPath();ctx.rect(list.x+55,yy+26,list.width-62,25);ctx.clip();txt(ctx,a[2],list.x+57,yy+41,9,'#899eaa');ctx.restore();}});
 ctx.fillStyle='#f7f9fb';ctx.fillRect(chat.x,chat.y,chat.width,chat.height);txt(ctx,'陈一 · 产品讨论',chat.x+24,chat.y+34,14,'#3b5869',550);txt(ctx,'···',chat.x+chat.width-36,chat.y+34,19,'#78919f');ctx.fillStyle='#e7edf1';ctx.fillRect(chat.x,chat.y+53,chat.width,1);
 txt(ctx,'14:32',chat.x+chat.width/2-12,chat.y+82,9,'#acbbc4');
 rr(ctx,{x:chat.x+16,y:bubble.y+3,width:27,height:27},'#94aeae',6);txt(ctx,'陈',chat.x+22,bubble.y+22,11,'white');rr(ctx,bubble,'#e8eef3',8);
 ctx.save();ctx.beginPath();ctx.rect(bubble.x+10,bubble.y+6,bubble.width-18,bubble.height-10);ctx.clip();txt(ctx,'鼠标经过输入区，就能看到它的边界。',bubble.x+13,bubble.y+27,11,'#5d7688');txt(ctx,'坐标、尺寸和边距最好一起提供。',bubble.x+13,bubble.y+51,11,'#788f9f');ctx.restore();
 if(chat.height>390){const br={x:chat.x+Math.max(34,chat.width-324),y:bubble.y+100,width:Math.min(275,chat.width-64),height:49};rr(ctx,br,'#d5eade',8);txt(ctx,'对，减少手动框选和反复测量。',br.x+13,br.y+29,11,'#4d7b67');}
 rr(ctx,comp,'#ffffff',8);ctx.strokeStyle='#e1e8ed';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(comp.x+.5,comp.y+.5,comp.width-1,comp.height-1,8);ctx.stroke();
 ['☺','▧','✂','⋯'].forEach((s,i)=>txt(ctx,s,comp.x+15+i*28,comp.y+24,16,'#8ba0b0'));
 rr(ctx,input,'#fafbfc',4);txt(ctx,'在这里输入消息…',input.x+10,input.y+24,11,'#b1bfc8');
 rr(ctx,send,'#d9eee4',5);txt(ctx,'发送',send.x+30,send.y+19,11,'#548770',550);
 ctx.restore();
}
function buildSnapshot(){
 W=stage.clientWidth;H=stage.clientHeight;const dm=$('display-mode').value;origin={x:dm==='retina'?0:-Math.round(W/2),y:dm==='negative'?-180:0};defineScene();
 $('scene').replaceChildren();rawCanvases.clear();
 const halves=dm==='mixed'?[{x:0,width:Math.floor(W/2),scale:1},{x:Math.floor(W/2),width:W-Math.floor(W/2),scale:2}]:[{x:0,width:W,scale:dm==='negative'?1.25:2}];
 tiles=halves.map((d,i)=>{const c=document.createElement('canvas');c.className='raw';c.style.cssText=`left:${d.x}px;top:0;width:${d.width}px;height:${H}px`;c.width=Math.round(d.width*d.scale);c.height=Math.round(H*d.scale);const ctx=c.getContext('2d',{willReadFrequently:true});ctx.scale(c.width/d.width,c.height/H);ctx.translate(-d.x,0);drawScene(ctx);$('scene').append(c);const displayId=`demo-display-${i+1}`;rawCanvases.set(displayId,c);return {displayId,logicalBounds:{x:origin.x+d.x,y:origin.y,width:d.width,height:H},pixelSize:{width:c.width,height:c.height},scaleX:c.width/d.width,scaleY:c.height/H,colorSpace:'sRGB'};});
 analysisCanvas=document.createElement('canvas');analysisCanvas.width=W;analysisCanvas.height=H;const ac=analysisCanvas.getContext('2d',{willReadFrequently:true});drawScene(ac);pixels=ac.getImageData(0,0,W,H);
 snapshotId=`prototype-${++E.snapshotRevision}-${Date.now()}`;E.pixelCache=[];E.lastQuery=null;overlay.setAttribute('viewBox',`0 0 ${W} ${H}`);
}
function rawColor(p){if(!p)return null;const q=M.logicalToPixel(p,tiles);if(!q)return null;const ctx=rawCanvases.get(q.displayId)?.getContext('2d');if(!ctx)return null;const rgba=Array.from(ctx.getImageData(q.x,q.y,1,1).data);return {hex:'#'+rgba.slice(0,3).map(n=>n.toString(16).padStart(2,'0')).join('').toUpperCase(),rgba,imagePixel:{x:q.x,y:q.y},displayId:q.displayId,scaleX:q.scaleX,scaleY:q.scaleY,colorSpace:'sRGB',source:'frozen-synthetic-raw-pixel',interpolation:'none'};}
function semanticAt(p){return nodes.filter(n=>inside(p,n.rect)).sort((a,b)=>M.area(a.rect)-M.area(b.rect));}
function visualAt(p){
 const t0=performance.now(), pp=local(p), x=Math.floor(pp.x), y=Math.floor(pp.y), wr=locRect(win.rect), tolerance=Number($('tolerance').value);
 if(!inside(p,win.rect)||x<0||y<0||x>=W||y>=H)return null;
 const k=y*W+x, cached=E.pixelCache.find(c=>c.tolerance===tolerance&&c.mask[k]);if(cached)return clone(cached.node);
 E.pixelRuns++;
 const left=Math.max(0,Math.ceil(wr.x)),right=Math.min(W-1,Math.floor(wr.x+wr.width-1)),top=Math.max(0,Math.ceil(wr.y)),bottom=Math.min(H-1,Math.floor(wr.y+wr.height-1));
 const maxCount=180000, queue=new Int32Array(maxCount), seen=new Uint8Array(W*H), mask=new Uint8Array(W*H), d=pixels.data;
 const seed=[d[k*4],d[k*4+1],d[k*4+2]];let head=0,tail=1,count=0,minX=x,maxX=x,minY=y,maxY=y,limited=false;queue[0]=k;seen[k]=1;
 function enqueue(n,xx,yy){if(xx<left||xx>right||yy<top||yy>bottom||seen[n])return;seen[n]=1;const j=n*4;if(Math.max(Math.abs(d[j]-seed[0]),Math.abs(d[j+1]-seed[1]),Math.abs(d[j+2]-seed[2]))>tolerance)return;if(tail>=maxCount){limited=true;return;}queue[tail++]=n;}
 while(head<tail&&!limited){const n=queue[head++], xx=n%W, yy=Math.floor(n/W);mask[n]=1;count++;minX=Math.min(minX,xx);maxX=Math.max(maxX,xx);minY=Math.min(minY,yy);maxY=Math.max(maxY,yy);enqueue(n-1,xx-1,yy);enqueue(n+1,xx+1,yy);enqueue(n-W,xx,yy-1);enqueue(n+W,xx,yy+1);if((count&2047)===0&&performance.now()-t0>24)limited=true;}
 E.status=limited?'视觉检测达到预算，未生成可用候选':'像素检测完成';
 if(limited)return null;const r={...abs({x:minX,y:minY}),width:maxX-minX+1,height:maxY-minY+1},density=count/M.area(r);
 if(r.width<16||r.height<16||density<.40||M.area(r)>.78*M.area(win.rect))return null;
 const n={id:`visual-${minX}-${minY}-${r.width}-${r.height}`,label:'色块区域',rect:r,parentId:'window',role:null,provider:'pixel-region-growing',reliability:'estimated-not-semantic',evidence:{seedPixel:{x,y},tolerance,connectivity:4,pixels:count,boundingBoxFillRatio:density,budgetLimited:false,analysisScale:'one-logical-unit-per-analysis-pixel',notNativeScreenshot:true}};
 E.pixelCache.unshift({tolerance,mask,node:clone(n)});E.pixelCache.length=Math.min(E.pixelCache.length,4);return n;
}
function resolveNow(){
 if(!E.active||E.adjusting||!E.p||E.alt||!$('magnet').checked||E.locked)return;
 E.detected++;E.pending=false;
 if($('provider').value==='semantic'){E.stack=semanticAt(E.p);E.layer=Math.min(E.layer,Math.max(0,E.stack.length-1));E.region=clone(E.stack[E.layer]||null);E.status=E.region?'候选来自模拟 UI 树':'窗口外：仅显示屏幕坐标';}
 else {const n=visualAt(E.p);E.stack=n?[n]:[];E.layer=0;E.region=n;if(!n&& !E.status.includes('预算'))E.status='未找到可靠色块，请手动框选';}
 render();
}
function scheduleResolve(){
 cancelDetection();if(!E.active||E.adjusting||!E.p||E.locked||E.alt||!$('magnet').checked){renderSoon();return;}
 if(E.region&&!inside(E.p,E.region.rect))E.region=null;
 E.pending=true;const generation=E.generation,snapshot=snapshotId;
 E.timer=setTimeout(()=>{E.timer=null;if(E.generation===generation&&snapshot===snapshotId&&E.active&&!E.locked){resolveNow();}},120);renderSoon();
}
function movePointer(p){if(!E.active||E.adjusting||E.locked)return;const old=E.p;E.p=p;E.layer=old&&Math.hypot(p.x-old.x,p.y-old.y)<3?E.layer:0;scheduleResolve();}
