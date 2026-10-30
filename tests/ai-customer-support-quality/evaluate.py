"""Standalone offline retrieval baselines and bounded, opt-in model evaluation."""
import hashlib,json,math,re,sys,time,urllib.request
from collections import Counter
from pathlib import Path
D=Path('examples/ai-customer-support/fixtures/r30c-quality')
E=Path('.runtime/tests/ai-customer-support/r30c-20261030/quality')
def load(n): return json.loads((D/n).read_text())
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def write(p,x): p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
def tokens(s):
 s=s.lower(); return re.findall(r'[a-z0-9]+|[\u4e00-\u9fff]',s)
def retrieve(q,kb,method,k=3):
 docs=[d for d in kb if d['status']=='active' and d['project']=='synthetic-demo' and not d.get('scope')]
 if method=='faq': return [d for d in docs if q.strip() in [d['question'],*d['aliases']]][:k]
 bags=[Counter(tokens(d['question']+d['answer'])) for d in docs]; avg=sum(map(lambda b:sum(b.values()),bags))/len(bags)
 scores=[]
 for d,b in zip(docs,bags):
  score=0
  for t in set(tokens(q)):
   df=sum(t in x for x in bags); tf=b[t]
   score+=math.log(1+(len(docs)-df+.5)/(df+.5))*tf*2.2/(tf+1.2*(.25+.75*sum(b.values())/avg))
  scores.append((score,d))
 return [d for score,d in sorted(scores,key=lambda x:(-x[0],x[1]['id']))[:k] if score>0]
def metrics(c,answer,outcome,ids):
 # Strict lexical coverage is auditable, not a semantic accuracy judge.
 points=[dict(id=p['id'],covered=p['text'] in answer,evidenceRetrieved=p['evidence'] in ids) for p in c['gold']]
 unsupported=bool(re.search(r'(保证|承诺).{0,12}(到账|退款成功|付款成功|999元)',answer)) and not bool(re.search(r'(不保证|不承诺|不能保证)',answer))
 return dict(id=c['id'],expected=c['outcome'],actual=outcome,outcomeCorrect=outcome==c['outcome'],points=points,unsupportedCommitmentHeuristic=unsupported,manualFaithfulnessReview='pending')
def verify():
 seal=load('seal.json')
 for name,h in seal['files'].items():
  if digest(D/name)!=h: raise ValueError('seal mismatch: '+name)
 if digest(Path(__file__))!=seal['evaluatorSha256']: raise ValueError('evaluator changed after freeze')
def run(live=False):
 verify(); E.mkdir(parents=True,exist_ok=True)
 kb=load('knowledge.json'); cases=[c for c in load('cases.json') if c['split']=='sealed']; policy=load('policy.json')
 results={}
 for method in ['faq','bm25']:
  rows=[]
  for c in cases:
   docs=retrieve(c['question'],kb,method); answer='\n'.join(d['answer'] for d in docs)
   rows.append(dict(**metrics(c,answer,'answer' if docs else 'clarify',[d['id'] for d in docs]),answer=answer,retrieved=[d['id'] for d in docs]))
  results[method]=rows
 if live:
  # A persistent attempt ledger prevents accidental retries consuming another budget.
  ledger=E/'attempts.jsonl'; used=len(ledger.read_text().splitlines()) if ledger.exists() else 0
  if used: raise RuntimeError('live attempts already exist; replay saved output, do not retune/retry')
  auth=json.loads(Path('/Users/shopme/.codex/auth.json').read_text()); token=auth.get('OPENAI_API_KEY') or auth.get('tokens',{}).get('access_token')
  if not token: raise RuntimeError('Existing authorized credential unavailable')
  rows=[]
  for n in range(4):
   batch=cases[n*10:(n+1)*10]
   body=dict(model=policy['model'],reasoning_effort='low',max_tokens=6000,messages=[dict(role='system',content=policy['prompt']),dict(role='user',content=json.dumps(dict(knowledge=kb,questions=[dict(id=c['id'],question=c['question']) for c in batch]),ensure_ascii=False))])
   write(E/f'request-{n}.json',body)
   with ledger.open('a') as f: f.write(json.dumps(dict(batch=n,questions=len(batch),at=time.time()))+'\n')
   start=time.monotonic()
   try:
    req=urllib.request.Request(policy['endpoint'],data=json.dumps(body).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=180) as r: raw=json.load(r)
    write(E/f'response-{n}.json',dict(elapsedSeconds=time.monotonic()-start,response=raw))
    text=raw['choices'][0]['message']['content']; text=re.sub(r'^```(?:json)?\s*|\s*```$','',text.strip()); outputs=json.loads(text)
    if len(outputs)!=len(batch) or {x['id'] for x in outputs}!={c['id'] for c in batch}: raise ValueError('missing/duplicate/foreign ids')
    for c in batch:
     x=next(x for x in outputs if x['id']==c['id']); rows.append(dict(**metrics(c,x['answer'],x['outcome'],[]),answer=x['answer']))
   except Exception as ex:
    write(E/f'error-{n}.json',dict(error=str(ex),elapsedSeconds=time.monotonic()-start)); raise
  results['model']=rows
 elif all((E/f'response-{n}.json').exists() for n in range(4)):
  rows=[]
  for n in range(4):
   raw=json.loads((E/f'response-{n}.json').read_text())['response']; outputs=json.loads(re.sub(r'^```(?:json)?\s*|\s*```$','',raw['choices'][0]['message']['content'].strip()))
   for c in cases[n*10:(n+1)*10]:
    x=next(x for x in outputs if x['id']==c['id']); rows.append(dict(**metrics(c,x['answer'],x['outcome'],[]),answer=x['answer']))
  results['model']=rows
 summary={}
 for name,rows in results.items():
  ps=[p for r in rows for p in r['points']]; recall=sum(p['covered'] for p in ps)/len(ps)
  summary[name]=dict(questions=len(rows),pointRecall=recall,retrievalPointRecall=sum(p['evidenceRetrieved'] for p in ps)/len(ps) if name!='model' else None,outcomeAccuracy=sum(r['outcomeCorrect'] for r in rows)/len(rows),unsupportedCommitmentsHeuristic=sum(r['unsupportedCommitmentHeuristic'] for r in rows),automatedGate=recall>=.9 and all(r['outcomeCorrect'] and not r['unsupportedCommitmentHeuristic'] for r in rows),releaseGate='BLOCKED: human faithfulness review and business approval pending')
 write(E/'metrics.json',dict(summary=summary,perPoint=results)); print(json.dumps(summary,ensure_ascii=False,indent=2))
if __name__=='__main__': run('--live' in sys.argv)
