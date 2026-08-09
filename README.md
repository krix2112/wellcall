# Wellcall 📞
> **Voice-First Post-Discharge Patient Check-in Agent with Semantic Red-Flag Escalation**

*Submitted to STARFORGE 2026 Hackathon — VoxForge Track*

---

## 1. One-Sentence Claim
**Wellcall is an AI-powered voice outreach agent that calls post-discharge patients, semantically matches spoken symptoms against personalized care plans stored in Qdrant vector memory, and immediately escalates critical recovery red flags to human nurses via a real-time gateway.**

---

## 2. Problem & Solution

### The Problem
Over 18% of hospital discharges result in preventable 30-day readmissions due to unmonitored recovery symptoms, missed discharge red flags, or lack of clinical follow-up bandwidth.

### The Solution
Wellcall automates post-discharge outreach using natural voice dialogue driven by Rime TTS and Deepgram STT. It extracts patient symptoms via Claude LLM tool use, matches them semantically against Qdrant care plan vectors, maintains cross-call memory via `sessionMemory.ts`, and broadcasts nurse escalations to the Next.js dashboard via Socket.io.

---

## 3. Architecture

```
+---------------------------------------------------------------------------------------------------+
| SINGLE LONG-RUNNING ORCHESTRATOR PROCESS (services/voice-pipeline/src/index.ts)                   |
|                                                                                                   |
|  +-----------------------------------+             +-------------------------------------------+  |
|  | Fastify + Socket.io Gateway Server|             | In-Process Logic Workspace Packages       |  |
|  | (Backed by SQLite db.ts)          |             | (Direct TypeScript function imports)      |  |
|  |                                   |             |                                           |  |
|  | REST Routes:                      |             | -> @wellcall/extraction (extractFields)   |  |
|  | - GET /patients                   |             | -> @wellcall/qdrant-memory (matchRedFlags)|  |
|  | - GET /patients/:id               |             | -> @wellcall/risk-engine (decideRisk)     |  |
|  | - GET /calls/:id                  |             | -> @wellcall/audit-report (generateReport)|  |
|  | - GET /audit                      |             +-------------------------------------------+  |
|  |                                   |                                  ^                         |
|  | Socket.io Events:                 |                                  | In-Process              |
|  | - transcript:new                  |                                  | Function Calls          |
|  | - escalation:new                  |                                  v                         |
|  | - call:status                     |             +-------------------------------------------+  |
|  +-----------------+-----------------+             | Call State Machine (callStateMachine.ts)  |  |
|                    ^                               +-------------------------------------------+  |
+--------------------|------------------------------------------------------------------------------+
                     |
                     | REST Reads & Socket.io Live Events ONLY
                     v
+---------------------------------------------------------------------------------------------------+
| Next.js Dashboard (apps/dashboard)                                                                |
| - LiveTranscript.tsx (renders on transcript:new)                                                  |
| - RiskFlagBanner.tsx (renders on escalation:new)                                                  |
| - CarePlanCard.tsx (from GET /patients/:id)                                                       |
| - CallHistoryTimeline.tsx                                                                         |
+---------------------------------------------------------------------------------------------------+
```

### Repo Structure

