import type {
  EntryBlockLevel,
  EntryTiming,
  IndicatorRawValues,
  IndicatorStatus,
  IndexCondition,
  MarketCondition,
  RiskLevel,
  Signal,
  TodayAction,
  TrendDirection,
} from "@/app/lib/technicalAnalysis/types";

export interface DayResult {
  date: string; // YYYY-MM-DD（実際に約定日として採用した営業日）
  changePercent: number;
}

// "observed"：Version 1.2で追加。買い/売りのように方向性のある勝ち負け判定はできないが
// （待ち・本日は休みましょう・見送り・押し目待ち・ブレイク待ち・様子見が対象）、
// day1/day3/day5の価格は追跡し「エントリーしなかった判断が結果的にどうだったか」を
// 後から検証できるようにする。
// 互換性メモ：Version 1.1以前の「待ち」は価格を追跡せず即座に"neutral"へ確定していたため、
// 既存ログの"neutral"レコードはday1/day3/day5が常にnull。新規に生成される"observed"と
// 区別するため既存の"neutral"の意味は変更しない。
export type VerificationOutcome = "pending" | "win" | "loss" | "neutral" | "observed";

export interface VerificationRecord {
  id: string; // `${code}-${judgedAt}`
  code: string;
  name: string;
  judgedAt: string; // YYYY-MM-DD（判定日）
  score: number;
  signal: Signal;
  priceAtJudgment: number;
  // AIが外れた理由を後から分析できるよう、判定時点の主要な材料も保存しておく
  // （将来のスコア配点調整のための学習データ）。
  marketCondition: MarketCondition;
  dowTheoryStatus: IndicatorStatus;
  atrPercent: number;
  volumeRatio: number;
  entryTiming: EntryTiming;
  day1: DayResult | null;
  day3: DayResult | null;
  day5: DayResult | null;
  outcome: VerificationOutcome;

  // ここから Version 1.2 で追加。既存データ（Version 1.1以前）には存在しないため、
  // 必ずoptionalにして後方互換性を保つ。集計・UI側はundefinedを許容すること。

  // RSI・MACD・移動平均線の生値（analyze.tsで計算済みだった値をそのまま記録するだけで、
  // スコア計算式・シグナル判定には使わない）。
  indicatorValues?: IndicatorRawValues;

  // EntryBlock（懸念材料2つ以上でエントリー見送りを促す仕組み）の発動有無・理由。
  entryBlockLevel?: EntryBlockLevel;
  entryBlockReason?: string | null;

  // risk.assessRisk()が出したリスク評価（EntryBlockの入力にもなっている値）。
  riskLevel?: RiskLevel;

  // 「今日やること」表示用の最終区分（EntryTiming + EntryBlock=blockedなら「見送り」）とその理由文。
  todayAction?: TodayAction;
  todayActionReason?: string;

  // 地合い判定の根拠（日経225・TOPIX代替ETFそれぞれの生の状況）。
  // marketConditionは既存フィールド（overallのみ）で、こちらは内訳。
  marketRegimeDetail?: {
    nikkei225: IndexCondition;
    topix: IndexCondition;
  };

  // 60分足・15分足のトレンド。一括スクリーニング（includeIntraday:false）で判定された
  // レコードは常にnull（そもそも取得していないため）。個別銘柄詳細ページ経由の判定でのみ埋まる。
  trend60m?: TrendDirection | null;
  trend15m?: TrendDirection | null;

  // 決算リスク（Version 1.2）。AIスコア・シグナル・EntryBlockの判定条件にはまだ使用せず、
  // verificationログへの記録とUI上の警告表示のみに使う。
  // earningsDateは取得時点でのYahoo Finance予測値であり、確定発表日ではない場合がある
  // （earningsIsEstimateがtrueのとき）。
  earningsDate?: string | null;
  // judgedAt を基準にした決算発表日までの日数差をそのまま保存する（生データ）。
  // 負数=決算前、0=決算当日、正数=決算後。earningsDateがnullならnull。
  // 「決算前後の成績比較」は将来この値を使って再集計できる。
  daysFromEarnings?: number | null;
  earningsRiskFlag?: boolean;
  earningsIsEstimate?: boolean;
}
