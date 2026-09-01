// Pure helpers shared by the coverage gate and its negative conformance tests.
globalThis.RuntimeAPICoverageValidation = (() => {
  function gatePassed(name, gate) {
    if (!gate || gate.status !== 'passed') return false;
    if (name !== 'custom-ui') return true;
    return gate.behaviorStatus === 'passed'
      && gate.postSuite && gate.postSuite.status === 'passed'
      && gate.postSuite.finalized === true
      && gate.postSuite.noResidualProcesses === 'passed';
  }

  function passedTestRecords(gates) {
    return Object.entries(gates)
      .filter(([name, gate]) => gatePassed(name, gate))
      .flatMap(([, gate]) => (gate.tests || []).filter((test) => test.status === 'passed'));
  }

  function requiredGateNames(manifest) {
    return Array.from(new Set(manifest.flatMap((entry) => entry.requiredVerificationTiers))).sort();
  }

  function failedRequiredGates(manifest, gateStatuses) {
    return requiredGateNames(manifest)
      .filter((gate) => gateStatuses[gate] !== 'passed')
      .map((gate) => ({ gate, status: gateStatuses[gate] || 'missing' }));
  }

  return { gatePassed, passedTestRecords, requiredGateNames, failedRequiredGates };
})();
