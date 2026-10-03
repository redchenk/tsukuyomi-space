import protocol from '../../../../shared/llm-protocol.cjs';

// Identical wire semantics on browser-direct and API-proxied transports.
export const readRoomChatStream = protocol.readStream;
