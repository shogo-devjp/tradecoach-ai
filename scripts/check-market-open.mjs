#!/usr/bin/env node
// JPX（日本取引所グループ）の営業日かどうかを判定する。休場日（土日・年末年始・祝日）なら
// exit code 1、営業日なら exit code 0。判定ロジック本体は scripts/lib/marketCalendar.mjs に
// 切り出し済み（Version 1.3で週次レポート判定と共有するため）。挙動・出力メッセージは変更していない。
import { getJstDateParts, isTradingDay, getClosedReasons } from "./lib/marketCalendar.mjs";

const parts = getJstDateParts();

if (!isTradingDay(parts)) {
  console.error(`market closed (${getClosedReasons(parts).join(", ")})`);
  process.exit(1);
}
process.exit(0);
