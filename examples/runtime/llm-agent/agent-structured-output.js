'use strict';

const result = await Agent.run({
  prompt: '返回一个 5 到 15 的整数。',
  output: {
    type: 'json',
    name: 'integer_5_to_15',
    validation: 'native',
    schema: {
      type: 'object',
      properties: {
        value: {type: 'integer', minimum: 5, maximum: 15},
      },
      required: ['value'],
      additionalProperties: false,
    },
  },
});

console.log(result.data);
