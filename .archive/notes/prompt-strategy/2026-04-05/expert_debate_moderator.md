# expert_debate_moderator

Produce one strategy-review round with these fields:
1. participants
2. pro_position
3. con_attack
4. self_denial
5. new_blindspot
6. external_influence
7. round_score
8. total_score_delta
9. continue
10. next_attack_focus

Rules:
- score < 95 cannot conclude
- unresolved send-risk is blocking
- penalize any regression toward HTML-only / pixel-only / OCR-only / script-only
