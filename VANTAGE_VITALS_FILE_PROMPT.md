# VANTAGE Vitals Markdown File Prompt

Copy the prompt below into the ChatGPT thread where you provide your daily vitals.

---

Create a downloadable Markdown file for import into the VANTAGE Training Console vitals page.

File name: `VANTAGE_Vitals_YYYY-MM-DD.md`

Use exactly one fenced code block labelled `vantage-vitals` containing valid JSON. Use only fields supported by the source data; remove fields with no supplied value rather than guessing.

```vantage-vitals
{
  "schema": "vantage-vitals-v1",
  "date": "YYYY-MM-DD",
  "recovery": null,
  "charge": null,
  "restScore": null,
  "status": null,
  "synthesis": "Peak, Building, Maintain, Steady, Balanced, Primed, Solid, Low, Draining or Depleted",
  "guidance": null,
  "hrv": null,
  "hrvBaseline": null,
  "hrvDeltaFromBaseline": null,
  "hrvBaselineStatus": "known, at-baseline, above-baseline, below-baseline or unknown",
  "restingHr": null,
  "rhrBaseline": null,
  "rhrDeltaFromBaseline": null,
  "rhrBaselineStatus": "known, at-baseline, above-baseline, below-baseline or unknown",
  "respiratoryRate": null,
  "stress": null,
  "stressBand": null,
  "sleepHours": null,
  "sleepPerformance": null,
  "sleepEfficiency": null,
  "sleepDebt": null,
  "hoursVsNeededPercent": null,
  "restorativeSleepPercent": null,
  "sleepLedger": null,
  "sleepStageDetailStatus": null,
  "bloodPressure": "systolic/diastolic",
  "pulse": null,
  "weight": null,
  "dailyHydrationConsumedLitres": null,
  "dailyHydrationTargetLitres": null,
  "feeling": "good, average or poor",
  "symptoms": false,
  "notes": ""
}
```

Rules:

- Use only values actually supplied. Never infer a missing baseline or copy a delta from another metric.
- HRV delta and resting-HR delta are independent fields.
- If the source explicitly says resting HR is **at baseline** but supplies no numeric baseline/delta, use `rhrBaselineStatus: "at-baseline"` and omit `rhrDeltaFromBaseline`.
- Keep blood pressure as `systolic/diastolic` and cuff pulse separate from resting HR.
- Current sleep summary and detailed sleep-stage evidence are separate. If detailed stages have a date conflict, preserve the current summary and use `sleepStageDetailStatus: "date-conflict"` rather than deleting current sleep totals.
- Do not include recovery actions. Recovery activities are logged separately in the VANTAGE Recovery section.
- You may add a short human-readable summary outside the code block, but keep the JSON block valid.
- Return the result as an actual downloadable `.md` file, not only pasted chat text.
