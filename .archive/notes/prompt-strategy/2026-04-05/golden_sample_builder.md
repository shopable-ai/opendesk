# golden_sample_builder

Output JSON:
```json
{
  "sample_id": "",
  "status": "candidate|verified|frozen|rejected",
  "copied_artifacts": [],
  "missing_artifacts": [],
  "provenance": {},
  "quality_risks": [],
  "needs_human_freeze": true,
  "summary": ""
}
```

Rules:
- never freeze automatically
- never overwrite a frozen sample
- reject visually similar but actionability-poor samples
