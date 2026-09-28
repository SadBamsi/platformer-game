/** Сколько висит надпись о победе до автоматического старта следующего этапа. */
export const STAGE_CLEAR_DELAY_MS = 3000;

/**
 * Надпись о победе — белорусская лацинка: «Перамога!» и «Этап N пройдзены».
 * Без диакритики, поэтому хватает латиницы пиксельного шрифта (pixelFont.ts).
 */
export const STAGE_CLEAR_TITLE = 'PIERAMOHA!';

export function stageClearSubtitle(stage: number): string {
  return `ETAP ${stage} PROJDZIENY`;
}
