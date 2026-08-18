#!/usr/bin/env node
// 「今日がJPXの今週最後の営業日か」を判定する。夕方の検証専用スクリプトから呼ばれ、
// 週次レポート（reports/weekly/）を生成するタイミングかどうかを決めるためだけに使う。
// exit code 0 = 今週最後の営業日（週次レポートを生成してよい） / 1 = それ以外（生成しない）
import { getJstDateParts, isLastTradingDayOfWeek } from "./lib/marketCalendar.mjs";

process.exit(isLastTradingDayOfWeek(getJstDateParts()) ? 0 : 1);
