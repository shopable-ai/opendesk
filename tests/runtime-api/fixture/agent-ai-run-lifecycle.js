'use strict';

const directory = Execution.env.OPENDESK_AGENT_LIFECYCLE_DIR;
const prompt = Execution.env.OPENDESK_AGENT_LIFECYCLE_PROMPT;
const resultPath = Execution.env.OPENDESK_AGENT_LIFECYCLE_RESULT;

if (!directory || !prompt) throw new Error('Agent lifecycle fixture environment is incomplete');
File.ensureDir(directory);

const result = await Agent.run({prompt, cwd: directory});
if (resultPath) {
  await File.writeJSON(resultPath, {data: result.data, meta: result.meta}, {
    spaces: 2,
    createDirs: true,
  });
}
