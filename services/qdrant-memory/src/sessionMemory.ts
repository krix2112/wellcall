export interface MemoryItem {
  id: string;
  patientId: string;
  key: string;
  value: string;
  timestamp: string;
  correctedAt?: string;
  deletedAt?: string;
}

export interface MemoryCorrection {
  key: string;
  newValue: string;
  reason: string;
}

/**
 * SessionMemory Store
 * Exposes explicit named methods: getMemory, setMemory, correctMemory, deleteMemory.
 */
export class SessionMemory {
  private store: Map<string, MemoryItem> = new Map();

  private getKey(patientId: string, key: string): string {
    return `${patientId}:${key}`;
  }

  public async getMemory(patientId: string, key: string): Promise<MemoryItem | null> {
    const item = this.store.get(this.getKey(patientId, key));
    if (!item || item.deletedAt) return null;
    return { ...item };
  }

  public async setMemory(patientId: string, key: string, value: string): Promise<MemoryItem> {
    const item: MemoryItem = {
      id: `mem-${Date.now()}`,
      patientId,
      key,
      value,
      timestamp: new Date().toISOString(),
    };
    this.store.set(this.getKey(patientId, key), item);
    return { ...item };
  }

  public async correctMemory(patientId: string, correction: MemoryCorrection): Promise<MemoryItem> {
    const existing = this.store.get(this.getKey(patientId, correction.key));
    const now = new Date().toISOString();
    const updated: MemoryItem = {
      id: existing ? existing.id : `mem-${Date.now()}`,
      patientId,
      key: correction.key,
      value: correction.newValue,
      timestamp: existing ? existing.timestamp : now,
      correctedAt: now,
    };
    this.store.set(this.getKey(patientId, correction.key), updated);
    console.log(`[sessionMemory] Corrected memory key "${correction.key}". Reason: ${correction.reason}`);
    return { ...updated };
  }

  public async deleteMemory(patientId: string, key: string): Promise<boolean> {
    const existing = this.store.get(this.getKey(patientId, key));
    if (!existing || existing.deletedAt) return false;
    existing.deletedAt = new Date().toISOString();
    this.store.set(this.getKey(patientId, key), existing);
    return true;
  }
}
