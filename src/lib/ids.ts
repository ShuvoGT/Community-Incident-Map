import { customAlphabet } from "nanoid";

// Lowercase alphanumeric, no ambiguous chars, for short public incident ids.
const alphabet = "23456789abcdefghijkmnpqrstuvwxyz";

const nano = customAlphabet(alphabet, 10);

export function newPublicId(): string {
  return nano();
}