| Directory | Purpose |
| :--- | :--- |
| [`packages/shared-types`](file:///c:/krishna/wellcall/packages/shared-types) | **API Contract**: `Patient`, `CallSession`, `TranscriptEntry`, `ExtractedFields`, `RedFlagMatch`, `RiskDecision`, `Escalation`, Socket events |
| [`services/voice-pipeline`](file:///c:/krishna/wellcall/services/voice-pipeline) | **THE ORCHESTRATOR**: Single process running Fastify + Socket.io gateway & in-process pipeline calls |
| [`services/extraction`](file:///c:/krishna/wellcall/services/extraction) | Pure workspace package: Claude prompt-constrained tool extraction (`extractFields`) |
| [`services/qdrant-memory`](file:///c:/krishna/wellcall/services/qdrant-memory) | Pure workspace package: Qdrant vector store, standalone [`redFlagMatcher.ts`](file:///c:/krishna/wellcall/services/qdrant-memory/src/redFlagMatcher.ts), and explicit [`sessionMemory.ts`](file:///c:/krishna/wellcall/services/qdrant-memory/src/sessionMemory.ts) |
| [`services/risk-engine`](file:///c:/krishna/wellcall/services/risk-engine) | Pure workspace package: Clinical risk decision logic (`decideRisk`) |
| [`services/audit-report`](file:///c:/krishna/wellcall/services/audit-report) | Pure workspace package: Audit record & summary generator (`generateAuditReport`) |
| [`apps/dashboard`](file:///c:/krishna/wellcall/apps/dashboard) | Next.js nurse dashboard talking ONLY to the Gateway REST & Socket.io endpoints |
| [`data/synthetic-patients`](file:///c:/krishna/wellcall/data/synthetic-patients) | 4 synthetic patient records (`patient-01.json` through `patient-04.json`) |
| [`infra`](file:///c:/krishna/wellcall/infra) | Docker Compose for Qdrant vector storage + environment variables template |

---

## 4. How to Run Locally

```bash
cd wellcall

# Install dependencies across pnpm workspaces
pnpm install

# Copy environment variables configuration template
cp infra/env.example .env

# Start Qdrant vector storage container
docker-compose -f infra/docker-compose.yml up -d

# Run Orchestrator & Gateway Server
pnpm --filter @wellcall/voice-pipeline dev

# Run Nurse Dashboard
pnpm --filter @wellcall/dashboard dev
```

---

## 5. Proof of Functionality & Features
- **Runnable Unit Test**: [`redFlagMatcher.test.ts`](file:///c:/krishna/wellcall/services/qdrant-memory/src/redFlagMatcher.test.ts) exercises both positive cardiac red flag matching and negative benign recovery matching.
- **Explicit Memory Methods**: `sessionMemory.ts` provides explicit `getMemory`, `setMemory`, `correctMemory`, and `deleteMemory` methods.
- **Fake Mode Call State Machine**: `CallStateMachine` includes a built-in fake mode for immediate testing without active audio streams.

---

## 6. Technology Anchor & Innovation
- **Rime Coda Voice Integration**: Synthesizes warm, natural spoken dialogue with post-discharge patients.
- **Qdrant Vector Red-Flag Store**: Performs semantic distance vector matching between patient utterances and red-flag thresholds.
- **Single-Process Orchestration**: Eliminates inter-service network overhead while decoupling business logic into clean workspace packages.

---

## 7. Synthetic Data Disclosure
> [!IMPORTANT]
> **All patient records in this repository are 100% synthetic.**
> No real Protected Health Information (PHI) is used anywhere. See [`data/synthetic-patients/README.md`](file:///c:/krishna/wellcall/data/synthetic-patients/README.md) for compliance disclosures.

---

## 8. Limitations & Ethical Considerations
- **Triage Assistance Notice**: Wellcall is an automated outreach helper; it does not issue autonomous medical diagnoses.
- See [`docs/LIMITATIONS.md`](file:///c:/krishna/wellcall/docs/LIMITATIONS.md) for full clinical safety guidelines.

---

## 9. Team Contributions
- **Full-Stack Engineer 1**: Voice pipeline state machine, Deepgram STT, Rime TTS, and Fastify/Socket.io gateway.
- **Full-Stack Engineer 2**: Extraction Tool Use, Qdrant vector memory, and Risk Decision Engine.
- **Frontend Engineer**: Next.js dashboard pages (`page.tsx`, `patient/[id]/page.tsx`, `audit/page.tsx`).
- **UI/UX Designer**: React dashboard components (`LiveTranscript`, `RiskFlagBanner`, `CarePlanCard`, `CallHistoryTimeline`).

---

## 10. Demo Clip Link
- **Demo Video**: `[Insert YouTube / Loom Link Here]`

---

## License
[MIT License](file:///c:/krishna/wellcall/LICENSE)
