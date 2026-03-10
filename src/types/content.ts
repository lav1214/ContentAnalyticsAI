export type ToneOption = "authoritative" | "conversational" | "provocative" | "visionary";
export type SeniorityOption = "executive" | "professional";
export type DepthOption = "high-level" | "balanced" | "deep-dive";

export type Phase =
  | "intake"        // Phase 1: Source intake
  | "analyzing"     // Phase 1b: AI analyzing
  | "positioning"   // Phase 2: Strategic positioning
  | "angle"         // Phase 3: Angle selection
  | "format"        // Phase 4: Format selection
  | "drafting"      // Phase 5: Draft generation
  | "refine";       // Phase 5b: Refinement loop

export type AngleOption = "contrarian" | "educational" | "story-driven";
export type FormatOption = "linkedinLong" | "linkedinShort" | "sponsoredAds";
export type IntakeRevisionTarget = "thesis" | "insights" | "data" | "contrarian" | "audience" | "commercial";
export type BriefField = "reportSummary" | "objective" | "userNarrative" | "tone" | "voice" | "proposedApproach" | "brand";

export interface ContentBrief {
  reportSummary: string;
  objective: string;
  userNarrative: string | null;
  tone: string;
  voice: string;
  proposedApproach: string;
  brand: string | null;
  persona: string;
  channel: string;
  confirmed: boolean;
}

export interface UserPerspective {
  name?: string;
  role?: string;
  company?: string;
  topic?: string;
  icp?: string;
  goal?: "authority" | "engagement" | "lead-gen";
  brandType?: "founder" | "company";
  challengedBelief?: string;
}

export interface ContentSettings {
  tone: ToneOption;
  seniority: SeniorityOption;
  depth: DepthOption;
}

export interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  timestamp: Date;
  options?: string[];
}

export interface VisualAnalysisItem {
  pageNumber?: number;
  type: "diagram" | "chart" | "table" | "image" | "process_model";
  description: string;
  strategicInsight: string;
  feedReadiness: "ready" | "needs_simplification" | "replace";
  recommendation: string;
  selectedForPost?: boolean;
  placementHint?: string;
  regenerationPrompt?: string;
}

export interface SourceAnalysis {
  coreThesis: string;
  keyInsights: string[];
  dataPoints: string[];
  controversialClaim: string;
  likelyAudience?: string;
  commercialImplication?: string;
  visualAnalysis?: VisualAnalysisItem[];
  recommendedNarrativeAngle?: string;
  suggestedHook?: string;
  primaryKeyword?: string;
  hashtags?: string[];
}

export interface StrategicPosition {
  audience: string;
  desiredReaction: string;
  challengedBelief: string;
  objective: string;
  voice: string;
}

export interface DraftContent {
  linkedinLong: string;
  linkedinShort: string;
  sponsoredAds: string;
}

export interface DraftSnapshot {
  drafts: DraftContent;
  label: string;
  timestamp: Date;
}

export interface SessionState {
  id: string;
  messages: ChatMessage[];
  drafts: DraftContent;
  settings: ContentSettings;
  sourceText: string;
  sourceAnalysis: SourceAnalysis | null;
  intakeRevisionTarget: IntakeRevisionTarget | null;
  strategicPosition: Partial<StrategicPosition>;
  selectedAngle: AngleOption | null;
  selectedFormats: FormatOption[];
  phase: Phase;
  positioningStep: number;
  clarityScore: number;
  perspective: UserPerspective;
  contentBrief: ContentBrief | null;
  draftHistory: DraftSnapshot[];
}
