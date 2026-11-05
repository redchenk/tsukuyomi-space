# Room settings navigation

The eight existing settings sections remain available under their existing IDs: llm, tts, knowledge, memory, model, diary, mcp, and debug. `/room/settings` opens an overview; `?section=` selects an existing section and `?setup=1` retains first-use setup.

Mobile shows all eight entry points and persistent access to the overview and search. Desktop keeps its sidebar. Search opens the existing form and expands its relevant advanced group. Category changes retain drafts. Save applies all categories; leaving offers save, discard, or continue editing. Memory and knowledge edits retain their existing explicit save/delete/import flows and account isolation.

TTS groups the same providers into official service, personal API, and local voice. Each provider retains its own unsaved draft while switching, and official availability continues to come from the server. Personal Fish Audio, official Fish, GPT-SoVITS, Japanese translation, emotion, model choice, preview, and all advanced parameters remain on their existing request paths. Saving alone does not create a paid synthesis job.

Character-card and world-book switches stay independently visible. The knowledge library, built-in reference reset, memory-source choice, diary archives, model runtime capabilities, MCP permissions, and Live2D controls are retained. A labeled settings entry is visible from Room. The music drawer is available from the settings header so its collapsed floating button cannot cover settings controls.

Validation: Node unit tests; Chromium and native WebKit journeys for mobile/desktop, three locales, saved drafts, request payloads, account isolation, official replay, local voice, memory and knowledge. The companion Flutter change uses the same eight-section taxonomy while retaining native navigation, secure credential storage and service clients.
