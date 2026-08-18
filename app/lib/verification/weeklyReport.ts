import type { VerificationRecord } from "./types";

// Version 1.3: 自動検証基盤の週次レポート生成。
// 重要: このファイルはVerificationRecordを「読むだけ」。AIスコア配点・シグナル判定条件・
// EntryBlock条件・TOP3抽出条件（app/lib/technicalAnalysis/, app/lib/screening/rankings.ts）には
// 一切触れない。改善候補は文章化するだけで、コード・スコアへは反映しない。

// ── サンプル数による信頼度（過学習防止のため必ず表示する） ──────────────
export type ConfidenceLevel = "unusable" | "reference" | "reliable";

export function confidenceLevel(n: number): ConfidenceLevel {
  if (n < 10) return "unusable";
  if (n < 30) return "reference";
  return "reliable";
}

export function confidenceLabel(level: ConfidenceLevel): string {
  switch (level) {
    case "unusable":
      return "判断不可(n<10)";
    case "reference":
      return "参考値(n=10〜29)";
    case "reliable":
      return "分析対象(n>=30)";
  }
}

// ── 日付・週番号ユーティリティ（judgedAtはYYYY-MM-DDのJST日付文字列を前提） ──
function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isoWeekKey(date: Date): string {
  const d = new Date(date);
  const dayNum = (d.getUTCDay() + 6) % 7; // 月=0 ... 日=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const fdDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fdDayNum + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function weekRange(date: Date): { monday: Date; sunday: Date } {
  const dayNum = (date.getUTCDay() + 6) % 7;
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - dayNum);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { monday, sunday };
}

