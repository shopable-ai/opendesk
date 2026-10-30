"""Split-only v3 evaluation. Never use v2.evaluate/live; approval before network.

development execution opens only shared policy/knowledge and development files.
It never loads sealed cases, requests, labels, responses or baseline diagnostics.
"""
import argparse
import fcntl
import hashlib
import json
import os
import time
import urllib.request
from pathlib import Path

from run_v2 import baseline, parse_response, ratio, score

D = Path('examples/ai-customer-support/fixtures/r30c-quality/v3')
E = Path('.runtime/tests/ai-customer-support/r30c-20261030/quality/v3')
SPLITS = ('development', 'sealed')
SHARED = ('source-policy.json', 'source-seal.json', 'knowledge.json', 'policy.json')


def load(path):
    return json.loads(path.read_text())


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def verify(split):
    if split not in SPLITS:
        raise ValueError('Choose exactly one split')
    seal = load(D / 'seal.json')
    selected = [*SHARED, f'{split}/cases.json', f'{split}/requests.json']
    for name in selected:
        if digest(D / name) != seal['files'][name]:
            raise ValueError('Selected input freeze mismatch: ' + name)
    for name, expected in seal['code'].items():
        if digest(Path(name)) != expected:
            raise ValueError('Code freeze mismatch: ' + name)
    for name, expected in seal['priorSeals'].items():
        if digest(Path(name)) != expected:
            raise ValueError('Prior version seal changed')
    return seal


def require_review():
    # This file must be created only after the leader/user relays Socrates's
    # independent review. Preparation never creates it or claims signoff.
    path = E / 'review-release.json'
    if not path.exists():
        raise RuntimeError('Live forbidden: Socrates review/user relay not received')
    approval = load(path)
    if (approval.get('approvedForLive') is not True or approval.get('reviewer') != 'Socrates'
            or not approval.get('userRelay') or not approval.get('reviewEvidence')
            or approval.get('sealSha256') != digest(D / 'seal.json')):
        raise RuntimeError('Live forbidden: review release absent, incomplete or for another freeze')
    return approval


def summarize(rows, policy):
    multi = [r for r in rows if r['multi']]
    risk = [r for r in rows if r['expected'] != 'answer']
    facts = sum(r['outputFacts'] for r in rows)
    result = dict(questions=len(rows),
        factCorrectness=ratio(sum(r['correctOutputFacts'] for r in rows), facts),
        evidenceSupport=ratio(sum(r['supportedOutputFacts'] for r in rows), facts),
        goldFactCompletion=ratio(sum(len(r['correctGold']) for r in rows), sum(len(r['gold']) for r in rows)),
        distinctGoldFacts=len({f for r in rows for f in r['gold']}),
        distinctCorrectGoldFacts=len({f for r in rows for f in r['correctGold']}),
        multiIntentCoverage=ratio(sum(r['intentsCovered'] for r in multi), sum(r['intents'] for r in multi)),
        multiFactCompletion=ratio(sum(len(r['correctGold']) for r in multi), sum(len(r['gold']) for r in multi)),
        refusal=ratio(sum(r['dispositionCorrect'] for r in risk), len(risk)),
        outcome=ratio(sum(r['dispositionCorrect'] for r in rows), len(rows)))
    result['automatedGate'] = (
        all(result[k]['rate'] is not None and result[k]['rate'] >= threshold for k, threshold in policy['thresholds'].items())
        and result['goldFactCompletion']['rate'] is not None and result['goldFactCompletion']['rate'] >= policy['minGoldCompletion']
        and result['multiFactCompletion']['rate'] is not None and result['multiFactCompletion']['rate'] >= policy['minMultiFactCompletion']
        and (not policy['requireAllDispositions'] or result['outcome']['numerator'] == len(rows)))
    return result


