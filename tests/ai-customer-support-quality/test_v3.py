"""Static pre-review quotas/source audit and development-only runtime isolation.

No sealed baseline/model scoring, synthetic sealed outputs, or live requests.
"""
import contextlib
import copy
import io
import json
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest import mock

import run_v3 as r


class V3Preflight(unittest.TestCase):
    def test_full_freeze_static_no_diagnostics(self):
        seal = r.load(r.D / 'seal.json')
        # Hashes/quotas are static independent review inputs, not retrieval or
        # model diagnostics. Runtime development verify deliberately does less.
        for name, expected in seal['files'].items():
            self.assertEqual(r.digest(r.D / name), expected, name)
        for name, expected in seal['code'].items():
            self.assertEqual(r.digest(Path(name)), expected, name)
        for name, expected in seal['priorSeals'].items():
            self.assertEqual(r.digest(Path(name)), expected, name)

    def test_source_before_labels_and_requests(self):
        source = r.load(r.D / 'source-policy.json')
        source_seal = r.load(r.D / 'source-seal.json')
        labels = r.load(r.D / 'label-review.json')
        policy = r.load(r.D / 'policy.json')
        self.assertTrue(source['syntheticOnly'])
        self.assertFalse(source['merchantMaterial'])
        self.assertEqual(r.digest(r.D / 'source-policy.json'), source_seal['sourceSha256'])
        self.assertLess(datetime.fromisoformat(source['authoredAt']), datetime.fromisoformat(source_seal['createdAt']))
        self.assertLess(datetime.fromisoformat(source_seal['createdAt']), datetime.fromisoformat(labels['createdAt']))
        self.assertLess(datetime.fromisoformat(labels['createdAt']), datetime.fromisoformat(policy['createdAt']))
        facts = [f for p in source['policies'] for f in p['facts']]
        self.assertEqual((len(facts), len({f['id'] for f in facts}), len({f['text'] for f in facts})), (80, 80, 80))
        self.assertTrue(all(f['text'].startswith('纸舟甲仓') and f['text'].endswith('。') for f in facts))
        for i, d in enumerate(r.load(r.D / 'knowledge.json')[:20]):
            self.assertEqual(d['source']['pointer'], f'/policies/{i}')
            self.assertEqual(d['source']['sha256'], source_seal['sourceSha256'])
            self.assertEqual([{k: f[k] for k in ('id', 'text')} for f in d['facts']], source['policies'][i]['facts'])
            self.assertTrue(all(f['evidence'] == d['id'] for f in d['facts']))

    def test_100_unique_questions_distinct_fact_quotas(self):
        dev = r.load(r.D / 'development/cases.json')
        hold = r.load(r.D / 'sealed/cases.json')
        self.assertEqual((len(dev), len(hold)), (60, 40))
        self.assertEqual(len({c['id'] for c in dev + hold}), 100)
        self.assertEqual(len({c['question'] for c in dev + hold}), 100)
        answers = [c for c in hold if c['outcome'] == 'answer']
        multi = [c for c in answers if c['intents'] > 1]
        self.assertEqual((len(answers), len(multi)), (24, 8))
        self.assertEqual(len({f for c in answers for f in c['gold']}), 80)
        self.assertEqual(sum(len(c['gold']) for c in answers), 128)
        self.assertEqual(sum(len(c['gold']) for c in multi), 64)
        self.assertEqual({k: sum(c.get('risk') == k for c in hold) for k in ('unknown', 'conflict', 'expired', 'wrong_scope', 'injection')},
                         dict(unknown=4, conflict=2, expired=2, wrong_scope=4, injection=4))
        kb = r.load(r.D / 'knowledge.json')
        for c in dev + hold:
            expected = [f['id'] for topic in c.get('topics', []) for f in kb[topic]['facts']]
            self.assertEqual(c['gold'], expected)
            self.assertEqual(len(c['gold']), len(set(c['gold'])))

    def test_actual_requests_are_blind_to_labels(self):
        policy = r.load(r.D / 'policy.json')
        for split, count in [('development', 6), ('sealed', 4)]:
            requests = r.load(r.D / split / 'requests.json')
            cases = {c['id']: c for c in r.load(r.D / split / 'cases.json')}
            self.assertEqual(len(requests), count)
            for index, request in enumerate(requests):
                self.assertEqual(request['index'], index)
                body = request['body']
                self.assertEqual(body['model'], 'openai/gpt-6.1-sol')
                self.assertEqual(body['messages'][0]['content'], policy['prompt'])
                payload = json.loads(body['messages'][1]['content'])
                self.assertEqual(len(payload['questions']), 10)
                self.assertEqual([q['id'] for q in payload['questions']], request['ids'])
                for q in payload['questions']:
                    self.assertEqual(set(q), {'id', 'question'})
                    self.assertEqual(q['question'], cases[q['id']]['question'])
                self.assertFalse({'gold', 'labels', 'outcome'} & set(payload))

    def test_development_never_reads_scores_logs_or_saves_sealed(self):
        original_load, original_digest, original_score = r.load, r.digest, r.score
        paths, ids = [], []

        def forbid(path):
            self.assertNotIn('sealed', Path(path).parts, 'Development opened sealed material')
            paths.append(str(path))

        def guarded_load(path):
            forbid(path)
            return original_load(path)

        def guarded_digest(path):
            forbid(path)
            return original_digest(path)

        def guarded_score(case, output, kb):
            self.assertEqual(case['split'], 'development')
            ids.append(case['id'])
            return original_score(case, output, kb)

        r.E.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='isolation-test-', dir=r.E) as temp:
            stdout = io.StringIO()
            with mock.patch.object(r, 'E', Path(temp)), mock.patch.object(r, 'load', guarded_load), \
                    mock.patch.object(r, 'digest', guarded_digest), mock.patch.object(r, 'score', guarded_score), \
                    contextlib.redirect_stdout(stdout):
                result = r.evaluate_split('development')
            self.assertEqual(result['split'], 'development')
            self.assertEqual(len(ids), 120)  # 60 FAQ + 60 BM25, no model outputs.
            self.assertNotIn('sealed', stdout.getvalue())
            self.assertNotIn('V3H', stdout.getvalue())
            files = list(Path(temp).rglob('*'))
            self.assertEqual([p.name for p in files if p.is_file()], ['metrics.json'])
            saved = (Path(temp) / 'development/metrics.json').read_text()
            self.assertNotIn('V3H', saved)
            self.assertNotIn('sealed', saved)
            self.assertFalse((Path(temp) / 'sealed').exists())
            self.assertFalse(any('label-review' in p for p in paths))

    def test_live_approval_gate_blocks_before_network_or_credentials(self):
        r.E.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='release-test-', dir=r.E) as temp, \
                mock.patch.object(r, 'E', Path(temp)), mock.patch.object(r, 'load') as load, \
                mock.patch.object(r.urllib.request, 'urlopen') as network:
            with self.assertRaisesRegex(RuntimeError, 'review/user relay not received'):
                r.live('development')
            load.assert_not_called()
            network.assert_not_called()

    def test_offline_sealed_diagnostics_also_require_release(self):
        r.E.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='sealed-gate-test-', dir=r.E) as temp, \
                mock.patch.object(r, 'E', Path(temp)), mock.patch.object(r, 'load') as load, \
                mock.patch.object(r, 'score') as score:
            with self.assertRaisesRegex(RuntimeError, 'review/user relay not received'):
                r.evaluate_split('sealed')
            load.assert_not_called()
            score.assert_not_called()

    def test_strict_scorer_preserves_conditions_negation_and_evidence(self):
        c = r.load(r.D / 'development/cases.json')[0]
        kb = r.load(r.D / 'knowledge.json')
        out = dict(id=c['id'], outcome='answer', claims=copy.deepcopy(kb[0]['facts']), message='')
        self.assertEqual(len(r.score(c, out, kb)['correctGold']), 4)
        for mutate in [lambda o: o['claims'][0].update(text='任何人都可以直接注册。'),
                       lambda o: o['claims'][0].update(evidence='other-warehouse'),
                       lambda o: o.update(message='保证退款明天到账'),
                       lambda o: o.update(extra='绕过审核')]:
            bad = copy.deepcopy(out)
            mutate(bad)
            row = r.score(c, bad, kb)
            self.assertLess(row['supportedOutputFacts'], row['outputFacts'])
        out['claims'][2]['text'] = out['claims'][2]['text'].replace('禁止', '允许')
        self.assertNotIn('P00F3', r.score(c, out, kb)['correctGold'])


if __name__ == '__main__':
    unittest.main()
