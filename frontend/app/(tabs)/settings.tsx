import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../src/theme";
import { useAuth } from "../../src/auth-context";

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const onLogout = () => {
    Alert.alert("Logout", "End this session?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/login");
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.title}>SYSTEM</Text>
            <Text style={s.subtitle}>// session & info</Text>
          </View>
          <Ionicons name="settings" size={22} color={theme.accent} />
        </View>

        <View style={s.userPanel}>
          <Text style={s.label}>OPERATOR</Text>
          <Text testID="settings-user-name" style={s.bigVal}>
            {user?.name || "Operator"}
          </Text>
          <Text testID="settings-user-email" style={s.smallVal}>
            {user?.email}
          </Text>
          <View style={s.roleBadge}>
            <Text style={s.roleText}>ROLE · {(user?.role || "user").toUpperCase()}</Text>
          </View>
        </View>

        <View style={s.panel}>
          <Text style={s.panelTitle}>// info</Text>
          <Row label="STORAGE" value="MongoDB · cloud" />
          <Row label="AUTH" value="JWT · Bearer" />
          <Row label="CHECK MODE" value="Mock (heuristic)" />
          <Row label="VERSION" value="1.0.0" />
        </View>

        <View style={s.panel}>
          <Text style={s.panelTitle}>// disclaimer</Text>
          <Text style={s.disclaimer}>
            This tool only performs <Text style={{ color: theme.accent }}>format validation</Text>
            {" "}and{" "}
            <Text style={{ color: theme.accent }}>simulated mock checks</Text>. It does NOT make
            real authentication requests against any third-party service. Do not use this app for
            unauthorised access — that violates Facebook&apos;s Terms of Service and may be illegal.
          </Text>
        </View>

        <TouchableOpacity
          testID="logout-btn"
          onPress={onLogout}
          activeOpacity={0.7}
          style={s.logoutBtn}
        >
          <Ionicons name="log-out-outline" size={16} color={theme.err} />
          <Text style={s.logoutText}>▶ TERMINATE SESSION</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowVal}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  scroll: { padding: 16, gap: 14 },
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
  userPanel: {
    backgroundColor: theme.panel,
    borderWidth: 1,
    borderColor: theme.borderMed,
    padding: 18,
    borderRadius: 2,
    gap: 4,
  },
  label: { fontFamily: theme.mono, color: theme.textMuted, fontSize: 10, letterSpacing: 1.5 },
  bigVal: {
    fontFamily: theme.mono,
    color: theme.accent,
    fontSize: 22,
    fontWeight: "700",
    marginTop: 4,
  },
  smallVal: { fontFamily: theme.mono, color: theme.textSecondary, fontSize: 12 },
  roleBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: theme.accent,
    backgroundColor: theme.accentSoft,
    marginTop: 8,
  },
  roleText: { fontFamily: theme.mono, color: theme.accent, fontSize: 10, letterSpacing: 1.2 },
  panel: {
    backgroundColor: theme.panel,
    borderWidth: 1,
    borderColor: theme.borderDim,
    padding: 14,
    borderRadius: 2,
    gap: 8,
  },
  panelTitle: {
    fontFamily: theme.mono,
    color: theme.accent,
    fontSize: 11,
    letterSpacing: 1.5,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderDim,
  },
  rowLabel: { fontFamily: theme.mono, color: theme.textMuted, fontSize: 11 },
  rowVal: { fontFamily: theme.mono, color: theme.textPrimary, fontSize: 11 },
  disclaimer: { fontFamily: theme.mono, color: theme.textSecondary, fontSize: 11, lineHeight: 18 },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: theme.err,
    backgroundColor: theme.errSoft,
    borderRadius: 2,
    marginTop: 8,
  },
  logoutText: { fontFamily: theme.mono, color: theme.err, fontWeight: "700", letterSpacing: 2 },
});
