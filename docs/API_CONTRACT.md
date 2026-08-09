# Wellcall Gateway API Contract

The Next.js dashboard talks **ONLY** to the Fastify + Socket.io Gateway running in `services/voice-pipeline`.

## REST API Endpoints

| Method | Route | Description | Response Payload |
| :--- | :--- | :--- | :--- |
| `GET` | `/patients` | Fetch active patient roster | `{ data: Patient[] }` |
| `GET` | `/patients/:id` | Fetch single patient care plan | `{ data: Patient }` |
| `GET` | `/calls/:id` | Fetch call session details & transcripts | `{ data: { call: CallSession, transcripts: TranscriptEntry[] } }` |
| `GET` | `/audit` | Fetch nurse escalation audit table | `{ data: Escalation[] }` |

---

## Socket.io Live Event Contract

### Server to Client Events (`ServerToClientEvents`)

#### `transcript:new`
Broadcasted whenever a new audio transcript entry is generated.
```json
{
  "id": "tr-101",
  "callId": "call-20260809-01",
  "patientId": "patient-02",
  "timestamp": "2026-08-09T15:30:00.000Z",
  "speaker": "patient",
  "text": "My chest feels tight when I take deep breaths.",
  "isFinal": true
}
```

#### `escalation:new`
Broadcasted when a red-flag condition triggers an immediate nurse escalation.
```json
{
  "id": "esc-201",
  "callId": "call-20260809-01",
  "patientId": "patient-02",
  "patientName": "Jane Smith",
  "timestamp": "2026-08-09T15:30:05.000Z",
  "riskTier": "critical",
  "reason": "Patient reported chest tightness matching post-CABG cardiac red flag.",
  "status": "pending"
}
```

#### `call:status`
Broadcasted when a call transitions state (`idle` -> `ringing` -> `connected` -> `ended`).
```json
{
  "callId": "call-20260809-01",
  "status": "connected"
}
```
