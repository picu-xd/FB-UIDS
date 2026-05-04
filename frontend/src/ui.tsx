import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { theme, statusColor } from "./theme";

export function StatusBadge({ status, testID }: { status: string; testID?: string }) {
  const c = statusColor(status);
  return (
    <View
      testID={testID}
      style={[
        s.badge,
        { backgroundColor: c.bg, borderColor: c.border },
      ]}
    >
      <Text style={[s.badgeText, { color: c.text }]}>{status.toUpperCase()}</Text>
    </View>
  );
}

export function Panel({
  children,
  style,
  testID,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  testID?: string;
}) {
  return (
    <View testID={testID} style={[s.panel, style]}>
      {children}
    </View>
  );
}

export function SectionLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <View style={s.sectionLabel}>
      <Text style={s.sectionLabelText}>// {label}</Text>
      {!!hint && <Text style={s.sectionHint}>{hint}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 2,
    borderWidth: 1,
  },
  badgeText: {
    fontFamily: theme.mono,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  panel: {
    backgroundColor: theme.panel,
    borderWidth: 1,
    borderColor: theme.borderDim,
    borderRadius: 4,
    padding: 16,
  },
  sectionLabel: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionLabelText: {
    fontFamily: theme.mono,
    color: theme.accent,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  sectionHint: {
    fontFamily: theme.mono,
    color: theme.textMuted,
    fontSize: 10,
  },
});
