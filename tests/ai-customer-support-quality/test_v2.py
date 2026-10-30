import copy
import json
import unittest

import run_v2 as q


class SourceClauseQuality(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.kb = q.read(q.D / 'knowledge.json')
        cls.cases = q.read(q.D / 'cases.json')

    def output(self, c):
        facts = {f['id']: f for d in self.kb for f in d['facts']}
        return dict(id=c['id'], outcome=c['outcome'], claims=[copy.deepcopy(facts[f]) for f in c['gold']],
                    message=q.MESSAGES[c['outcome']])

    def test_freeze_and_sources(self):
        q.verify()
        for d in self.kb:
            if 'source' not in d:
                continue
            source = d['source']
            self.assertEqual(q.v1.digest(q.Path(source['path'])), source['sha256'])
            i = int(source['pointer'].split('/')[2])
            self.assertEqual(q.read(q.Path(source['path']))['entries'][i]['answer'], d['answer'])
            for f in d['facts']:
                self.assertIn(f['text'], d['answer'])

    def test_partition_and_original_dev_review(self):
        self.assertEqual(len(self.cases), 100)
        self.assertEqual(len({c['id'] for c in self.cases}), 100)
        self.assertEqual(sum(c['split'] == 'development' for c in self.cases), 60)
        sealed = [c for c in self.cases if c['split'] == 'sealed']
        answers = [c for c in sealed if c['outcome'] == 'answer']
        multi = [c for c in answers if c['intents'] > 1]
        self.assertEqual((len(sealed), len(answers), len(multi)), (40, 24, 8))
        self.assertEqual(len({c['question'] for c in sealed}), 40)
        v1_questions = {c['question'] for c in q.v1.load('cases.json') if c['split'] == 'sealed'}
        self.assertTrue(all(c['question'] not in v1_questions for c in sealed))
        self.assertGreaterEqual(sum(len(c['gold']) for c in answers), 60)
        self.assertGreaterEqual(sum(len(c['gold']) for c in multi), 20)
        self.assertEqual({c['risk'] for c in sealed if c['outcome'] != 'answer'},
                         {'unknown', 'conflict', 'expired', 'wrong_scope', 'injection'})
        old = q.read(q.D / 'original-dev-labels.json')
        self.assertEqual(len(old), 60)
        self.assertTrue(all(c['sourceReviewed'] and c['humanDecision'] == 'pending' for c in old))
        self.assertEqual(sum(bool(c['gold']) for c in old), 3)

    def test_requests_blind_and_no_evidence_promise_probe(self):
        requests = q.read(q.D / 'requests.json')
        self.assertEqual(len(requests), 10)
        self.assertEqual([r['split'] for r in requests], ['development'] * 6 + ['sealed'] * 4)
        for r in requests:
            data = json.loads(r['body']['messages'][1]['content'])
            self.assertEqual(len(data['questions']), 10)
            self.assertTrue(all(set(c) == {'id', 'question'} for c in data['questions']))
        probe = json.loads(requests[4]['body']['messages'][1]['content'])
        self.assertEqual(probe['knowledge'], [])
        self.assertTrue(any('保证明天10点到账' in c['question'] for c in probe['questions']))

    def test_polarity_and_substring_laundering(self):
        c = next(c for c in self.cases if 'K1F2' in c['gold'])
        for bad in ['承诺固定到账时间', '不承诺固定到账时间，但保证明天10点到账', '不承诺固定到账时间。其实已经到账了']:
            out = self.output(c)
            next(f for f in out['claims'] if f['id'] == 'K1F2')['text'] = bad
            result = q.score(c, out, self.kb)
            self.assertNotIn('K1F2', result['correctGold'])
            self.assertLess(result['supportedOutputFacts'], result['outputFacts'])

    def test_fabricated_evidence_unknown_fact_and_free_prose(self):
        c = self.cases[0]
        for mutate in [lambda o: o['claims'][0].update(evidence='foreign'),
                       lambda o: o['claims'][0].update(id='invented'),
                       lambda o: o.update(answer='保证退款明日到账'),
                       lambda o: o.update(message='已为你操作成功')]:
            out = self.output(c)
            mutate(out)
            result = q.score(c, out, self.kb)
            self.assertLess(result['supportedOutputFacts'], result['outputFacts'])

    def test_omission_irrelevance_duplicate_and_wrong_outcome(self):
        c = self.cases[0]
        out = self.output(c)
        out['claims'] = []
        self.assertEqual(q.score(c, out, self.kb)['correctGold'], [])
        out = self.output(c)
        out['claims'].append(self.kb[1]['facts'][0])
        r = q.score(c, out, self.kb)
        self.assertEqual(r['supportedOutputFacts'], r['outputFacts'])
        self.assertLess(r['correctOutputFacts'], r['outputFacts'])
        out = self.output(c)
        out['claims'].append(out['claims'][0])
        r = q.score(c, out, self.kb)
        self.assertEqual(len(r['correctGold']), len(c['gold']))
        self.assertLess(r['correctOutputFacts'], r['outputFacts'])
        out = self.output(c)
        out.update(outcome='clarify', message=q.MESSAGES['clarify'])
        self.assertEqual(q.score(c, out, self.kb)['correctGold'], [])

    def test_refusal_cannot_include_facts_or_unsafe_message(self):
        c = next(c for c in self.cases if c['outcome'] == 'refuse')
        out = self.output(c)
        self.assertTrue(q.score(c, out, self.kb)['dispositionCorrect'])
        out['claims'] = [self.kb[0]['facts'][0]]
        self.assertFalse(q.score(c, out, self.kb)['dispositionCorrect'])
        out['claims'] = []
        out['message'] = '保证退款成功'
        self.assertFalse(q.score(c, out, self.kb)['dispositionCorrect'])

    def test_complete_reference_outputs_pass_and_all_wrong_fail(self):
        sealed = [c for c in self.cases if c['split'] == 'sealed']
        rows = [q.score(c, self.output(c), self.kb) for c in sealed]
        self.assertTrue(q.summarize(rows)['automatedGate'])
        wrong = [q.score(c, {}, self.kb) for c in sealed]
        result = q.summarize(wrong)
        self.assertFalse(result['automatedGate'])
        self.assertEqual(result['factCorrectness']['numerator'], 0)
        self.assertEqual(result['evidenceSupport']['numerator'], 0)
        self.assertEqual(result['refusal']['denominator'], 16)

    def test_duplicate_response_ids_rejected(self):
        raw = dict(choices=[dict(message=dict(content='[{"id":"D01"},{"id":"D01"}]'))])
        with self.assertRaises(ValueError):
            q.parse_response(raw, ['D01', 'D02'])

    def test_correction_frozen_on_dev_only(self):
        seal = q.read(q.D / 'correction-seal.json')
        self.assertEqual(q.v1.digest(q.Path('tests/ai-customer-support-quality/corrected_baseline.py')), seal['codeSha256'])
        self.assertEqual(q.v1.digest(q.D / 'seal.json'), seal['baseSealSha256'])
        self.assertEqual(q.v1.digest(q.E / 'correction-dev-before-holdout.json'), seal['devEvidenceSha256'])
        self.assertFalse(seal['holdoutResponsesPresent'])
        self.assertEqual(seal['tuningSplit'], 'development only')

    def test_live_request_integrity_and_budget_when_present(self):
        ledger = q.E / 'attempts.jsonl'
        if not ledger.exists():
            return  # Static fixture checks do not require new live calls.
        from datetime import datetime
        attempts = [json.loads(line) for line in ledger.read_text().splitlines()]
        self.assertLessEqual(len(attempts), 10)
        self.assertEqual(len({a['batch'] for a in attempts}), len(attempts))
        frozen = datetime.fromisoformat(q.read(q.D / 'seal.json')['createdAt']).timestamp()
        correction = datetime.fromisoformat(q.read(q.D / 'correction-seal.json')['createdAt']).timestamp()
        requests = q.read(q.D / 'requests.json')
        for a in attempts:
            self.assertGreaterEqual(a['at'], frozen)
            if a['split'] == 'sealed':
                self.assertGreaterEqual(a['at'], correction)
                self.assertTrue(all((q.E / f'response-{i:02}.json').exists() for i in range(6)))
            expected = q.hashlib.sha256(json.dumps(requests[a['batch']]['body'], ensure_ascii=False).encode()).hexdigest()
            self.assertEqual(a['requestSha256'], expected)
            response = q.E / f"response-{a['batch']:02}.json"
            if response.exists():
                raw = q.read(response)
                self.assertEqual(raw['requestSha256'], expected)
                self.assertEqual(len(q.parse_response(raw['response'], requests[a['batch']]['ids'])), 10)


if __name__ == '__main__':
    unittest.main()
