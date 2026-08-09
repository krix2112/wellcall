# Wellcall System Architecture

> **Architecture Overview: Monolithic Single-Process Orchestrator + Fastify/Socket.io Gateway**

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

## Critical Architecture Principles

1. **NO Microservices / NO Inter-Service HTTP**:
   - `extraction`, `qdrant-memory`, `risk-engine`, and `audit-report` are plain TypeScript workspace packages.
   - They expose exported functions ONLY. They do NOT run HTTP servers, call `listen()`, or use HTTP frameworks.

2. **Single Entry Point**:
   - `services/voice-pipeline/src/index.ts` is the single entry point that boots Fastify + Socket.io and calls workspace package functions in-process.

3. **Single Gateway Endpoint**:
   - `apps/dashboard` talks **ONLY** to the gateway running on Fastify + Socket.io.
