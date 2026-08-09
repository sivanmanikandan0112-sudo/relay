# The math behind Relay

Relay's readiness score is built from a handful of sports-science ideas: session load (Foster's
RPE method), accumulating load over time, an acute:chronic workload ratio, and how far an
athlete's self-reported wellness sits from normal. The original derivation — six pages of
handwritten notes and worked examples — is scanned into [`proofs/`](../proofs) (`IMG_4417.jpg`
through `IMG_4423.jpg`, in order).

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
in §4.

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
   has a built-in neutral point of 1.0 rather than a neutral point derived from the athlete's own
   mean.

**In code: not implemented.** There is no per-athlete mean/standard-deviation tracking, no z-score
of any kind, and no "effort cost" / pace-based efficiency metric anywhere in the schema or scoring
code — `TrainingLoad` stores `distanceMiles`, but nothing currently divides it into an
efficiency figure. What the code does instead, in `computeScore` (§7), is compare each athlete's
recent wellness average against one **fixed constant baseline (4.2/5) shared by every athlete**,
not a personalized mean/σ. The full z-score design across all three stats is the biggest gap
between the notes and what's running today.

## 7. The score that actually ships

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
wellness deviation into one number), but it is **not** the z-score-standardized, EWMA-smoothed
model the notes actually derive. The gaps, summarized:

| Concept (from the notes) | Status in code |
|---|---|
| Session load = RPE × duration | ✅ implemented exactly (`TrainingLoad.load`) |
| Acute (7d) / chronic (28d) load windows | ✅ implemented (`avgDailyLoad`) |
| Load ratio = acute / chronic | ✅ implemented (`acwr` in `recomputeReadiness`) |
| EWMA smoothing (λ = 2/(N+1)) | ❌ not implemented — plain window average used instead |
| Gabbett-style ACWR bands | ⚠️ partially — only the 0.8 floor is used, as a linear risk ramp |
| Per-athlete z-scored effort cost / efficiency | ❌ not implemented — no such field exists |
| Per-athlete z-scored wellness | ⚠️ simplified — compared to a fixed 4.2 baseline, not a personal μ/σ |
| Per-athlete z-scored load (ACWR) | ❌ not implemented — ACWR feeds a linear formula instead |
| Combine risk + wellness into one 0–100 score | ✅ implemented (`computeScore`), with the simplified inputs above |

If the z-score/EWMA design gets built out, the natural place for it is inside `avgDailyLoad` (swap
the plain mean for the recursive EWMA in §4) and a new per-athlete stats table to hold each
metric's running μ/σ so `computeScore` can be rewritten in terms of z-scores instead of a fixed
baseline.
