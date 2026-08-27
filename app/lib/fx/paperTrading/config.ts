// FX版Paper Trading（仮想運用）専用の設定値。分析エンジン側のFX_CONFIG（app/lib/fx/config.ts）
// とは完全に別物で、こちらは「資金管理・約定コスト・監視タイミング」だけを扱う。
// 分析ロジック・スコアリング・判定閾値には一切関与しない。
export const PAPER_TRADING_CONFIG = {
  // 初期資金（円）
  initialEquityJPY: 500_000,

  // 1トレードあたりの最大許容リスク（総資産に対する割合）。
  // SL距離だけでなく、spread・通常slippageを含めた最大想定損失がこの割合以内になるよう
  // 数量を逆算する（positionSizing.ts）。
  riskPercentPerTrade: 0.01,

  // レバレッジ上限（総資産の何倍までの想定元本を建てられるか）。
  // 日本の個人向けFX規制上の上限は25倍だが、「単純に最大まで使わない」という方針のため
  // 初期値は10倍に抑える。
  leverageCapMultiple: 10,

  // 実際に取引可能な最小単位（通貨単位）。証券会社により1〜10,000通貨と幅があるため、
  // 保守的な中間値を初期値とする。将来、対象証券会社が決まった時点で調整する。
  minTradableUnit: 1_000,

  // スプレッド（円）。USD/JPYの実勢を踏まえ、平常時の目安として0.3銭=0.003円を初期値とする。
  // エントリー・決済の両方で半分ずつ（往復で1回ぶん）発生するものとして扱う（fills.ts参照）。
  spreadJPY: 0.003,

  // 通常時のスリッページ（円）。0.2銭=0.002円。
  // Stop Loss・タイムアウト決済のみに適用し、Take Profit（指値的な性質）には適用しない。
  // 週末ギャップ・急変時はこの固定値ではなく、実際に観測された価格で約定させる
  // 別ルールを使う（tradeOutcome.tsのgapFill判定）。
  normalSlippageJPY: 0.002,

  // エントリー待ちのタイムアウト（ms）。Entryゾーンに来ないまま経過したら見送りとする。
  entryTimeoutMs: 24 * 60 * 60 * 1000,

  // 最大保有期間（営業日）。FXは土日が休場のため、暦日ではなく営業日（月〜金）で数える。
  maxHoldingBusinessDays: 5,

  // ポジション監視に使う足種。「5〜15分ごとの現在価格だけを比較」ではなく、
  // 前回監視時刻から今回までの全確定バーのHigh/Lowを走査するため、最も細かい5分足を使う。
  monitoringTimeframe: "5m" as const,

  // 記録するトレードがどのバージョンの分析ロジックで生成されたかの目印。
  // 将来ロジックを変更した際に、どの結果がどのロジックによるものか区別できるようにする。
  analysisVersion: "fx-phase1",
};

export type PaperTradingConfig = typeof PAPER_TRADING_CONFIG;
