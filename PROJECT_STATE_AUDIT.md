# Wellcall — Comprehensive Project Audit & Technical Blueprint

> **Wellcall** is an AI-powered post-discharge patient voice check-in gateway. It automatically monitors post-operative patients, transcribes patient speech, extracts clinical symptoms via Groq LLM, matches red flags against Qdrant Cloud vector search, evaluates risk deterministically, notifies on-call nurses via Twilio, and renders live alerts on a Clinician Dashboard.

---

## 🏛️ Project Architecture & File Directory Map

```text
wellcall/
├── apps/
│   └── dashboard/                        # Next.js 14 Web Application (Port 3000)
│       ├── app/
│       │   ├── page.tsx                  # Main Clinician Dashboard Home Page
│       │   ├── layout.tsx                # Root layout with Header & Navigation
│       │   ├── globals.css               # Global dark theme CSS rules
│       │   ├── mic/
│       │   │   └── page.tsx              # Live Browser Microphone Audio Stream Page
│       │   ├── audit/
│       │   │   └── page.tsx              # Compliance Audit Report Log Page
│       │   └── patient/[id]/
│       │       └── page.tsx              # Patient Care Plan Detail Page
│       ├── components/
│       │   ├── CarePlanCard.tsx          # Patient profile, prescribed meds & red flags
│       │   ├── CallHistoryTimeline.tsx   # Cross-call timeline & call status history
│       │   ├── LiveTranscript.tsx        # Real-time transcript stream (Socket.io)
│       │   └── RiskFlagBanner.tsx        # Pulsing red risk escalation banner
│       └── lib/
│           └── apiClient.ts              # REST API & Socket.io client wrapper
├── packages/
│   └── shared-types/                     # Monorepo Shared TypeScript Interfaces
│       └── src/index.ts                  # Patient, Escalation, Transcript, Socket event definitions
└── services/
    ├── extraction/                       # Groq LLM Field Extraction & Dialogue Generator
    │   └── src/
    │       ├── claudeExtractor.ts        # Groq llama-3.3-70b tool-calling extractor
    │       └── responseGenerator.ts      # Conversational response builder
    ├── qdrant-memory/                    # Vector Database & Embedding Search
    │   └── src/
    │       ├── qdrantClient.ts           # Qdrant Cloud client initialization
    │       ├── embeddings.ts             # Local ONNX Xenova/all-MiniLM-L6-v2 (384d)
    │       ├── redFlagMatcher.ts         # Semantic similarity matching (Threshold 0.50)
    │       ├── carePlanStore.ts          # Seed & store red-flag vectors
    │       └── sessionMemory.ts          # Cross-call persistent memory store
    ├── risk-engine/                      # Clinical Decision Engine
    │   └── src/
    │       └── riskDecision.ts           # Rules A-E deterministic decision logic
    ├── audit-report/                     # Compliance & Audit Logging
    │   └── src/
    │       ├── reportGenerator.ts        # Structured AuditRecord builder
    │       └── textFormatter.ts          # Human-readable ASCII audit report formatter
    └── voice-pipeline/                   # Core Backend Server (Port 3001)
        └── src/
            ├── index.ts                  # Fastify server entry point & demo controller
            ├── callStateMachine.ts       # Live dialogue call state orchestrator
            ├── sttClient.ts              # Deepgram Nova-2 streaming STT wrapper
            ├── rimeClient.ts             # Rime TTS voice synthesis wrapper
            ├── telephonyClient.ts        # WebRTC telephony session stub
            ├── notifyNurseSMS.ts         # Twilio SMS / WhatsApp alert dispatcher
            └── gateway/
                ├── server.ts             # Fastify REST endpoints & CORS configuration
                ├── socket.ts             # Socket.io server & mic streaming handler
                └── db.ts                 # JSON file-backed gateway database (wellcall.db.json)
```

---

## ✅ What is 100% WORKING & WIRED UP

1. **Groq LLM Field Extraction (`@wellcall/extraction`)**:
   - Uses `llama-3.3-70b-versatile` via OpenAI function calling.
   - Extracts `{ symptom, severity, mood, medAdherence }` from natural language patient speech.
   - Offline fallback parser ensures 100% uptime even if API is unreachable.

2. **Qdrant Cloud Vector Red-Flag Matcher (`@wellcall/qdrant-memory`)**:
   - Connected to live **Qdrant Cloud** cluster.
   - Runs local ONNX `Xenova/all-MiniLM-L6-v2` 384-dimensional feature extraction.
   - Computes cosine similarity between patient utterance and clinical red flags ($\ge 0.50$ threshold).
   - Strict payload isolation guarantees zero cross-patient vector leakage.

3. **Deterministic Clinical Risk Engine (`@wellcall/risk-engine`)**:
   - **Rule A**: High-risk red flag vector match ($\text{score} \ge 0.50$) $\rightarrow$ `ESCALATE`.
   - **Rule B**: Extracted `severity === 'severe'` $\rightarrow$ `ESCALATE`.
   - **Rule C**: Medium-risk match AND `severity === 'moderate'` $\rightarrow$ `ESCALATE`.
   - **Rule D**: Medication non-adherence (`medAdherence === 'no'`) + active symptoms $\rightarrow$ `ESCALATE`.
   - **Rule E**: Routine check-in with no risk indicators $\rightarrow$ `LOG`.

