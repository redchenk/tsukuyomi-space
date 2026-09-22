# Room settings verification — 2026-09-22

## Fixed behavior

- The saved knowledge list is authoritative. Editing built-in IDs, disabling entries, deleting entries and saving an empty list no longer restore defaults during chat.
- Both basic setup and advanced settings persist the knowledge switch. Save knowledge, Save all and Save and return include an active editor draft; failed writes retain it and stop navigation.
- Pending changes have a visible status and a route/unload guard. Invalid LLM, enabled TTS and enabled MCP endpoints show an error instead of a success message.
- Saving LLM/model settings preserves additional stored options. Custom GPT-SoVITS endpoints and Unicode audio paths remain unchanged.
- Fresh Live2D views apply saved scale and offsets once after loading, on mobile and desktop.
- Diary persona and imported diary prose are excluded from live chat prompts. Diary generation and its preview retain the selected diary author. Import cannot write to a different account if the identity changes during file reading.

## Verification

`node --test tests/markdown.test.js tests/frontend-*.test.js`: 204 passing tests. Includes stateful settings-handler tests, storage-failure cases, knowledge retrieval, chat-context isolation and Live2D initialization. Domestic and overseas Vite production builds pass.

Browser workflows used the real frontend and a temporary local API/database with a synthetic chat-completions provider, at 393 × 852 and 1280 × 900:

1. Edit the built-in identity entry on mobile, save knowledge, change chat instructions and diary persona, then Save and return. The outgoing request contains the edited knowledge and chat instructions, but no diary persona.
2. Edit the same entry on desktop and Save all. The next request contains the desktop edit and excludes its previous mobile text.
3. Generate a diary. Its outgoing prompt uses the separate diary persona; the preview displays that diary author while the room/chat remains 八千代.
4. Disable knowledge in basic setup step 3 on mobile, save and enter Room. The outgoing request omits knowledge while retaining explicit chat instructions.
5. Import the repository's synthetic persona-sample JSON through the mobile file chooser. The settings page shows Aoi and two entries, with chat settings preserved.

## Limits

Viewport testing is not physical iOS Safari testing. External paid model/TTS services were not called with user credentials. Provider availability, CORS, LAN reachability and device audio permissions still depend on the configured service and browser. Settings and keys remain local to the current browser; no new cross-device synchronization was introduced.
