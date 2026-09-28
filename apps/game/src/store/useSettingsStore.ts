import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface SettingsState {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  setMasterVolume: (value: number) => void;
  setMusicVolume: (value: number) => void;
  setSfxVolume: (value: number) => void;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Настройки громкости, сохраняются в localStorage через persist middleware.
 * skipHydration: true — обязателен для SSR: без него persist полез бы в
 * localStorage прямо при инициализации стора (в т.ч. на сервере при первом
 * рендере), что даёт mismatch между SSR- и client-разметкой. Гидратация
 * запускается вручную на клиенте — см. store/SettingsHydrator.tsx.
 */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      masterVolume: 0.8,
      musicVolume: 0.7,
      sfxVolume: 0.9,
      setMasterVolume: (value) => set({ masterVolume: clamp01(value) }),
      setMusicVolume: (value) => set({ musicVolume: clamp01(value) }),
      setSfxVolume: (value) => set({ sfxVolume: clamp01(value) }),
    }),
    {
      name: 'agentic-game-settings',
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
);