4. **Compliance Audit Generator (`@wellcall/audit-report`)**:
   - Assembles immutable `AuditRecord` objects containing call metadata, transcript, extracted fields, red flag matches, and escalation reasons.
   - Generates human-readable ASCII audit reports for clinical review.

5. **Fastify REST Gateway & Socket.io Server (`services/voice-pipeline`, Port 3001)**:
   - `GET /patients`: Returns list of all patients.
   - `GET /patients/:id`: Returns single patient care plan.
   - `GET /patients/:id/calls`: Returns enriched call history with escalation outcomes.
   - `GET /calls/:id`: Returns single call transcript.
   - `GET /audit`: Returns all compliance audit records.
   - `POST /demo/run`: Triggers scenario-based demo runs.
   - Full CORS support enabled for cross-origin browser clients (`http://localhost:3000`).

6. **Live Browser Microphone Input (`http://localhost:3000/mic`)**:
   - Browser `MediaRecorder` captures microphone audio in 250ms chunks.
   - Streams `voice:chunk` binary audio over Socket.io to Fastify gateway.
   - Gateway forwards stream to **Deepgram Nova-2** live STT.
   - Receives real-time partial/final transcripts and broadcasts `voice:transcript` back to browser.
   - Final utterances ($\ge 3$ words) automatically trigger Groq LLM + Qdrant Cloud + Risk Engine pipeline.
   - Fires live **pulsing red escalation alert banner** on screen if high risk detected.

7. **Twilio Nurse Alert Dispatch (`notifyNurseSMS.ts`)**:
   - Dispatches urgent SMS alerts (`🚨 URGENT NURSE ALERT...`) to on-call nurse phone number.
   - Supports both standard Twilio SMS and Twilio WhatsApp Sandbox.
   - Fully wrapped in non-blocking `try/catch` fault tolerance to ensure gateway stability.

---

## 🔒 What is HARDCODED or MOCKED

| Item | Current Implementation | Details |
| :--- | :--- | :--- |
| **Seeded Patients** | JSON File `wellcall.db.json` | Patients `patient-01` (Jane Smith - CABG), `patient-02` (Jane Smith), `patient-03` (Robert Johnson - CHF), and `patient-04` (Emily Davis - Diabetes) are pre-seeded in file storage. |
| **Telephony PSTN Stub** | `telephonyClient.ts` | Telephony dialer creates synthetic WebRTC call IDs (`call-webrtc-...`) for local demo mode. Does not initiate PSTN cellular phone calls over Twilio Voice SIP trunks. |
| **Demo Script Runner** | `demoScript.ts` | `POST /demo/run?scenario=escalation` uses bundled sample dialogue utterances to simulate a patient call without requiring hardware. |
| **Rime TTS Voice Output** | `rimeClient.ts` | Rime TTS client synthesizes voice audio responses; falls back gracefully to silent text log if TTS key is invalid or API fails. |

---

## ⚠️ What is NOT Working / Not Wired Up (Current Limitations)

1. **Live PSTN Phone Call Dialing (Twilio Voice Inbound/Outbound Webhooks)**:
   - The app runs in browser mic mode (`/mic`) or REST demo mode (`/demo/run`). Placing a real cellular telephone call by dialing a phone number requires an active `ngrok` tunnel and Twilio Voice TwiML Webhook configuration.

2. **Twilio Trial Account SMS Restrictions**:
   - Sending international SMS to unverified numbers (or without pre-registered SMS templates) returns Twilio error `572006` or `21654`. The code handles this gracefully via `try/catch` and logs the error without crashing.

3. **Audio Playback in Browser Speaker for Mic Mode**:
   - In `/mic` mode, the user speaks into the microphone and sees real-time transcription + risk analysis on screen. However, server text-to-speech audio is not currently played back through the browser speaker.

4. **User Authentication & Role-Based Access**:
   - There is no login page, JWT auth token, or user account management. The dashboard is open for demo monitoring.

---

## 💻 Frontend Page Inventory (`apps/dashboard`)

1. **`http://localhost:3000/` (Home Dashboard)**:
   - Live monitoring dashboard featuring `RiskFlagBanner`, `CarePlanCard`, `CallHistoryTimeline`, and `LiveTranscript`.

2. **`http://localhost:3000/mic` (Live Voice Page)**:
   - Real-time browser microphone check-in tool with Start/Stop controls, live Deepgram transcription stream, and instant escalation alert banner.

3. **`http://localhost:3000/audit` (Audit Report Page)**:
   - Full compliance log viewing past call audit reports and escalation history.

4. **`http://localhost:3000/patient/patient-01` (Patient Care Plan Detail Page)**:
   - Dedicated patient care plan view displaying medical condition, prescribed medications, follow-up dates, and red-flag symptoms.
