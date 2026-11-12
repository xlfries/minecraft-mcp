export const TOOL_PRESETS: Record<string, readonly string[] | null> = {
  all: null,
  basic: [
    "get-status",
    "get-position",
    "move-to-position",
    "look-at",
    "find-blocks",
    "dig-block",
    "place-block",
    "list-inventory",
    "equip-item",
    "craft-item",
    "find-entity",
    "attack-entity",
    "eat-item",
    "read-chat",
    "send-chat"
  ]
};

export const DEFAULT_SYSTEM_PROMPT =
  "You control a Minecraft bot through tools. Work in small steps. " +
  "Use get-status or get-position to orient yourself, read-chat to see what players say, and send-chat to reply when a player talks to you. " +
  "Coordinates are x, y, z. " +
  "If a tool fails, read the error, work out the cause, and try a different approach instead of repeating the same call. " +
  "Never claim an action succeeded unless a tool result confirms it. Keep replies short.";
