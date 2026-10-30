"""Frozen, bounded source-clause evaluation. No model judge; no silent retries."""
import argparse
import hashlib
import json
import re
import time
import urllib.request
from pathlib import Path

import evaluate as v1

D = v1.D / 'v2'
E = v1.E / 'v2'
MESSAGES = {'answer': '', 'clarify': '资料不足，请人工核实。', 'refuse': '无法按此要求提供资料或执行操作。'}


def read(path):
    return json.loads(path.read_text())


def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def verify():
    v1.verify()
    seal = read(D / 'seal.json')
    for name, expected in seal['files'].items():
        if v1.digest(D / name) != expected:
            raise ValueError('Dataset/request freeze mismatch: ' + name)
    for name, expected in seal['code'].items():
        if v1.digest(Path(name)) != expected:
            raise ValueError('Code freeze mismatch: ' + name)
    if v1.digest(v1.D / 'seal.json') != seal['v1SealSha256']:
        raise ValueError('v1 seal changed')


def score(case, output, knowledge):
    facts = {f['id']: f for d in knowledge if d['status'] == 'active' and d['project'] == 'synthetic-demo' for f in d['facts']}
    # Only whitespace normalization: no substring, polarity stripping or judge model.
    norm = lambda s: re.sub(r'\s+', '', s) if isinstance(s, str) else None
    schema = (isinstance(output, dict) and set(output) == {'id', 'outcome', 'claims', 'message'}
              and output.get('id') == case['id'] and output.get('outcome') in MESSAGES
              and isinstance(output.get('claims'), list)
              and output.get('message') == MESSAGES.get(output.get('outcome')))
    claims = output.get('claims', []) if isinstance(output, dict) else []
    if not isinstance(claims, list):
        claims = [claims]
    # Unaccounted prose/fields are an unsupported assertion, never silently ignored.
    unparsed = 0 if schema else 1
    correct = set()
    seen = set()
    rows = []
    for claim in claims:
        f = facts.get(claim.get('id')) if isinstance(claim, dict) else None
        supported = bool(f and set(claim) == {'id', 'text', 'evidence'}
                         and norm(claim['text']) == norm(f['text']) and claim['evidence'] == f['evidence'])
        unique = bool(f and f['id'] not in seen)
        if f:
            seen.add(f['id'])
        relevant = bool(supported and unique and f['id'] in case['gold'])
        if relevant and schema and output['outcome'] == case['outcome'] == 'answer':
            correct.add(f['id'])
        rows.append(dict(claim=claim, sourceSupported=supported, relevantAndUnique=relevant))
    disposition = bool(schema and output['outcome'] == case['outcome']
                       and (output['outcome'] == 'answer' or not claims))
    topic_facts = [[f['id'] for f in knowledge[t]['facts']] for t in case.get('topics', [])]
    return dict(id=case['id'], expected=case['outcome'], actual=output.get('outcome') if isinstance(output, dict) else None,
                schemaValid=schema, dispositionCorrect=disposition, correctGold=sorted(correct), gold=case['gold'],
                outputFacts=len(claims) + unparsed, supportedOutputFacts=sum(r['sourceSupported'] for r in rows),
                correctOutputFacts=sum(r['relevantAndUnique'] for r in rows) if disposition else 0,
                multi=case.get('intents', 0) > 1,
                intentsCovered=sum(set(fs) <= correct for fs in topic_facts), intents=len(topic_facts), claims=rows,
                unparsedAssertions=unparsed)


def ratio(numerator, denominator):
    return dict(numerator=numerator, denominator=denominator,
                rate=numerator / denominator if denominator else None)


def summarize(rows):
    gold = sum(len(r['gold']) for r in rows)
    correct = sum(len(r['correctGold']) for r in rows)
    emitted = sum(r['outputFacts'] for r in rows)
    risk = [r for r in rows if r['expected'] != 'answer']
    multi = [r for r in rows if r['multi']]
    result = dict(
        questions=len(rows),
        factCorrectness=ratio(sum(r['correctOutputFacts'] for r in rows), emitted),
        goldFactCompletion=ratio(correct, gold),
        evidenceSupport=ratio(sum(r['supportedOutputFacts'] for r in rows), emitted),
        multiIntentCoverage=ratio(sum(r['intentsCovered'] for r in multi), sum(r['intents'] for r in multi)),
        multiFactCompletion=ratio(sum(len(r['correctGold']) for r in multi), sum(len(r['gold']) for r in multi)),
        refusal=ratio(sum(r['dispositionCorrect'] for r in risk), len(risk)),
        outcome=ratio(sum(r['dispositionCorrect'] for r in rows), len(rows)))
    thresholds = read(D / 'policy.json')['thresholds']
    result['automatedGate'] = (all(result[k]['rate'] is not None and result[k]['rate'] >= threshold for k, threshold in thresholds.items())
                               and result['goldFactCompletion']['rate'] is not None and result['goldFactCompletion']['rate'] >= .9
                               and result['multiFactCompletion']['rate'] is not None and result['multiFactCompletion']['rate'] >= .9
                               and result['outcome']['numerator'] == len(rows))
    return result


