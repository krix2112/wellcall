# Wellcall — Comprehensive System Documentation & Verification Report

> **Wellcall** is an AI-powered post-discharge patient follow-up and clinical intelligence platform. It combines real-time voice synthesis and speech-to-text, Groq LLM clinical field extraction, Qdrant Cloud semantic vector red-flag matching, deterministic clinical risk assessment, nurse notification dispatches, and live clinician web dashboards.

---

## 🔬 Monorepo Test Suite Results Summary

All test suites were executed across all workspace packages via Turborepo (`turbo run test` & `turbo run typecheck`).

```text
Tasks: 12 successful, 12 total
Cached: 7 cached, 12 total
Time: 7.93s
```

### Test Results Breakdown:

| Service Package | Test Suite File | Status | Test Cases Passed | Key Verified Capabilities |
| :--- | :--- | :---: | :---: | :--- |
| **`@wellcall/extraction`** | `claudeExtractor.test.ts` | **PASSED** | 3 / 3 | Groq LLM (`llama-3.3-70b-versatile`) tool-calling extraction of symptom, severity, mood, and medication adherence. |
| **`@wellcall/qdrant-memory`** | `redFlagMatcher.test.ts` | **PASSED** | 4 / 4 | Qdrant Cloud vector search, ONNX 384d MiniLM-L6-v2 embeddings, positive/paraphrased matches ($\ge 0.50$), negative matches ($< 0.50$), and strict cross-patient payload isolation. |
| **`@wellcall/risk-engine`** | `riskDecision.test.ts` | **PASSED** | 6 / 6 | Rules A through E deterministic risk evaluation (high-risk red flag match, severe severity, medium-risk match + moderate severity, med non-adherence, routine check-in). |
| **`@wellcall/shared-types`** | `tsc --noEmit` | **PASSED** | 12 / 12 | Monorepo-wide type safety and interface contracts. |
| **`@wellcall/audit-report`** | `tsc --noEmit` | **PASSED** | 12 / 12 | Compliance audit record assembly and ASCII report text formatting. |
| **`@wellcall/voice-pipeline`** | `demoRunner.test.ts` | **PASSED** | 2 / 2 | End-to-end fallback demo execution for routine log and high-risk nurse escalation scenarios. |
| **`@wellcall/dashboard`** | `tsc --noEmit` | **PASSED** | 12 / 12 | Next.js 14 clinician web application and Socket.io event client integration. |

---

## 🏛️ System Component Specifications

```text
wellcall/
├── packages/
│   └── shared-types/             # Central TypeScript interfaces (Patient, CallSession, RiskDecision, Escalation, AuditRecord)
├── services/
│   ├── extraction/               # Groq LLM (llama-3.3-70b-versatile) clinical field extractor
│   ├── qdrant-memory/            # Qdrant Cloud vector database + ONNX MiniLM-L6-v2 embeddings
│   ├── risk-engine/              # Deterministic clinical decision engine (Rules A-E)
│   ├── audit-report/             # Structured compliance report generator & ASCII text formatter
│   └── voice-pipeline/           # Fastify HTTP REST API (Port 3001), Socket.io server, & Twilio Nurse Alert handler
└── apps/
    └── dashboard/                # Next.js 14 Clinician Web Dashboard
```

---

## ⚖️ Risk Engine Deterministic Rule Hierarchy (`decideRisk.ts`)

| Rule | Trigger Condition | Action | Clinical Rationale |
| :---: | :--- | :---: | :--- |
| **Rule A** | High-Risk Qdrant Vector Match ($\text{score} \ge 0.50$) | `escalate` | Patient description matches known high-risk red flag (e.g., chest tightness post-CABG). |
| **Rule B** | Extracted `severity === 'severe'` | `escalate` | Patient reported severe symptom intensity regardless of vector match. |
| **Rule C** | Medium-Risk Match AND `severity === 'moderate'` | `escalate` | Moderate severity paired with secondary red flag indicator. |
| **Rule D** | Medication Non-Adherence (`medAdherence === 'no'`) + Active Symptoms | `escalate` | Skipped post-operative medication while experiencing active symptoms. |
| **Rule E** | No Red-Flag Match AND Low/None Severity | `log` | Routine post-discharge check-in; no risk indicators detected. |

---

## 📡 REST API & Gateway Endpoints (`services/voice-pipeline`)

- `GET /patients`: Retrieve list of all patient care plans.
- `GET /patients/:id`: Retrieve single patient profile by ID.
- `GET /patients/:id/calls`: Retrieve call history enriched with escalation outcomes.
- `GET /calls/:id`: Retrieve single call session with transcript entries.
- `GET /audit`: Retrieve all compliance audit records.
- `POST /demo/run?scenario=routine|escalation`: Trigger Fallback Demo Mode without voice hardware requirements.

---

## 📲 Telephony & Nurse Alert Dispatch (`notifyNurseSMS.ts`)

- **Service**: Integrated Twilio Node.js SDK.
- **Support**: Dispatches urgent alerts via **Twilio SMS** and **Twilio WhatsApp Sandbox**.
- **Fault-Tolerance**: Fully wrapped in non-blocking `try/catch` logic logging results (`[notifyNurseSMS] SMS sent successfully. SID: ...`) while guaranteeing gateway process stability.

---

## 🏁 Live Presentation Quickstart

1. **Start Gateway Server (Port 3001)**:
   ```powershell
   node services/voice-pipeline/dist/index.js
   ```
2. **Start Dashboard Web App (Port 3000)**:
   ```powershell
   pnpm --filter @wellcall/dashboard dev
   ```
3. **Trigger Escalation Demo**:
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:3001/demo/run?scenario=escalation&patientId=patient-01" -Method Post -ContentType "application/json" -Body "{}"
   ```
