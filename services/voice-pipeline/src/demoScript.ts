/**
 * Fallback Demo Mode Script Definitions
 * Provides realistic canned conversational sequences for patient check-ins.
 * Feeds real transcript text through the intelligence pipeline (Groq -> Qdrant -> Risk Engine)
 * without requiring mic/hardware voice I/O.
 */

export interface DemoScriptItem {
  speaker: 'system' | 'patient';
  text: string;
  delayMs: number;
}

export interface DemoScenario {
  patientId: string;
  scenarioName: 'routine' | 'escalation';
  sequence: DemoScriptItem[];
}

/**
 * Routine Call Scenario (patient-02 / Jane Smith)
 * Patient reports feeling fine, taking meds, no symptoms.
 * Should result in Risk Decision 'log' (No escalation).
 */
export const ROUTINE_SCENARIO: DemoScenario = {
  patientId: 'patient-02',
  scenarioName: 'routine',
  sequence: [
    {
      speaker: 'system',
      text: 'Hello Jane, this is WellCall checking in on your post-discharge recovery. How are you feeling today?',
      delayMs: 500,
    },
    {
      speaker: 'patient',
      text: "I'm feeling fine today, took my meds this morning and had a light breakfast.",
      delayMs: 1500,
    },
    {
      speaker: 'system',
      text: 'Glad to hear that! Are you experiencing any chest pain, shortness of breath, or fever today?',
      delayMs: 1500,
    },
    {
      speaker: 'patient',
      text: 'No symptoms at all today, feeling good and resting comfortably.',
      delayMs: 1500,
    },
    {
      speaker: 'system',
      text: 'Wonderful! We have logged your check-in update. Please call us if anything changes. Have a great day!',
      delayMs: 1000,
    },
  ],
};

/**
 * High-Risk Escalation Call Scenario (patient-01 / John Doe - Post-CABG)
 * Patient reports: "My chest feels tight when I try to take deep breaths"
 * Triggers Qdrant Cloud semantic match (~0.66 similarity score) -> Rule A escalation!
 */
export const ESCALATION_SCENARIO: DemoScenario = {
  patientId: 'patient-01',
  scenarioName: 'escalation',
  sequence: [
    {
      speaker: 'system',
      text: 'Hello John, this is WellCall checking in after your heart surgery. How are you doing today?',
      delayMs: 500,
    },
    {
      speaker: 'patient',
      text: 'My chest feels tight when I try to take deep breaths',
      delayMs: 1500,
    },
    {
      speaker: 'system',
      text: 'I understand you are experiencing chest tightness. I am notifying your care team and escalating to a nurse immediately.',
      delayMs: 1500,
    },
  ],
};

export const DEMO_SCENARIOS: Record<string, DemoScenario> = {
  routine: ROUTINE_SCENARIO,
  escalation: ESCALATION_SCENARIO,
};
