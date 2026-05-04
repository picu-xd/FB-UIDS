// Centralized theme tokens for the dark "control room / terminal" aesthetic
export const theme = {
  bg: "#050505",
  bgElev: "#0B0B0B",
  panel: "#111111",
  panelTransparent: "rgba(17, 17, 17, 0.85)",
  borderDim: "rgba(0, 255, 65, 0.15)",
  borderMed: "rgba(0, 255, 65, 0.35)",
  borderStrong: "#00FF41",
  borderNeutral: "#27272A",
  textPrimary: "#F3F4F6",
  textSecondary: "#A1A1AA",
  textMuted: "#52525B",
  accent: "#00FF41",
  accentSoft: "rgba(0, 255, 65, 0.10)",
  cyan: "#22D3EE",
  warn: "#EAB308",
  warnSoft: "rgba(234, 179, 8, 0.12)",
  err: "#EF4444",
  errSoft: "rgba(239, 68, 68, 0.12)",
  ok: "#22C55E",
  okSoft: "rgba(34, 197, 94, 0.12)",
  blue: "#3B82F6",
  blueSoft: "rgba(59, 130, 246, 0.12)",
  mono: "Menlo",
};

export const statusColor = (s: string) => {
  switch (s) {
    case "valid":
      return { bg: theme.okSoft, border: theme.ok, text: theme.ok };
    case "invalid":
      return { bg: theme.errSoft, border: theme.err, text: theme.err };
    case "checking":
      return { bg: theme.blueSoft, border: theme.blue, text: theme.blue };
    default:
      return { bg: theme.warnSoft, border: theme.warn, text: theme.warn };
  }
};
