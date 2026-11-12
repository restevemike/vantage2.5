# VANTAGE v1.4.3 — Extended Hybrid Heavy Duty Cycle

## Purpose
v1.4.3 extends the active Hybrid Heavy Duty programme using `VANTAGE_Extended_HDM_Complete_Cycle_v1.2.md` without rewriting recorded HDM-A, HDM-B, LISS, vitals, readiness or progression history.

## Added
- HDM-C — Legs / Chest / Triceps variation.
- HDM-D — Back / Shoulders / Biceps variation.
- Six-week schedule from 25 October to 6 December 2026.
- Exact new exercise identities for C/D rather than merging similar movements.
- Maintenance Exit Review with explicit Recovery, BP, weight/waist, performance and shoulder gates.
- Buttons to begin lean-mass transition or extend maintenance by one/two weeks.
- Phase metadata for Maintenance vs Lean Mass Transition.
- Maintenance/lean-mass set targets stored on routine exercises.
- Lean-mass activation changes phase/RIR guidance but does not automatically add every extra set.
- Double-progression and warm-up/work-set separation remain intact.
- Extended-cycle nutrition guidance and readiness rules shown in the cycle panel.

## Data integrity
- Existing A/B/LISS templates and recorded sessions are preserved.
- No historical session is rewritten or backfilled.
- HDM-C begins no earlier than 30 October 2026.
- HDM-D begins no earlier than 2 November 2026.
- Planned future slots remain planned until logged.
- New variation exercises retain separate canonical progression histories.

## Shoulder / readiness rules
- Neutral/semi-neutral machine shoulder pressing only, controlled ROM, about 2 RIR and pain-free.
- Sharp/load-related shoulder pain removes the press from that session and flags it for review; no automatic free-weight overhead substitution.
- Amber readiness keeps volume lower and 2–3 RIR with no intensity techniques.
- Red readiness means no hard lifting.

## Install note
This is a normal in-place update from v1.4.2. Export a JSON backup before replacing the app folder. Existing IndexedDB data is retained because the update does not reset browser storage.
