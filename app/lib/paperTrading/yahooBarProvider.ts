import YahooFinance from "yahoo-finance2";
import type { DailyBarProvider } from "./engine";
import type { DayBar } from "./exitResolver";

const yahooFinance = new YahooFinance();

// コード（例: "7203"）をYahoo Financeのシンボル（"7203.T"）へ変換する。
// 指数シンボル（"^N225"等）はそのまま使う。
function toSymbol(codeOrSymbol: string): string {
  return codeOrSymbol.startsWith("^") ? codeOrSymbol : `${codeOrSymbol}.T`;
}

// 本番用のDailyBarProvider実装。既存のanalyzeStockByCode()等と同じyahoo-finance2を使うが、
// verification/screeningのキャッシュには一切触れない（Paper Trading専用の独立した取得）。
export const yahooBarProvider: DailyBarProvider = {
  async getBar(codeOrSymbol, date) {
    const symbol = toSymbol(codeOrSymbol);
    const period1 = new Date(date);
    period1.setDate(period1.getDate() - 3);
    const period2 = new Date(date);
    period2.setDate(period2.getDate() + 1);

    try {
      const chart = await yahooFinance.chart(symbol, { period1, period2, interval: "1d" });
      const row = chart.quotes.find((q) => q.date.toISOString().slice(0, 10) === date);
      if (!row || row.open == null || row.high == null || row.low == null || row.close == null) return null;
      const bar: DayBar = { open: row.open, high: row.high, low: row.low, close: row.close };
      return bar;
    } catch {
      return null;
    }
  },

  async getPreviousClose(codeOrSymbol, date) {
    const symbol = toSymbol(codeOrSymbol);
    const period1 = new Date(date);
    period1.setDate(period1.getDate() - 14);
    const period2 = new Date(date);

    try {
      const chart = await yahooFinance.chart(symbol, { period1, period2, interval: "1d" });
      const priorRows = chart.quotes
        .filter((q) => q.close !== null && q.date.toISOString().slice(0, 10) < date)
        .sort((a, b) => a.date.getTime() - b.date.getTime());
      const last = priorRows[priorRows.length - 1];
      return last?.close ?? null;
    } catch {
      return null;
    }
  },
};
