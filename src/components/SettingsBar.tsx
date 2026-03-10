import type { ContentSettings, SeniorityOption, DepthOption, FormatOption } from "@/types/content";
import { Pencil } from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface SettingsBarProps {
  settings: ContentSettings;
  selectedFormats: FormatOption[];
  onUpdate: (settings: Partial<ContentSettings>) => void;
  onToggleFormat: (fmt: FormatOption) => void;
}

const DEPTH: { value: DepthOption; label: string }[] = [
  { value: "high-level", label: "High-level" },
  { value: "balanced", label: "Balanced" },
  { value: "deep-dive", label: "Deep dive" },
];

const FORMATS: { value: FormatOption; label: string }[] = [
  { value: "linkedinLong", label: "Long-Form" },
  { value: "linkedinShort", label: "Short-Form" },
  { value: "sponsoredAds", label: "Ads" },
];

const AUDIENCES: { value: SeniorityOption; label: string }[] = [
  { value: "executive", label: "Executive" },
  { value: "professional", label: "Professional" },
];

type DropdownKey = "format" | "audience" | "depth" | null;

function InlineDropdown<T extends string>({
  label,
  value,
  options,
  onSelect,
  isOpen,
  onToggle,
  onClose,
}: {
  label: string;
  value: string;
  options: { value: T; label: string }[];
  onSelect: (v: T) => void;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    if (isOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, onClose]);

  return (
    <div className="relative inline-flex items-center" ref={ref}>
      <button
        onClick={onToggle}
        className="flex items-center gap-1 text-xs text-foreground hover:text-primary transition-colors"
      >
        <span className="text-muted-foreground">{label}:</span>
        <span className="font-medium">{value}</span>
        <Pencil className="w-2.5 h-2.5 text-muted-foreground" />
      </button>
      {isOpen && (
        <div className="absolute top-full mt-1 left-0 min-w-[140px] bg-popover border border-border rounded-lg shadow-xl z-50 py-1 animate-in fade-in slide-in-from-top-2 duration-150">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onSelect(opt.value); onClose(); }}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                value === opt.label ? "text-primary bg-primary/5" : "text-foreground hover:bg-muted"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SettingsBar({ settings, selectedFormats, onUpdate, onToggleFormat }: SettingsBarProps) {
  const [openDropdown, setOpenDropdown] = useState<DropdownKey>(null);

  const formatLabel = selectedFormats
    .map((f) => FORMATS.find((o) => o.value === f)?.label || f)
    .join(", ");
  const audienceLabel = AUDIENCES.find((a) => a.value === settings.seniority)?.label || settings.seniority;
  const depthLabel = DEPTH.find((d) => d.value === settings.depth)?.label || settings.depth;

  return (
    <div className="flex items-center gap-4 px-6 py-2 border-b border-border bg-ink-deep">
      <InlineDropdown
        label="Format"
        value={formatLabel}
        options={FORMATS}
        onSelect={onToggleFormat}
        isOpen={openDropdown === "format"}
        onToggle={() => setOpenDropdown(openDropdown === "format" ? null : "format")}
        onClose={() => setOpenDropdown(null)}
      />
      <span className="text-border">·</span>
      <InlineDropdown
        label="Audience"
        value={audienceLabel}
        options={AUDIENCES}
        onSelect={(v) => onUpdate({ seniority: v })}
        isOpen={openDropdown === "audience"}
        onToggle={() => setOpenDropdown(openDropdown === "audience" ? null : "audience")}
        onClose={() => setOpenDropdown(null)}
      />
      <span className="text-border">·</span>
      <InlineDropdown
        label="Depth"
        value={depthLabel}
        options={DEPTH}
        onSelect={(v) => onUpdate({ depth: v })}
        isOpen={openDropdown === "depth"}
        onToggle={() => setOpenDropdown(openDropdown === "depth" ? null : "depth")}
        onClose={() => setOpenDropdown(null)}
      />
    </div>
  );
}
