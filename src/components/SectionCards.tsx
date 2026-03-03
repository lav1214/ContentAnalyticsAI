import { Pencil } from "lucide-react";

interface SectionCardsProps {
  content: string;
  activeSection: string | null;
  onSelectSection: (section: string) => void;
  onRefineSection: (section: string) => void;
  onUpdateContent: (content: string) => void;
}

const SECTIONS = ["Hook", "Body", "Proof", "CTA"] as const;

function splitIntoSectionBlocks(content: string): { section: string; text: string }[] {
  if (!content) return [];
  const lines = content.split("\n");
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.trim() === "" && current.length > 0) {
      blocks.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current);
  if (blocks.length === 0) return [{ section: "Hook", text: content }];

  const results: { section: string; text: string }[] = [];
  blocks.forEach((block, i) => {
    let section: string;
    if (i === 0) section = "Hook";
    else if (i === blocks.length - 1) section = "CTA";
    else if (i === blocks.length - 2 && blocks.length > 2) section = "Proof";
    else section = "Body";
    results.push({ section, text: block.join("\n") });
  });
  return results;
}

function mergeSections(sectionBlocks: { section: string; text: string }[]): Record<string, string> {
  const merged: Record<string, string[]> = {};
  for (const block of sectionBlocks) {
    if (!merged[block.section]) merged[block.section] = [];
    merged[block.section].push(block.text);
  }
  const result: Record<string, string> = {};
  for (const [key, texts] of Object.entries(merged)) {
    result[key] = texts.join("\n\n");
  }
  return result;
}

export function SectionCards({ content, activeSection, onSelectSection, onRefineSection, onUpdateContent }: SectionCardsProps) {
  const blocks = splitIntoSectionBlocks(content);
  const sections = mergeSections(blocks);

  return (
    <div className="space-y-3 p-4">
      {SECTIONS.map((sec) => {
        const text = sections[sec];
        if (!text) return null;
        const isActive = activeSection === sec;

        return (
          <div
            key={sec}
            onClick={() => onSelectSection(sec)}
            className={`rounded-lg border p-4 transition-all cursor-pointer ${
              isActive
                ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                : "border-border bg-card hover:border-muted-foreground/30"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}>
                {sec}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRefineSection(sec);
                }}
                className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Pencil className="w-3 h-3" />
                Refine
              </button>
            </div>
            <pre className="text-sm leading-relaxed font-mono whitespace-pre-wrap text-foreground">{text}</pre>
          </div>
        );
      })}
    </div>
  );
}
