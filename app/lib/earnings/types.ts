export interface EarningsInfo {
  // 次回決算発表予定日（JST日付、YYYY-MM-DD）。取得できなければnull。
  earningsDate: string | null;
  // Yahoo側が「確定日」ではなく「予測日」として返している場合true。
  // UI文言・分析上の扱いを「確定情報」と誤解させないための情報。
  isEstimate: boolean;
}
