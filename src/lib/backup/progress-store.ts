import type { ProgressState } from "./types";

const progressMap = new Map<string, ProgressState>();

// Auto-cleanup completed operations after 15 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of progressMap) {
      if (value.completedAt && now - value.completedAt > 15 * 60 * 1000) {
        progressMap.delete(key);
      }
    }
  }, 60_000);
}

export function createOperation(type: "backup" | "restore"): string {
  // Only one operation at a time
  for (const op of progressMap.values()) {
    if (op.status === "running") {
      throw new Error("Another operation is already running");
    }
  }

  const operationId = crypto.randomUUID();
  progressMap.set(operationId, {
    operationId,
    type,
    status: "running",
    step: "init",
    percentage: 0,
    message: "Initializing...",
    startedAt: Date.now(),
  });
  return operationId;
}

export function updateProgress(
  operationId: string,
  update: Partial<Omit<ProgressState, "operationId" | "type" | "startedAt">>
): void {
  const state = progressMap.get(operationId);
  if (!state) return;
  Object.assign(state, update);
}

export function completeOperation(operationId: string, error?: string): void {
  const state = progressMap.get(operationId);
  if (!state) return;
  state.status = error ? "failed" : "completed";
  state.percentage = error ? state.percentage : 100;
  state.message = error || "Complete";
  state.completedAt = Date.now();
  if (error) state.error = error;
}

export function getProgress(operationId: string): ProgressState | undefined {
  return progressMap.get(operationId);
}

export function hasRunningOperation(): boolean {
  for (const op of progressMap.values()) {
    if (op.status === "running") return true;
  }
  return false;
}
