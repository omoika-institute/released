import spriteMarkup from "@/assets/images/omoika-sprite.svg?raw";

const ICON_ID_PATTERN = /id="omoika-([^"]+)"/g;

const parsedIconIds = (() => {
  const ids = new Set<string>();
  let match: RegExpExecArray | null;
  const pattern = new RegExp(ICON_ID_PATTERN);

  while ((match = pattern.exec(spriteMarkup)) !== null) {
    if (match[1]) {
      ids.add(match[1]);
    }
  }

  return Array.from(ids).sort();
})();

export const ICON_SPRITE_SYMBOL_PREFIX = "#omoika-";

export function normalizeIconName(icon: string): string {
  return icon.startsWith("omoika-") ? icon.slice(5) : icon;
}

export function getIconSpriteMarkup(): string {
  return spriteMarkup;
}

export function getIconIds(): readonly string[] {
  return parsedIconIds;
}
