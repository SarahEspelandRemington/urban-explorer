<!-- Source: Google Doc "Streetlit Product Language & Trust Guidelines",
     pulled 2026-06-26. This file is a Markdown copy for repo/Claude Code
     reference. The Google Doc remains the editable source. -->

# **Streetlit Product Language & Trust Guidelines**

## **Purpose**

This document defines Streetlit's core user-facing terminology and copy principles so the app, App Store materials, support pages, privacy language, prompts, and future implementation work stay consistent.

Streetlit should sound curious, warm, and trustworthy. It should invite people to notice the world around them without overstating what the app knows.

Streetlit's voice should be accurate and clear, clever but not cutesy.

## **Launch Language Decision**

Streetlit should launch in English only for now.

Do not present partial or unreviewed non-English localization as supported launch behavior. Unsupported device languages should fall back cleanly to English.

Future localization should be treated as a deliberate product task, including translated UI copy, App Store metadata, support/privacy materials, screenshots, QA, and review by fluent speakers.

## **Core Terms**

### **Location**

**Location** means the user's physical position, GPS position, searched area, or map center.

Use **location** when talking about:

- location permission
- GPS
- map/search area
- background location
- privacy and tracking
- whether Streetlit uses or does not use a user's position

Example:

Streetlit uses your location to find nearby stories.

Avoid using **location** as the main term for surfaced Streetlit results, because it can blur into privacy/location-tracking language.

### **Place**

**Place** means the real-world location or entity itself: a building, park, monument, lot, business site, corner, storefront, institution, or other physical point of interest.

Use **place** when plain language is clearer than "discovery," especially when referring to the real-world thing.

Examples:

Save this place.
This place may have more than one layer of history.

### **Discovery**

**Discovery** means a place surfaced by Streetlit as potentially worth noticing.

In the UI, a discovery is usually represented by:

- a dot on the map
- an Explore result
- a Walk Mode result
- a card
- a saved item
- a surfaced place that may have a story attached

Use **discovery** when talking about the app's result object or the experience of noticing something nearby.

Examples:

Nearby discoveries
Saved discoveries
New discoveries appear as you walk.

### **Story**

**Story** means the narrative or explanatory content about a discovery.

A story may appear as:

- narration
- card text
- detail-page history
- contextual explanation
- timeline copy
- "what to notice" guidance

Use **story** when talking about what the user reads or hears.

Examples:

Listening for nearby stories to narrate as you walk.
No stories found nearby.

## **Initial Copy Guidance**

Use **location** when talking about the user's position, map/search area, or privacy behavior.

Use **discovery** when talking about surfaced dots, cards, results, or saved items.

Use **story** when talking about narration or historical/contextual content.

Use **place** when referring to the real-world thing itself.

When uncertain, prefer plain language over internal precision, but do not blur privacy-sensitive terms.

## **Trust and Uncertainty Principles**

Streetlit should not imply that every surfaced place has verified historical significance.

Streetlit should avoid language that implies archival research, formal verification, or human expert review unless that is actually happening.

Streetlit should not sound like there is a human historian behind the curtain quickly searching archives, records, or old maps for each user request.

Prefer language that is curious and grounded:

- "looking closer"
- "finding nearby stories"
- "what may have happened here"
- "what's known about this place"
- "stories hidden in ordinary places"
- "what this block still remembers"
- "what came before"
- "what changed over time"

Avoid language that overclaims:

- "verified"
- "confirmed"
- "the historian"
- "checking records"
- "digging through archives"
- "checking old maps"
- "historical data" unless the source is actually structured historical data

Loading copy can be lyrical, but it should not falsely describe Streetlit's method. Poetic language is acceptable when it creates atmosphere without implying a source or verification process that does not exist.

Good:

Looking for the stories this block still remembers...

Risky:

Digging through the archives...

## **Location and Privacy Copy**

Streetlit should explain location use plainly and without creepiness.

Approved location permission direction:

Streetlit uses your location to find nearby stories. We don't use it to build a profile or track where you've been.

This avoids overpromising that location is never processed, cached, logged, or used transiently. It focuses on what matters to users: Streetlit is not building a profile or tracking where they have been.

Approved Walk Mode background notification direction:

Streetlit is walking with you
Listening for nearby stories to narrate as you walk.

Approved End Walk direction:

This stops narration and background location. Your recent routes stay saved on this device.

## **Approved Launch Copy Updates**

### **Location Permission**

Use:

Streetlit uses your location to find nearby stories. We don't use it to build a profile or track where you've been.

