# The math behind Relay

Relay's readiness score is built from a handful of sports-science ideas: session load (Foster's
RPE method), accumulating load over time, an acute:chronic workload ratio, and how far an
athlete's self-reported wellness sits from normal. The original derivation — eleven pages of
handwritten notes and worked examples — is scanned into [`proofs/`](../proofs) (`IMG_4417.jpg`
through `IMG_4428.jpg`, in order; `IMG_4421` wasn't part of the photographed set). The first six
pages (§1–§6) work out the load and wellness math; the last five (§6's z-score extension through
§9) work out how those pieces combine into one bounded risk score.

This document walks through that derivation and, at each step, says plainly whether the shipped
code in [`backend/src/lib/readiness.ts`](../backend/src/lib/readiness.ts) and
[`backend/src/lib/scoring.ts`](../backend/src/lib/scoring.ts) implements it as designed, implements
a simplified version, or hasn't been built yet. Some of the notes describe a more sophisticated
model than what's currently running — that's called out explicitly rather than glossed over.

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
sum the slices across a window to approximate the area under a "load over time" curve. In practice
this just means summing (or averaging) the daily `load` values that fall inside a rolling window.

**In code:** implemented, without the Riemann-sum framing made explicit — `avgDailyLoad` in
`scoring.ts` filters `TrainingLoad` rows into a window and totals them. See §3 below for exactly
how.

## 3. Acute vs. chronic load, and the load ratio

Two windows matter:

- **Acute load** — the last **7 days**. Changes fast; reflects short-term fatigue.
- **Chronic load** — the last **28 days**. Changes slowly; reflects the fitness base the athlete
  has actually built up.

```
load ratio (ACWR) = acute load / chronic load
```

An ACWR near 1.0 means this week looks like the last month — sustainable. Well above 1.0 means load
has spiked faster than the athlete has adapted to it.

The notes flag a specific weakness of computing acute/chronic load as a **plain average** over each
window: a single big session dominates the average while it's inside the window, then disappears
abruptly the instant it rolls out — an artificial cliff that doesn't reflect how fatigue actually
fades. That's the motivation for the EWMA in §4.

**In code:** the load ratio itself is implemented — `avgDailyLoad(loads, days, now)` in
[`scoring.ts`](../backend/src/lib/scoring.ts) sums `TrainingLoad.load` within the last `days` days
and divides by `days`, called once with `days=7` and once with `days=28`, and `acwr = acute /
chronic`. **This is the plain average the notes call out as the weaker option** — see the gap noted
in §4. It divides by `min(days, days of history actually on file)` rather than always the full
window, so a newly-logging athlete's chronic average isn't diluted by days before they'd logged
anything — without that guard, ACWR reads as artificially spiked (and risk artificially high) for
anyone's first few weeks, which isn't a real signal.

## 4. EWMA — the proposed fix for the plain-average cliff

To avoid the abrupt dropoff, the notes derive an **exponentially weighted moving average**, which
lets old sessions fade out gradually instead of falling off a cliff:

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

**In code: not implemented.** `avgDailyLoad` in `scoring.ts` (§3) is a plain windowed mean, not an
EWMA — there's no `λ`, no `EWMA_yesterday` carried forward, anywhere in the codebase today. The
notes present EWMA as an improvement on top of a working plain-average baseline, and that's
exactly where the code currently stands: the plain-average baseline, without the improvement yet
applied.

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

**In code:** a version of the *lower* Gabbett cutoff is implemented, not the full three-band model
and not z-scored. `riskFromAcwr` in `readiness.ts`:

```ts
export function riskFromAcwr(acwr: number): number {
  return Math.max(0, Math.min(100, Math.round((acwr - 0.8) * 100)));
}
```

turns ACWR into a 0–100 risk figure by a straight line starting at the `0.8` floor from the Gabbett
range (below it, risk is clamped to 0) and climbing linearly — an ACWR of 1.8 or higher saturates
risk at 100. It doesn't reproduce the "risk comes back down again once ACWR is very low" shape, and
it isn't standardized per athlete the way §6 describes.

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

The three stats the notes apply this to:

1. **Effort cost / efficiency** — `(duration / distance) / RPE`, i.e. pace normalized by how hard
   it felt, tracked only on easy/steady aerobic runs (where pace-vs-effort is actually meaningful,
   unlike intervals). `z = (effort_cost_recent − μ) / σ`. Worked example: μ = 60, σ = 3,
   recent = 66 → z = 2.
2. **Wellness** — daily wellness averaged as `(sleep + mood + energy + motivation + (6 − soreness))
   / 5` (soreness inverted so higher is always better before averaging), then z-scored against the
   athlete's own history — but sign-flipped relative to the general form, since a wellness *drop*
   should read as a positive (worse) z: `z = (μ − well_daily_recent) / σ`.
3. **Load (ACWR)** — also z-scored, but by the notes' own account "a different method," since ACWR
   has a built-in neutral point of **1.0**, not one derived from the athlete's own mean:

   ```
   z_load = (ACWR − 1.0) / σ_ACWR
   ```

   ACWR = 1.0 means this week's load exactly equals what the athlete's body has adapted to, so
   there's nothing to compute a personal μ from — the neutral point is fixed by definition, the
   same way "0 degrees" doesn't need to be measured per person. z_load > 0 means recent load
   exceeds adaptation; z_load < 0 means detraining. The notes are explicit about *why* it has to be
   the fixed 1.0 rather than the athlete's own average ACWR: an athlete who has been chronically
   over-ramped for months would have a personal average well above 1.0, and centering on that
   average would make their ongoing overtraining look statistically normal — exactly the failure
   mode standardizing-per-athlete is supposed to avoid for the other two stats.

   `σ_ACWR` should, in principle, be measured from the standard deviation of weekly ACWR values
   across the whole squad over a season, but the notes use a **provisional value of 0.18** for now
   for lack of enough real data yet, citing published ACWR distributions in endurance athletes
   clustering around 0.15–0.25. Worked examples: ACWR = 1.18 → z = (1.18 − 1.0) / 0.18 = **+1.0**;
   ACWR = 1.42 → z = (1.42 − 1.0) / 0.18 = **+2.33** (flagged as real injury risk). Once real
   injury/overreaching outcomes get recorded, the notes say this fixed `σ_ACWR` should be replaced
   by fitting a logistic regression of actual injury outcomes against ACWR directly — the
   hand-picked constant is explicitly a placeholder for a value data should eventually supply.

**In code: not implemented.** There is no per-athlete mean/standard-deviation tracking, no z-score
of any kind, and no "effort cost" / pace-based efficiency metric anywhere in the schema or scoring
code — `TrainingLoad` stores `distanceMiles`, but nothing currently divides it into an
efficiency figure. What the code does instead, in `computeScore` (§10), is compare each athlete's
recent wellness average against one **fixed constant baseline (4.2/5) shared by every athlete**,
not a personalized mean/σ, and turn ACWR into risk via a straight line (§5) rather than a
z-score. The full z-score design across all three stats is the biggest gap between the notes and
what's running today.

## 7. Combining the three z-scores into one composite

Once `z_load`, `z_effortcost`, and `z_welldaily` all exist on the same standardized scale, the
notes blend them into a single **composite risk score C** with a weighted sum:

```
C = (w_load × z_load) + (w_effortcost × z_effortcost) + (w_welldaily × z_welldaily)
```

Two constraints on the weights: every `w ≥ 0` (non-negativity, so a good signal on one stat can't
numerically cancel out a bad signal on another), and `w_load + w_effortcost + w_welldaily = 1.0`
(so `C` stays on the same standard-deviation-ish scale regardless of how the weight is split).
Within those constraints, the notes reason about *relative* trust in each signal rather than
treating them as equal:

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

Like `σ_ACWR` above, these weights are called out as **provisional** — once real injury/overreaching
outcomes exist, `C = Σ wᵢzᵢ` becomes the input to a logistic regression that *learns* the weights
from who actually got hurt, rather than having them hand-picked.

**In code: not implemented.** There's no composite score, no per-stat weighting, and (per §6) two
of the three inputs it would blend don't exist yet either.

## 8. From composite to a bounded 0–100 risk score

`C` alone is an unbounded z-score-ish number, which the notes judge harder to read at a glance
than a familiar 0–100 scale. The requirements they set for that conversion — bounded to `[0, 100]`,
most *sensitive* to change in the middle (where borderline, actually-ambiguous athletes sit), and
*flattening out* at the extremes (the numeric gap between "very bad" and "extremely bad" doesn't
need its own resolution) — describe an S-shaped curve, so the notes reach for a **logistic
function**:

```
R = 100 / (1 + e^(−k(C − C₀)))
```

where `R` is the risk score (0–100), `e` is Euler's number, `C₀` is the composite value that maps
to the exact middle of the scale, and `k` controls how sharply `R` swings as `C` crosses `C₀`
(bigger `k` = a sharper cliff right at `C₀`; smaller `k` = a gentler ramp). Provisional values:
`C₀ = 0.35` (an athlete has to sit somewhat past a neutral composite before it becomes a 50/50 call
to flag them) and `k = 1.15`. As with `σ_ACWR` and the composite weights, the notes expect a real
model to later *learn* `k` and `C₀` from recorded outcomes rather than keep them hand-picked.

Worked example, continuing `C = 2.01` from §7:

```
exponent = −1.15 × (2.01 − 0.35) = −1.15 × 1.66 = −1.909
e^−1.909 ≈ 0.148
R = 100 / (1 + 0.148) ≈ 87
```

The app is meant to display the inverse, **readiness = 100 − R** (so high readiness reads as good,
matching "Fresh"), giving a readiness of 13 for this athlete.

**In code: not implemented.** There's no logistic transform anywhere in the codebase — `computeScore`
(§10) produces its 0–100 number directly from a linear formula, with no composite `C` or S-curve step
in between.

## 9. Status thresholds, and the guardrails around them

With `R`/readiness on a 0–100 scale, the notes set three status bands (readiness = 100 − R):

| `R` | Readiness | Status |
|---|---|---|
| R ≥ 70 | ≤ 30 | "Back off" (high risk) |
| 45 ≤ R ≤ 70 | 30–55 | "Ease back" (watch) |
| R ≤ 45 | ≥ 55 | "Fresh" (on track) |

— with a note that the labels are for convenience only, since a readiness of 31 isn't meaningfully
different from a readiness of 29; the underlying number is what matters, the band is just a
human-readable bucket around it.

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
— and baselines should **roll forward weekly** rather than freeze at day one, so an athlete's
"normal" tracks real fitness changes over a season instead of staying anchored to how they looked
in week 1.

**In code:** the three-tier status idea and both guardrails are implemented, though with different
specific numbers and without the cold-start gate. `bandForScore` in
[`readiness.ts`](../backend/src/lib/readiness.ts) uses score thresholds of 65/40 rather than the
notes' readiness thresholds of 55/30 (a different scale entirely, since the shipped score isn't
`100 − R`, but structurally the same three tiers). The injured/return-to-run guardrails **are**
implemented essentially as designed — `resolveStatus` overrides the score-driven band entirely
whenever there's an active or recovering injury on file, which is exactly the "don't flag this
runner at all" behavior the notes call for, just without the μ/σ-exclusion detail (moot, since
there's no per-athlete μ/σ yet per §6). What's missing is the 2–3 week minimum-data requirement and
the weekly-rolling baseline — the app currently scores an athlete from their very first check-in or
run, with `wellnessAvg` defaulting to a neutral 3.5 only when there's *zero* data rather than
holding off until there's *enough*.

