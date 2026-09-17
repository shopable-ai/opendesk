'use strict';

// This is the complete business entry point for the public .odflow example.
// Importing/installing the Flow does not execute this file. The result is
// written only after the user explicitly runs the installed Flow.
const message = File.read(Flow.resolve('assets/message.txt')).trim();
const result = {
  message,
  flowRoot: Flow.root,
  dataDir: Flow.dataDir,
  executed: true,
};

File.write(File.join(Flow.dataDir, 'result.json'), JSON.stringify(result, null, 2));