def evaluate_split(split, emit=True):
    if split == 'sealed':
        require_review()
        development_prerequisite()
    verify(split)
    # No loop over SPLITS, no glob of responses from other splits, no shared
    # metrics.json containing both. Sealed content cannot enter dev diagnostics.
    cases = load(D / split / 'cases.json')
    requests = load(D / split / 'requests.json')
    kb, policy = load(D / 'knowledge.json'), load(D / 'policy.json')
    summaries, detail, provenance = {}, {}, {}
    for method in ('faq', 'bm25'):
        rows = [score(c, baseline(c, kb, method), kb) for c in cases]
        summaries[method], detail[method] = summarize(rows, policy), rows
    outputs, usage = {}, {}
    for request in requests:
        file = E / split / f"response-{request['index']:02}.json"
        if not file.exists():
            continue
        saved = load(file)
        expected = hashlib.sha256(json.dumps(request['body'], ensure_ascii=False).encode()).hexdigest()
        if saved['requestSha256'] != expected:
            raise ValueError('Response request hash mismatch')
        outputs.update(parse_response(saved['response'], request['ids']))
        provenance[file.name] = digest(file)
        for key, value in saved['response'].get('usage', {}).items():
            if isinstance(value, int):
                usage[key] = usage.get(key, 0) + value
    if len(outputs) == len(cases):
        rows = [score(c, outputs[c['id']], kb) for c in cases]
        summaries['model'], detail['model'] = summarize(rows, policy), rows
    else:
        summaries['model'] = dict(status='NOT_RUN_OR_INCOMPLETE', received=len(outputs), required=len(cases), automatedGate=False)
    result = dict(split=split, sealSha256=digest(D / 'seal.json'), casesSha256=digest(D / split / 'cases.json'),
                  summary=summaries, perCase=detail, responseSha256=provenance, usage=usage)
    write(E / split / 'metrics.json', result)
    if emit:
        print(json.dumps(dict(split=split, summary=summaries), ensure_ascii=False, indent=2))
    return result


def development_prerequisite():
    # Explicit development-only evaluation, not a generic both-split runner.
    result = evaluate_split('development', emit=False)
    if not result['summary']['model']['automatedGate']:
        raise RuntimeError('Development model gate incomplete/failed; holdout forbidden')
    return result


def live(split):
    require_review()  # No credential read or network before this check.
    verify(split)
    if split == 'sealed':
        development_prerequisite()  # Only now may sealed cases/requests be loaded.
    requests = load(D / split / 'requests.json')
    policy = load(D / 'policy.json')
    E.mkdir(parents=True, exist_ok=True)
    # Exclusive lock prevents two processes bypassing the shared 10-call cap.
    with (E / 'live.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        ledger = E / 'attempts.jsonl'
        used = [json.loads(line) for line in ledger.read_text().splitlines()] if ledger.exists() else []
        if any(a['split'] == split for a in used):
            raise RuntimeError('Split already attempted; offline replay only, no live retries')
        if split == 'development' and used:
            raise RuntimeError('Development must be the first six requests')
        if split == 'sealed' and (len(used) != 6 or any(a['split'] != 'development' for a in used)):
            raise RuntimeError('Sealed requires exactly six previous development attempts')
        if len(used) + len(requests) > policy['maxNewBatches']:
            raise RuntimeError('v3 ten-batch cap exceeded')
        auth = load(Path('/Users/shopme/.codex/auth.json'))
        token = auth.get('OPENAI_API_KEY') or auth.get('tokens', {}).get('access_token')
        if not token:
            raise RuntimeError('Existing credential unavailable')
        for request in requests:
            started = time.time()
            request_hash = hashlib.sha256(json.dumps(request['body'], ensure_ascii=False).encode()).hexdigest()
            with ledger.open('a') as f:
                f.write(json.dumps(dict(split=split, batch=request['index'], questions=10,
                                        at=started, requestSha256=request_hash)) + '\n')
                f.flush()
                os.fsync(f.fileno())
            try:
                req = urllib.request.Request(policy['endpoint'], data=json.dumps(request['body'], ensure_ascii=False).encode(),
                                             headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
                with urllib.request.urlopen(req, timeout=180) as response:
                    raw = json.load(response)
                write(E / split / f"response-{request['index']:02}.json", dict(response=raw, requestSha256=request_hash,
                       elapsedSeconds=time.time()-started))
                parse_response(raw, request['ids'])
                print(f"{split} batch {request['index']}: received 10 outputs", flush=True)
            except Exception as ex:
                write(E / split / f"error-{request['index']:02}.json", dict(type=type(ex).__name__, elapsedSeconds=time.time()-started))
                raise RuntimeError(f"{split} batch {request['index']} failed ({type(ex).__name__}); no retry") from None
        evaluate_split(split)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--split', choices=SPLITS, required=True)
    parser.add_argument('--live', action='store_true')
    parser.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    if args.live and args.verify_only:
        parser.error('choose live or verify-only')
    if args.verify_only:
        verify(args.split)
        print(args.split + ' freeze verified; no scoring or model call')
    elif args.live:
        live(args.split)
    else:
        # Even offline held-out diagnostics require the review plus completed
        # development model gate. No pre-review convenience path can expose it.
        evaluate_split(args.split)
