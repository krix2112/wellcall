import { RedFlagMatch } from '@wellcall/shared-types';
import { fallbackPointStore, qdrantFetch } from './qdrantClient';
import { RED_FLAGS_COLLECTION } from './carePlanStore';
import { embedText } from './embeddings';

/**
 * Tunable similarity score threshold (0.0 to 1.0)
 * Scores >= SIMILARITY_THRESHOLD trigger a red-flag match escalation.
 */
export const SIMILARITY_THRESHOLD = 0.50;

/**
 * Core Semantic Red-Flag Matcher
 * Queries Qdrant using vector similarity search via authenticated qdrantFetch, filtered strictly by patientId payload filter.
 */
export async function matchRedFlag(
  patientId: string,
  spokenText: string
): Promise<RedFlagMatch> {
  const spokenVector = await embedText(spokenText);

  try {
    const res = await qdrantFetch(`/collections/${RED_FLAGS_COLLECTION}/points/search`, {
      method: 'POST',
      body: JSON.stringify({
        vector: spokenVector,
        filter: {
          must: [
            {
              key: 'patientId',
              match: { value: patientId },
            },
          ],
        },
        limit: 1,
        with_payload: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`Qdrant search endpoint returned HTTP status ${res.status}`);
    }

    const data = (await res.json()) as {
      result: Array<{
        id: string | number;
        score: number;
        payload: { flagText: string; riskTier?: 'high' | 'medium' | 'low'; patientId: string };
      }>;
    };

    if (!data.result || data.result.length === 0) {
      console.log(
        `[redFlagMatcher] Patient: ${patientId} | Similarity Score: 0.0000 (Threshold: ${SIMILARITY_THRESHOLD}) | Utterance: "${spokenText}" | Matched: false (No records for patient)`
      );
      return {
        matched: false,
        riskTier: 'low',
        reason: 'No red-flag pattern matched for this patient.',
      };
    }

    const topResult = data.result[0];
    const score = Number(topResult.score.toFixed(4));
    const isMatched = score >= SIMILARITY_THRESHOLD;
    const payload = topResult.payload;

    console.log(
      `[redFlagMatcher] Patient: ${patientId} | Similarity Score: ${score.toFixed(4)} (Threshold: ${SIMILARITY_THRESHOLD}) | Utterance: "${spokenText}" | Matched: ${isMatched}`
    );

    if (isMatched) {
      return {
        matched: true,
        riskTier: payload.riskTier || 'high',
        matchedFlag: payload.flagText,
        reason: `Patient's description matches known red flag: ${payload.flagText}`,
      };
    }

    return {
      matched: false,
      riskTier: 'low',
      reason: `No red-flag pattern matched (top similarity score ${score.toFixed(4)} below threshold ${SIMILARITY_THRESHOLD})`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes('404')) {
      console.warn('[redFlagMatcher] Qdrant server query failed, using fallback cosine search.', err);
    }
    return matchRedFlagFallback(patientId, spokenText, spokenVector);
  }
}

function matchRedFlagFallback(
  patientId: string,
  spokenText: string,
  spokenVector: number[]
): RedFlagMatch {
  const points = fallbackPointStore.get(RED_FLAGS_COLLECTION) || [];
  const patientPoints = points.filter((p) => p.payload.patientId === patientId);

  if (patientPoints.length === 0) {
    console.log(`[redFlagMatcher] Patient: ${patientId} | Score: 0.0000 | Utterance: "${spokenText}" | Matched: false (Fallback empty)`);
    return {
      matched: false,
      riskTier: 'low',
      reason: 'No red-flag pattern matched for this patient.',
    };
  }

  let bestScore = -1;
  let bestPoint = patientPoints[0];

  for (const point of patientPoints) {
    const similarity = cosineSimilarity(spokenVector, point.vector);
    if (similarity > bestScore) {
      bestScore = similarity;
      bestPoint = point;
    }
  }

  const score = Number(bestScore.toFixed(4));
  const isMatched = score >= SIMILARITY_THRESHOLD;

  console.log(
    `[redFlagMatcher-Fallback] Patient: ${patientId} | Score: ${score.toFixed(4)} | Utterance: "${spokenText}" | Matched: ${isMatched}`
  );

  if (isMatched) {
    return {
      matched: true,
      riskTier: bestPoint.payload.riskTier || 'high',
      matchedFlag: bestPoint.payload.flagText,
      reason: `Patient's description matches known red flag: ${bestPoint.payload.flagText}`,
    };
  }

  return {
    matched: false,
    riskTier: 'low',
    reason: `No red-flag pattern matched (top similarity score ${score.toFixed(4)} below threshold ${SIMILARITY_THRESHOLD})`,
  };
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}
