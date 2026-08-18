import type { OHLCSeries } from "../types";

// filterClosedBars が扱う足種（4hは1hを合成して作るため対象外。4hの未確定バケット除外は
// aggregate.ts側の責務にする）。
export type ClosableTimeframe = "5m" | "15m" | "1h" | "1d";

// ============================================================================
// Yahoo Finance実データ調査結果（yahoo-finance2 経由、USDJPY=X）
//
// 1. 5m/15m/1hは常にUTC固定境界（例: 15分足は毎時00/15/30/45分ちょうどに始まる）。
//    タイムゾーン・DSTの影響を受けない、単純な固定長のバー。
//
// 2. Yahoo Financeのchart()は、どの足種でも配列の最後に「まだクローズしていない
//    現在進行形の1本」を、確定バーと全く同じ形式で追加してくる。そのタイムスタンプは
//    足の境界にすら一致しない「直近の1ティックの時刻」であることを実データで確認済み
//    （例: 1h足の並びが 10:00,11:00,...,16:00 と並んだ直後に 16:40:26 のような
//    半端な時刻のバーが1本追加される）。
//
// 3. 日足(1d)の境界はUTC固定ではない。実データで以下を確認した：
//      2026年1月（冬）: バー開始時刻は 00:00:00 UTC
//      2026年7月（夏）: バー開始時刻は 23:00:00 UTC（前日）
//    切り替わりは 2026年3月29日〜4月5日の間に発生しており、これは米国のDST開始日
//    （2026/3/8）ではなく、EU（英国）のDST開始日（2026/3/29、3月最終日曜）と一致する。
//    同様に2025年10月のEU DST終了日（10/26）付近でも 23:00→00:00 の切り替わりを確認した。
//    つまり日足の境界は「米国時間」ではなく「EU/英国時間」に連動して1時間シフトする。
//
//    この正確な境界時刻をコード側で「決め打ち」するのは危険（Yahoo側の仕様変更・
//    地域による違いのリスクがある）なため、日足だけは以下の保守的な基準を採用する：
//      「バー開始時刻から24時間ちょうどでは確定済みとみなさない。
//       25時間（24h + 1hのDST安全マージン）経過して初めて確定済みとみなす」
//    安全側（確定判定が最大1時間遅れる方向）に倒すことで、DSTの正確な切り替え規則を
//    知らなくても「未確定の日足を確定済みと誤認するリスク」をゼロにできる。
//    唯一のトレードオフは、年2回・最大1時間だけ確定判定が遅れる可能性があることだが、
//    これは「分析に使うデータの正確性」を最優先する今回の目的においては許容範囲とする。
// ============================================================================

const FIXED_DURATION_MS: Record<Exclude<ClosableTimeframe, "1d">, number> = {
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
};

// 24h（86,400,000ms）ではなく25hにしている理由は上記コメント参照。
const DAILY_SAFE_CLOSE_MS = 25 * 60 * 60_000;

// 個々のバーが asOfTime 時点で確実にクローズ済みかどうかを判定する。
// Date.now()には一切依存せず、常に呼び出し側から渡されたasOfTimeのみを基準にする
// （ライブ分析では「現在時刻」、バックテストでは「リプレイ対象の過去時刻」を渡す想定）。
export function isBarClosed(bar: { time: number }, asOfTime: number, timeframe: ClosableTimeframe): boolean {
  if (timeframe === "1d") {
    return asOfTime - bar.time >= DAILY_SAFE_CLOSE_MS;
  }
  return asOfTime - bar.time >= FIXED_DURATION_MS[timeframe];
}

// asOfTime時点で確実にクローズ済みのバーだけを残す純粋関数。
// ・ネットワークアクセスなし
// ・Date.now()に依存しない（必ずasOfTimeを引数で受け取る）
// ・ライブ分析（yahooFxProvider.ts）・将来のバックテストの両方から同じ関数として再利用できる
export function filterClosedBars(series: OHLCSeries, asOfTime: number, timeframe: ClosableTimeframe): OHLCSeries {
  return series.filter((bar) => isBarClosed(bar, asOfTime, timeframe));
}