// ── 基本統計 ──────────────────────────────────────────────
interface StatRow {
  label: string;
  n: number;
  win: number;
  loss: number;
  winRate: number | null;
  avgAbsDay1: number | null;
  avgAbsDay3: number | null;
  avgAbsDay5: number | null;
  confidence: ConfidenceLevel;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function avgAbs(values: number[]): number | null {
  if (values.length === 0) return null;
  return round1(values.reduce((sum, v) => sum + Math.abs(v), 0) / values.length);
}

// 勝率（win/loss）を主目的とする行の集計。信頼度はwinRateの計算対象である
// decided（win+loss）件数を基準にする（groupの総数が多くても、勝敗が決まった
// 件数が少なければ「判断不可」と正しく表示するため）。
function computeStatRow(label: string, group: VerificationRecord[]): StatRow {
  const win = group.filter((r) => r.outcome === "win").length;
  const loss = group.filter((r) => r.outcome === "loss").length;
  const decided = win + loss;
  const observedOrDecided = group.filter((r) => r.outcome === "win" || r.outcome === "loss" || r.outcome === "observed");
  return {
    label,
    n: group.length,
    win,
    loss,
    winRate: decided > 0 ? round1((win / decided) * 100) : null,
    avgAbsDay1: avgAbs(observedOrDecided.filter((r) => r.day1).map((r) => r.day1!.changePercent)),
    avgAbsDay3: avgAbs(observedOrDecided.filter((r) => r.day3).map((r) => r.day3!.changePercent)),
    avgAbsDay5: avgAbs(observedOrDecided.filter((r) => r.day5).map((r) => r.day5!.changePercent)),
    confidence: confidenceLevel(decided),
  };
}

// 「待ち・休み・見送り」用。win/lossの概念が無いため、信頼度はgroupの総数（観測できた件数）を基準にする。
function computeObservedRow(label: string, group: VerificationRecord[]): StatRow {
  return {
    label,
    n: group.length,
    win: 0,
    loss: 0,
    winRate: null,
    avgAbsDay1: avgAbs(group.filter((r) => r.day1).map((r) => r.day1!.changePercent)),
    avgAbsDay3: avgAbs(group.filter((r) => r.day3).map((r) => r.day3!.changePercent)),
    avgAbsDay5: avgAbs(group.filter((r) => r.day5).map((r) => r.day5!.changePercent)),
    confidence: confidenceLevel(group.length),
  };
}

function statRowToMarkdownLine(row: StatRow): string {
  const winRateText = row.winRate === null ? "-" : `${row.winRate}%`;
  return `| ${row.label} | ${row.n} | ${row.win} | ${row.loss} | ${winRateText} | ${confidenceLabel(row.confidence)} |`;
}

// TOP3抽出条件（app/lib/screening/rankings.ts の rankBuySignals・app/api/v1/screening/signals/route.ts の
// DEFAULT_THRESHOLD=80 / TODAYS_PICKS_LIMIT=3）を「読むだけ」で再現し、その日どの銘柄がLINE通知の
// TOP3だったかを検証ログから逆算する。この定数はレポート集計専用のコピーであり、
// 本番のTOP3抽出条件そのものは一切変更していない。
// 注意: 本番のtie-breakにはconfidence（確信度）も使われるがVerificationRecordには保存されていないため、
// 同点銘柄の順序が本番と一致しない可能性がある（近似値であることをレポート内に明記する）。
const TOP3_SCORE_THRESHOLD = 80;
const TOP3_LIMIT = 3;

function reconstructTop3Records(dayRecords: VerificationRecord[]): VerificationRecord[] {
  return dayRecords
    .filter((r) => r.signal === "買い" && r.score >= TOP3_SCORE_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP3_LIMIT);
}

function reconstructTop3ForWeek(weekRecords: VerificationRecord[]): VerificationRecord[] {
  const byDay = new Map<string, VerificationRecord[]>();
  for (const r of weekRecords) {
    const list = byDay.get(r.judgedAt) ?? [];
    list.push(r);
    byDay.set(r.judgedAt, list);
  }
  return [...byDay.values()].flatMap(reconstructTop3Records);
}

// ── 指標別バケット集計 ──────────────────────────────────────
interface Bucket {
  label: string;
  match: (r: VerificationRecord) => boolean;
}

function bucketStats(records: VerificationRecord[], buckets: Bucket[]): StatRow[] {
  return buckets.map((b) => computeStatRow(b.label, records.filter(b.match)));
}

const RSI_BUCKETS: Bucket[] = [
  { label: "RSI<30(売られすぎ)", match: (r) => (r.indicatorValues?.rsi ?? -1) < 30 },
  { label: "RSI 30-50", match: (r) => (r.indicatorValues?.rsi ?? -1) >= 30 && (r.indicatorValues?.rsi ?? -1) < 50 },
  { label: "RSI 50-70", match: (r) => (r.indicatorValues?.rsi ?? -1) >= 50 && (r.indicatorValues?.rsi ?? -1) < 70 },
  { label: "RSI>=70(買われすぎ)", match: (r) => (r.indicatorValues?.rsi ?? -1) >= 70 },
];

const MACD_BUCKETS: Bucket[] = [
  { label: "MACDヒストグラム陽転(>0)", match: (r) => (r.indicatorValues?.macdHistogram ?? 0) > 0 },
  { label: "MACDヒストグラム陰転(<=0)", match: (r) => (r.indicatorValues?.macdHistogram ?? 0) <= 0 },
];

const MA_BUCKETS: Bucket[] = [
  {
    label: "5MA>25MA>75MA(上昇配列)",
    match: (r) =>
      !!r.indicatorValues && r.indicatorValues.sma5 > r.indicatorValues.sma25 && r.indicatorValues.sma25 > r.indicatorValues.sma75,
  },
  {
    label: "5MA<25MA<75MA(下降配列)",
    match: (r) =>
      !!r.indicatorValues && r.indicatorValues.sma5 < r.indicatorValues.sma25 && r.indicatorValues.sma25 < r.indicatorValues.sma75,
  },
  {
    label: "その他(配列が乱れている)",
    match: (r) =>
      !!r.indicatorValues &&
      !(r.indicatorValues.sma5 > r.indicatorValues.sma25 && r.indicatorValues.sma25 > r.indicatorValues.sma75) &&
      !(r.indicatorValues.sma5 < r.indicatorValues.sma25 && r.indicatorValues.sma25 < r.indicatorValues.sma75),
  },
];

const ATR_BUCKETS: Bucket[] = [
  { label: "ATR<2%", match: (r) => r.atrPercent < 2 },
  { label: "ATR 2-4%", match: (r) => r.atrPercent >= 2 && r.atrPercent < 4 },
  { label: "ATR 4-6%", match: (r) => r.atrPercent >= 4 && r.atrPercent < 6 },
  { label: "ATR>=6%", match: (r) => r.atrPercent >= 6 },
];

const VOLUME_BUCKETS: Bucket[] = [
  { label: "出来高倍率<1.0", match: (r) => r.volumeRatio < 1.0 },
  { label: "出来高倍率 1.0-1.5", match: (r) => r.volumeRatio >= 1.0 && r.volumeRatio < 1.5 },
  { label: "出来高倍率 1.5-2.0", match: (r) => r.volumeRatio >= 1.5 && r.volumeRatio < 2.0 },
  { label: "出来高倍率>=2.0", match: (r) => r.volumeRatio >= 2.0 },
];

const EARNINGS_BUCKETS: Bucket[] = [
  { label: "決算リスクフラグあり(直近)", match: (r) => r.earningsRiskFlag === true },
  { label: "決算情報あり・リスク範囲外", match: (r) => r.earningsRiskFlag === false && r.earningsDate != null },
  { label: "決算情報なし", match: (r) => r.earningsDate == null },
];

const REGIME_BUCKETS: Bucket[] = [
  { label: "地合い:強い", match: (r) => r.marketCondition === "強い" },
  { label: "地合い:中立", match: (r) => r.marketCondition === "中立" },
  { label: "地合い:弱い", match: (r) => r.marketCondition === "弱い" },
];

interface IndicatorGroupResult {
  name: string;
  rows: StatRow[];
}

function allIndicatorGroups(records: VerificationRecord[]): IndicatorGroupResult[] {
  return [
    { name: "RSI", rows: bucketStats(records, RSI_BUCKETS) },
    { name: "MACD", rows: bucketStats(records, MACD_BUCKETS) },
    { name: "移動平均線配列(5/25/75MA)", rows: bucketStats(records, MA_BUCKETS) },
    { name: "ATR(変動率)", rows: bucketStats(records, ATR_BUCKETS) },
    { name: "出来高倍率", rows: bucketStats(records, VOLUME_BUCKETS) },
    { name: "決算前後", rows: bucketStats(records, EARNINGS_BUCKETS) },
    { name: "地合い", rows: bucketStats(records, REGIME_BUCKETS) },
  ];
}

// ── 改善候補（テキスト化のみ・コード反映なし） ──────────────────────
interface ImprovementCandidate {
  text: string;
  winRate: number;
  n: number;
}

function buildImprovementCandidates(groups: IndicatorGroupResult[]): ImprovementCandidate[] {
  const candidates: ImprovementCandidate[] = [];
  for (const group of groups) {
    for (const row of group.rows) {
      if (row.confidence === "unusable" || row.winRate === null) continue;
      candidates.push({ text: `${group.name}「${row.label}」（勝率${row.winRate}%, n=${row.n}, ${confidenceLabel(row.confidence)}）`, winRate: row.winRate, n: row.n });
    }
  }
  // 勝率が低い順（外れやすい＝改善余地がある条件）にTOP5
  return candidates.sort((a, b) => a.winRate - b.winRate).slice(0, 5);
}

function buildBiggestMisses(records: VerificationRecord[]): VerificationRecord[] {
  return records
    .filter((r) => r.outcome === "loss" && r.day5)
    .sort((a, b) => {
      // 買いなら大きく下落したもの、売りなら大きく上昇したものほど「外れが大きい」
      const magA = a.signal === "買い" ? -a.day5!.changePercent : a.day5!.changePercent;
      const magB = b.signal === "買い" ? -b.day5!.changePercent : b.day5!.changePercent;
      return magB - magA;
    })
    .slice(0, 5);
}

// ── メイン：週次レポートMarkdown生成 ────────────────────────────
export interface WeeklyReportMeta {
  weekKey: string; // 例: 2026-W34
  mondayKey: string;
  fridayKey: string;
  generatedAt: string;
}

export function computeWeekMeta(referenceDateKey: string): WeeklyReportMeta {
  const ref = parseDateKey(referenceDateKey);
  const { monday } = weekRange(ref);
  const friday = new Date(monday);
  friday.setUTCDate(monday.getUTCDate() + 4);
  return {
    weekKey: isoWeekKey(ref),
    mondayKey: formatDateKey(monday),
    fridayKey: formatDateKey(friday),
    generatedAt: new Date().toISOString(),
  };
}

export function generateWeeklyReportMarkdown(allRecords: VerificationRecord[], referenceDateKey: string): { markdown: string; meta: WeeklyReportMeta } {
  const meta = computeWeekMeta(referenceDateKey);
  const weekRecords = allRecords.filter((r) => r.judgedAt >= meta.mondayKey && r.judgedAt <= meta.fridayKey);

  const buyRecords = weekRecords.filter((r) => r.signal === "買い");
  const sellRecords = weekRecords.filter((r) => r.signal === "売り");
  const observedRecords = weekRecords.filter((r) => r.outcome === "observed" || r.entryBlockLevel === "blocked" || r.todayAction === "見送り");
  const top3Records = reconstructTop3ForWeek(weekRecords);

  const scoreBuckets: Bucket[] = [
    { label: "80-100", match: (r) => r.score >= 80 },
    { label: "65-79", match: (r) => r.score >= 65 && r.score <= 79 },
    { label: "36-64", match: (r) => r.score >= 36 && r.score <= 64 },
    { label: "20-35", match: (r) => r.score >= 20 && r.score <= 35 },
    { label: "0-19", match: (r) => r.score <= 19 },
  ];
  const scoreRows = bucketStats(weekRecords.filter((r) => r.signal === "買い" || r.signal === "売り"), scoreBuckets);

  const indicatorGroups = allIndicatorGroups(weekRecords.filter((r) => r.signal === "買い" || r.signal === "売り"));
  const improvementCandidates = buildImprovementCandidates(indicatorGroups);
  const biggestMisses = buildBiggestMisses(weekRecords);

  const lowSampleWarnings = indicatorGroups.flatMap((g) => g.rows.filter((r) => r.confidence === "unusable" && r.n > 0).map((r) => `${g.name}「${r.label}」(n=${r.n})`));

  const lines: string[] = [];
  lines.push(`# TradeCoach AI 週次検証レポート ${meta.weekKey}（${meta.mondayKey}〜${meta.fridayKey}）`);
  lines.push("");
  lines.push(`生成日時: ${meta.generatedAt}`);
  lines.push("");
  lines.push("> このレポートは自動生成された検証データの集計です。AIスコア配点・シグナル判定条件・EntryBlock条件・TOP3抽出条件はこのレポートによって自動変更されることはありません。改善候補はあくまで提案であり、反映するかどうかは人間が判断してください。");
  lines.push("");

  lines.push("## 1. 今週の総判定数");
  lines.push("");
  lines.push(`- 総判定数: ${weekRecords.length}件（買い ${buyRecords.length} / 売り ${sellRecords.length} / 待ち・休み・見送り等 ${weekRecords.length - buyRecords.length - sellRecords.length}）`);
  lines.push(`- うち決済済み: ${weekRecords.filter((r) => r.outcome !== "pending").length}件 / 判定待ち(pending): ${weekRecords.filter((r) => r.outcome === "pending").length}件`);
  lines.push("");

  lines.push("## 2. 買い判定の成績");
  lines.push("");
  lines.push("| 区分 | n | win | loss | 勝率 | 信頼度 |");
  lines.push("|---|---|---|---|---|---|");
  lines.push(statRowToMarkdownLine(computeStatRow("買い（全体）", buyRecords)));
  lines.push("");

  lines.push("## 3. 売り判定の成績");
  lines.push("");
  lines.push("| 区分 | n | win | loss | 勝率 | 信頼度 |");
  lines.push("|---|---|---|---|---|---|");
  lines.push(statRowToMarkdownLine(computeStatRow("売り（全体）", sellRecords)));
  lines.push("");

  lines.push("## 4. TOP3の成績");
  lines.push("");
  lines.push("スコア80点以上・買いシグナルの上位3件（rankings.tsのTOP3抽出条件をレポート側で再現した近似値。confidenceによるtie-breakは未反映のため、同点銘柄の順序が実際のLINE通知と異なる場合があります）。");
  lines.push("");
  lines.push("| 区分 | n | win | loss | 勝率 | 信頼度 |");
  lines.push("|---|---|---|---|---|---|");
  lines.push(statRowToMarkdownLine(computeStatRow("TOP3(再現値)", top3Records)));
  lines.push("");

  lines.push("## 5. 待ち・休み・見送り後の値動き");
  lines.push("");
  lines.push("方向性のある勝敗はつけられないため、判定後の平均絶対変化率（値動きの大きさ）のみ示す。");
  lines.push("");
  lines.push("| 区分 | n | day1平均絶対変化率 | day3平均絶対変化率 | day5平均絶対変化率 | 信頼度 |");
  lines.push("|---|---|---|---|---|---|");
  {
    const row = computeObservedRow("待ち/休み/見送り", observedRecords);
    lines.push(`| ${row.label} | ${row.n} | ${row.avgAbsDay1 ?? "-"}% | ${row.avgAbsDay3 ?? "-"}% | ${row.avgAbsDay5 ?? "-"}% | ${confidenceLabel(confidenceLevel(row.n))} |`);
  }
  lines.push("");

  lines.push("## 6. AIスコア帯別成績");
  lines.push("");
  lines.push("| スコア帯 | n | win | loss | 勝率 | 信頼度 |");
  lines.push("|---|---|---|---|---|---|");
  for (const row of scoreRows) lines.push(statRowToMarkdownLine(row));
  lines.push("");

  lines.push("## 7. 決算前後の成績");
  lines.push("");
  lines.push("| 区分 | n | win | loss | 勝率 | 信頼度 |");
  lines.push("|---|---|---|---|---|---|");
  for (const row of indicatorGroups.find((g) => g.name === "決算前後")!.rows) lines.push(statRowToMarkdownLine(row));
  lines.push("");

  lines.push("## 8. 地合い別成績");
  lines.push("");
  lines.push("| 区分 | n | win | loss | 勝率 | 信頼度 |");
  lines.push("|---|---|---|---|---|---|");
  for (const row of indicatorGroups.find((g) => g.name === "地合い")!.rows) lines.push(statRowToMarkdownLine(row));
  lines.push("");

  lines.push("## 9. 指標別に良かった条件 / ## 10. 外れやすかった条件");
  lines.push("");
  for (const group of indicatorGroups) {
    if (group.name === "決算前後" || group.name === "地合い") continue; // 7・8で既出のため重複掲載しない
    lines.push(`### ${group.name}`);
    lines.push("");
    lines.push("| 条件 | n | win | loss | 勝率 | 信頼度 |");
    lines.push("|---|---|---|---|---|---|");
    for (const row of group.rows) lines.push(statRowToMarkdownLine(row));
    lines.push("");
  }

  lines.push("## 11. 大きく外れた判定（上位5件）");
  lines.push("");
  if (biggestMisses.length === 0) {
    lines.push("該当なし（今週、大きく外れたdecided判定はありませんでした）。");
  } else {
    lines.push("| 銘柄コード | 銘柄名 | 判定日 | シグナル | スコア | day5変化率 |");
    lines.push("|---|---|---|---|---|---|");
    for (const r of biggestMisses) {
      lines.push(`| ${r.code} | ${r.name} | ${r.judgedAt} | ${r.signal} | ${r.score} | ${r.day5?.changePercent ?? "-"}% |`);
    }
  }
  lines.push("");

  lines.push("## 12. 改善候補TOP5（提案のみ・自動反映なし）");
  lines.push("");
  lines.push("**重要: これはテキストによる提案です。AIスコア配点・シグナル判定条件・EntryBlock条件・TOP3抽出条件には一切反映されません。次バージョンで実装するかはユーザーまたはChatGPTが内容を確認して判断してください。**");
  lines.push("");
  if (improvementCandidates.length === 0) {
    lines.push("該当なし（信頼度のある候補がまだありません）。");
  } else {
    improvementCandidates.forEach((c, i) => lines.push(`${i + 1}. ${c.text} — 勝率が低めのため、この条件下での判定基準を見直す余地があるかもしれません。`));
  }
  lines.push("");

  lines.push("## 13. サンプル数が少なく判断できない項目（n<10）");
  lines.push("");
  if (lowSampleWarnings.length === 0) {
    lines.push("該当なし。");
  } else {
    for (const w of lowSampleWarnings) lines.push(`- ${w}`);
  }
  lines.push("");

  return { markdown: lines.join("\n"), meta };
}
