const ROOT_KEYS = Object.freeze([
  'schemaVersion',
  'kind',
  'task',
  'buttons',
  'multiplier',
  'message',
]);

export const TASK_IDS = Object.freeze({
  PRESS_AND_READ: 'calculator.pressAndRead',
  TWO_STAGE: 'calculator.twoStage',
});

export const TASK_LIMITS = Object.freeze({
  maxPromptChars: 4096,
  minButtons: 3,
  maxButtons: 64,
  maxOperandDigits: 12,
  maxMessageChars: 1200,
});

const ALLOWED_KINDS = new Set(['task', 'clarify', 'unsupported']);
const ALLOWED_TASKS = new Set(Object.values(TASK_IDS));
const ALLOWED_BUTTONS = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '+', '-', '×', '=']);

// Keep the native schema deliberately inside the Runtime's conservative JSON
// Schema subset. Semantic constraints are repeated by validateTaskEnvelope().
export const PLANNER_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: Object.freeze({
    schemaVersion: Object.freeze({type: 'integer', enum: Object.freeze([1])}),
    kind: Object.freeze({type: 'string', enum: Object.freeze(['task', 'clarify', 'unsupported'])}),
    task: Object.freeze({type: 'string'}),
    buttons: Object.freeze({type: 'array', items: Object.freeze({type: 'string'})}),
    multiplier: Object.freeze({type: 'string'}),
    message: Object.freeze({type: 'string'}),
  }),
  required: ROOT_KEYS,
  additionalProperties: false,
});

export class TaskContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'TaskContractError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new TaskContractError(code, message);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function exactKeys(value) {
  const actual = Object.keys(value).sort();
  const expected = [...ROOT_KEYS].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function validateButtons(buttons) {
  if (!Array.isArray(buttons)) fail('INVALID_BUTTONS', 'buttons must be an array');
  if (buttons.length < TASK_LIMITS.minButtons || buttons.length > TASK_LIMITS.maxButtons) {
    fail('INVALID_BUTTON_COUNT', `buttons must contain ${TASK_LIMITS.minButtons}-${TASK_LIMITS.maxButtons} items`);
  }
  for (const button of buttons) {
    if (typeof button !== 'string' || button.length !== 1 || !ALLOWED_BUTTONS.has(button)) {
      fail('UNSUPPORTED_BUTTON', `unsupported Calculator button: ${JSON.stringify(button)}`);
    }
  }

  const equalsIndexes = [];
  for (let index = 0; index < buttons.length; index += 1) {
    if (buttons[index] === '=') equalsIndexes.push(index);
  }
  if (equalsIndexes.length !== 1 || equalsIndexes[0] !== buttons.length - 1) {
    fail('INVALID_EQUALS', 'buttons must contain exactly one trailing equals sign');
  }

  const body = buttons.slice(0, -1);
  let expectingOperand = true;
  let operandDigits = 0;
  let operatorCount = 0;
  for (let index = 0; index < body.length; index += 1) {
    const token = body[index];
    const digit = /^\d$/.test(token);
    if (expectingOperand) {
      if (!digit) fail('INVALID_EXPRESSION', 'an operand must start with a digit');
      operandDigits = 1;
      expectingOperand = false;
      continue;
    }
    if (digit) {
      operandDigits += 1;
      if (operandDigits > TASK_LIMITS.maxOperandDigits) {
        fail('OPERAND_TOO_LONG', `each operand is limited to ${TASK_LIMITS.maxOperandDigits} digits`);
      }
      continue;
    }
    if (token !== '+' && token !== '-' && token !== '×') {
      fail('INVALID_EXPRESSION', `unsupported operator: ${JSON.stringify(token)}`);
    }
    operatorCount += 1;
    expectingOperand = true;
    operandDigits = 0;
  }
  if (expectingOperand) fail('INVALID_EXPRESSION', 'expression is missing its final operand');
  if (operatorCount < 1) fail('INVALID_EXPRESSION', 'expression must contain at least one binary operation');
}

