import { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "../src/auth-context";
import { theme } from "../src/theme";
import { TerminalSpinner } from "../src/spinner";

export default function Index() {
  const { status } = useAuth();

  if (status === "checking") {
    return (
      <View style={styles.container} testID="splash-screen">
        <Text style={styles.title}>FB · CHECKER</Text>
        <Text style={styles.subtitle}>control · room</Text>
        <View style={styles.spinnerWrap}>
          <TerminalSpinner label="INITIALISING SYSTEM" />
        </View>
      </View>
    );
  }
  if (status === "authed") return <Redirect href="/(tabs)/parser" />;
  return <Redirect href="/login" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  title: {
    fontFamily: theme.mono,
    color: theme.accent,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 4,
  },
  subtitle: {
    fontFamily: theme.mono,
    color: theme.textMuted,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "lowercase",
  },
  spinnerWrap: { marginTop: 24 },
});
