"""Small dev-derived lexical safety gate; a baseline, not product routing code.

Rules use development vocabulary only. Freeze before opening holdout model output.
No case IDs, gold labels, hidden synonym additions, embeddings or model judge.
"""
import re

import run_v2 as q

REFUSE = r'另一|另一个客户|其他项目|客户A|客户B|sandbox-|忽略|泄露|提示词|冒充|虚构|编一个|关闭.*审核'
UNSUPPORTED = r'库存|成交价|支付成功|此刻|运费|明天.*到账|到账.*几点|退款.*几点|A.?方案|套餐|空间|尺寸|矛盾|相反|冲突|不一致|停用|去年|过期|撤销'
TOPICS = [r'地址|收货信息', r'退款', r'售后.*(凭证|材料|准备)|退货.*照片',
          r'快递|包裹.*(不动|卡住)|物流', r'发票|开票', r'保修|质保']


def corrected(case, kb):
    question = case['question']
    if re.search(REFUSE, question):
        outcome, docs = 'refuse', []
    elif re.search(UNSUPPORTED, question):
        outcome, docs = 'clarify', []
    else:
        hits = q.v1.retrieve(question, [dict(d, scope=None, aliases=d.get('aliases', [])) for d in kb], 'bm25')
        topics = {f'K{i}' for i, pattern in enumerate(TOPICS) if re.search(pattern, question)}
        docs = [d for d in hits if d['id'] in topics]
        outcome = 'answer' if docs else 'clarify'
    return dict(id=case['id'], outcome=outcome, claims=[f for d in docs for f in d['facts']], message=q.MESSAGES[outcome])


def run():
    q.verify()
    seal = q.read(q.D / 'correction-seal.json')
    if q.v1.digest(q.Path(__file__)) != seal['codeSha256']:
        raise ValueError('Correction changed after dev-only freeze')
    kb = q.read(q.D / 'knowledge.json')
    cases = q.read(q.D / 'cases.json')
    results = {}
    for split in ['development', 'sealed']:
        rows = [q.score(c, corrected(c, kb), kb) for c in cases if c['split'] == split]
        results[split] = dict(summary=q.summarize(rows), perCase=rows)
    q.save(q.E / 'corrected-baseline.json', results)
    print(__import__('json').dumps({k: v['summary'] for k, v in results.items()}, indent=2))


if __name__ == '__main__':
    run()
