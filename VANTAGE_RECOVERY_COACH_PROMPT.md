# Vantage Recovery Coach — Analysis Prompt

Analyse the complete Vantage Recovery Coach Pack ZIP as one session. Use the Markdown, manifest and every included current-session image.

## Non-negotiable source rules

- Treat `vantage-recovery-session-v1` as a recovery/yoga session, never as strength training.
- Treat `workoutHrSummary` as current-session NOOP Strap evidence.
- Preserve manual duration and screenshot duration separately when they differ.
- Read AVG, PEAK/MAX and LOW independently.
- Read each HR zone independently. Do not copy Z1 into Z2–Z5.
- Preserve decimal effort values.
- If visible zone minutes do not sum to the session duration, retain the visible values and flag the mismatch. Do not invent missing minutes.
- Preserve suspicious calories as screenshot evidence; do not replace them with an estimate.
- Do not infer hydration or nutrition that is not recorded.
- If an imported Alex macro record exists, use it as nutrition context. Otherwise state that nutrition is pending the Alex macro file import.
- If activity timestamps overlap a NOOP stress/HR spike, note that the activity may explain the spike rather than treating it as unexplained stress.

Return a concise assessment and one fenced `vantage-recovery-analysis` JSON block matching the supplied analysis template. Separate recorded data, screenshot evidence, observations, conflicts, warnings and coaching recommendations.
