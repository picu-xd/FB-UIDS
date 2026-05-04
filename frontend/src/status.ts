// Map raw status (DB value) → display label and colors used in the UI.
// User-requested rename: valid → LIVE, invalid → DIE
import { theme } from "./theme";

export type RawStatus = "pending" | "valid" | "invalid" | "checking";

export const STATUS_LABEL: Record<RawStatus, string> = {
  pending: "PENDING",
  valid: "LIVE",
  invalid: "DIE",
  checking: "CHECKING",
};

export function statusColors(status: string): {
  bg: string;
  border: string;
  text: string;
} {
  switch (status) {
    case "valid":
      return { bg: theme.okSoft, border: theme.ok, text: theme.ok };
    case "invalid":
      return { bg: theme.errSoft, border: theme.err, text: theme.err };
    case "checking":
      return { bg: theme.blueSoft, border: theme.blue, text: theme.blue };
    default:
      return { bg: theme.warnSoft, border: theme.warn, text: theme.warn };
  }
}

export function labelFor(status: string): string {
  return STATUS_LABEL[status as RawStatus] || status.toUpperCase();
}
