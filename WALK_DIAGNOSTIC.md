# Streetlit Walk Diagnostic

## Purpose

Use this file for the current real-world Streetlit testing cycle.

The goal is not to prove the current architecture works.

The goal is to find out what is now preventing Streetlit from consistently creating the:

> “I walk past this all the time and had no idea.”

experience.

A successful Streetlit discovery is trustworthy, specific, and worth interrupting a walk for. It should make an ordinary-looking place, familiar building, or streetscape newly legible.

Perfectly grounded filler is still failure.

A magical story that invents facts is also failure.

## Current product direction

Current production uses the richer-evidence A-style synthesis path.

The generalized final-narration grounding-gate experiments (V1–V3) are parked / DO NOT SHIP. Do not open V4 by default.

The next product decision should come from real Walk evidence, not from another architecture experiment unless the Walk exposes a concrete blocker.

## Where to test

Sarah chooses the test area.

Do not assume Spring Garden, Philadelphia, New York, or any other location unless the current task says so.

Prefer a bounded, naturally walkable area with a realistic chance of interesting Streetlit material.

This should not be a handpicked demo tour. Known places may be useful as diagnostic missed opportunities, but normal production discovery should operate.

## What to notice

Do not turn the walk into a scoring exercise.

Pay attention to five dimensions:

### 1. Worth / magic

Did the discovery change how Sarah understood the place?

Would she remember it later?

Did it reveal something non-obvious, causal, human, spatial, social, cultural, or otherwise perception-changing?

### 2. Density

Were there enough worthwhile discoveries to make the walk feel alive?

Were gaps tolerable?

Do not assume low density means ranking is the problem. It may reflect candidate aperture, source coverage, eligibility, or another upstream loss.

### 3. Trust

Were factual claims, relationships, physical descriptions, and visible details supportable?

Capture specific unsupported claims rather than labeling the whole narration “bad.”

Do not automatically revive the generalized grounding gate. Repeated failures should first be grouped by type.

### 4. Orientation

Could Sarah tell what physical place, building, feature, or site the narration referred to?

A good story that cannot be located in the real world is still a product failure.

### 5. Delivery

Did the narration arrive audibly and at a useful moment?

Was the subject actually relevant to the walker’s path?

Keep playback, timing, path relevance, orientation, ranking, and editorial quality separate when diagnosing failures.

## Quick encounter labels

For each meaningful encounter, use whichever label best describes it:

- **Magic / worthwhile** — recognizably Streetlit; changed how the place was understood.
- **Missed opportunity** — a good story plausibly existed, but Streetlit did not surface it.
- **Trust failure** — unsupported or misleading fact, relationship, visible detail, or connection.
- **Orientation failure** — narration was worthwhile but the physical subject was unclear.
- **Delivery / path / timing failure** — narration was unheard, badly timed, or irrelevant to the actual path.
- **Filler / meh** — basically trustworthy, but not worth interrupting the walk for.

A single encounter may expose more than one failure mechanism. Keep them separate.

## Calibration: what “good” feels like

These are examples of the category of experience Streetlit is trying to recover, not templates every narration must follow:

- Elk Hotel — hidden story attached to an ordinary place.
- Film Center Building — nitrate film / fireproofing explanation that changes how the building is understood.
- Longo rooftop sign — hidden commercial/local history embedded in the visible streetscape.
- St. Malachy’s — surprising human/cultural history, such as the Valentino funeral / 4 A.M. Mass material.
- Manhattan Plaza — a visually ordinary or unremarkable building whose hidden social function changes its meaning.

## After the Walk

Do not choose the next engineering task until the observations are grouped by failure mechanism.

Use the dominant pattern to select **one** next intervention.

### If good stories or evidence exist but disappear

Investigate where selection, narrowing, or synthesis loses them.

### If too few worthwhile stories exist in the available material

Investigate candidate aperture and/or source breadth.

The earlier Streetlit “glory days” suggest that separating story discovery from spatial grounding may matter. Current OSM-first production may still have a candidate-origin problem.

Richer Wikipedia evidence access fixed one downstream evidence bottleneck. It did not prove that production originates enough of the right stories.

### If unsupported claims recur in a narrow pattern

Consider a targeted safeguard for that failure class.

Do not automatically revive the generalized V1–V3 grounding gate.

### If good narration repeatedly cannot be physically located

Prioritize subject identification / trustworthy orientation.

### If good narration is unheard, late, or off-path

Prioritize the specific delivery, playback, path-relevance, or timing defect observed.

Do not merge those problems unless evidence shows they share a cause.

### If trustworthy generic filler dominates

Quiet over below-bar filler is the settled product direction. The open question is only whether and when to change the runtime floor. Do that only once worthwhile-story density is high enough that going quiet would not leave the walk empty; if filler dominates before then, fix story coverage first. Strict production silence is not globally enabled today.

## Stop condition

The Walk does not need to produce a statistically meaningful sample.

Stop treating the outing as an open-ended evaluation once there is enough evidence to identify the dominant failure mode or a small number of clearly recurring failure modes.

Then update the backlog and choose the smallest intervention that addresses the observed problem.

## Working rule for RC / CC

Do not use this file to infer permission for architecture changes.

When Sarah brings back Walk observations:

1. diagnose the observed failure mechanism;
2. distinguish evidence, candidate origin, synthesis, trust, orientation, ranking, path relevance, timing, and playback;
3. recommend the smallest next step;
4. do not reopen parked architecture merely because it exists.
