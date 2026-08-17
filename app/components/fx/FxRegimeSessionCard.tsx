import type { FxAnalysisResult } from "@/app/lib/fx/types";
import { REGIME_LABEL, VOLATILITY_LABEL } from "@/app/lib/fx/displayLabels";
import { SESSION_LABEL } from "@/app/lib/fx/sessions/sessions";

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-center">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-white">{value}</p>
    </div>
  );
}

// Market Regime / Session / Trend / Momentum / Volatility を並べて表示する（要件13）
export default function FxRegimeSessionCard({ result }: { result: FxAnalysisResult }) {
  const { regime, session, multiTimeframe } = result;
  const currentTf = multiTimeframe.byTimeframe["1h"];
  const rsi = currentTf?.indicators.rsi14;

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
      <h3 className="text-sm font-semibold text-slate-300">相場環境</h3>

      <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <InfoBox label="Market Regime" value={REGIME_LABEL[regime.state]} />
        <InfoBox
          label="Session"
          value={session.activeSessions.length > 0 ? session.activeSessions.map((s) => SESSION_LABEL[s]).join("・") : "時間外"}
        />
        <InfoBox label="Trend" value={currentTf?.direction ?? "―"} />
        <InfoBox label="Momentum" value={rsi !== null && rsi !== undefined ? `RSI ${rsi.toFixed(0)}` : "―"} />
        <InfoBox label="Volatility" value={VOLATILITY_LABEL[regime.volatilityLevel]} />
      </div>

      <p className="mt-3 text-xs text-slate-400">{regime.comment}</p>
      <p className="mt-1 text-xs text-slate-500">{session.comment}</p>
    </div>
  );
}
