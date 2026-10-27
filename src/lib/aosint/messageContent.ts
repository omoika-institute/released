const CHANNEL_BLOCK_PATTERN =
  /^\s*<\|channel(?:\|)?>\s*(?:thought|analysis)?\s*(?:\r?\n\s*)?(?:thought|analysis)?\s*(?:\r?\n\s*<channel\|>)?\s*$/gim;
const OPEN_CHANNEL_MARKER_PATTERN =
  /^\s*<\|channel(?:\|)?>\s*$/gim;
const OPEN_CHANNEL_WITH_NAME_PATTERN =
  /^\s*<\|channel(?:\|)?>\s*(?:thought|analysis)\s*$/gim;
const LEADING_CHANNEL_NAME_PATTERN = /^\s*(?:thought|analysis)\s*(?:\r?\n)+/i;
const CLOSE_CHANNEL_MARKER_PATTERN = /^\s*<channel\|>\s*$/gim;
const INLINE_CHANNEL_MARKER_PATTERN =
  /<\|channel(?:\|)?>\s*(?:thought|analysis)?\s*<channel\|>/gi;
const ANY_OPEN_CHANNEL_MARKER_PATTERN =
  /<\|channel(?:\|)?>\s*(?:thought|analysis)?/gi;
const CHANNEL_NAME_BEFORE_CLOSE_PATTERN =
  /(?:thought|analysis)\s*<channel\|>/gi;
const ANY_CLOSE_CHANNEL_MARKER_PATTERN = /<channel\|>/gi;

export function stripAssistantChannelMarkers(content: string) {
  return content
    .replace(CHANNEL_BLOCK_PATTERN, "")
    .replace(INLINE_CHANNEL_MARKER_PATTERN, "")
    .replace(ANY_OPEN_CHANNEL_MARKER_PATTERN, "")
    .replace(CHANNEL_NAME_BEFORE_CLOSE_PATTERN, "")
    .replace(ANY_CLOSE_CHANNEL_MARKER_PATTERN, "")
    .replace(OPEN_CHANNEL_MARKER_PATTERN, "")
    .replace(OPEN_CHANNEL_WITH_NAME_PATTERN, "")
    .replace(LEADING_CHANNEL_NAME_PATTERN, "")
    .replace(CLOSE_CHANNEL_MARKER_PATTERN, "");
}

export function sanitizeAssistantMessageContent(content: string) {
  return stripAssistantChannelMarkers(content)
    .replace(/<\/?think>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
