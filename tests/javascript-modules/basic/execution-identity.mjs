globalThis.__opendeskESMIdentityEvaluations =
  (globalThis.__opendeskESMIdentityEvaluations || 0) + 1;

export const moduleEvaluationCount = globalThis.__opendeskESMIdentityEvaluations;
export const moduleExecutionID = Execution.id;
