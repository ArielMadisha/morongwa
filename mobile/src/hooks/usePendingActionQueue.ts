import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, AppStateStatus } from "react-native";
import { useCallback, useEffect, useState } from "react";

type UsePendingActionQueueOptions<TAction> = {
  storageKey: string;
  executeAction: (action: TAction) => Promise<void>;
  autoFlushIntervalMs?: number;
};

export function usePendingActionQueue<TAction>({
  storageKey,
  executeAction,
  autoFlushIntervalMs = 30000
}: UsePendingActionQueueOptions<TAction>) {
  const [pendingActionsPreview, setPendingActionsPreview] = useState<TAction[]>([]);
  const [retryingQueue, setRetryingQueue] = useState(false);

  const loadPendingActions = useCallback(async (): Promise<TAction[]> => {
    try {
      const raw = await AsyncStorage.getItem(storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as TAction[]) : [];
    } catch {
      return [];
    }
  }, [storageKey]);

  const savePendingActions = useCallback(
    async (actions: TAction[]) => {
      await AsyncStorage.setItem(storageKey, JSON.stringify(actions));
    },
    [storageKey]
  );

  const refreshPendingPreview = useCallback(async () => {
    const queued = await loadPendingActions();
    setPendingActionsPreview(queued);
  }, [loadPendingActions]);

  const enqueuePendingAction = useCallback(
    async (action: TAction) => {
      const existing = await loadPendingActions();
      const next = [...existing, action];
      await savePendingActions(next);
      setPendingActionsPreview(next);
    },
    [loadPendingActions, savePendingActions]
  );

  const flushPendingActions = useCallback(async (): Promise<TAction[]> => {
    const queued = await loadPendingActions();
    if (!queued.length) {
      setPendingActionsPreview([]);
      return [];
    }
    const remaining: TAction[] = [];
    for (const action of queued) {
      try {
        await executeAction(action);
      } catch {
        remaining.push(action);
      }
    }
    await savePendingActions(remaining);
    setPendingActionsPreview(remaining);
    return remaining;
  }, [executeAction, loadPendingActions, savePendingActions]);

  const retryPendingNow = useCallback(async () => {
    setRetryingQueue(true);
    try {
      return await flushPendingActions();
    } finally {
      setRetryingQueue(false);
    }
  }, [flushPendingActions]);

  useEffect(() => {
    void flushPendingActions();
    const interval = setInterval(() => {
      void flushPendingActions();
    }, autoFlushIntervalMs);
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") {
        void flushPendingActions();
      }
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [autoFlushIntervalMs, flushPendingActions]);

  useEffect(() => {
    void refreshPendingPreview();
  }, [refreshPendingPreview]);

  return {
    pendingActionsPreview,
    retryingQueue,
    enqueuePendingAction,
    flushPendingActions,
    refreshPendingPreview,
    retryPendingNow
  };
}
