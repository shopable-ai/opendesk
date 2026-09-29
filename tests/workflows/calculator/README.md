# Calculator workflow qualification tools

The existing `qualify.cjs` and `spec.json` are frozen to a historical r003 Candidate.
`check-current-candidate.cjs` checks a different historical r009 Candidate. Do not
retarget either for a newly produced Candidate.

From the repository root, after the S11 handoff is frozen, create an independent
S12 request under `.runtime/tests/agent-to-recipe/<task>/` and run:

```bash
node tests/workflows/calculator/fresh-qualification.cjs --check .runtime/tests/agent-to-recipe/<task>/s12-request.json --reviewed-source-sha256 <reviewed-source-sha256>
```

The request must contain `schemaVersion: "fresh-calculator-s12/v1"`, task root,
content-bound Producer freeze release/original source/TaskContract/Candidate/binary refs, exact production
command and working directory, all TaskContract `criterionId`s in
`requiredCriteria`, `requested` scope attested against the exact original source
ref, and predeclared
scenarios. Each scenario has an ID, `scopeRefs`, `criterionRefs`, input, Oracle,
independent observation, allowed side effects, and stop rule. Environment,
authorization, and budget are explicit. The tool checks release/source/dependency hashes,
binary and script resolution, and scenario coverage without touching the desktop.
It writes a separate freeze report under `.runtime/tests/workflows/calculator/fresh/`.
It is not a Fresh Run or Qualification PASS.

The normal S12 entry also requires a content-bound `stageReviewRef` in the
request. It invokes the Stage Guard for S11 → S12 before allowing a live attempt,
checks the TaskContract identity and the exact Candidate/source selected by S11,
and rejects missing, failed, stale or unrelated stage records. The review uses
the caller-controlled `repo` and `task` roots; evidence cannot add filesystem roots.
The postcheck repeats this guard against the same bound record. This authoring
requirement does not restrict running unrelated ordinary JavaScript. A passing
record still does not prove that its semantic reviews or live observations are true.

The S11 record must include the applicable artifact-chain report and its
`consumerVerification` descriptor/evaluator refs, even if its acceptance file
omits `requiredValidators`. Without the command-line reviewed-source hash the
entry remains read-only and refuses controlled execution. The explicit hash
authorizes execution of only those operator-reviewed bytes in the maintained
bounded host harness; Node `vm` is not a security sandbox and this option must
not be supplied for unreviewed code. Request or review JSON cannot grant that
authority. The harness uses synthetic inputs and no native desktop actions;
its observations are L1 evidence, not Fresh Runs. The gate records each new
controlled observation separately and binds the evaluator version.

The gate accepts the supported `-script <file>` or `ai run <file>` command form
and checks its trailing options. Repeated or alternative script sources and
unsupported entry arguments are rejected. API refs must bind a file or a nonempty
set of source ranges with valid line bounds and matching source hashes; an empty
range list cannot stand in for a canonical API contract.

After the live attempt, run `--postcheck <same-request.json> <pre-run-freeze-check.json> --reviewed-source-sha256 <same-reviewed-source-sha256>`;
it reopens all frozen files and rejects changed request, source, binary, contract,
or dependency bytes. A saved pre-run digest alone is insufficient.

`fresh-witness.js` is a read-only Runtime observer for an authorized S12 live
attempt. It captures each observed Calculator display transition without expected
numbers; the evaluator correlates first and final result evidence after the exact
Candidate run. Run it only when the desktop is released for S12, using the same
frozen Runtime binary and a separate execution. Unknown input or observation state
stops the attempt; never replay an uncertain prefix.

The witness records the actual initial display (which may be a prior result)
and announces readiness without input. It must then observe a clean zero before
counting this run's first input, followed by a separate clear and later result.
The initial value never becomes this run's `firstResult`; the evaluator correlates
observations with the exact Candidate receipts after execution. Declare this
observer policy and freeze the witness hash in the qualification request before
running it. No preparation click is hidden inside the read-only witness.
