# Limitations & Known Constraints

## Scope & Architecture
Wellcall is a **voice-first triage & escalation system** for post-discharge patient check-ins. It is **not a diagnostic tool** and should never replace clinical judgment.

## Known Limitations (This Hackathon Build)

### 1. Rime TTS (Voice Output) — Stubbed
- **Status**: Rime API integration is currently a stub (returns empty buffer, no real audio output)
- **Fallback**: In live demos, the system narrates escalations via text-to-speech locally or pre-recorded audio samples
- **Real Implementation**: Full Rime integration (Coda model, real API calls, live voice synthesis) remains as future work

### 2. False Negatives Risk (Semantic Red-Flag Matching)
- The Qdrant vector matcher has a 0.50 similarity threshold, tuned on 4 synthetic patients
- Real-world paraphrasing or unusual symptom phrasing may not match stored red flags
- **Mitigation**: When in doubt, the system escalates; human nurses review all escalations before action

### 3. Real-Time Multi-Patient Concurrency
- Current build handles single active call per session
- Scaling to multiple concurrent calls requires session isolation per patient ID (architectural, not blocked)

### 4. Audit Trail Completeness
- Audit records capture: transcript, extraction, Qdrant match, risk decision, escalation reason
- Missing from audit: actual nurse actions post-escalation (handled externally)

## What's Proven & Production-Ready
- ✅ Speech-to-text via Deepgram (real mic input, real transcripts)
- ✅ LLM extraction via Groq (structured field parsing, context-aware)
- ✅ Semantic red-flag matching via Qdrant (0.6595 similarity demonstrated, catches paraphrased critical symptoms)
- ✅ Deterministic risk engine with 5-rule escalation logic (tested on 6+ scenarios)
- ✅ Real-time socket-based escalation to clinician dashboard
- ✅ Persistent audit trail (JSON export + human-readable summaries)

## Recommended Real-World Next Steps
1. Clinical validation: test on 20+ real patient conversations with domain experts
2. Integrate actual EHR/CRM systems (Zoho, HubSpot, Salesforce)
3. Add persistent session storage & multi-patient concurrency
4. Implement Rime TTS for full voice output
5. Deploy behind HIPAA-compliant infrastructure
