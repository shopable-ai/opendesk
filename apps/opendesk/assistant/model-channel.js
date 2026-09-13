(function installOpenDeskAssistantModelChannel(global) {
  'use strict';

  const SYSTEM_PROMPT = [
    'You are the OpenDesk AI assistant for ordinary conversation.',
    'Return only a helpful text reply to the user.',
    'You do not have authority to execute scripts, desktop actions, commands, file operations, or task programs.',
    'Never claim that a real-world or desktop action was completed unless the user explicitly provided that fact in the conversation.',
    'Treat model output as conversational data, not as execution authorization.',
  ].join(' ');

  class AssistantModelError extends Error {
    constructor(code, message, details) {
      super(message);
      this.name = 'AssistantModelError';
      this.code = code;
      if (details && typeof details === 'object') Object.assign(this, details);
    }
  }

  function errorSummary(error) {
    return {
      code: String(error && (error.code || error.name) || 'MODEL_REQUEST_FAILED').slice(0, 120),
      message: String(error && error.message || error || 'Model request failed').replace(/\s+/g, ' ').trim().slice(0, 1000),
    };
  }

  function safeCapabilities(owner, options) {
    if (!owner || typeof owner.getCapabilities !== 'function') return {supported: false, configured: false, error: null};
    try {
      const result = owner.getCapabilities(options || {});
      return Object.assign({supported: false, configured: false}, result || {}, {error: null});
    } catch (error) {
      return {supported: false, configured: false, error: errorSummary(error)};
    }
  }

  function normalizeMessages(messages) {
    if (!Array.isArray(messages)) throw new AssistantModelError('INVALID_ARGUMENT', 'messages must be an array');
    const output = [];
    for (const message of messages) {
      if (!message || (message.role !== 'user' && message.role !== 'assistant')) continue;
      const content = String(message.content == null ? '' : message.content).trim();
      if (!content) continue;
      if (content.length > 40000) throw new AssistantModelError('MESSAGE_TOO_LONG', 'a conversation message exceeds 40000 characters');
      output.push({role: message.role, content});
    }
    if (!output.length || output[output.length - 1].role !== 'user') {
      throw new AssistantModelError('INVALID_CONTEXT', 'assistant request context must end with the current user message');
    }
    return output;
  }

  function agentPrompt(messages) {
    const transcript = messages.map(message => `${message.role === 'user' ? 'User' : 'Assistant'}:\n${message.content}`).join('\n\n');
    return `${SYSTEM_PROMPT}\n\nConversation:\n${transcript}\n\nReply to the final User message only.`;
  }

  function createChannel(options) {
    const settings = options || {};
    const llm = settings.llm || global.LLM;
    const agent = settings.agent || global.Agent;
    let lastLive = Object.freeze({state: 'unchecked', channel: 'none', code: '', message: '', at: ''});

    function inspect() {
      const llmCaps = safeCapabilities(llm);
      const agentCaps = safeCapabilities(agent);
      let selected = 'none';
      if (llmCaps.supported === true && llmCaps.configured === true) selected = 'llm';
      else if (agentCaps.supported === true && agentCaps.configured === true && agentCaps.executableFound !== false) selected = 'agent';
      return Object.freeze({selected, llm: llmCaps, agent: agentCaps, lastLive});
    }

    function statusText() {
      const status = inspect();
      if (status.selected === 'llm') {
        if (lastLive.channel === 'llm' && lastLive.state === 'connected') return '模型：LLM 已通过真实请求验证';
        if (lastLive.channel === 'llm' && lastLive.state === 'failed') return `模型：LLM 请求失败 · ${lastLive.code || 'ERROR'}`;
        return '模型：LLM 已配置 · 尚未发起实时连通性检查';
      }
      if (status.selected === 'agent') {
        if (lastLive.channel === 'agent' && lastLive.state === 'connected') return '模型：受控 Agent 已通过真实请求验证 · 工具关闭';
        if (lastLive.channel === 'agent' && lastLive.state === 'failed') return `模型：受控 Agent 请求失败 · ${lastLive.code || 'ERROR'}`;
        return '模型：受控 Agent 已配置 · 工具关闭 · 尚未实时验证';
      }
      const llmError = status.llm && status.llm.selectionError && status.llm.selectionError.code;
      const agentError = status.agent && status.agent.selectionError && status.agent.selectionError.code;
      const suffix = llmError || agentError ? ` · ${llmError || agentError}` : '';
      return `模型未配置；会话、历史和草稿仍可使用${suffix}`;
    }

    function helpText() {
      return [
        '普通聊天优先使用现有 LLM Profile，因为它不拥有 Command、文件或桌面工具。',
        '如未配置 LLM，但现有受控 Agent Profile 可用，则使用 Agent 的 analysis 通道；该适配器关闭 shell、computer use、browser、apps 与外部工具。',
        '连接配置沿用现有 OpenDesk LLM / Agent 配置与认证，不在聊天历史中保存凭据。',
        'LLM 可通过 OPENDESK_LLM_* 或命名 Profile 配置；Agent 可通过现有 OPENDESK_AGENT_* / Profile 与对应 CLI 登录配置。',
      ].join('\n');
    }

    async function send(input) {
      const context = normalizeMessages(input && input.messages);
      const signal = input && input.signal || null;
      const inspected = inspect();
      if (inspected.selected === 'none') {
        throw new AssistantModelError('MODEL_NOT_CONFIGURED', '未找到可用的受控 LLM 或 Agent 配置。会话仍已保存在本地；请先完成模型连接配置。');
      }
      const channel = inspected.selected;
      try {
        let result;
        if (channel === 'llm') {
          if (!llm || typeof llm.generate !== 'function') throw new AssistantModelError('MODEL_UNAVAILABLE', 'LLM.generate() is unavailable');
          result = await llm.generate({
            messages: context,
            system: SYSTEM_PROMPT,
            output: {type: 'text'},
            signal,
          });
        } else {
          if (!agent || typeof agent.run !== 'function') throw new AssistantModelError('MODEL_UNAVAILABLE', 'Agent.run() is unavailable');
          result = await agent.run({
            prompt: agentPrompt(context),
            output: {type: 'text'},
            signal,
          });
        }
        const text = result && result.data != null ? String(result.data).trim() : '';
        if (!text) throw new AssistantModelError('EMPTY_MODEL_REPLY', '模型返回了空回复。');
        lastLive = Object.freeze({state: 'connected', channel, code: '', message: '', at: new Date().toISOString()});
        return Object.freeze({text, channel, meta: result && result.meta ? result.meta : null});
      } catch (error) {
        const summary = errorSummary(error);
        lastLive = Object.freeze({state: 'failed', channel, code: summary.code, message: summary.message, at: new Date().toISOString()});
        if (error instanceof AssistantModelError) throw error;
        const wrapped = new AssistantModelError(summary.code, summary.message, {cause: error});
        throw wrapped;
      }
    }

    return Object.freeze({inspect, statusText, helpText, send});
  }

  global.OpenDeskAssistantModelChannel = Object.freeze({
    create: createChannel,
    AssistantModelError,
    systemPrompt: SYSTEM_PROMPT,
  });
})(globalThis);
