import type { PaperPosition } from "../types";

// 設計書§12。将来証券会社APIを実装する際もこのインターフェースを実装するだけで済むよう、
// Strategy（判断）・Portfolio（資金管理）・Execution（約定計算）とBroker（実際の売買主体）を分離する。
export interface OrderRequest {
  strategyId: string;
  code: string;
  side: "BUY" | "SELL";
  shares: number;
  referencePrice: number; // 参考値（実際の約定価格はBroker実装側が決める）
}

export interface OrderResult {
  accepted: boolean;
  fillPrice?: number;
  reason?: string;
}

export interface Broker {
  getCashBalance(strategyId: string): Promise<number>;
  getOpenPositions(strategyId: string): Promise<PaperPosition[]>;
  placeOrder(order: OrderRequest): Promise<OrderResult>;
}
