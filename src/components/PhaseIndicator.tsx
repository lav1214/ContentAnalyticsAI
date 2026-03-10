import { Check } from "lucide-react";

export type UIPhase = "setup" | "strategy" | "draft" | "polish" | "preview";

interface PhaseIndicatorProps {
  currentPhase: UIPhase;
  completedPhases: Set<UIPhase>;
}

const PHASES: { key: UIPhase; label: string }[] = [
  { key: "setup", label: "Setup" },
  { key: "strategy", label: "Strategy" },
  { key: "draft", label: "Draft" },
  { key: "polish", label: "Polish" },
  { key: "preview", label: "Preview" },
];

export function PhaseIndicator({ currentPhase, completedPhases }: PhaseIndicatorProps) {
  return (
    <div className="flex flex-col gap-0.5 py-3 px-4 border-b border-border">
      <div className="flex items-center gap-1">
        {PHASES.map((phase, i) => {
          const isCompleted = completedPhases.has(phase.key);
          const isCurrent = currentPhase === phase.key;
          const isFuture = !isCompleted && !isCurrent;

          return (
            <div key={phase.key} className="flex items-center gap-1">
              <div className="flex items-center gap-1.5">
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-all ${
                    isCompleted
                      ? "bg-success text-success-foreground"
                      : isCurrent
                        ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isCompleted ? <Check className="w-3 h-3" /> : i + 1}
                </div>
                <span
                  className={`text-[10px] font-medium transition-colors ${
                    isCompleted
                      ? "text-success"
                      : isCurrent
                        ? "text-foreground"
                        : "text-muted-foreground"
                  }`}
                >
                  {phase.label}
                </span>
              </div>
              {i < PHASES.length - 1 && (
                <div
                  className={`w-6 h-px mx-0.5 ${
                    isCompleted ? "bg-success/50" : "bg-border"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
