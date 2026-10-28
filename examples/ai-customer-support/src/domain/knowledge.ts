import { normalize } from './catalog';

export interface Knowledge {
  id: string; q: string; question: string; a: string; keys: string[];
  aliases: string[]; source: string; enabled: boolean; category: string;
  scope: string | null; eligible: boolean; eligibility: string;
}
export interface KnowledgeHit { k: Knowledge; exact: boolean; score: number }
export interface ReplyOption { id: string; name: string; symbol: string; text: string }

export const initialKnowledge = (): Knowledge[] => [
  {id:'k1',q:'签收后几天可以申请退款',question:'签收后几天可以申请退款',a:'演示规则：符合条件的实物订单可在签收后 7 天内申请退款。具体资格需按订单售后政策核实。',keys:['退款','退货','签收','售后'],aliases:['退款期限是多少','几天内可以退款','签收后 7 天内还能申请退款吗？'],source:'demo/after-sales.json',enabled:true,category:'售后',scope:null,eligible:true,eligibility:'预设演示知识（仍需精确匹配）'},
  {id:'k2',q:'如何申请电子发票',question:'请问能开发票吗？',a:'演示规则：符合开票条件的订单可以申请电子发票。请提供订单号，以便核实开票信息与具体流程。',keys:['发票','电子发票','开票'],aliases:['发票在哪里开','可以申请发票吗','能开发票吗'],source:'demo/finance.json',enabled:true,category:'财务',scope:null,eligible:true,eligibility:'预设演示知识（仍需精确匹配）'},
  {id:'k3',q:'物流进度怎么查询',question:'物流怎么查询？',a:'演示规则：提供订单编号后，客服可以协助查询物流轨迹。物流长时间没有更新，需要人工进一步核实。',keys:['物流','快递','配送','发货'],aliases:['快递怎么查','物流到哪里了'],source:'demo/shipping.md',enabled:true,category:'物流',scope:null,eligible:true,eligibility:'预设演示知识（仍需精确匹配）'},
  {id:'k4',q:'商品尺码如何选择',question:'商品如何选尺码？',a:'演示规则：请提供商品型号与尺码需求，由客服核对商品规格后给出建议，不承诺未核实的具体尺码。',keys:['商品','尺码','尺寸','规格'],aliases:['尺码推荐','这款商品多大码'],source:'demo/product.json',enabled:true,category:'商品',scope:null,eligible:false,eligibility:'需要商品上下文核实，暂不自动托管'},
  {id:'k5',q:'旧版优惠活动是否继续',question:'活动是否继续？',a:'演示规则：历史促销活动已经结束，旧版活动说明不能作为当前业务承诺。',keys:['活动','优惠','折扣'],aliases:['旧优惠还有吗'],source:'demo/old-campaign.md',enabled:false,category:'活动',scope:null,eligible:false,eligibility:'已停用，不参与知识匹配或自动托管'},
  {id:'k6',q:'A 方案支持多少成员',question:'A 方案支持几名成员？',a:'演示规则：A 方案最多支持 5 名成员，其他方案须按对应套餐说明确认。',keys:['A 方案','成员','人数'],aliases:['A 方案人数上限'],source:'demo/plans.json',enabled:true,category:'套餐',scope:'A 方案',eligible:false,eligibility:'限定适用范围，需明确确认套餐身份后才可使用'},
  {id:'k7',q:'人工客服在线时间',question:'人工客服什么时候在线？',a:'演示规则：人工客服服务时间为工作日 09:00–18:00，非工作时段可留言等待回复。',keys:['客服','人工','服务时间'],aliases:['人工几点上班','怎么转人工'],source:'demo/service.json',enabled:true,category:'服务',scope:null,eligible:true,eligibility:'预设演示知识（仍需精确匹配）'}
];
export function matchKnowledge(message: string | undefined, kb: readonly Knowledge[], observed: boolean): KnowledgeHit | null {
  if (!observed || !message?.trim()) return null;
  const input = normalize(message);
  const hits = kb.filter(k => k.enabled && !k.scope).map(k => {
    const exact = [k.question, ...k.aliases].some(a => normalize(a) === input);
    const similarity = k.keys.filter(key => normalize(key) && input.includes(normalize(key))).length;
    return { k, exact, score: exact ? 100 : similarity * 10 };
  }).filter(h => h.score > 0).sort((a, b) => b.score - a.score);
  return hits[0] || null;
}
export function replyOptions(hit: KnowledgeHit | null): ReplyOption[] {
  if (!hit) return [
    { id:'clarify', name:'继续确认', symbol:'?', text:'您好，为了准确帮您处理，能否补充订单号及具体情况？我会进一步核实。' },
    { id:'human', name:'人工核实', symbol:'♙', text:'您好，当前资料不足，无法确认具体处理规则，我会交由人工客服核实后回复您。' }
  ];
  return [
    { id:'accurate', name:'准确答复', symbol:'✓', text:'您好，' + hit.k.a },
    { id:'verify', name:'补充核实', symbol:'✦', text:'您好，根据演示资料：' + hit.k.a + ' 请提供相关订单号，以便人工核对实际适用条件。' },
    { id:'human', name:'人工核实', symbol:'♙', text:'您好，为避免信息有误，我先请人工客服核实您的订单情况，请稍候。' }
  ];
}
export function parseKnowledgeFile(raw: string, filename: string, currentCount: number, nextId: number): Knowledge[] {
  if (!/\.(json|md|markdown)$/i.test(filename) || raw.length > 262144) throw Error('仅支持 256KB 内的 JSON / Markdown');
  let rows: unknown;
  if (/\.json$/i.test(filename)) {
    const d = JSON.parse(raw);
    rows = Array.isArray(d) ? d : d?.entries || d?.items;
  } else {
    rows = raw.split(/^##\s+/m).slice(1).map(section => ({ question:section.split('\n')[0], answer:section.split('\n').slice(1).join('\n') }));
  }
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 100 || currentCount + rows.length > 150) throw Error('知识条目数量无效（1–100）');
  return rows.map((source: unknown, i: number): Knowledge => {
    const x = (source || {}) as Record<string, unknown>;
    const question = String(x.question || x.title || '').trim();
    const answer = String(x.answer || x.content || x.reply || '').trim();
    if (!question || !answer || question.length > 240 || answer.length > 2000) throw Error('第 ' + (i+1) + ' 条问答不符合要求');
    const aliases = Array.isArray(x.aliases) ? x.aliases.filter((v):v is string=>typeof v==='string').slice(0,20) : [];
    const keys = Array.isArray(x.keywords) ? x.keywords.filter((v):v is string=>typeof v==='string').slice(0,20) : question.split(/[\s，。？！?]/).filter(w=>w.length>1).slice(0,10);
    return { id:'k' + (nextId + i + 1), q:question, question, a:answer, keys, aliases,
      source:filename.slice(0,120), enabled:x.enabled !== false, category:String(x.category || x.group || '导入').slice(0,24),
      scope:typeof x.scope === 'string' ? x.scope : null, eligible:false,
      eligibility:'导入数据尚未经过托管资格审核，默认只提供推荐' };
  });
}
