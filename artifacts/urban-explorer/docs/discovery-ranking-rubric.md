# Discovery Ranking Rubric v1

This rubric does not prescribe a specific algorithm. It defines the relative value of different types of discoveries and should inform future ranking, filtering, and eligibility decisions.

---

## How this should be used

This rubric should guide future ranking, filtering, Explore surface eligibility, Walk Mode narration eligibility, `osm_bare` handling, and prompt changes. It does not prescribe a specific algorithm.

When in doubt, apply the tie-breaker: prefer the discovery that creates the larger change in the user's understanding of the place or neighborhood.

---

## Real is not enough

A real nearby place is not automatically a Streetlit discovery. OSM presence confirms that a place exists; it does not by itself justify automatic surfacing. To auto-surface, a place should have a specific hidden story, visible remnant, contextual explanation, civic/social role, architectural meaning, or larger-pattern connection. If it only passes the "is real" test, it is map data, not a discovery.

---

## Priority tiers

### Highest priority

These discoveries most strongly align with Streetlit's purpose.

- Hidden stories
- Human and community stories
- Visible remnants of an earlier use or era
- Discoveries that explain why a place or neighborhood looks the way it does today
- Ordinary places connected to larger historical, cultural, social, or economic patterns
- Discoveries that reveal an invisible layer of the city

**Examples:**

- Hidden Pullman train car inside a former office building
- Former speakeasy entrance
- Windermere's role in tenant-rights history
- Oregon Diner preserving the footprint of Stonehouse Lane

---

### Medium-high priority

Strong discoveries that deepen understanding of a place.

- Neighborhood context
- Adaptive reuse
- Local institutions with meaningful civic or social roles
- Architectural details that meaningfully change perception
- Discoveries that reveal how people once lived, worked, traveled, learned, or gathered

**Examples:**

- Streetcar-suburb development
- Public-health influences on school design
- Commercial districts created to serve a growing neighborhood

---

### Medium priority

Useful discoveries that may not be deeply historical but still reward attention.

- Visually striking architecture with meaningful context
- Distinctive physical features with explanatory context
- Contextual discoveries in areas with few higher-priority opportunities

**Examples:**

- The McGraw-Hill Building's Art Deco design and distinctive terra-cotta facade
- An unusual architectural style that helps explain a period of development

---

### Low priority / manual exploration

Information that may be useful to curious users but generally should not be auto-surfaced as a discovery or trigger automatic narration.

- Generic descriptions
- Basic place information
- Category-level information
- Generic business functions

**Examples:**

- School
- Bank
- Office building
- Restaurant
- Place of worship

---

### Suppress from auto-surface

The following do not meaningfully contribute to discovery and should generally be suppressed from auto-surfaced Explore results and automatic narration.

- Metadata-only content
- Facts obvious from visual observation
- Generic business descriptions
- Repeated contextual themes already established during the walk
- Generic chain businesses with no meaningful story
- Placeholder language ("notable place," "local institution," etc.) unsupported by actual context
- Raw category labels presented as discoveries

**Examples:**

- "This is a bank."
- "This building has four stories."
- "It serves local students."
- "A notable place in this area."

---

## Tie-breaking principle

When choosing between two discoveries:

**Prefer the discovery that creates the larger change in the user's understanding of a place.**

An ordinary place with an extraordinary story should generally outrank an extraordinary-looking place with no meaningful story.
