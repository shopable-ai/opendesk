import historyFixture from '../../fixtures/customer-history-demo.json';
import type { CustomerId } from './catalog';
import { isCustomerId } from './catalog';

export type HistoryMessage = { messageId:string; role:'customer'|'agent'; text:string; at:string };
export type HistorySession = { sessionId:string; messages:HistoryMessage[] };
export type HistoryByCustomer = Record<CustomerId, HistorySession[]>;
export type FactStatus = 'candidate'|'confirmed'|'dismissed';
export type ProfileFact = {id:string; customerId:CustomerId;category:string;value:string;evidence:string;sessionId:string;messageId:string;at:string;status:FactStatus;method:string};

export function initialHistory(): HistoryByCustomer {
  return {
    t1:[{sessionId:'seed-t1',messages:[
      {messageId:'seed-t1-01',role:'customer',text:'我更喜欢蓝色的款式，有的话可以优先发蓝色。',at:'2026-10-23'},
      {messageId:'seed-t1-02',role:'customer',text:'以后优先短信通知我，我不太方便接电话。',at:'2026-10-24'}
    ]}],
    t2:[{sessionId:'seed-t2',messages:[
      {messageId:'seed-t2-01',role:'customer',text:'我希望尽量安排周末配送。',at:'2026-10-23'},
      {messageId:'seed-t2-02',role:'customer',text:'物流进度有变动请优先短信通知。',at:'2026-10-24'}
    ]}],
    t3:[{sessionId:'seed-t3',messages:[
      {messageId:'seed-t3-01',role:'customer',text:'我平时穿 M 码，买之前想看尺码表。',at:'2026-10-23'},
      {messageId:'seed-t3-02',role:'customer',text:'我更喜欢简洁的款式。',at:'2026-10-24'}
    ]}]
  };
}
const rules = [
  {key:'blue',category:'商品偏好',value:'偏好蓝色',pattern:/更喜欢蓝色|喜欢蓝色|偏好蓝色/},
  {key:'black',category:'商品偏好',value:'偏好黑色',pattern:/更喜欢黑色|喜欢黑色|偏好黑色/},
  {key:'brief',category:'风格偏好',value:'倾向简洁款式',pattern:/喜欢简洁|偏好简洁|更喜欢简洁/},
  {key:'sms',category:'沟通偏好',value:'优先短信联系',pattern:/优先短信|短信通知|短信联系/},
  {key:'no-call',category:'沟通限制',value:'不方便接电话',pattern:/不(?:太)?方便接电话|不想接电话/},
  {key:'weekend',category:'配送偏好',value:'希望周末配送',pattern:/周末配送|周末送货|周末安排配送/},
  {key:'size-m',category:'尺码信息',value:'通常穿 M 码',pattern:/通常穿\s*M\s*码|平时穿\s*M\s*码/i},
  {key:'size-l',category:'尺码信息',value:'通常穿 L 码',pattern:/通常穿\s*L\s*码|平时穿\s*L\s*码/i},
  {key:'size-chart',category:'选购习惯',value:'购前希望看尺码表',pattern:/想看尺码表|先看尺码表|发我尺码表/}
];
const sensitive = /身份证号|银行卡号|密码|验证码|宗教|政治立场|医疗诊断/;
export function extractFacts(history: HistoryByCustomer, previous: readonly ProfileFact[]): ProfileFact[] {
  const next = [...previous], seen = new Set(next.map(f=>f.id));
  for (const id of ['t1','t2','t3'] as const) {
    for (const session of history[id]) for (const message of session.messages) {
      if (message.role !== 'customer' || !message.text || sensitive.test(message.text)) continue;
      for (const rule of rules) {
        if (!rule.pattern.test(message.text)) continue;
        const key = [id, session.sessionId, message.messageId, rule.key].join('/');
        if (seen.has(key)) continue;
        next.push({id:key,customerId:id,category:rule.category,value:rule.value,evidence:message.text,
          sessionId:session.sessionId,messageId:message.messageId,at:message.at||'日期未提供',
          status:'candidate',method:'演示规则匹配'});
        seen.add(key);
      }
    }
  }
  return next;
}
export function parseHistoryFile(raw: string): HistoryByCustomer {
  const d = JSON.parse(raw);
  if (!d || d.schemaVersion !== 1 || d.format !== 'opendesk.ai-customer-support.customer-history-demo' ||
      d.demo !== true || !Array.isArray(d.customers) || !d.customers.length || d.customers.length > 10) {
    throw Error('需要 customer-history-demo v1 JSON，且必须标记 demo:true');
  }
  const result: HistoryByCustomer = {t1:[],t2:[],t3:[]};
  let count = 0;
  for (const customer of d.customers) {
    if (!isCustomerId(customer?.customerId) || !Array.isArray(customer.sessions) ||
      !customer.sessions.length || customer.sessions.length > 30) throw Error('未知客户或历史会话结构无效');
    for (const session of customer.sessions) {
      if (!/^[-_a-zA-Z0-9]{1,80}$/.test(session?.sessionId) ||
          !Array.isArray(session.messages) || session.messages.length > 180) throw Error('会话标识或消息数量无效');
      const messages: HistoryMessage[] = [];
      for (const m of session.messages) {
        count++;
        if (count > 360 || !/^[-_a-zA-Z0-9]{1,80}$/.test(m?.messageId) ||
          !['customer','agent'].includes(m?.role) || typeof m?.text !== 'string' ||
          !m.text.trim() || m.text.length > 600 || m.text.includes('\0') ||
          (m.at !== undefined && (typeof m.at !== 'string' || m.at.length > 32))) throw Error('历史消息字段无效');
        messages.push({messageId:m.messageId,role:m.role,text:m.text.trim(),at:m.at||''});
      }
      result[customer.customerId as CustomerId].push({sessionId:session.sessionId,messages});
    }
  }
  return result;
}
export function mergeHistory(original: HistoryByCustomer, imported: HistoryByCustomer): HistoryByCustomer {
  const next = structuredClone(original);
  for (const id of ['t1','t2','t3'] as const) {
    for (const session of imported[id]) {
      let target = next[id].find(s=>s.sessionId===session.sessionId);
      if (!target) { target={sessionId:session.sessionId,messages:[]}; next[id].push(target); }
      const ids = new Set(target.messages.map(m=>m.messageId));
      for (const m of session.messages) if (!ids.has(m.messageId)) {target.messages.push(m); ids.add(m.messageId);}
    }
  }
  return next;
}
const escapeMd = (value:unknown) => String(value??'').replace(/[\\`*_[\]<>]/g,'\\$&').replace(/[\r\n]+/g,' ').trim();
export function profileMarkdown(customerName:string, customerId:CustomerId, boundId:CustomerId,
                                history:HistoryByCustomer, facts:readonly ProfileFact[]):string {
  const entries = facts.filter(f=>f.customerId===customerId);
  const confirmed=entries.filter(f=>f.status==='confirmed').length;
  const candidates=entries.filter(f=>f.status==='candidate').length;
  const lines=['# '+escapeMd(customerName),'','> 客户档案（演示） · '+(customerId===boundId?'当前会话':'浏览其他客户'),
    '','## 客户摘要','',confirmed?'已确认 '+confirmed+' 条信息，'+candidates+' 条待核实。':'有 '+candidates+' 条历史线索，尚无人工确认的信息。',''];
  for (const [status,heading] of [['confirmed','已确认信息'],['candidate','待核实线索'],['dismissed','已忽略信息']] as const) {
    const group=entries.filter(f=>f.status===status);if(!group.length)continue;
    lines.push('## '+heading,'');
    for(const f of group)lines.push('- **'+escapeMd(f.category)+'**：'+escapeMd(f.value),
      '  - 原话：'+escapeMd(f.evidence),'  - 来源：'+escapeMd(f.at)+' · '+escapeMd(f.sessionId)+' / '+escapeMd(f.messageId));
    lines.push('');
  }
  lines.push('## 历史对话','');
  const messages=history[customerId].flatMap(s=>s.messages.filter(m=>m.role==='customer').map(m=>({at:m.at,sessionId:s.sessionId,text:m.text})));
  if(!messages.length)lines.push('暂无客户原话。');
  for(const m of messages.slice(-12).reverse())lines.push('- '+escapeMd(m.at)+' · '+escapeMd(m.sessionId)+'：'+escapeMd(m.text));
  lines.push('','> 以上为当前浏览器演示数据生成的只读 Markdown，尚未保存为实际 .md 文件。');
  return lines.join('\n');
}
export const bundledHistoryFixture = historyFixture; // 原文件供导入测试，不预填真实客户档案
