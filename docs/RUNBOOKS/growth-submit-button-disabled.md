# Runbook: Growth Submit Button Disabled Or Misleading

## Symptoms

- Submit button remains disabled even after text is entered.
- A phone shows "submitted" but Owner cannot see a saved submission.
- The UI shows waiting for AI before the server has confirmed persistence.

## First Checks

1. Confirm the phone static client version.
2. Use the authenticated API to read the task card projection and check `latestSubmission`, latest evaluation, and queued job metadata.
3. If allowed, POST a bounded synthetic submission to a temporary test card, then remove it, to verify the backend save/enqueue path.
4. Inspect frontend local state paths for `submitting`, `accepted`, and server receipt projection.

Do not dump learner full answers or transcripts. Use metadata counts and ids.

## Common Causes

- Text does not satisfy the task guard, such as minimum English words or characters.
- The frontend displays local `submitting` as if the server had accepted the submission.
- Browser still runs an older static client.
- The card is in a phase that requires reflection/rewrite instead of first-draft submission.

## Repair

- Server-confirmed states must be visually distinct from local in-flight states.
- Submit enabling logic should be derived from the task interaction state service and local input validity.
- Guard failures should be visible and specific enough for the learner.
- After successful first-draft feedback, the UI should move to the correct reflection/rewrite flow instead of reusing the first submission box with stale text.

## Validation

- `node --check public\app-learning-program-ui.js`
- `node --check public\app-learning-native-growth-submission-controller.js`
- `node tests\app-learning-program-ui.test.js`
- `node tests\task-list-ui.test.js`
- Backend route/service tests when changing submission persistence or guards.
