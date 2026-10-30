# Room text-chat architecture — 2026-10-29

The live website now compiles its prompt from the shared Yachiyo card instead of
the separate legacy persona string in `useRoomChat`. The default setting is an
original daily-life continuation after the film: anticipation, creativity and
reunions, with the original identity and relationships intact. This is an
interaction setting, not a claim about additional official events.

## Request path

`useRoomChat` still owns cancellation, account/revision checks, streaming,
completed-turn persistence, editing/regeneration, images, tool calls and speech.
It gathers existing context and calls `shared/room-chat-runtime.cjs` once before
the provider request. There is no additional per-turn model call.

The compiler separates:

1. The boundary for imported reference material and before-character world entries.
2. The seven-layer built-in character card and post-film daily setting.
3. Spoiler preference, optional character reference and after-character entries.
4. Current account username/nickname and the user's explicit introduction.
5. Existing user instructions, live environment, owned memories and public sources.
6. The existing dialogue planner, output contract and current-turn instruction.

The account object is projected to username/nickname only. Email, account ID,
session tokens and provider keys do not enter the identity block. The compiler's
trace contains block names/counts and selected world-entry IDs, never prompt text.
It stays in memory and is cleared on a new conversation/account reset.

The system text has a 20,000 UTF-16-character hard ceiling, individual block
limits and a 2,200-character world-book envelope budget. Whole optional imported
blocks are dropped first. Existing 4,000/6,000-character paired conversation
selection and 4,000/8,000-character source packing remain. These are character
budgets, **not exact provider token counts**; providers retain their existing
output-token settings. Model-specific tokenizer/context-window negotiation is
not implemented by this change.

## Character cards and world books

Room Settings → Character knowledge → Character and conversation provides:

- Spoiler preference, optional self-introduction and a daily scene.
- JSON Character Card V2/basic-card import with an editable preview. The bundled card and world book are enabled by default, with ending discussion allowed. Imports enable both switches in the draft; saving applies them. Explicit disable/removal and spoiler opt-outs survive reload.
- Export of the bundled Yachiyo V3 card as Character Card V2 JSON.
- Entry review, disabling individual entries, spoiler flags and a local preview.
- Card reference and world-book switches are independent: disabling expression reference does not disable an enabled world book. Removing the card removes both sources.
- Both the local preview and the last successful reply report whether the card was included and whether world entries were included, disabled, unmatched or omitted for length. The reply indicator is published only after a nonempty provider response, not from an unsent preview.
- Independent save/cancel plus integration with the page-wide save bar, discard action and unsaved-change guard.

Settings use `roomDialogueSettingsV1:<account-id-or-guest>`. No existing settings,
knowledge edits, provider configuration, diary personas or memories are migrated
or overwritten. Settings remain local to this account/browser; cloud settings
sync is not implied. Disabling memory prevents retrieval of saved facts, while
an introduction explicitly entered in these settings is still sent.

Supported world-book features are literal primary keys, optional secondary keys
(AND_ANY / NOT_ALL / NOT_ANY / AND_ALL), constant entries, enable/disable,
case sensitivity, scan depth 0–12, deterministic insertion order, before/after
character placement and a bounded whole-entry budget. No recursive scanning,
regex execution, arbitrary macros, remote URL loading, scripts or extensions are
executed. Advanced/depth positions fall back to after-character reference data.
PNG cards, full V3 cards, lore outlets, timed effects and complete SillyTavern
extension compatibility are outside this implementation.

The world-book budget counts the actual serialized source/id/content envelope sent
to the provider. Editor metadata and trigger keywords do not consume that budget.
Entries dropped by the overall prompt limit are also reported as omitted.

Imported `system_prompt` and `post_history_instructions` are not adopted.
Examples/opening messages are preview-only: they are not fabricated shared
history or permanent few-shot dialogue. Imported material informs expression and
scenes while the application retains Yachiyo's identity and output contracts.
Descriptions/personality/scene are bounded before packaging; a large reference
does not displace account identity or the final current-turn instruction.

## Continuity without random retrieval

