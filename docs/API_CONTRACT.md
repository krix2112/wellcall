# Wellcall API Contract

This document outlines the API specification between the Fastify / Socket.io gateway (`services/voice-pipeline`) and the Next.js frontend dashboard (`apps/dashboard`). All payload shapes strictly reference `@wellcall/shared-types`.

---

## 1. REST API Endpoints

### `GET /patients`
Retrieves the list of active discharged patients.
- **Response Shape**: `Patient[]`

### `GET /patients/:id`
Retrieves single patient details, care plan, and red flags by ID.
- **Parameters**: `id` (string - Patient ID)
- **Response Shape**: `Patient`

### `GET /calls/:id`
Retrieves details and transcript history for a specific call session.
- **Parameters**: `id` (string - CallSession ID)
- **Response Shape**: `{ call: CallSession, transcripts: TranscriptEntry[] }`

### `GET /audit`
Retrieves table of all recorded call sessions, decisions, and escalations.
- **Response Shape**: `{ escalations: Escalation[], calls: CallSession[] }`

---

## 2. WebSocket Events (Socket.io)

### Server to Client Events (`ServerToClientEvents`)

#### `transcript:new`
Emitted in real-time as dialogue chunks are processed.
- **Payload Shape**: `TranscriptEntry`
  ```json
  {
    "id": "tr-101",
    "callId": "call-501",
    "speaker": "patient",
    "text": "My chest feels tight when breathing deeply.",
    "timestamp": "2026-08-09T23:30:00.000Z"
  }
  ```

#### `escalation:new`
Emitted when a call triggers a clinical escalation.
- **Payload Shape**: `Escalation`
  ```json
  {
    "id": "esc-201",
    "callId": "call-501",
    "patientId": "patient-02",
    "reason": "Symptom matched post-CABG cardiac red-flag.",
    "timestamp": "2026-08-09T23:30:05.000Z",
    "acknowledged": false
  }
  ```

#### `call:status`
Emitted when a call session state changes.
- **Payload Shape**: `{ callId: string; status: 'idle' | 'ringing' | 'connected' | 'ended' }`
  ```json
  {
    "callId": "call-501",
    "status": "connected"
  }
  ```
