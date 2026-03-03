import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Chunk {
  id: string;
  label: string;
  text: string;
  charRange: [number, number];
}

const SECTION_PATTERNS = [
  /^(executive\s+summary|abstract|introduction|background|overview|findings|results|analysis|discussion|recommendations?|conclusion|appendix|methodology|literature\s+review|references)/i,
];

function isHeadingLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 120) return null;

  // ALL CAPS lines (at least 3 chars, not just numbers)
  if (/^[A-Z][A-Z\s\d\-:&,]{2,}$/.test(trimmed) && /[A-Z]{3,}/.test(trimmed)) {
    return trimmed;
  }

  // Lines ending with ":"
  if (/^[A-Z].{2,80}:$/.test(trimmed)) {
    return trimmed.replace(/:$/, "");
  }

  // Known section names
  for (const pattern of SECTION_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) return trimmed;
  }

  // Numbered sections like "1. Introduction" or "Chapter 2: Methods"
  if (/^(\d+\.?\s+|chapter\s+\d+[:\s])/i.test(trimmed) && trimmed.length < 80) {
    return trimmed;
  }

  return null;
}

function chunkSemantic(text: string, totalPages: number): { chunks: Chunk[]; strategy: "semantic" | "proportional" } {
  const lines = text.split("\n");
  const sections: { label: string; startIdx: number }[] = [];

  // Detect section boundaries
  let charIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const heading = isHeadingLine(lines[i]);
    if (heading) {
      sections.push({ label: heading, startIdx: charIdx });
    }
    charIdx += lines[i].length + 1; // +1 for \n
  }

  // If fewer than 2 headings detected, fall back to proportional
  if (sections.length < 2) {
    return { chunks: chunkProportional(text), strategy: "proportional" };
  }

  // Build section texts
  const sectionTexts: { label: string; text: string; start: number; end: number }[] = [];
  for (let i = 0; i < sections.length; i++) {
    const start = sections[i].startIdx;
    const end = i < sections.length - 1 ? sections[i + 1].startIdx : text.length;
    sectionTexts.push({
      label: sections[i].label,
      text: text.slice(start, end),
      start,
      end,
    });
  }

  // Merge small sections into ~4000 char chunks
  const TARGET_SIZE = 4000;
  const merged: Chunk[] = [];
  let currentText = "";
  let currentLabels: string[] = [];
  let currentStart = sectionTexts[0]?.start ?? 0;

  for (const section of sectionTexts) {
    if (currentText.length + section.text.length > TARGET_SIZE * 1.5 && currentText.length > 500) {
      merged.push({
        id: `chunk_${merged.length + 1}`,
        label: currentLabels.length > 2 
          ? `${currentLabels[0]} — ${currentLabels[currentLabels.length - 1]}`
          : currentLabels.join(" / "),
        text: currentText,
        charRange: [currentStart, currentStart + currentText.length],
      });
      currentText = section.text;
      currentLabels = [section.label];
      currentStart = section.start;
    } else {
      currentText += section.text;
      currentLabels.push(section.label);
    }
  }

  // Push remaining
  if (currentText.length > 0) {
    merged.push({
      id: `chunk_${merged.length + 1}`,
      label: currentLabels.length > 2
        ? `${currentLabels[0]} — ${currentLabels[currentLabels.length - 1]}`
        : currentLabels.join(" / "),
      text: currentText,
      charRange: [currentStart, currentStart + currentText.length],
    });
  }

  // Ensure first 15% and last 15% are always included
  const firstBoundary = Math.floor(text.length * 0.15);
  const lastBoundary = Math.floor(text.length * 0.85);

  // Check if first chunk starts near the beginning
  if (merged.length > 0 && merged[0].charRange[0] > firstBoundary) {
    merged.unshift({
      id: "chunk_0",
      label: "Opening / Introduction",
      text: text.slice(0, firstBoundary),
      charRange: [0, firstBoundary],
    });
    // Re-number
    merged.forEach((c, i) => { c.id = `chunk_${i + 1}`; });
  }

  // Check if last chunk covers the end
  const lastChunk = merged[merged.length - 1];
  if (lastChunk && lastChunk.charRange[1] < lastBoundary) {
    merged.push({
      id: `chunk_${merged.length + 1}`,
      label: "Conclusion / Summary",
      text: text.slice(lastBoundary),
      charRange: [lastBoundary, text.length],
    });
  }

  // Cap at 4 chunks by merging middle ones if needed
  while (merged.length > 4) {
    // Find smallest adjacent pair and merge
    let minSize = Infinity;
    let minIdx = 1;
    for (let i = 1; i < merged.length - 1; i++) {
      const combined = merged[i].text.length + (merged[i + 1]?.text.length || Infinity);
      if (combined < minSize && i + 1 < merged.length) {
        minSize = combined;
        minIdx = i;
      }
    }
    const a = merged[minIdx];
    const b = merged[minIdx + 1];
    if (b) {
      merged.splice(minIdx, 2, {
        id: `chunk_${minIdx + 1}`,
        label: `${a.label} / ${b.label}`,
        text: a.text + b.text,
        charRange: [a.charRange[0], b.charRange[1]],
      });
      merged.forEach((c, i) => { c.id = `chunk_${i + 1}`; });
    } else {
      break;
    }
  }

  return { chunks: merged, strategy: "semantic" };
}

function chunkProportional(text: string): Chunk[] {
  const chunkCount = 4;
  const chunkSize = Math.ceil(text.length / chunkCount);
  const chunks: Chunk[] = [];

  for (let i = 0; i < chunkCount; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, text.length);
    if (start >= text.length) break;

    // Try to break at a sentence/paragraph boundary
    let actualEnd = end;
    if (end < text.length) {
      const nearbyBreak = text.indexOf("\n\n", end - 200);
      if (nearbyBreak > 0 && nearbyBreak < end + 200) {
        actualEnd = nearbyBreak;
      } else {
        const sentenceBreak = text.indexOf(". ", end - 100);
        if (sentenceBreak > 0 && sentenceBreak < end + 100) {
          actualEnd = sentenceBreak + 1;
        }
      }
    }

    chunks.push({
      id: `chunk_${i + 1}`,
      label: `Part ${i + 1} of ${chunkCount}`,
      text: text.slice(start, actualEnd),
      charRange: [start, actualEnd],
    });
  }

  return chunks;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { text, totalPages } = await req.json();

    if (!text || typeof text !== "string" || text.length < 100) {
      return new Response(
        JSON.stringify({ error: "Text too short for chunking." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { chunks, strategy } = chunkSemantic(text, totalPages || 1);

    console.log(JSON.stringify({
      status: "success",
      strategy,
      totalChunks: chunks.length,
      textLength: text.length,
      chunkSizes: chunks.map(c => c.text.length),
    }));

    return new Response(
      JSON.stringify({ chunks, strategy, totalChunks: chunks.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("chunk-document error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