function validateNonTask(envelope) {
  if (envelope.task !== '') fail('NON_TASK_ACTION', 'clarify/unsupported task must be empty');
  if (!Array.isArray(envelope.buttons) || envelope.buttons.length !== 0) {
    fail('NON_TASK_ACTION', 'clarify/unsupported buttons must be empty');
  }
  if (envelope.multiplier !== '') fail('NON_TASK_ACTION', 'clarify/unsupported multiplier must be empty');
  if (envelope.message.trim() === '') fail('INVALID_MESSAGE', 'clarify/unsupported message must explain the next step');
}

export function validateUserRequest(text) {
  if (typeof text !== 'string') fail('INVALID_PROMPT', 'task request must be a string');
  const value = text.trim();
  if (value === '') fail('EMPTY_PROMPT', '请输入要执行的计算任务。');
  if (value.length > TASK_LIMITS.maxPromptChars) {
    fail('PROMPT_TOO_LONG', `任务描述最多 ${TASK_LIMITS.maxPromptChars} 个字符。`);
  }
  return value;
}

export function validateTaskEnvelope(value) {
  if (!isPlainObject(value)) fail('INVALID_ENVELOPE', 'planner output must be a plain object');
  if (!exactKeys(value)) fail('UNKNOWN_FIELD', `planner output must contain exactly: ${ROOT_KEYS.join(', ')}`);
  if (value.schemaVersion !== 1) fail('UNSUPPORTED_SCHEMA_VERSION', 'schemaVersion must be 1');
  if (typeof value.kind !== 'string' || !ALLOWED_KINDS.has(value.kind)) fail('INVALID_KIND', 'invalid planner kind');
  if (typeof value.task !== 'string') fail('INVALID_TASK', 'task must be a string');
  if (typeof value.multiplier !== 'string') fail('INVALID_MULTIPLIER', 'multiplier must be a string');
  if (typeof value.message !== 'string' || value.message.length > TASK_LIMITS.maxMessageChars) {
    fail('INVALID_MESSAGE', `message must be a string no longer than ${TASK_LIMITS.maxMessageChars} characters`);
  }

  if (value.kind !== 'task') {
    validateNonTask(value);
    return value;
  }

  if (!ALLOWED_TASKS.has(value.task)) fail('UNSUPPORTED_TASK', `unsupported task: ${JSON.stringify(value.task)}`);
  validateButtons(value.buttons);

  if (value.task === TASK_IDS.PRESS_AND_READ) {
    if (value.multiplier !== '') fail('INVALID_MULTIPLIER', 'calculator.pressAndRead multiplier must be empty');
  } else if (!/^\d{1,12}$/.test(value.multiplier)) {
    fail('INVALID_MULTIPLIER', 'calculator.twoStage multiplier must be a 1-12 digit non-negative integer string');
  }

  return value;
}

export function freezeTaskEnvelope(value) {
  validateTaskEnvelope(value);
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    kind: value.kind,
    task: value.task,
    buttons: Object.freeze([...value.buttons]),
    multiplier: value.multiplier,
    message: value.message,
  });
}

export function buildTrustedPreview(value) {
  validateTaskEnvelope(value);
  if (value.kind !== 'task') return value.message;
  const first = value.buttons.join(' ');
  if (value.task === TASK_IDS.PRESS_AND_READ) {
    return `将清空当前计算器输入。随后按顺序点击：${first}。最后只从计算器显示区读取真实结果。`;
  }
  const multiplier = value.multiplier.split('').join(' ');
  return [
    '将清空当前计算器输入。',
    `第一段按顺序点击：${first}。`,
    '从显示区读取本次 firstResult；读取失败、歧义或格式不支持时立即停止。',
    `再次清空后点击：${multiplier} × [本次实际 firstResult 的逐位数字] =。`,
    '最后再次从显示区读取 finalResult。',
  ].join('\n');
}