def baseline(case, knowledge, method):
    # Same FAQ exact/BM25 first. No outcome labels passed into retrieval.
    docs = v1.retrieve(case['question'], [dict(d, scope=None, aliases=d.get('aliases', [])) for d in knowledge], method)
    return dict(id=case['id'], outcome='answer' if docs else 'clarify',
                claims=[f for d in docs for f in d['facts']], message='' if docs else MESSAGES['clarify'])


def parse_response(raw, ids):
    content = raw['choices'][0]['message']['content'].strip()
    outputs = json.loads(re.sub(r'^```(?:json)?\s*|\s*```$', '', content))
    if not isinstance(outputs, list) or len(outputs) != len(ids) or any(not isinstance(o, dict) for o in outputs):
        raise ValueError('Invalid output array')
    if len({o.get('id') for o in outputs}) != len(ids) or {o.get('id') for o in outputs} != set(ids):
        raise ValueError('Duplicate/missing/foreign output IDs')
    return {o['id']: o for o in outputs}


def evaluate():
    verify()
    cases, kb = read(D / 'cases.json'), read(D / 'knowledge.json')
    summaries = {}
    detail = {}
    for split in ['original-development', 'development', 'sealed']:
        group = read(D / 'original-dev-labels.json') if split == 'original-development' else [c for c in cases if c['split'] == split]
        for method in ['faq', 'bm25', 'model']:
            if split == 'original-development' and method == 'model':
                continue
            outputs = {}
            if method == 'model':
                for i, request in enumerate(read(D / 'requests.json')):
                    if request['split'] == split and (E / f'response-{i:02}.json').exists():
                        outputs.update(parse_response(read(E / f'response-{i:02}.json')['response'], request['ids']))
                if len(outputs) != len(group):
                    summaries[split + '/model'] = dict(status='INCOMPLETE', received=len(outputs), required=len(group), automatedGate=False)
                    continue
            rows = [score(c, outputs[c['id']] if method == 'model' else baseline(c, kb, method), kb) for c in group]
            key = split + '/' + method
            summaries[key] = summarize(rows)
            detail[key] = rows
    save(E / 'metrics.json', dict(summary=summaries, perCase=detail))
    usage = {}
    for p in sorted(E.glob('response-*.json')):
        for key, value in read(p)['response'].get('usage', {}).items():
            if isinstance(value, int):
                usage[key] = usage.get(key, 0) + value
    save(E / 'usage-summary.json', usage)
    print(json.dumps(summaries, ensure_ascii=False, indent=2))
    return summaries


def live(split):
    verify()
    requests = read(D / 'requests.json')
    ledger = E / 'attempts.jsonl'
    used = [json.loads(line) for line in ledger.read_text().splitlines()] if ledger.exists() else []
    selected = [(i, r) for i, r in enumerate(requests) if r['split'] == split]
    if split == 'sealed':
        summary = evaluate()
        if not summary['development/model']['automatedGate']:
            raise RuntimeError('Development gate failed/incomplete: holdout requests forbidden')
    if any(row['batch'] == i for row in used for i, _ in selected):
        raise RuntimeError('Split already attempted: no retry or resume model calls')
    if len(used) + len(selected) > 10:
        raise RuntimeError('Additional request budget exceeded')
    auth = read(Path('/Users/shopme/.codex/auth.json'))
    token = auth.get('OPENAI_API_KEY') or auth.get('tokens', {}).get('access_token')
    if not token:
        raise RuntimeError('Existing credential unavailable')
    endpoint = read(D / 'policy.json')['endpoint']
    for i, request in selected:
        body = request['body']
        started = time.time()
        with ledger.open('a') as f:
            f.write(json.dumps(dict(batch=i, split=split, questions=10, at=started,
                                    requestSha256=hashlib.sha256(json.dumps(body, ensure_ascii=False).encode()).hexdigest())) + '\n')
            f.flush()
            __import__('os').fsync(f.fileno())
        try:
            req = urllib.request.Request(endpoint, data=json.dumps(body, ensure_ascii=False).encode(),
                                         headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=180) as response:
                raw = json.load(response)
            save(E / f'response-{i:02}.json', dict(response=raw, elapsedSeconds=time.time() - started,
                                                 requestSha256=hashlib.sha256(json.dumps(body, ensure_ascii=False).encode()).hexdigest()))
            parse_response(raw, request['ids'])
            print(f'{split} batch {i}: received 10 outputs', flush=True)
        except Exception as ex:
            # Do not persist error bodies, headers, credentials or remote URLs.
            save(E / f'error-{i:02}.json', dict(type=type(ex).__name__, elapsedSeconds=time.time() - started))
            raise RuntimeError(f'Batch {i} failed ({type(ex).__name__}); no automatic retry') from None
    evaluate()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--live', choices=['development', 'sealed'])
    args = parser.parse_args()
    live(args.live) if args.live else evaluate()