## 10. The score that actually ships

Putting together what *is* implemented — the plain-average ACWR (§3) and the fixed-baseline
wellness comparison — `computeScore` in [`readiness.ts`](../backend/src/lib/readiness.ts):

```ts
export function computeScore(risk: number, wellnessAvg: number): number {
  return Math.max(6, Math.min(97, Math.round(100 - risk * 0.72 - (4.2 - wellnessAvg) * 7)));
}
```

Starting from 100: load risk (§5) is subtracted at 72% weight, and wellness is subtracted in
proportion to how far the athlete's recent average sits below a flat 4.2/5 baseline, at a rate of 7
points per whole point of wellness. The result is clamped to `[6, 97]` — a score never reads as a
perfect 100 or a hopeless 0, since the current inputs alone shouldn't be read as that certain.
`bandForScore` then turns that into `FRESH` (≥ 65) / `EASE_BACK` (40–64) / `BACK_OFF` (< 40), and
an active or recovering injury overrides the band entirely (`resolveStatus`) — see the README's
[Readiness status](../README.md#readiness-status) table.

This formula is a reasonable, shipped approximation of the notes' intent (combine load risk and
wellness deviation into one number), but it is **not** the z-score-standardized, EWMA-smoothed,
logistic-squashed model the notes actually derive end to end. The gaps, summarized:

