import { getOpenPositions, getPortfolioState } from "../portfolioManager";
import { getStrategyConfig } from "../config";
import type { PaperPosition } from "../types";
import type { Broker, OrderRequest, OrderResult } from "./types";

// 設計書§12。JSONストアに対するBroker実装。
// engine.ts は実際の約定計算・冪等性チェック等をpositionSizer/executionSimulator/portfolioManagerで
// 直接行うため、このクラスはBroker interfaceの形を担保するための読み取り専用ラッパーとして提供する。
// placeOrder()自体は「注文を受け付けるかどうか」の入口を将来のLiveBroker実装と揃えるために用意するが、
// Phase 1では実際の約定確定はengine.tsの6段構成フロー側が行う（このメソッド経由の発注は使わない）。
export class PaperBroker implements Broker {
  async getCashBalance(strategyId: string): Promise<number> {
    const config = await getStrategyConfig(strategyId);
    const state = await getPortfolioState(strategyId, config.initialCapital);
    return state.cash;
  }

  async getOpenPositions(strategyId: string): Promise<PaperPosition[]> {
    return getOpenPositions(strategyId);
  }

  async placeOrder(_order: OrderRequest): Promise<OrderResult> {
    return { accepted: false, reason: "not_implemented_use_engine" };
  }
}
