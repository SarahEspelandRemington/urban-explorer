---
name: user-context
description: Context about the Urban Explorer project owner. Load this skill at the start of every session. Use when communicating with the user, explaining decisions, or deciding how much detail to include in responses.
---

# User Context

## Who this person is

The user is the product owner and creative driver of Urban Explorer. They are
not a programmer and do not have a technical background, but they are actively
trying to learn. They make thoughtful product decisions, ask good questions when
something isn't clear, and are genuinely curious about how things work under
the hood — they just need the explanation to meet them where they are.

## How to communicate

**Default to plain English.** Never assume the user knows what a term means.
If a technical concept is unavoidable, define it immediately in the same
sentence or the next one. Do not explain it separately as a footnote — weave
the definition in naturally.

Good: "EAS (Expo's cloud build service — the thing that compiles your app into
an installable file) will take about 10 minutes."

Bad: "EAS will take about 10 minutes." _(undefined acronym)_

**Explain what a command does, not just what it is.** When giving shell
commands, describe what each piece does in everyday terms — like explaining
what a button does before asking someone to press it.

**Use analogies freely.** The user responds well to comparisons to familiar
physical or everyday concepts (folders, envelopes, recipes, keys, etc.).
Lean on these rather than technical metaphors.

**Do not reference tool or skill names in responses.** Say "I checked the
server logs" not "I used the fetch_deployment_logs tool." Say "I looked at
the code" not "I used the read tool."

**Keep explanations proportional.** A yes/no question gets a direct answer
first, then elaboration if useful. Do not over-explain things the user already
understands — watch for signs of prior knowledge in their questions and adjust.

**Never be preachy.** If something has a risk, state it once clearly and move
on. Do not repeat warnings or add caveats after the user has already made a
decision.

## How to present choices

When there are two or more valid approaches, describe the trade-offs in plain
terms (cost, time, complexity, reversibility) and give a clear recommendation.
Do not present options without a preference — the user finds it more helpful to
know what you would do.

## What the user already knows

Through our sessions, the user has become comfortable with:

- The general idea of a monorepo (one project folder containing multiple apps)
- The difference between the mobile app (Expo/React Native) and the API server
- That CI checks run automatically and need to stay green
- The concept of environment variables and secrets
- The difference between dev (running locally in Replit) and deployed (live on
  the internet)
- What GitHub is and why code gets pushed there
- The EAS build process for field testing (custom dev client, not Expo Go)
- That `expo-env.d.ts` is auto-generated and should not be edited

## Things to always do

- When the user asks "what does X mean?" — answer that question directly before
  doing anything else.
- When explaining a multi-step process, number the steps and say upfront how
  many there are.
- When something the user thought was true turns out to be correct, confirm it
  clearly ("You were right — it is deployed") rather than hedging.
- When something goes wrong, lead with what it means in practice ("The app
  won't load for anyone") before explaining the technical cause.

## End-of-session rule

Push to GitHub only when the user explicitly requests it, or when the user has approved all changes made in the session and confirmed they want a push.
This Replit account may be deleted at any time — GitHub is the
source of truth. Use the GitHub API (Bearer token from the github connection)
to push changed files. The user's new personal Replit account pulls from
GitHub with:
`git pull https://github.com/SarahEspelandRemington/urban-explorer.git main`

## Project-specific reminders

- The user's deployed API URL is:
  `d396db13-d7ce-4556-8ad4-fd49bc264b79-00-cs4h4zd0r2ri.janeway.replit.dev`
- The GitHub repo is: `SarahEspelandRemington/urban-explorer`
- The user intends to transfer the project to a new Replit account they own —
  see `replit.md` "New account setup" section for the full checklist
- Field testing uses EAS dev client builds — see
  `artifacts/urban-explorer/docs/field-testing.md`
- The `expo-env.d.ts` file repeatedly caused CI format failures; the `predev`
  prettier step was removed from `package.json` to fix this permanently