`shared/room-continuity.cjs` recognizes a deliberately narrow set of explicit
user statements: direct names/preferred names, stopping a name, and a quoted
next-chat cue/answer agreement. It excludes third-person quotations,
hypotheticals and assistant assertions. General preferences and plans continue
to use the existing semantic analysis; this fast path is not a general language
understanding or promise-completion classifier.

On a completed authenticated turn, these facts are written synchronously to the
existing `room_memory_facts` table, linked to the exact owned source. Query-time
selection reads up to four current anchors separately from similarity-ranked
memories, so a greeting can recover a name and agreement without crowding out
the normal retrieval limit. Existing high-confidence semantic name facts also
qualify. No new database table or remote memory service is introduced.

Every request, including regeneration, re-reads the owned source. Recent-turn
exclusions apply. Corrections retire older names; deleting the correction does
not reactivate them. Deletion/clear cascades with the source. Manual source edits
invalidate prior extracted anchors immediately; the edited text remains in
normal retrieval. A new explicit statement can establish a new anchor. The
client's memory-off switch skips both normal and continuity retrieval.

Guest/account-local storage uses the same IndexedDB memory records and marks
superseded facts on those records. It does not create a shadow archive. Existing
legacy records with an unambiguous user boundary can be recognized locally;
server legacy records need an existing semantic name fact or a new explicit
statement. This change does not promise complete automatic recovery of every
old name or arbitrary past agreement.

## Reference decisions

- [SillyTavern character design](https://docs.sillytavern.app/usage/core-concepts/characterdesign/): separate character, personality, scenario and user persona.
- [Character Card V2 specification](https://github.com/malfoyslastname/character-card-spec-v2/blob/main/spec_v2.md): exported cards include mandatory nested extension objects. Import is an expression-reference adapter, not a lossless general card editor or full V2 frontend implementation.
- [SillyTavern World Info](https://docs.sillytavern.app/usage/core-concepts/worldinfo/): selective contextual entries, ordering and budgets.
- [SillyTavern Prompt Manager](https://docs.sillytavern.app/usage/prompts/prompt-manager/): ordered inspectable prompt blocks.
- [SillyTavern source](https://github.com/SillyTavern/SillyTavern), inspected release commit `06bde939fb1e9c4c8d8641d810f0a916b5bce127`, AGPL-3.0. This implementation is independently authored from the concepts; no SillyTavern implementation or dependency is vendored.
- [YacchoGPT](https://github.com/tsukumijima/YacchoGPT), CC0 prompt reference: borrow the distinction between self-knowledge and disclosure, concrete motives and coherent voice. Do not copy its earlier time setting, permanent identity concealment, unknown-user assumption, model-specific hidden-reasoning instructions or long canned examples.
- Official character sources and evidence remain in `shared/room-character.json` and the existing source-labelled knowledge library. Fan cards do not establish canon.

## Validation and rollout

Focused tests cover parser boundaries, world-book gating/budget, identity privacy,
prompt order/limits, cross-session anchors, corrections, deletion, disabled memory
and account isolation. Browser tests use a synthetic provider response and inspect
the actual outgoing request after saving a card, starting a new chat and removing
the reference. Existing streaming/regeneration, diary, image, TTS and settings
tests remain in the regression suite.

Automated fixtures establish data flow and persistence, not human-rated dialogue
quality. The previous 2026-10-23 DeepSeek evaluation is not a validation of V3;
no live-provider evaluation is claimed here. Follow-up quality assessment should
compare short multi-session dialogues for names, agreements, canon relationships,
spoiler avoidance, ordinary happiness, book discussion and technical help.

Deployment uses the existing guarded domestic/overseas workflow. Rollback is a
source revert: additive local settings can remain dormant, and the existing fact
table needs no destructive migration. Original user memories remain accessible.

Local validation before PR: 1,258 Node unit/integration tests passed. The focused desktop/phone Chromium and mobile WebKit regression run passed 32 tests, followed by 22 settings/architecture browser tests after save-bar integration. Domestic and overseas production builds passed. Provider replies in browser tests are mocked.
