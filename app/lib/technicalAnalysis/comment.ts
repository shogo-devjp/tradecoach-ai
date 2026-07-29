import type { EntryBlockLevel, EntryTiming, MarketCondition, Signal, TrendDirection } from "./types";
import { PRICE_LEVEL_LABEL } from "./displayLabels";

export interface CommentContext {
  signal: Signal;
  trend: TrendDirection;
  confidence: number;
  rsiValue: number;
  reasons: string[];
  entryPrice: number;
  takeProfit: number;
  stopLoss: number;
  riskReward: number;
  atrPercent: number;
  entryBlockLevel: EntryBlockLevel;
  entryBlockReason: string | null;
  entryTiming: EntryTiming;
  support: number;
  resistance: number;
  marketCondition: MarketCondition;
}

function yen(value: number): string {
  return `${Math.round(value).toLocaleString()}円`;
}

function buildPriceSentence(ctx: CommentContext): string {
  return `目安として、${PRICE_LEVEL_LABEL.entry}は${yen(ctx.entryPrice)}付近、${PRICE_LEVEL_LABEL.takeProfit}は${yen(ctx.takeProfit)}、${PRICE_LEVEL_LABEL.stopLoss}は${yen(ctx.stopLoss)}になります。リスクとリターンのバランス（リスクリワード比${ctx.riskReward.toFixed(1)}倍）の参考にしてください。`;
}

function buildCautionSentence(ctx: CommentContext): string {
  if (ctx.entryBlockLevel !== "caution" || !ctx.entryBlockReason) return "";
  return `ただし${ctx.entryBlockReason}ポジションは小さめにするなど、無理のない範囲で判断しましょう。`;
}

// 「買い」判定の中でも、今日やること（entryTiming）に応じて
// 「なぜ今動けるのか／なぜ休む・待つべきか／何円まで下がれば有利か／どこを抜ければ有利か」を
// 初心者向けに自然な話し言葉で説明する。断定は避け「分析上は」等のヘッジを含める。
function buildBuySignalComment(ctx: CommentContext): string {
  const { trend, marketCondition, support, resistance, reasons } = ctx;
  const priceSentence = buildPriceSentence(ctx);
  const cautionSentence = buildCautionSentence(ctx);
  const reasonHint = reasons.length > 0 ? `（${reasons.slice(0, 2).join("、")}）` : "";

  if (ctx.entryTiming === "本日は休みましょう") {
    if (marketCondition === "弱い") {
      return `個別銘柄だけを見れば買いの条件はそろっていますが、日経平均・TOPIXなど市場全体の勢いが弱く、今は逆風の中での判断になります。無理に動かず、市場全体が落ち着くまで休むのがおすすめです。`;
    }
    return `値動きの幅が大きく、リスク管理が難しい状況です。分析上は買いの条件がそろっていても、無理をせず今日は休むのも良い選択です。`;
  }

  if (ctx.entryTiming === "様子見") {
    return `日足は${trend}トレンドですが、短期的な値動き（60分足・15分足）の方向感がそろっておらず、今はどちらに転ぶか読みにくい状態です。もう少し値動きがそろうまで待った方が安心です。`;
  }

  if (ctx.entryTiming === "押し目待ち") {
    return `現在は${trend}トレンドを維持しています${reasonHint}。ただし短期的には勢いが弱まっており、ここで飛び乗るとやや高値づかみになりやすい状況です。焦らず、${PRICE_LEVEL_LABEL.entry}の目安である${yen(support)}付近まで下がって反発を確認できてからの方がエントリーを検討しやすくなります。`;
  }

  if (ctx.entryTiming === "ブレイク待ち") {
    return `現在は${trend}トレンドで、買いの条件はしっかりそろっています${reasonHint}。ただし直近の${PRICE_LEVEL_LABEL.takeProfit}${yen(resistance)}が近く、ここからは一旦伸び悩みやすい水準です。焦らず、${yen(resistance)}を明確に上へ抜けるのを確認してからの方が安心してエントリーを検討できます。`;
  }

  // 今すぐエントリー
  return `現在は${trend}トレンドが続いており、短期的な値動きも同じ方向を向いています${reasonHint}。無理に急ぐ必要はありませんが、分析上は条件がそろっている今、エントリーを検討しやすい場面です。${priceSentence}${cautionSentence}`;
}

export function generateComment(ctx: CommentContext): string {
  const { signal, trend, reasons } = ctx;

  if (ctx.entryBlockLevel === "blocked") {
    return `${ctx.entryBlockReason ?? ""}分析上は${signal}のサインが出ていますが、今日は無理をせず見送るのが賢明です。チャンスはまた巡ってきます。`;
  }

  if (signal === "買い") {
    return buildBuySignalComment(ctx);
  }

  const reasonHint = reasons.length > 0 ? `（${reasons.slice(0, 2).join("、")}）` : "";
  const priceSentence = buildPriceSentence(ctx);
  const cautionSentence = buildCautionSentence(ctx);

  if (signal === "売り") {
    return `現在は${trend}トレンドが続いており、下値を試しやすい状況です${reasonHint}。反発を狙って逆張りするより、今の流れに沿って利益確定・損切りを意識した方が無難でしょう。${priceSentence}${cautionSentence}`;
  }

  return `指標の方向感がバラバラで、現在の状況では強い根拠が出ていません${reasonHint}。無理に売買を急がず、次にはっきりした値動きが出るまで見送るのがおすすめです。${cautionSentence}`;
}