| Concept (from the notes) | Status in code |
|---|---|
| Session load = RPE × duration | ✅ implemented exactly (`TrainingLoad.load`) |
| Acute (7d) / chronic (28d) load windows | ✅ implemented (`avgDailyLoad`) |
| Load ratio = acute / chronic | ✅ implemented (`acwr` in `recomputeReadiness`) |
| EWMA smoothing (λ = 2/(N+1)) | ❌ not implemented — plain window average used instead |
| Gabbett-style ACWR bands | ⚠️ partially — only the 0.8 floor is used, as a linear risk ramp |
| Per-athlete z-scored effort cost / efficiency | ❌ not implemented — no such field exists |
| Per-athlete z-scored wellness | ⚠️ simplified — compared to a fixed 4.2 baseline, not a personal μ/σ |
| Per-athlete z-scored load (ACWR, centered on 1.0) | ❌ not implemented — ACWR feeds a linear formula instead |
| Weighted composite `C` of the 3 z-scores | ❌ not implemented — no composite score exists |
| Logistic transform of `C` into a bounded 0–100 `R` | ❌ not implemented — `computeScore` is linear, not S-shaped |
| Three status tiers from the final score | ✅ implemented (`bandForScore`), different thresholds/scale |
| Injured / return-to-run guardrails override the score | ✅ implemented (`resolveStatus`) |
| 2–3 week minimum data before scoring an athlete | ❌ not implemented — scores from the first check-in/run |
| Weekly-rolling per-athlete baseline | ❌ not implemented — moot without per-athlete μ/σ yet |
| Combine risk + wellness into one 0–100 score | ✅ implemented (`computeScore`), with the simplified inputs above |

If the full design gets built out, the natural build order follows the notes' own structure: EWMA
inside `avgDailyLoad` (§4) → a per-athlete stats table holding rolling μ/σ for effort-cost and
wellness, refreshed weekly (§6, §9) → the three z-scores, including the fixed-1.0-centered
`z_load` (§6) → the weighted composite `C` (§7) → the logistic transform into `R` (§8) → status
bands and guardrails off of that `R` (§9) — replacing `computeScore`'s direct linear formula with
the end of that pipeline instead.

The notes close with their own one-page summary of this whole pipeline, goal to output, in
`proofs/IMG_4428.jpg` — worth a look side by side with the section list above.
