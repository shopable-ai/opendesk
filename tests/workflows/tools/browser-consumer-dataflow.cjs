'use strict';
// Maintained exact-byte consumer adapter for the existing workflow gate.
// Controlled substitutes only: no real Browser, DOM, network or OS action.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

async function evaluate(descriptor) {
  if(descriptor.schemaVersion!=='browser-consumer-l1/v1'||descriptor.harness!=='browser-runtime-v1')throw new Error('UNSUPPORTED_BROWSER_DESCRIPTOR');
  const source=fs.readFileSync(descriptor.script.path,'utf8');
  if(hash(Buffer.from(source))!==descriptor.script.sha256||hash(fs.readFileSync(__filename))!==descriptor.evaluatorSha256)throw new Error('CURRENT_BYTES_CHANGED');
  const cases=[];
  for(const [index,amount] of ['017.20','543.09','992.01'].entries()) {
    const orderId='L1_ORDER_'+index,events=[];let order='',confirmation='',finalStatus='Ready',submissions=0,sequence=0,readId;
    const targetNames={order:'order-id',query:'query',amount:'amount',confirmation:'confirmation',confirm:'confirm',status:'status'};
    const meta={coreCandidateId:'74d9700a9a7dbc30837e2b34ebba714473d8e3e3dbc5aeed736a00f31968169b',origin:'http://127.0.0.1:51722',tab:759147624};
    function reply(operation,args={},result={}) {
      const requestId='l1-'+index+'-'+(++sequence);events.push({operation,requestId,args:JSON.parse(JSON.stringify(args))});return{requestId,result,outcome:'SUCCEEDED',browserExecution:meta,evidence:{tracePath:'controlled-substitute'}};
    }
    function locateName(query) {
      if(query.kind==='label')return query.value==='Order ID'?'order-id':'confirmation';
      if(query.kind==='testId')return query.value;
      if(query.kind==='role')return query.name==='Query'?'query':query.name==='Confirm'?'confirm':'amount';
      throw new Error('UNSUPPORTED_HARNESS_QUERY');
    }
    const browser={
      status:()=>reply('status',{}, {connected:true}),
      tabs:()=>reply('tabs',{}, {tabs:[{tab:759147624,url:'http://127.0.0.1:51722/'}]}),
      observe:args=>reply('observe',args,{identity:{document:'l1-document'}}),
      locate:args=>reply('locate',args,{candidateCount:1,target:{testId:locateName(args.query),tab:759147624,frame:0,document:'l1-document'}}),
      read:args=>{
        const value=args.target.testId==='amount'?amount:args.target.testId==='confirmation'?confirmation:args.target.testId==='order-id'?order:finalStatus;
        const response=reply('read',args,{value,redacted:false});if(args.target.testId==='amount')readId=response.requestId;return response;
      },
      act:args=>{
        if(args.operation==='fill'){
          if(args.target.testId==='order-id')order=args.value;
          else{if(args.value!==amount||args.sourceReadRequestId!==readId)throw new Error('ACTUAL_CONSUMER_SOURCE_BROKEN');confirmation=args.value;}
        }else if(args.target.testId==='confirm'){submissions++;if(confirmation===amount)finalStatus='Completed';}
        return reply('act',args,{value:args.value});
      },
      wait:args=>reply('wait',args,{trace:{verification:{pass:true,actual:args.target.testId==='amount'?amount:finalStatus}}}),
      verify:args=>{
        const actual=args.target.testId==='order-id'?order:args.target.testId==='confirmation'?confirmation:finalStatus;
        if(actual!==args.condition.expected)throw new Error('VERIFICATION_FAILED');return reply('verify',args,{trace:{verification:{pass:true,actual}}});
      },
      close:()=>events.push({operation:'close'}),
    };
    const sandbox={BrowserDOM:browser,File:{readJSON:async()=>({orderId})},Execution:{executionId:'l1-'+index,scriptHash:descriptor.script.sha256},console:{log:()=>{}}};
    const result=await vm.runInNewContext(source,sandbox,{timeout:1000,filename:descriptor.script.path});
    if(order!==orderId||confirmation!==amount||submissions!==1||finalStatus!=='Completed'||result.amount!==amount)throw new Error('EXACT_BYTE_DATAFLOW_FAILED');
    cases.push({orderId,amount,confirmation,submissions,finalStatus,events});
  }
  // A failed producer read must terminate before any Confirm.
  let confirms=0;
  const failedBrowser={status:()=>({outcome:'SUCCEEDED',result:{connected:true},browserExecution:{coreCandidateId:'74d9700a9a7dbc30837e2b34ebba714473d8e3e3dbc5aeed736a00f31968169b',origin:'http://127.0.0.1:51722',tab:759147624}}),tabs:()=>({outcome:'SUCCEEDED',result:{tabs:[{tab:759147624,url:'http://127.0.0.1:51722/'}]}}),observe:()=>({outcome:'SUCCEEDED',result:{identity:{document:'d'}}}),locate:args=>({outcome:'SUCCEEDED',result:{candidateCount:1,target:{query:args.query}}}),act:args=>{if(args.operation==='click'&&args.target.query.name==='Confirm')confirms++;return{outcome:'SUCCEEDED',result:{}};},verify:()=>({outcome:'SUCCEEDED',result:{}}),wait:()=>({outcome:'SUCCEEDED',result:{}}),read:()=>({error:{code:'READ_FAILED'},outcome:'NOT_DISPATCHED'}),close:()=>{}};
  let rejected=false;try{await vm.runInNewContext(source,{BrowserDOM:failedBrowser,File:{readJSON:async()=>({orderId:'L1_FAILED'})},Execution:{executionId:'failed'},console:{log:()=>{}}},{timeout:1000});}catch{rejected=true;}
  if(!rejected||confirms!==0)throw new Error('FAILED_PRODUCER_DID_NOT_STOP');
  const output=descriptor.outputDirectory;
  if(!path.isAbsolute(output)||!output.includes(path.sep+'.runtime'+path.sep))throw new Error('OUTPUT_ROOT');
  fs.mkdirSync(output,{recursive:true});const evidencePath=path.join(output,'consumer-observations.json');
  fs.writeFileSync(evidencePath,JSON.stringify({layer:'L1-controlled-substitutes',cases,failedRead:{rejected,confirmCalls:confirms}},null,2)+'\n');
  const root=descriptor.roots.sort((a,b)=>b[1].length-a[1].length).find(([,p])=>evidencePath.startsWith(p+path.sep));
  const evidenceRef={kind:'ValidationReport',rootId:root[0],path:path.relative(root[1],evidencePath),sha256:hash(fs.readFileSync(evidencePath)),schemaVersion:'json/v1'};
  return {tool:'browser-consumer-dataflow/v1',verdict:'pass',subjectRefs:[descriptor.candidateRef,descriptor.scriptRef,...descriptor.dependencies],
    businessDataflow:{verdict:'pass',releaseBlocked:false},evidenceLayer:'L1-controlled-substitutes',desktopActions:false,liveQualificationGranted:false,generalJavaScriptProof:false,
    verification:{mode:'controlled-exact-byte',evaluator:{path:__filename,sha256:descriptor.evaluatorSha256},evidenceRefs:[evidenceRef]},
    scope:'Only current frozen candidate with declared BrowserDOM substitutes; does not establish live Qualification'};
}
function verifyBrowserConsumer(descriptor) {
  return JSON.parse(execFileSync(process.execPath,[__filename],{input:JSON.stringify(descriptor),encoding:'utf8',timeout:15000,maxBuffer:2*1024*1024}));
}
if(require.main===module){let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>{input+=chunk;if(input.length>1024*1024)throw new Error('DESCRIPTOR_LIMIT');});process.stdin.on('end',()=>evaluate(JSON.parse(input)).then(result=>process.stdout.write(JSON.stringify(result)+'\n')).catch(error=>{process.stderr.write(String(error)+'\n');process.exitCode=1;}));}
module.exports={verifyBrowserConsumer};
