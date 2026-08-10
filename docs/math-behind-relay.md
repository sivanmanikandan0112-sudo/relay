# The math behind Relay

Relay's readiness score is built from a handful of sports-science ideas: session load (Foster's
RPE method), accumulating load over time, an acute:chronic workload ratio, and how far an
athlete's self-reported wellness sits from normal. The original derivation — eleven pages of
handwritten notes and worked examples — is scanned into [`proofs/`](../proofs) (`IMG_4417.jpg`
through `IMG_4428.jpg`, in order; `IMG_4421` wasn't part of the photographed set). The first six
pages (§1–§6) work out the load and wellness math; the last five (§6's z-score extension through
§9) work out how those pieces combine into one bounded risk score.

**Every formula below is implemented, runnable, and unit-tested** in
[`backend/src/lib/math.ts`](../backend/src/lib/math.ts) — pure functions, no database, each one
checked in [`backend/src/lib/math.test.ts`](../backend/src/lib/math.test.ts) against the notes'
own worked examples (run them with `npm run test:backend`). The DB-touching wiring that fetches an
athlete's real check-ins/runs/injuries and feeds them through those functions lives in
[`backend/src/lib/scoring.ts`](../backend/src/lib/scoring.ts), specifically
`recomputeReadiness`, which runs automatically — and immediately — every time an athlete submits a
check-in, logs a run, deletes a run, or a coach changes their injury status (see the route handlers
in `backend/src/routes/wellness.ts`, `trainingLoad.ts`, and `injuries.ts`).

This document walks through the derivation and, at each step, says exactly which function
implements it. A few places in the notes leave a real judgment call unresolved — how much history
counts as "enough," whether "recent" counts toward its own baseline, how to tell an "easy" run from
a hard one — those are called out explicitly as implementation decisions, not silent guesses.

## 1. Session load — Foster's RPE method

Every logged run gets one number, its **session load**, from the athlete's rate of perceived
exertion (RPE, 1–10) and how long the session took:

```
load = RPE × duration
```

This is the standard Foster session-RPE method for quantifying training load without needing a
heart-rate monitor or GPS — "how hard did it feel, for how long."

**In code:** implemented exactly as designed.
[`TrainingLoad.load`](../backend/prisma/schema.prisma) is `rpe * durationMin`, computed when a run
is logged (`durationMin` itself is converted from the HH:MM:SS the athlete enters). See
`proofs/IMG_4418.jpg` for the worked example.

## 2. Accumulating load over time

A single session's load doesn't say much on its own — what matters is how load adds up over days
and weeks. The notes frame this as a Riemann sum: treat each day's total load as a thin slice, and
sum the slices over time.

**In code:** implemented. `buildDailySeries` in
[`scoring.ts`](../backend/src/lib/scoring.ts) buckets every `TrainingLoad` row into one load-total
per calendar day (0 on rest days) across a 90-day lookback, oldest first — exactly the day-by-day
slices §4's EWMA recursion walks over.

## 3. Acute vs. chronic load, and the load ratio

Two windows matter:

- **Acute load** — the last **7 days**. Changes fast; reflects short-term fatigue.
- **Chronic load** — the last **28 days**. Changes slowly; reflects the fitness base the athlete
  has actually built up.

```
load ratio (ACWR) = acute load / chronic load
```

An ACWR near 1.0 means this week looks like the last month — sustainable. Well above 1.0 means load
has spiked faster than the athlete has adapted to it. The notes flag a specific weakness of
computing acute/chronic load as a **plain average** over each window: a single big session
dominates the average while it's inside the window, then disappears abruptly the instant it rolls
out. That's the motivation for the EWMA in §4, which is what the code actually uses.

**In code:** implemented as an EWMA, not a plain average — see §4. `acwr(acuteLoad, chronicLoad)`
in [`math.ts`](../backend/src/lib/math.ts) is the division itself (`acuteLoad / chronicLoad`,
reading as a neutral 1.0 rather than dividing by zero when there's no chronic load on file yet);
`recomputeReadiness` in `scoring.ts` supplies the two EWMA values it divides.

## 4. EWMA — acute and chronic load, properly smoothed

To avoid the plain average's abrupt dropoff, the notes derive an **exponentially weighted moving
average**, which lets old sessions fade out gradually instead of falling off a cliff:

```
EWMA_today = λ · L_today + (1 − λ) · EWMA_yesterday
```

with the smoothing constant chosen from the window length `N`:

```
λ = 2 / (N + 1)
```

which gives `λ = 0.25` for the 7-day acute window and `λ ≈ 0.069` for the 28-day chronic window —
the acute EWMA reacts to a new session roughly 3.6× faster than the chronic one, matching that
acute load is supposed to move fast and chronic load slow. The notes work a 3-day numeric example
showing a load spike moving through both EWMAs at their respective rates (`proofs/IMG_4420.jpg`).

**In code:** implemented exactly as designed. `ewmaLambda`, `ACUTE_LAMBDA`, `CHRONIC_LAMBDA`, and
`ewmaSeries` (the recursion itself) all live in [`math.ts`](../backend/src/lib/math.ts) and are
unit-tested against the λ values and the recursion's behavior on a flat series and a spike.
`recomputeReadiness` in `scoring.ts` runs `ewmaSeries` over the **full 90-day daily series** from
§2 for both the acute and chronic `λ` — not just the last 7 or 28 days — so each EWMA is fully
converged (any residual bias from starting the recursion at 0 is under 0.3% after 90 days) rather
than restarting cold at the edge of its own window.

## 5. Interpreting the ACWR

The notes cite the commonly used Gabbett (2016)-style ACWR bands:

| ACWR | Reading |
|---|---|
| ≈ 0.8 – 1.5 | recent load matches what the athlete has adapted to |
| \> 1.5 | load is spiking faster than fitness can absorb |
| < 0.8 | detraining |

— then explicitly decide **not** to ship those fixed bands, in favor of standardizing with
z-scores instead (§6), on the grounds that a single global cutoff doesn't account for how much an
individual athlete's own numbers naturally vary. The notes also cite Williams et al. (2017) for
EWMA-smoothed ACWR being a better predictor of fitness/fatigue trend than a traditional rolling
average. (These citations are transcribed as written in the source notes; take them as the
notes' own reference, not independently verified here.)

**In code:** the notes' decision is followed to the letter — these fixed bands are **not** used
anywhere. `zLoad` in `math.ts` (§6) standardizes ACWR instead, and that z-score is the only thing
ACWR feeds into.

## 6. Standardizing with z-scores

The last two pages of the notes lay out a general z-score framework and apply it to three different
per-athlete metrics.

**The general form**, over an athlete's own history of a stat:

```
mean:               μ = (1/n) Σ xᵢ
standard deviation: σ = √[(1/n) Σ (xᵢ − μ)²]
z-score:            z = (x_recent − μ) / σ
```

Dividing by σ is what makes this fair across athletes: a naturally "bouncy" stat needs a bigger raw
swing before it counts as alarming, while a naturally steady one gets flagged from a smaller move.
Reference points from the notes: z = 0 is exactly average; z = ±1 is one standard deviation out;
z = ±2 (only ~2.5% of a normal distribution) starts to count as an extreme outlier.

**In code:** `mean`, `stddev` (population, dividing by `n` as the notes specify, not `n − 1`), and
`zScore` all live in `math.ts`. One judgment call the notes don't spell out: does "recent" count
toward its own μ/σ, or is it judged against the history *before* it? The code takes the latter —
`zScore(recent, baseline)` takes `baseline` as the athlete's prior points with the newest one held
out — since judging a value partly against itself understates how unusual it is. `MIN_BASELINE_SAMPLES
= 4` is a related, explicit implementation choice: below 4 prior points, `zScore` returns `null`
("no signal yet") rather than a σ computed from too little data to mean anything.

The three stats the notes apply this to:

1. **Effort cost / efficiency** — `(duration / distance) / RPE`, i.e. pace normalized by how hard
   it felt, tracked only on easy/steady aerobic runs (where pace-vs-effort is actually meaningful,
   unlike intervals). `z = (effort_cost_recent − μ) / σ`. Worked example: μ = 60, σ = 3,
   recent = 66 → z = 2.

   **In code:** `effortCost` computes the ratio; `isEasyRun` decides which runs count. The notes
   describe "easy/steady" as something a coach would judge by eye — the code approximates it with
   `EASY_RPE_THRESHOLD = 5`: a logged RPE at or below 5 counts as easy, matching the RPE scale
   already collected on every run, rather than trying to parse the free-text run title.
2. **Wellness** — daily wellness averaged as `(sleep + mood + energy + motivation + (6 − soreness))
   / 5` (soreness inverted so higher is always better before averaging), then z-scored against the
   athlete's own history — but sign-flipped relative to the general form, since a wellness *drop*
   should read as a positive (worse) z: `z = (μ − well_daily_recent) / σ`.

   **In code:** `wellDaily` computes the average exactly as specified; the sign flip happens in
   `scoring.ts` (negating `zScore`'s result) rather than in `math.ts`, so `zScore` itself stays a
   single, generic, reusable formula.
3. **Load (ACWR)** — also z-scored, but by the notes' own account "a different method," since ACWR
   has a built-in neutral point of **1.0**, not one derived from the athlete's own mean:

   ```
   z_load = (ACWR − 1.0) / σ_ACWR
   ```

   ACWR = 1.0 means this week's load exactly equals what the athlete's body has adapted to, so
   there's nothing to compute a personal μ from — the neutral point is fixed by definition. The
   notes are explicit about *why* it has to be the fixed 1.0 rather than the athlete's own average
   ACWR: an athlete who has been chronically over-ramped for months would have a personal average
   well above 1.0, and centering on that average would make their ongoing overtraining look
   statistically normal — exactly the failure mode standardizing-per-athlete is supposed to avoid.

   `σ_ACWR` should, in principle, be measured from the standard deviation of weekly ACWR values
   across the whole squad over a season, but the notes use a **provisional value of 0.18**,
   citing published ACWR distributions in endurance athletes clustering around 0.15–0.25. Worked
   examples: ACWR = 1.18 → z = **+1.0**; ACWR = 1.42 → z = **+2.33**.

   **In code:** `zLoad` implements the formula directly, with `SIGMA_ACWR = 0.18` as a named
   constant. It is still the notes' provisional value, not one fit from this squad's real season
   data or from real injury outcomes — see the gap table in §10.

Two more decisions the code makes that the notes don't cover: what "the athlete's own history"
means in terms of exclusion, and how much history has to exist before any of this is trustworthy —
covered under the guardrails in §9.

## 7. Combining the three z-scores into one composite

Once `z_load`, `z_effortcost`, and `z_welldaily` all exist on the same standardized scale, the
notes blend them into a single **composite risk score C** with a weighted sum:

```
C = (w_load × z_load) + (w_effortcost × z_effortcost) + (w_welldaily × z_welldaily)
```

Two constraints on the weights: every `w ≥ 0` (non-negativity, so a good signal on one stat can't
numerically cancel out a bad signal on another), and `w_load + w_effortcost + w_welldaily = 1.0`.
Within those constraints, the notes reason about *relative* trust in each signal:

- **Wellness weighted least** (self-reported, and the easiest of the three for an athlete to
  under- or over-state).
- **Efficiency weighted second**, as a slightly more objective signal than self-report.
- **Load weighted most**, since a spiking ACWR is the most direct driver of overuse injury — but
  still capped under 0.5 so it alone can never dominate the verdict.

Provisional weights: `w_load = 0.42`, `w_effortcost = 0.32`, `w_welldaily = 0.26`. Worked example
using the z-scores from §6 (`z_load = +2.33`, `z_effortcost = +2.0`, `z_welldaily = +1.5`):

```
C = (0.42)(2.33) + (0.32)(2.0) + (0.26)(1.5) = 0.979 + 0.640 + 0.390 = 2.01
```

Like `σ_ACWR` above, these weights are called out in the notes as **provisional** — once real
injury/overreaching outcomes exist, `C = Σ wᵢzᵢ` becomes the input to a logistic regression that
*learns* the weights from who actually got hurt, rather than having them hand-picked.

**In code:** implemented as `composite` and `COMPOSITE_WEIGHTS` in `math.ts`, unit-tested against
the worked example above. One addition the notes don't specify: what happens to a metric whose
z-score is `null` (not enough history yet, per §6)? `composite` treats it as contributing exactly
`0` — "no evidence either way" — rather than dropping it and re-normalizing the other two weights,
so a single missing metric can't inflate the influence of the ones that do exist.

## 8. From composite to a bounded 0–100 risk score

`C` alone is an unbounded z-score-ish number, which the notes judge harder to read at a glance
than a familiar 0–100 scale. The requirements they set for that conversion — bounded to `[0, 100]`,
most *sensitive* to change in the middle (where borderline, actually-ambiguous athletes sit), and
*flattening out* at the extremes — describe an S-shaped curve, so the notes reach for a **logistic
function**:

```
R = 100 / (1 + e^(−k(C − C₀)))
```

where `R` is the risk score (0–100), `C₀` is the composite value that maps to the exact middle of
the scale, and `k` controls how sharply `R` swings as `C` crosses `C₀`. Provisional values:
`C₀ = 0.35` and `k = 1.15`. As with `σ_ACWR` and the composite weights, the notes expect a real
model to later *learn* `k` and `C₀` from recorded outcomes rather than keep them hand-picked.

Worked example, continuing `C = 2.01` from §7: `R = 100 / (1 + e^(−1.15×1.66)) ≈ 87`. The app
displays the inverse, **readiness = 100 − R** (so high readiness reads as good, matching "Fresh"),
giving a readiness of 13 for this athlete.

**In code:** `logisticRisk` and `readinessFromRisk` in `math.ts`, with `LOGISTIC_K = 1.15` and
`LOGISTIC_C0 = 0.35` as named constants — still the notes' provisional values, same caveat as
`σ_ACWR` (§6) and the composite weights (§7).

## 9. Status thresholds, and the guardrails around them

With `R`/readiness on a 0–100 scale, the notes set three status bands (readiness = 100 − R):

| `R` | Readiness | Status |
|---|---|---|
| R ≥ 70 | ≤ 30 | "Back off" (high risk) |
| 45 ≤ R ≤ 70 | 30–55 | "Ease back" (watch) |
| R ≤ 45 | ≥ 55 | "Fresh" (on track) |

Two guardrails sit on top of the score itself:

- **Injured** athletes are excluded from the computation entirely, and their injured days are
  removed from their own baseline window so μ/σ for their other stats aren't corrupted by the
  injury — and days spent working back to full recovery don't get folded into their "normal"
  either, so the future baseline stays clean once they're back.
- **Return-to-run protocol** athletes don't get risk-flagged at all: slower paces are *expected*
  during a return ramp, so the rising-effort-cost signal that would otherwise fire is a false
  alarm by design, not a real one.

Finally, the notes flag a cold-start requirement: an athlete needs **roughly 2–3 weeks of data**
before they can be scored at all, since a μ/σ computed from less than that is close to meaningless
— and baselines should **roll forward weekly** rather than freeze at day one.

**In code:**

- **Status bands** — `bandForReadiness` in `math.ts` implements the three tiers using the notes'
  own readiness thresholds (`≤30` / `≤55` / above), not the old shipped code's different numbers.
  The README's [Readiness status](../README.md#readiness-status) table reflects this.
- **Injured guardrail** — `resolveStatus` (`readiness.ts`) still overrides the band to `INJURED`
  whenever there's an active injury, same as before. The *exclusion* half is new:
  `baselineExclusionRanges` in `scoring.ts` builds date ranges from every `ACTIVE` injury (open,
  through today) and every `RESOLVED` one (its recorded `startDate`–`endDate`), and both the
  effort-cost and wellness baselines filter those dates out before computing μ/σ — an injured
  period, past or ongoing, never counts as part of an athlete's "normal."
- **Return-to-run guardrail** — `resolveStatus` still overrides the band to `RETURN_PROTOCOL`. Per
  the notes' guardrail being specifically about *not flagging*, not about excluding data, a
  `RECOVERING` injury's dates are deliberately **not** added to `baselineExclusionRanges` — that
  data still counts toward the rolling baseline; only the status display is overridden.
- **Minimum history** — `MIN_HISTORY_DAYS = 14` in `math.ts` is the code's concrete reading of the
  notes' "roughly 2–3 weeks." `recomputeReadiness` finds the athlete's very first-ever wellness
  entry or run and, if fewer than 14 days have passed since it, forces all three z-scores to `null`
  regardless of what each metric's own sample size would otherwise allow — matching the notes'
  "or else μ and σ are meaningless" for the *whole* pipeline, not just a per-metric check. A
  `null`/`null`/`null` composite is `0`, which (per §8's worked example shape) reads as a
  readiness in the high 50s — a neutral "Fresh" default, not a guess dressed up as a real number.
- **Weekly-rolling baseline** — implemented as *continuous*, not literally weekly:
  `recomputeReadiness` reruns the entire pipeline against the athlete's current trailing 28-day
  window every time they submit a check-in or log/delete a run, so the baseline is at least as
  fresh as a weekly rebuild would be, typically fresher.

## 10. The score that actually ships

`recomputeReadiness` in [`scoring.ts`](../backend/src/lib/scoring.ts) is the full pipeline above,
start to finish: build the daily load series (§2) → EWMA acute/chronic load and ACWR (§3–4) →
gather the effort-cost and wellness histories, excluding injured periods (§6, §9) → three z-scores,
or `null` below the minimum-history gate (§6, §9) → weighted composite (§7) → logistic risk score
and readiness (§8) → status band, with the injured/return-to-run overrides on top (§9). Every
number in that chain is a named, unit-tested function in `math.ts` — nothing about the shape of the
notes' derivation got flattened into one opaque formula.

What's still genuinely a gap between the notes and the code — not "not implemented," but "the
model runs, using placeholder constants instead of ones learned from data":

| Concept (from the notes) | Status in code |
|---|---|
| Session load = RPE × duration | ✅ implemented exactly (`TrainingLoad.load`) |
| Riemann-sum daily load accumulation | ✅ implemented (`buildDailySeries`) |
| EWMA acute (7d) / chronic (28d) load, λ = 2/(N+1) | ✅ implemented (`ewmaSeries`, `ACUTE_LAMBDA`/`CHRONIC_LAMBDA`) |
| Load ratio = acute / chronic | ✅ implemented (`acwr`) |
| Skip fixed Gabbett ACWR bands in favor of z-scoring | ✅ implemented — the bands aren't used anywhere |
| Per-athlete z-scored effort cost / efficiency | ✅ implemented (`effortCost`, `isEasyRun`, `zScore`) |
| Per-athlete z-scored wellness (sign-flipped) | ✅ implemented (`wellDaily`, `zScore`, flipped in `scoring.ts`) |
| z-scored load, centered on a fixed 1.0 | ✅ implemented (`zLoad`) |
| Weighted composite `C` of the 3 z-scores | ✅ implemented (`composite`, `COMPOSITE_WEIGHTS`) |
| Logistic transform of `C` into a bounded 0–100 `R` | ✅ implemented (`logisticRisk`, `readinessFromRisk`) |
| Status bands off readiness (30/55 thresholds) | ✅ implemented (`bandForReadiness`) |
| Injured guardrail: override status *and* exclude from baseline | ✅ implemented (`resolveStatus` + `baselineExclusionRanges`) |
| Return-to-run guardrail: override status, keep data in baseline | ✅ implemented (`resolveStatus`; not excluded) |
| ~2–3 week minimum history before scoring | ✅ implemented as a concrete 14-day gate (`MIN_HISTORY_DAYS`) |
| Weekly-rolling baseline | ✅ implemented, as continuous recompute-on-every-event instead |
| `σ_ACWR`, composite weights, `k`/`C₀` learned from real outcomes | ❌ still the notes' hand-picked provisional values — no outcomes data or regression step exists |

That last row is the one gap the notes themselves say can't be closed by more code alone — it
needs a season of real injury/overreaching outcomes to fit against, which is exactly why the notes
call every one of those constants "provisional" rather than final.

The notes close with their own one-page summary of this whole pipeline, goal to output, in
`proofs/IMG_4428.jpg` — worth a look side by side with the section list above.
