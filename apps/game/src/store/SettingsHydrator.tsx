'use client';

import { useEffect } from 'react';
import { useSettingsStore } from './useSettingsStore';

/**
 * Раз на клиенте запускает отложенную гидратацию useSettingsStore из
 * localStorage (см. skipHydration в useSettingsStore.ts). Рендерится один раз
 * в корневом layout — сам ничего не выводит.
 */
export function SettingsHydrator(): null {
  useEffect(() => {
    void useSettingsStore.persist.rehydrate();
  }, []);

  return null;
}
