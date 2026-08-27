const DAY_MS = 24 * 60 * 60 * 1000;

// fromMsからn営業日後の時刻を返す（土日をスキップして加算するだけの簡易実装）。
// FX市場の正確な週次オープン/クローズ時刻（金曜22時UTC〜日曜22時UTC等）までは厳密に
// 再現せず、「土曜・日曜のUTC日付を1日として数えない」という近似にとどめる
// （Phase 1の最大保有期間の目安としては十分な精度とする）。
export function addBusinessDays(fromMs: number, n: number): number {
  let result = fromMs;
  let remaining = n;
  while (remaining > 0) {
    result += DAY_MS;
    const utcDay = new Date(result).getUTCDay(); // 0=日,6=土
    if (utcDay !== 0 && utcDay !== 6) {
      remaining -= 1;
    }
  }
  return result;
}