Avoid:

Urban Explorer uses your location to surface stories and places nearby.

Reasons:

- Old brand name.
- "Stories and places" mixes terminology.
- Does not explain the privacy posture.

### **Walk Mode Background Notification**

Use:

Streetlit is walking with you
Listening for nearby stories to narrate as you walk.

Avoid:

Urban Explorer is exploring with you
Listening for nearby places to narrate as you walk.

Reasons:

- Old brand name.
- "Places to narrate" is less clear than "stories to narrate."
- "Walking with you" fits Walk Mode more naturally than "exploring with you."

### **Login / Account Copy**

Initial launch should not imply account support if accounts are deferred.

Use:

Streetlit
Discover the stories hidden in ordinary places.

Avoid:

Urban Explorer
Discover the hidden history around you. Log in or create a free account to start exploring.

Reasons:

- Old brand name.
- Conflicts with no-accounts launch posture.
- "Hidden history" is narrower and more absolute than "stories hidden in ordinary places."

### **End Walk Dialog**

Use:

End this walk?
This stops narration and background location. Your recent routes stay saved on this device.
End Walk
Keep Walking

Avoid:

Your walk history will be saved, but the session will end.

Reasons:

- "Session" is vague.
- "Walk history" could imply a broader saved personal history.
- Users should know that ending a walk stops narration and background location.

## **Approved Trust/Tone Copy Updates**

### **Discovery Loading Messages**

Use:

Looking for the stories this block still remembers...

Reading the neighborhood between the lines...

Connecting what's here now to what came before...

Following the clues in the streetscape...

Looking for what this block used to be...

Avoid:

Digging through the archives...

Checking old maps and records...

Cross-referencing the past with the present...

Reasons:

- The replacement copy keeps Streetlit's atmosphere without implying literal archival research or formal record-checking.
- "Block," "neighborhood," and "streetscape" keep the experience grounded in what the user is seeing.

### **Detail Loading Messages**

Use:

Finding the thread worth following...

Looking for the part worth noticing...

Pulling the useful clues together...

Avoid:

Verifying the interesting part...

Reasons:

- "Verifying" implies a formal verification step.
- The replacement language suggests curation and synthesis without overclaiming certainty.

### **Investigate Screen**

Use:

Curious about a specific place? See what Streetlit turns up.

Avoid:

Curious about a specific building? Ask the historian.

Reasons:

- "Place" is broader and matches Streetlit's terminology.
- "See what Streetlit turns up" is branded, humble, and accurate.
- "The historian" implies a human expert or authoritative research process.

Use:

Works best with a specific address or place name — obscure is welcome.

Avoid:

Works for any building — the more obscure, the better.

Reasons:

- "Works for any building" overpromises.
- "Works best" sets a more accurate expectation.
- "Obscure is welcome" preserves the spirit without guaranteeing results.

Use:

Looking for traces… this usually takes 15–25 seconds.

Avoid:

Loading historical data… this usually takes 15–25 seconds.

Reasons:

- "Historical data" implies structured or verified source data.
- "Looking for traces" is more accurate and more Streetlit.

### **Time Travel**

Use:

See how this place may have changed over time

Avoid:

See how this place evolved through history

Reasons:

- "May have changed" better reflects uncertainty.
- Timeline-style UI can appear authoritative, so the copy should not overstate confidence.
- "Changed over time" is plain and clear.

## **Current Working Rule**

When writing or revising Streetlit copy, first ask:

1.  Are we talking about the user's GPS/map position? Use **location**.
2.  Are we talking about a surfaced map dot/card/result? Use **discovery**.
3.  Are we talking about narration or explanatory content? Use **story**.
4.  Are we talking about the real-world entity itself? Use **place**.

Then ask:

1.  Does this imply a source, method, verification step, or human expert that does not actually exist?
2.  Does this sound more certain than the app can support?
3.  Does this explain location use clearly without sounding creepy?
4.  Does this preserve Streetlit's sense of curiosity without becoming cutesy?

## **Product Voice Summary**

Streetlit should feel like a smart, curious walking companion.

It should not sound like:

- a museum label generator
- a municipal archive database
- a tourist brochure
- a fake historian
- a generic AI assistant
- a novelty app trying too hard

It should sound:

- observant
- grounded
- warm
- lightly witty
- careful with certainty
- interested in ordinary places
- willing to say less when less is known

The goal is not to make every place sound important.

The goal is to help people notice something they might otherwise have missed.
