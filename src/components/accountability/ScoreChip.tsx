import { useNavigate } from "react-router-dom";
import { useMyScore } from "@/hooks/useMyScore";

/**
 * Persistent Appraisal Score chip for the sticky top bar.
 * 0–1000 points. Never a currency figure.
 */
export default function ScoreChip() {
  const nav = useNavigate();
  const { data, loading } = useMyScore();

  const score = data?.score ?? null;
  const band = data?.band?.label ?? null;
  const delta = data?.todayDelta ?? 0;
  const empty = score == null;

  return (
    <button
      type="button"
      onClick={() => nav("/my-today")}
      aria-label={empty ? "No score yet" : `Appraisal score ${score} out of 1000, ${band}`}
      className="flex items-center gap-2 h-10 min-h-[40px] pl-2.5 pr-3 rounded-md border border-line bg-white hover:border-[#bbb] transition-colors"
    >
      <span
        className={`font-serif leading-none ${empty ? "text-muted-foreground text-[20px]" : "text-gold text-[26px] sm:text-[28px] font-medium"}`}
      >
        {loading ? "…" : empty ? "—" : score}
      </span>

      {/* Mobile: a single small dot instead of words */}
      <span
        className={`sm:hidden w-1.5 h-1.5 rounded-full ${empty ? "bg-[#888]" : "bg-gold"}`}
        aria-hidden
      />

      <span className="hidden sm:flex flex-col items-start leading-tight">
        <span className="font-sans text-[10px] text-muted-foreground">
          {empty ? "No score yet" : band}
        </span>
        {!empty && delta !== 0 && (
          <span className="font-sans text-[10px] text-muted-foreground">
            {delta > 0 ? `+${delta} today` : `${delta} today`}
          </span>
        )}
      </span>
    </button>
  );
}
