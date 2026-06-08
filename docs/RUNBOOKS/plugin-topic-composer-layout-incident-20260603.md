# Incident: Plugin Topic Composer Layout Overrun - 2026-06-03

## Summary

On 2026-06-03, a small Hermes Mobile UI issue in Hermes-owned plugin-bound topic chat layout
took several hours and many repeated iterations to resolve. The expected result
was simple: the plugin topic chat should look like the normal Hermes chat page,
with the normal five-entry bottom navigation replaced by the three-entry
plugin-context footer.

This was not a plugin iframe bug. Plugin projects were not responsible for this
failure. Plugins only need to lay out their own bottom labels/tabs correctly
inside their own iframe.

Instead, the fix path repeatedly treated the page as a special layout surface.
Several attempts moved padding between outer shells, main containers, and fixed
composer rules. This produced alternating failures on iOS:

- visible blank space above the footer;
- composer covered by the footer;
- composer floating above messages;
- input disappearing or landing outside the expected visual area;
- old clients not consistently receiving or showing an obvious refresh state.

The final working direction was to follow the existing working pattern used by
Finance-like embedded pages and standard chat:

- fixed bottom control at the correct footer boundary;
- reserve covered space in the scroll container;
- no outer shell padding used as the visible spacer;
- explicit static version bump and refresh proof.

## Impact

- User time was wasted on repeated manual refreshes and screenshots.
- The model spent excessive tool calls and context tokens on a narrow CSS/layout
  issue.
- User confidence in small UI fixes was damaged because the visible result
  regressed across attempts.
- The fix did not require a new product concept, service boundary, or complex
  algorithm; it required stricter reuse of an existing layout pattern.

## Root Causes

### 1. Wrong Surface Classification

The page was approached as a special plugin-related page. The correct classification was
"Hermes-owned chat topic with plugin-context bottom nav." Because it is still a
chat topic, the baseline should have been the ordinary chat composer behavior.

### 2. Missing Shared Bottom-Layout Standard

Existing docs covered iframe plugin layout, but did not clearly separate that
from Hermes-owned plugin-bound topic chats. That left room for local experiments
instead of a single mandatory rule for the Hermes chat surface.

### 3. CSS Fixes Were Tried At The Wrong Layer

Several attempts changed `.app` or `.main` spacing. On mobile, especially iOS,
outer padding can become visible blank space or interact with safe-area/browser
viewport behavior. The reservation needed to be on `.conversation`, the scroll
container that is actually covered by the fixed composer.

### 4. Android Evidence Was Overweighted For An iOS Symptom

Android screenshots showed a near-correct result, but the user's failing client
was iOS. Android validation was useful but insufficient for final confidence.
The limitation should have been stated earlier and the CSS should have been
more conservative around iOS safe-area and scroll-container behavior.

### 5. Refresh State Added Noise To Layout Diagnosis

Some iterations were deployed, but the phone did not always show an obvious
refresh action. This made it unclear whether the user was seeing the newest CSS
or an old cached client. The refresh path should have been stabilized before
asking the user to judge fine layout changes.

### 6. The Debug Loop Was Too Broad

The issue was a narrow bottom layout contract problem. The loop repeatedly
touched deployment, refresh, screenshots, and alternative CSS strategies without
first locking the invariant: "same as ordinary chat, only bottom nav changes."

## Final Fix Direction

The final source version for this incident was:

- `20260603-plugin-topic-composer-reserve-v546`

The effective layout rule:

- `.composer` is fixed above `--plugin-context-bottom-nav-height`;
- `.conversation` reserves `--plugin-topic-composer-reserved-height`;
- the reserve was increased to `142px` to avoid auto-scroll clipping;
- `.main` remains a relative container and does not carry the visible bottom
  spacer.

Later update: the current standard is variable-driven. The composer bottom
offset includes bottom-nav bottom inset, plugin-context nav height, bottom-tab
visual lift, and the composer/nav gap; the reserve currently tracks this full
bottom region through `--plugin-topic-composer-reserved-height`.

The static deploy proved old clients would receive a refresh marker:

- old v545 request returned
  `X-Hermes-Web-Version=20260603-plugin-topic-composer-reserve-v546`;
- old v545 request returned `X-Hermes-Web-Refresh-Required=1`.

## Correct Future Procedure

For any Hermes Mobile bottom-layout issue:

1. Classify the surface before editing:
   - ordinary chat;
   - plugin-bound chat;
   - iframe plugin;
   - preview overlay;
   - other secondary page.
2. Find the existing working analogue:
   - ordinary chat for Hermes-owned chat topics;
   - Finance-like embedded page for plugin-owned fixed local nav;
   - full-screen preview contract for modal media/file previews.
3. Change the smallest owner layer:
   - fixed control at owner boundary;
   - scroll reserve in the scroll container;
   - no outer-shell spacer unless the outer shell is the scroll container.
4. Bump static version once per deployable UI attempt.
5. Prove refresh with `/api/client-version` before asking for visual judgement.
6. Validate the exact device class when the user reports a device-specific bug.
7. If exact device validation is unavailable, say so and make the next change
   intentionally conservative.

## What Not To Repeat

- Do not keep moving bottom padding among `.app`, `.main`, and `.conversation`
  without a declared owner model.
- Do not accept an Android screenshot as final proof for an iOS-only symptom.
- Do not ask the user to re-check fine UI spacing until the static refresh path
  has been proven for the previously served version.
- Do not treat plugin-bound topic chat as a new visual surface.
- Do not blame plugin iframe layout when the failing surface is Hermes-owned
  topic chat.
- Do not create a special local solution when the ordinary chat composer model
  already applies.

## Permanent Follow-Up

The shared standard now lives at:

- `docs/IMPLEMENTATION_NOTES/embedded-surface-bottom-layout-standard.md`

Future Hermes Mobile host and plugin UI work should read that standard together
with:

- `docs/IMPLEMENTATION_NOTES/embedded-plugin-ui-contract.md`
- `docs/MODULES/plugin-topics.md`
- `docs/RUNBOOKS/static-client-cache-version.md`
