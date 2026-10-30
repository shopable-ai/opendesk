import json,unittest
import evaluate as q
class Quality(unittest.TestCase):
 def test_seal(self): q.verify()
 def test_partition_and_floor(self):
  cs=q.load('cases.json'); self.assertEqual(len({c['id'] for c in cs}),100)
  self.assertEqual(sum(c['split']=='development' for c in cs),60)
  sealed=[c for c in cs if c['split']=='sealed']; a=[c for c in sealed if c['outcome']=='answer']; m=[c for c in a if c['intents']>1]
  self.assertEqual(len(sealed),40); self.assertEqual(len(a),24)
  self.assertGreaterEqual(sum(len(c['gold']) for c in a),60)
  self.assertGreaterEqual(len(m),8); self.assertGreaterEqual(sum(len(c['gold']) for c in m),20)
  self.assertEqual({c['risk'] for c in sealed if 'risk' in c},{'no_data','conflict','expired','wrong_scope','injection'})
 def test_sources_and_labels(self):
  kb={d['id']:d for d in q.load('knowledge.json')}
  for c in q.load('cases.json'):
   for p in c['gold']:
    d=kb[p['evidence']]; self.assertIn(p['text'],d['answer']); self.assertEqual(q.digest(q.Path(d['source']['path'])),d['source']['sha256'])
 def test_retrieval_deterministic_and_isolated(self):
  kb=q.load('knowledge.json')
  for method in ['faq','bm25']:
   for c in q.load('cases.json'):
    a=q.retrieve(c['question'],kb,method); self.assertEqual(a,q.retrieve(c['question'],kb,method))
    self.assertTrue(all(d['project']=='synthetic-demo' and d['status']=='active' and not d.get('scope') for d in a))
 def test_metrics_do_not_credit_omission(self):
  c=next(c for c in q.load('cases.json') if c['gold']); r=q.metrics(c,'','answer',[])
  self.assertFalse(any(p['covered'] for p in r['points']))
  self.assertTrue(q.metrics(c,'保证退款成功','answer',[])['unsupportedCommitmentHeuristic'])
  self.assertFalse(q.metrics(c,'不保证退款成功','answer',[])['unsupportedCommitmentHeuristic'])
if __name__=='__main__': unittest.main()
