const ALPHANUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function generateShortCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    const randomIndex = Math.floor(Math.random() * ALPHANUM.length);
    code += ALPHANUM.charAt(randomIndex);
  }
  return code;
}

export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  return trimmed;
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export type ExpirationPreset = "24h" | "7d" | "30d" | "never";

export function resolveExpiry(preset: ExpirationPreset = "never"): Date | null {
  const now = new Date();

  switch (preset) {
    case "24h":
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case "7d":
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    case "never":
    default:
      return null;
  }
}

export function buildShortUrl(code: string, origin: string): string {
  const base = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  return `${base}/go/${code}`;
}
