import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../src/theme";
import { Insights, Stats } from "../../src/api";
import { TerminalSpinner } from "../../src/spinner";

export default function StatsScreen() {
  const [data, setData] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await Insights.stats();
      setData(s);
    } catch {
      setData(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading || !data) {
    return (
      <SafeAreaView style={s.safe} edges={["top"]}>
        <View style={s.center}>
          <TerminalSpinner label="LOADING METRICS" />
        </View>
      </SafeAreaView>
    );
  }

  const total = data.total;
  const validPct = total ? Math.round((data.by_status.valid / total) * 100) : 0;
  const invalidPct = total ? Math.round((data.by_status.invalid / total) * 100) : 0;
  const pendingPct = total ? Math.max(0, 100 - validPct - invalidPct) : 0;

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.accent}
            colors={[theme.accent]}
          />
        }
      >
        <View style={s.headerRow}>
          <View>
            <Text style={s.title}>COMMAND · CENTER</Text>
            <Text style={s.subtitle}>// real-time database metrics</Text>
          </View>
          <Ionicons name="pulse" size={22} color={theme.accent} />
        </View>

        {/* Hero */}
        <View style={s.hero}>
          <Text style={s.heroLabel}>TOTAL ACCOUNTS</Text>
          <Text testID="stats-total" style={s.heroVal}>
            {total}
          </Text>
          <Text style={s.heroFoot}>
            {data.by_type.uid} UID · {data.by_type.email} EMAIL
          </Text>
        </View>

        {/* Status grid */}
        <View style={s.grid}>
          <Widget label="VALID" value={data.by_status.valid} color={theme.ok} testID="stat-valid" />
          <Widget
            label="INVALID"
            value={data.by_status.invalid}
            color={theme.err}
            testID="stat-invalid"
          />
          <Widget
            label="PENDING"
            value={data.by_status.pending}
            color={theme.warn}
            testID="stat-pending"
          />
          <Widget
            label="CHECKING"
            value={data.by_status.checking}
            color={theme.blue}
            testID="stat-checking"
          />
        </View>

        {/* Ratio bar */}
        <View style={s.panel}>
          <Text style={s.panelTitle}>// success ratio</Text>
          <View style={s.ratioBar}>
            <View style={[s.ratioSeg, { backgroundColor: theme.ok, flex: validPct }]} />
            <View style={[s.ratioSeg, { backgroundColor: theme.err, flex: invalidPct }]} />
            <View style={[s.ratioSeg, { backgroundColor: theme.warn, flex: pendingPct }]} />
          </View>
          <View style={s.ratioLegend}>
            <LegendDot color={theme.ok} label={`valid ${validPct}%`} />
            <LegendDot color={theme.err} label={`invalid ${invalidPct}%`} />
            <LegendDot color={theme.warn} label={`pending ${pendingPct}%`} />
          </View>
        </View>

        {/* Activity */}
        <View style={s.panel}>
          <Text style={s.panelTitle}>// recent activity</Text>
          {data.recent_activity.length === 0 ? (
            <Text style={s.emptyLine}>— no activity yet —</Text>
          ) : (
            data.recent_activity.slice(0, 12).map((a, i) => {
              const ts = a.ts ? new Date(a.ts).toLocaleTimeString() : "";
              const color =
                a.result === "valid"
                  ? theme.ok
                  : a.result === "invalid"
                  ? theme.err
                  : theme.textPrimary;
              return (
                <Text key={i} style={[s.activityLine, { color }]} numberOfLines={1}>
                  [{ts}] {a.type.toUpperCase()} → {a.result.toUpperCase()}
                </Text>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Widget({
  label,
  value,
  color,
  testID,
}: {
  label: string;
  value: number;
  color: string;
  testID?: string;
}) {
  return (
    <View testID={testID} style={[s.widget, { borderLeftColor: color }]}>
      <Text style={[s.widgetLabel, { color }]}>{label}</Text>
      <Text style={s.widgetVal}>{value}</Text>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={s.legend}>
      <View style={[s.dot, { backgroundColor: color }]} />
      <Text style={s.legendText}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  scroll: { padding: 16, gap: 14, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontFamily: theme.mono,
    color: theme.accent,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 3,
  },
  subtitle: { fontFamily: theme.mono, color: theme.textMuted, fontSize: 11, letterSpacing: 1 },
  hero: {
    backgroundColor: theme.panel,
    borderWidth: 1,
    borderColor: theme.borderMed,
    padding: 22,
    borderRadius: 4,
    alignItems: "center",
    gap: 4,
  },
  heroLabel: { fontFamily: theme.mono, color: theme.textMuted, fontSize: 10, letterSpacing: 2 },
  heroVal: {
    fontFamily: theme.mono,
    color: theme.accent,
    fontSize: 56,
    fontWeight: "700",
    lineHeight: 64,
  },
  heroFoot: { fontFamily: theme.mono, color: theme.textSecondary, fontSize: 11 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  widget: {
    flexBasis: "48%",
    flexGrow: 1,
    backgroundColor: theme.panel,
    borderWidth: 1,
    borderColor: theme.borderDim,
    borderLeftWidth: 3,
    padding: 14,
    borderRadius: 2,
  },
  widgetLabel: {
    fontFamily: theme.mono,
    fontSize: 10,
    letterSpacing: 1.5,
  },
  widgetVal: {
    fontFamily: theme.mono,
    color: theme.textPrimary,
    fontSize: 26,
    fontWeight: "700",
    marginTop: 4,
  },
  panel: {
    backgroundColor: theme.panel,
    borderWidth: 1,
    borderColor: theme.borderDim,
    padding: 14,
    borderRadius: 2,
    gap: 10,
  },
  panelTitle: {
    fontFamily: theme.mono,
    color: theme.accent,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  ratioBar: {
    flexDirection: "row",
    height: 12,
    borderRadius: 1,
    overflow: "hidden",
    backgroundColor: theme.borderNeutral,
  },
  ratioSeg: { height: "100%" },
  ratioLegend: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
  },
  legend: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 1 },
  legendText: { fontFamily: theme.mono, color: theme.textSecondary, fontSize: 11 },
  activityLine: { fontFamily: theme.mono, fontSize: 11, paddingVertical: 2 },
  emptyLine: {
    fontFamily: theme.mono,
    color: theme.textMuted,
    fontSize: 11,
    paddingVertical: 4,
  },
});
