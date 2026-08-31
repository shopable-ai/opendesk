# gate_judge

Output JSON:
```json
{
  "node": "",
  "status": "pass|warn|fail",
  "hard_gate_failures": [],
  "score_breakdown": {},
  "can_proceed": false,
  "can_send": false,
  "retry_allowed": false,
  "human_gate_required": false,
  "repair_priority": [],
  "summary": ""
}
```

Rules:
- fail beats score
- warn may continue probe-only
- can_send requires identity + focus + draft + post-send readiness
