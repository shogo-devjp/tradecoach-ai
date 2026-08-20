import { runDaily, type DailyBarProvider } from "@/app/lib/paperTrading/engine";
import { yahooBarProvider } from "@/app/lib/paperTrading/yahooBarProvider";
import { STRATEGY_A_ID } from "@/app/lib/paperTrading/config";
import { settlePendingUniverseVerificationRecords, type FutureClosesProvider } from "@/app/lib/universeVerification/settle";
import { isTradingDayJst, jstDateKey, jstHHMM } from "@/app/lib/marketCalendar";
import { generateDailyRecordAndMilestones } from "./dailyOrchestration";
import { upsertEveningOrchestrationRecord } from "./eveningOrchestrationStore";
import type { EveningOrchestrationRecord, EveningOrchestrationStep } from "./eveningOrchestrationStore";

function todayKeyJst(now: Date): string {
  return jstDateKey(now);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// 当日の日足OHLCが確定したとみなせる安全な時刻（JST）。これより前はPaper Trading runを
// 開始しない（既存run-paper-trading.sh/run-evening-settle.shの16:00より厳しい、
// このAPI自体が持つ独立したガード。既存シェルスクリプト側の安全窓とは別に、
// API単体が呼ばれても同じ基準で拒否できるようにするための二重防御）。
const EVENING_SETTLE_DEADLINE_HHMM = "16:35";

export interface RunEveningOrchestrationInput {
  date?: string;
  strategyId?: string;
  now?: Date;
  // テスト用の依存注入。省略時は本番実装（Yahoo Finance実通信）を使う。
  barProvider?: DailyBarProvider;
  benchmarkBarProvider?: DailyBarProvider;
  closesProvider?: FutureClosesProvider;
}

export interface EveningOrchestrationResult {
  record: EveningOrchestrationRecord;
}

// 想定運用（§10・本タスクの要求）：
//   16:35頃 ①Paper Trading run → ②Universe Verification settle →
//           ③Challenge Daily Record生成 → ④Milestone判定 → 終了ログ
//
// 朝側（morningOrchestration.ts）と同じ思想で「前段が正常完了した場合のみ次段へ進む」。
// ただし重要な非対称性：③④（Challenge記録）の失敗は、Paper Trading本体（①の確定済み取引・
// PaperPortfolioSnapshot・PaperPortfolioState）にもUniverse Verification（②の確定済みsettle結果）
// にも一切書き込み・ロールバックを行わない。Paper Tradingが金融記録のSingle Source of Truthで
// あるという原則を守るため、①②はこの関数の外側にある既存の確定済み処理（runDaily・
// settlePendingUniverseVerificationRecords）をそのまま呼ぶだけで、失敗時も"別エラー"として
// ログに記録するのみで巻き戻しは一切行わない。
//
// ③（Challenge Daily Record）はPaper Tradingの確定データを読み取るだけで②の結果には依存しない
// ため、②が失敗してこの関数が③へ進めなかった場合でも、既存の
// POST /api/v1/challenge/daily-record を後から個別に呼べば③④だけを安全に再生成できる
// （runDaily・settle・buildAndSaveDailyRecord・detectAndRecordMilestonesはいずれも
// 同一日の再実行に対して冪等）。
export async function runEveningOrchestration(input: RunEveningOrchestrationInput = {}): Promise<EveningOrchestrationResult> {
  const now = input.now ?? new Date();
  const date = input.date ?? todayKeyJst(now);
  const strategyId = input.strategyId ?? STRATEGY_A_ID;
  const barProvider = input.barProvider ?? yahooBarProvider;
  const benchmarkBarProvider = input.benchmarkBarProvider ?? barProvider;

  let paperTradingCompletedAt: string | null = null;
  let verificationSettledAt: string | null = null;
  let dailyRecordGeneratedAt: string | null = null;
  let milestonesProcessedAt: string | null = null;
  let successStep: EveningOrchestrationStep | null = null;
  let failedStep: EveningOrchestrationStep | null = null;
  let errorReason: string | null = null;

  // --- API側の時間帯fail-safe（二重防御。既存シェルスクリプトの安全窓とは独立した「呼び出しの
  //     入口」でのガード）。テストはnowを明示的に注入して時刻を制御する（本番と全く同じこの
  //     関数・同じ判定を通す。「テスト時だけ無条件通過する」ような分岐は存在しない）。
  //     ①非営業日（土日・年末年始・祝日）はPaper Trading runを開始しない。
  //     ②16:35 JSTより前はPaper Trading runを開始しない（当日の日足がまだ確定していない
  //       可能性が高いため）。
  const skipReason = !isTradingDayJst(now) ? "not_a_trading_day" : jstHHMM(now) < EVENING_SETTLE_DEADLINE_HHMM ? "before_settle_window" : null;

  if (skipReason) {
    const record = await upsertEveningOrchestrationRecord(date, {
      paperTradingCompletedAt: null,
      verificationSettledAt: null,
      dailyRecordGeneratedAt: null,
      milestonesProcessedAt: null,
      successStep: null,
      failedStep: null,
      errorReason: null,
      skipReason,
      retrySafe: true,
    });
    return { record };
  }

  // --- ① Paper Trading run（既存engine.tsをそのまま呼ぶ。判断・約定ロジックには一切手を加えない） ---
  try {
    await runDaily({ strategyId, date, barProvider, benchmarkBarProvider, now });
    paperTradingCompletedAt = new Date().toISOString();
    successStep = "paper_trading_run";
  } catch (error) {
    failedStep = "paper_trading_run";
    errorReason = errorMessage(error);
  }

  // --- ② Universe Verification settle（①が正常完了した場合のみ進む） ---
  if (!failedStep) {
    try {
      await settlePendingUniverseVerificationRecords(input.closesProvider);
      verificationSettledAt = new Date().toISOString();
      successStep = "verification_settle";
    } catch (error) {
      failedStep = "verification_settle";
      errorReason = errorMessage(error);
    }
  }

  // --- ③④ Challenge Daily Record生成 → Milestone判定（②が正常完了した場合のみ進む） ---
  // 失敗してもPaper Trading本体・Universe Verificationのデータには一切触れない
  // （generateDailyRecordAndMilestonesは読み取り専用＋Challenge自身のデータへの追記のみ）。
  if (!failedStep) {
    try {
      const genResult = await generateDailyRecordAndMilestones({ date, strategyId, now });
      if (genResult.record && genResult.dailyRecordGeneratedAt) {
        dailyRecordGeneratedAt = genResult.dailyRecordGeneratedAt;
        successStep = "challenge_daily_record";
        if (genResult.milestonesProcessedAt) {
          milestonesProcessedAt = genResult.milestonesProcessedAt;
          successStep = "milestones";
        }
      } else if (!genResult.recordCreated && genResult.reason !== "already_exists") {
        // fail-safe（例："portfolio_snapshot_not_found"）。Paper Tradingは既に正常完了しているはずの
        // タイミングでこれが起きるのは想定外だが、例外ではなくfail-safeとして返ってくるため
        // その理由をそのままerrorReasonとして記録する（Paper Trading・Verificationは無傷のまま）。
        failedStep = "challenge_daily_record";
        errorReason = genResult.reason ?? "unknown_reason";
      } else {
        // 既に当日分が生成済み（冪等・二重生成防止）。失敗ではないため成功扱いのまま進める。
        successStep = "milestones";
      }
    } catch (error) {
      // detectAndRecordMilestones側で例外が出た場合など。Daily Record自体は保存済みの可能性があるため
      // failedStepはmilestonesとして区別する（dailyRecordGeneratedAtが埋まっているかどうかで判別可能）。
      failedStep = dailyRecordGeneratedAt ? "milestones" : "challenge_daily_record";
      errorReason = errorMessage(error);
    }
  }

  const record = await upsertEveningOrchestrationRecord(date, {
    paperTradingCompletedAt,
    verificationSettledAt,
    dailyRecordGeneratedAt,
    milestonesProcessedAt,
    successStep,
    failedStep,
    errorReason,
    skipReason: null,
    // 各段は同一日の再実行に対して冪等（テストで確認済み）なため、失敗内容によらず再実行してよい。
    retrySafe: true,
  });

  return { record };
}
