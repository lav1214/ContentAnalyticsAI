# Plan: Fix Conversation Intelligence

## Problems (from screenshots)

1. **"update the angle"** → "No problem. What needs adjusting?" — Global router's angle-change pattern doesn't include "update" as a verb
2. **"i dont want contrarian"** → "No problem. What needs adjusting?" — No negation handling anywhere; `detectAngle()` actually returns "contrarian" because it finds the substring
3. **"i want to change to short post"** → Treated as a positioning answer, echoed back verbatim — Format/type switching not recognized mid-positioning; the positioning phase accepts ANY unrecognized text as the answer to the current question
4. **Vague fallbacks** — "What needs adjusting?" / "No problem" responses give zero actionable guidance

## Root Causes

- **Global router gaps**: Missing verbs ("update", "redo"), missing nouns ("format", "short post", "long form"), no negation patterns
- **No negation detection**: `detectAngle()` uses `.includes()` which matches "contrarian" inside "don't want contrarian"
- **Positioning phase too greedy**: Treats ALL unrecognized input as an answer to the current question (line ~1256), never checks if the user is requesting a phase change
- **No format-switching command**: No global or phase-level handler for "change to short post" / "switch format" / "I want long-form instead"
- **Fallback messages are lazy**: Generic "What needs adjusting?" without showing available options

## Fix Plan

### Fix 1: Add negation-aware intent detection
**File:** `useConversationEngine.ts`

- Create `detectNegation(input)` helper that returns the rejected item
- Pattern: `/\b(don'?t|do not|no|not|never|hate|dislike|skip|drop|remove|without)\s+(want|like|need|use)?\s*(the\s+|a\s+)?(contrarian|educational|story|long|short|sponsored|provocative|authoritative|conversational|visionary)\b/i`
- Update `detectAngle()` to return `null` when negation is present for that angle
- When negation is detected: show the OTHER options (filter out the rejected one) instead of a vague fallback

### Fix 2: Expand global router verb/noun vocabulary
**File:** `useConversationEngine.ts`

**Angle change route (lines 594-622):**
- Add verbs: "update", "redo", "revisit", "edit", "pick", "choose", "modify"
- Add patterns: "update the angle", "different angle", "pick another angle", "redo the angle"
- When no specific angle given, show the three angle chips instead of "What needs adjusting?"

**New route: Format/type switching:**
- Patterns: "change to short post", "switch to long-form", "I want short post instead", "change format", "switch format"
- Detect format from input: long-form, short post, sponsored ad
- If in positioning/angle phase: store preference and continue flow
- If drafts exist: switch active tab or regenerate specific format
- If in refine phase: switch to the requested format's tab

### Fix 3: Stop positioning phase from swallowing everything
**File:** `useConversationEngine.ts` (positioning handler, ~line 1231-1297)

Before accepting user input as a positioning answer:
1. Run `handleGlobalCommand()` first (already happens — but some patterns aren't caught)
2. Add pre-check: if input looks like a command (contains verbs like "change", "switch", "update", "go back", "want to") AND references a known entity (angle, format, post, tone, audience), route to the appropriate handler instead of treating as an answer
3. Add "Did you mean...?" disambiguation when input is ambiguous

### Fix 4: Replace vague fallbacks with actionable options
**File:** `useConversationEngine.ts`

Every fallback response must include chip options showing what the user CAN do:

- **Angle phase fallback**: Show angle chips `["Contrarian", "Educational Authority", "Story-Driven Insight"]`
- **Format phase fallback**: Show format chips `["LinkedIn Long-Form", "Short Post", "Sponsored Ad", "All Three"]`
- **Generic "What needs adjusting?"** → Replace with context-aware menu showing the specific things they can change at that point
- **Intake fallback**: Add `"← Go back"` and `"Move on →"` chips

### Fix 5: Add navigation chips to ALL option arrays
**File:** `useConversationEngine.ts`

Missing go-back options in:
- `REFINE_ENTRY_OPTIONS` — add `"← Change angle"`, `"← Edit strategy"`
- Format selection chips — add `"← Change angle"`, `"← Go back"`
- Brief confirmation chips — add `"← Go back to analysis"`
- Diagnostic result chips — add `"← Back to editing"`

### Fix 6: Make the "update" verb work everywhere
**File:** `useConversationEngine.ts`

The global router's angle route uses: `(change|switch|try|use|set)` — missing "update", "edit", "redo", "pick", "choose", "modify", "adjust". Add these to ALL global router patterns consistently, not just the positioning one.

## Implementation Order

1. Fix 1 (negation detection) — highest impact, solves "don't want contrarian"
2. Fix 2 (expand vocabulary + format switching) — solves "update the angle" and "change to short post"
3. Fix 3 (positioning guard) — prevents future input-swallowing bugs
4. Fix 4 (actionable fallbacks) — eliminates vague responses
5. Fix 5 (navigation chips) — consistency pass
6. Fix 6 (verb vocabulary) — consistency pass

## Files Changed

- `src/hooks/useConversationEngine.ts` — all fixes
