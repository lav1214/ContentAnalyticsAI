import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { SourceAnalysis, SessionState } from "@/types/content";
import type { PDFParseResult } from "@/services/pdfParser";

interface PipelineActions {
  addMessage: (msg: { role: "assistant" | "user"; content: string }) => void;
  setSourceAnalysis: (analysis: SourceAnalysis) => void;
  setPhase: (phase: SessionState["phase"]) => void;
  setSourceText: (text: string) => void;
  updatePerspective: (p: Record<string, any>) => void;
}

interface ChunkResult {
  id: string;
  label: string;
  text: string;
  charRange: [number, number];
}

export function usePDFPipeline() {
  const processWithChunking = useCallback(
    async (
      fullText: string,
      pdfResult: PDFParseResult,
      session: SessionState,
      actions: PipelineActions,
      fallback: (text: string, session: SessionState, actions: any, pdf?: PDFParseResult) => Promise<void>
    ) => {
      const { addMessage, setSourceAnalysis, setPhase, setSourceText } = actions;

      setSourceText(fullText);
      setPhase("analyzing");

      // Stage 1: Chunk the document
      let chunks: ChunkResult[];
      try {
        const { data, error } = await supabase.functions.invoke("chunk-document", {
          body: { text: fullText, totalPages: pdfResult.totalPages },
        });
        if (error || data?.error) {
          throw new Error(data?.error || error?.message || "Chunking failed");
        }
        chunks = data.chunks;
        addMessage({
          role: "assistant",
          content: `Analyzing ${chunks.length} sections in parallel (${data.strategy} split)...`,
        });
      } catch (err) {
        console.error("Chunking failed, falling back:", err);
        addMessage({
          role: "assistant",
          content: "Could not process document structure. Trying standard analysis...",
        });
        await fallback(fullText, session, actions, pdfResult);
        return;
      }

      // Stage 2: Parallel analysis of each chunk
      const chunkResults: any[] = [];
      const failedChunks: number[] = [];

      const results = await Promise.allSettled(
        chunks.map((chunk, i) =>
          supabase.functions.invoke("analyze-document", {
            body: {
              text: chunk.text,
              inputType: "document",
              chunkLabel: chunk.label,
              chunkIndex: i + 1,
              totalChunks: chunks.length,
            },
          })
        )
      );

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === "fulfilled" && result.value.data?.analysis) {
          chunkResults.push(result.value.data.analysis);
        } else {
          failedChunks.push(i + 1);
          console.error(`Chunk ${i + 1} failed:`, result.status === "rejected" ? result.reason : result.value.error);
        }
      }

      if (chunkResults.length === 0) {
        addMessage({
          role: "assistant",
          content: "All section analyses failed. Falling back to standard analysis...",
        });
        await fallback(fullText, session, actions, pdfResult);
        return;
      }

      if (failedChunks.length > 0) {
        addMessage({
          role: "assistant",
          content: `⚠️ ${failedChunks.length} section(s) couldn't be analyzed (${failedChunks.join(", ")}). Continuing with ${chunkResults.length} successful sections.`,
        });
      }

      addMessage({
        role: "assistant",
        content: "Sections analyzed. Synthesizing into unified strategy...",
      });

      // Stage 3: Synthesize
      const pageImages = pdfResult.pages.filter((p) => p.imageBase64);
      try {
        const { data, error } = await supabase.functions.invoke("synthesize-chunks", {
          body: {
            chunkAnalyses: chunkResults,
            chunkLabels: chunks.filter((_, i) => !failedChunks.includes(i + 1)).map((c) => c.label),
            pageImages: pageImages.slice(0, 8).map((p) => ({
              pageNumber: p.pageNumber,
              imageBase64: p.imageBase64,
            })),
            totalPages: pdfResult.totalPages,
          },
        });

        if (error || data?.error) {
          throw new Error(data?.error || error?.message || "Synthesis failed");
        }

        const analysis: SourceAnalysis = {
          coreThesis: data.analysis.coreThesis,
          keyInsights: data.analysis.keyInsights,
          dataPoints: [data.analysis.mostSurprisingStatistic, data.analysis.mostDefensibleClaim],
          controversialClaim: data.analysis.controversialIdea,
          likelyAudience: data.analysis.likelyAudience,
          commercialImplication: data.analysis.commercialImplication,
          visualAnalysis: data.analysis.visualAnalysis || [],
          recommendedNarrativeAngle: data.analysis.recommendedNarrativeAngle,
          suggestedHook: data.analysis.suggestedHook,
          primaryKeyword: data.analysis.primaryKeyword,
          hashtags: data.analysis.hashtags,
        };

        setSourceAnalysis(analysis);
        setPhase("intake");

        addMessage({
          role: "assistant",
          content: `✅ Done — I've synthesized all ${pdfResult.totalPages} pages (${chunkResults.length} sections) into a unified content strategy. The full analysis is ready for your review.`,
        });
      } catch (err) {
        console.error("Synthesis failed, retrying with first+last chunks:", err);
        addMessage({
          role: "assistant",
          content: "Synthesis failed. Retrying with key sections...",
        });

        // Retry with only first and last chunk
        const retryChunks = chunkResults.length > 1
          ? [chunkResults[0], chunkResults[chunkResults.length - 1]]
          : chunkResults;

        try {
          const { data, error } = await supabase.functions.invoke("synthesize-chunks", {
            body: {
              chunkAnalyses: retryChunks,
              chunkLabels: ["Opening", "Conclusion"],
              totalPages: pdfResult.totalPages,
            },
          });

          if (error || data?.error) {
            throw new Error(data?.error || error?.message || "Retry synthesis failed");
          }

          const analysis: SourceAnalysis = {
            coreThesis: data.analysis.coreThesis,
            keyInsights: data.analysis.keyInsights,
            dataPoints: [data.analysis.mostSurprisingStatistic, data.analysis.mostDefensibleClaim],
            controversialClaim: data.analysis.controversialIdea,
            likelyAudience: data.analysis.likelyAudience,
            commercialImplication: data.analysis.commercialImplication,
            visualAnalysis: data.analysis.visualAnalysis || [],
            recommendedNarrativeAngle: data.analysis.recommendedNarrativeAngle,
            suggestedHook: data.analysis.suggestedHook,
            primaryKeyword: data.analysis.primaryKeyword,
            hashtags: data.analysis.hashtags,
          };

          setSourceAnalysis(analysis);
          setPhase("intake");

          addMessage({
            role: "assistant",
            content: `Done — synthesized from key sections of the ${pdfResult.totalPages}-page document. Some middle sections were skipped.`,
          });
        } catch (retryErr) {
          console.error("Retry synthesis also failed:", retryErr);
          addMessage({
            role: "assistant",
            content: "Synthesis couldn't be completed. Falling back to standard analysis...",
          });
          await fallback(fullText, session, actions, pdfResult);
        }
      }
    },
    []
  );

  return { processWithChunking };
}
