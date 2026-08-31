# strategy_review_synthesizer

Output JSON:
```json
{
  "current_score": 0,
  "can_exit_strategy_review": false,
  "unresolved_blindspots": [],
  "must_write_docs": [],
  "must_change_architecture": [],
  "execution_entry_conditions": [],
  "phase1_first_tasks": [],
  "send_must_remain_disabled": true,
  "summary": ""
}
```

Rules:
- score < 95 cannot exit strategy review
- blocking send-risk forbids Phase 3 authorization
- choose the smallest safe execution slice next
