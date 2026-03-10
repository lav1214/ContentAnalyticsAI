import { useState, useCallback } from "react";
import type { SessionState, ChatMessage, DraftContent, DraftSnapshot, ContentSettings, SourceAnalysis, StrategicPosition, AngleOption, FormatOption, UserPerspective, ContentBrief } from "@/types/content";
import type { ParsedPDFPage } from "@/services/pdfParser";

const defaultSettings: ContentSettings = {
  tone: "authoritative",
  seniority: "executive",
  depth: "balanced",
};

const defaultDrafts: DraftContent = {
  linkedinLong: "",
  linkedinShort: "",
  sponsoredAds: "",
};


export function useSession() {
  const [session, setSession] = useState<SessionState>({
    id: crypto.randomUUID(),
    messages: [],
    drafts: defaultDrafts,
    settings: defaultSettings,
    sourceText: "",
    sourceAnalysis: null,
    intakeRevisionTarget: null,
    strategicPosition: {},
    selectedAngle: null,
    selectedFormats: [],
    phase: "intake",
    positioningStep: 0,
    clarityScore: 0,
    perspective: {},
    contentBrief: null,
    draftHistory: [],
  });

  const [extractedPageImages, setExtractedPageImages] = useState<ParsedPDFPage[]>([]);

  const addMessage = useCallback((msg: Omit<ChatMessage, "id" | "timestamp">) => {
    const newMsg: ChatMessage = {
      ...msg,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    };
    setSession((prev) => ({
      ...prev,
      messages: [...prev.messages, newMsg],
    }));
    return newMsg;
  }, []);

  const updateDrafts = useCallback((drafts: Partial<DraftContent>) => {
    setSession((prev) => ({
      ...prev,
      drafts: { ...prev.drafts, ...drafts },
    }));
  }, []);

  const updateSettings = useCallback((settings: Partial<ContentSettings>) => {
    setSession((prev) => ({
      ...prev,
      settings: { ...prev.settings, ...settings },
    }));
  }, []);

  const setPhase = useCallback((phase: SessionState["phase"]) => {
    setSession((prev) => ({ ...prev, phase }));
  }, []);

  const setSourceText = useCallback((sourceText: string) => {
    setSession((prev) => ({ ...prev, sourceText }));
  }, []);

  const setSourceAnalysis = useCallback((sourceAnalysis: SourceAnalysis) => {
    setSession((prev) => ({ ...prev, sourceAnalysis }));
  }, []);

  const setIntakeRevisionTarget = useCallback((target: SessionState["intakeRevisionTarget"]) => {
    setSession((prev) => ({ ...prev, intakeRevisionTarget: target }));
  }, []);

  const updateStrategicPosition = useCallback((pos: Partial<StrategicPosition>) => {
    setSession((prev) => ({
      ...prev,
      strategicPosition: { ...prev.strategicPosition, ...pos },
    }));
  }, []);

  const setSelectedAngle = useCallback((angle: AngleOption) => {
    setSession((prev) => ({ ...prev, selectedAngle: angle }));
  }, []);

  const setSelectedFormats = useCallback((formats: FormatOption[]) => {
    setSession((prev) => ({ ...prev, selectedFormats: formats }));
  }, []);

  const setPositioningStep = useCallback((step: number) => {
    setSession((prev) => ({ ...prev, positioningStep: step }));
  }, []);

  const setClarityScore = useCallback((score: number) => {
    setSession((prev) => ({ ...prev, clarityScore: score }));
  }, []);

  const updatePerspective = useCallback((perspective: Partial<UserPerspective>) => {
    setSession((prev) => ({
      ...prev,
      perspective: { ...prev.perspective, ...perspective },
    }));
  }, []);

  const setContentBrief = useCallback((brief: ContentBrief | null) => {
    setSession((prev) => ({ ...prev, contentBrief: brief }));
  }, []);

  const updateContentBrief = useCallback((updates: Partial<ContentBrief>) => {
    setSession((prev) => ({
      ...prev,
      contentBrief: prev.contentBrief ? { ...prev.contentBrief, ...updates } : null,
    }));
  }, []);

  const pushDraftHistory = useCallback((label: string) => {
    setSession((prev) => ({
      ...prev,
      draftHistory: [
        ...prev.draftHistory,
        { drafts: { ...prev.drafts }, label, timestamp: new Date() },
      ].slice(-20), // keep last 20 snapshots
    }));
  }, []);

  const popDraftHistory = useCallback((): DraftSnapshot | null => {
    let popped: DraftSnapshot | null = null;
    setSession((prev) => {
      if (prev.draftHistory.length === 0) return prev;
      popped = prev.draftHistory[prev.draftHistory.length - 1];
      return {
        ...prev,
        drafts: { ...popped!.drafts },
        draftHistory: prev.draftHistory.slice(0, -1),
      };
    });
    return popped;
  }, []);

  const resetSession = useCallback(() => {
    setSession({
      id: crypto.randomUUID(),
      messages: [],
      drafts: defaultDrafts,
      settings: defaultSettings,
      sourceText: "",
      sourceAnalysis: null,
      intakeRevisionTarget: null,
      strategicPosition: {},
      selectedAngle: null,
      selectedFormats: [],
      phase: "intake",
      positioningStep: 0,
      clarityScore: 0,
      perspective: {},
      contentBrief: null,
      draftHistory: [],
    });
    setExtractedPageImages([]);
  }, []);

  return {
    session,
    extractedPageImages,
    setExtractedPageImages,
    addMessage,
    updateDrafts,
    updateSettings,
    setPhase,
    setSourceText,
    setSourceAnalysis,
    setIntakeRevisionTarget,
    updateStrategicPosition,
    setSelectedAngle,
    setSelectedFormats,
    setPositioningStep,
    setClarityScore,
    updatePerspective,
    setContentBrief,
    updateContentBrief,
    pushDraftHistory,
    popDraftHistory,
    resetSession,
  };
}
