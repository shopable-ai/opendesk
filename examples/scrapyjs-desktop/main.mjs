import {runDesktopHttp} from './desktop-http-adapter.mjs';

export async function main() {
  // The current Browser main has no published R2.2 transport schema. Execution.input
  // is an explicitly reviewed local projection, not an AI-supplied approval.
  if (Execution.env.OPENDESK_SCRAPYJS_LOCAL_APPROVAL !== 'READ_ONLY_GET' || !Execution.scriptPath) {
    throw new Error('E_LOCAL_APPROVAL_REQUIRED');
  }
  const result = await runDesktopHttp(Execution.input, {http, File, Execution}, {localOperatorApproved: true});
  console.log('[SCRAPYJS-DESKTOP] ' + JSON.stringify({
    executionId: result.executionId, status: result.status,
    requestedCount: result.requestedCount, completedCount: result.completedCount,
    errorCode: result.errorCode, receiptPath: result.receiptPath,
  }));
  if (result.status !== 'completed') throw new Error('E_DESKTOP_CAPTURE_' + result.status.toUpperCase());
}
