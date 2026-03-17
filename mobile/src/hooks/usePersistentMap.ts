import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";

type MapUpdater<T> = Record<string, T> | ((prev: Record<string, T>) => Record<string, T>);

type UsePersistentMapOptions<T> = {
  storageKey: string;
  initialValue?: Record<string, T>;
  decode?: (raw: string) => Record<string, T>;
  encode?: (value: Record<string, T>) => string;
  preload?: boolean;
};

const defaultDecode = <T,>(raw: string): Record<string, T> => {
  const parsed = JSON.parse(raw) as unknown;
  return parsed && typeof parsed === "object" ? (parsed as Record<string, T>) : {};
};

const defaultEncode = <T,>(value: Record<string, T>) => JSON.stringify(value);

export function usePersistentMap<T>({
  storageKey,
  initialValue = {},
  decode = defaultDecode,
  encode = defaultEncode,
  preload = true
}: UsePersistentMapOptions<T>) {
  const [value, setValueState] = useState<Record<string, T>>(initialValue);
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const setValue = useCallback((updater: MapUpdater<T>) => {
    setValueState((prev) => {
      const next = typeof updater === "function" ? (updater as (p: Record<string, T>) => Record<string, T>)(prev) : updater;
      valueRef.current = next;
      return next;
    });
  }, []);

  const reload = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(storageKey);
      if (!raw) {
        setValue({});
        return {} as Record<string, T>;
      }
      const parsed = decode(raw);
      const safe = parsed && typeof parsed === "object" ? parsed : ({} as Record<string, T>);
      setValue(safe);
      return safe;
    } catch {
      setValue({});
      return {} as Record<string, T>;
    }
  }, [decode, setValue, storageKey]);

  const persistValue = useCallback(
    async (updater: MapUpdater<T>) => {
      const current = valueRef.current;
      const next = typeof updater === "function" ? (updater as (p: Record<string, T>) => Record<string, T>)(current) : updater;
      setValue(next);
      await AsyncStorage.setItem(storageKey, encode(next));
      return next;
    },
    [encode, setValue, storageKey]
  );

  useEffect(() => {
    if (!preload) return;
    void reload();
  }, [preload, reload]);

  return { value, setValue, persistValue, reload };
}
