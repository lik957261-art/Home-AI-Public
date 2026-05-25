# Hermes Mobile Product Requirements

This file records durable product rules that implementation must preserve.

## General

- Hermes Mobile is a private family/workspace AI control plane, not a generic public SaaS app.
- Owner controls production configuration, high-permission operations, workspace keys, Gateway maintenance, and Growth configuration.
- Non-Owner accounts must retain normal workspace tools according to their workspace policy; Growth-specific restrictions must not globally lock a workspace out of chat, topics, directory, Kanban, or automation.

## Growth Learning

- Evergreen cards are driven by observed ability and weakness evidence, not by a fixed grade-only track.
- Age, school, grade, and curriculum history are initialization signals; subsequent cards should primarily follow demonstrated mastery, repair needs, transfer, and trajectory.
- Growth scoring is evidence-based. A score can reach the numeric line while the card is still incomplete if a revision/reflection gate remains.
- AI evaluation must be asynchronous and durable when grading can take time. Restarting listener or Gateway should not lose accepted evaluation work.
- Learning records must be summary-only. Do not expose full child answers, transcripts, questions, answer keys, or prompts in planning records, docs, or handoffs.
- Rewards are settled only through the reward settlement service and coin service. Evaluation services must not write coin ledger rows directly.

## Skill Permissions

- Owner can write system/shared Skills.
- Non-Owner shared Skill access should be read-only at the product layer.
- Owner low-permission workers may need write access for Owner-owned Skill work; permission policy must distinguish Owner/non-Owner, not merely low/high Gateway permission.
- Skill UI must hide or disable write actions when `access.canWrite` is false.

## Gateway And ChatGPT Pro

- ChatGPT Pro requests require Owner-maintenance routing and the `chatgpt_pro_generate` tool.
- ChatGPT Pro long runs may take 20-30 minutes. Product timeouts and watchdogs must not terminate them early.
- ChatGPT Pro generated files are temporary artifacts and should default under production data temp, not the source checkout or repo-level `outputs/`.
- Gateway watchdogs may repair genuinely dead workers, but must not replace a busy maintenance worker merely because `/health` is slow during a long tool call.

## Automation And Web Push

- Automation list should preserve full-detail user format when foreground data is shown.
- Web Push notifications should deep-link to the specific resource when an id is available.
- Notification click handling must target top-level app windows, not embedded viewer iframes.

## Static Client

- Any client-visible static change must bump the static/client cache version in `public/index.html`, `public/service-worker.js`, `public/directory-viewer.html`, and the relevant test constant.
- Static-only deployment does not require listener or Gateway restart.
