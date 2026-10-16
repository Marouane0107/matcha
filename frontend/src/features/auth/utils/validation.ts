export type FieldErrors = Record<string, string>;

export const passwordHint = "Use 12 to 128 characters, including a letter and a number. Common or compromised passwords are not allowed.";

export function emailError(value: string): string | undefined {
  return value.length <= 254 && /^[^\s@\p{Cc}]+@[^\s@\p{Cc}]+\.[^\s@\p{Cc}]+$/u.test(value) ? undefined : "Enter a valid email address.";
}

export function usernameError(value: string): string | undefined {
  return /^[a-z][a-z0-9_]{2,29}$/.test(value) && !["me", "search", "suggestions", "auth", "api"].includes(value)
    ? undefined : "Use 3 to 30 lowercase letters, numbers or underscores, starting with a letter. Choose a non-reserved name.";
}

export function nameError(value: string): string | undefined {
  return [...value].length >= 1 && [...value].length <= 50 && !/\p{Cc}/u.test(value) ? undefined : "Enter 1 to 50 characters without control characters.";
}

export function passwordError(value: string): string | undefined {
  return [...value].length >= 12 && [...value].length <= 128 && /\p{L}/u.test(value) && /\p{N}/u.test(value)
    ? undefined : "Use 12 to 128 characters with at least one letter and one number.";
}

export function cleanErrors(values: Record<string, string | undefined>): FieldErrors {
  return Object.fromEntries(Object.entries(values).filter((entry): entry is [string, string] => Boolean(entry[1])));
}

export function readFragmentToken(location: Pick<Location, "hash" | "pathname" | "search">, history: Pick<History, "replaceState" | "state">) {
  const path = location.pathname;
  if (path !== "/verify-email" && path !== "/reset-password") return { path, token: null };
  const params = new URLSearchParams(location.hash.slice(1));
  const values = params.getAll("token");
  history.replaceState(history.state, "", path + location.search);
  const token = values.length === 1 && /^[a-fA-F0-9]{64}$/.test(values[0]) ? values[0] : null;
  return { path, token };
}
