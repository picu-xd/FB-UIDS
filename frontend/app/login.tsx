import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../src/auth-context";
import { theme } from "../src/theme";
import { TerminalSpinner } from "../src/spinner";

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("admin@fbchecker.com");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setBusy(true);
    try {
      await login(email.trim().toLowerCase(), password);
      router.replace("/(tabs)/parser");
    } catch (e: any) {
      setError(e?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.header}>
            <Text style={s.brand}>FB · CHECKER</Text>
            <Text style={s.subtitle}>// secure terminal access</Text>
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>$ login --user</Text>

            <Text style={s.label}>EMAIL</Text>
            <TextInput
              testID="login-email-input"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              placeholder="user@domain.com"
              placeholderTextColor={theme.textMuted}
              style={s.input}
            />

            <Text style={s.label}>PASSWORD</Text>
            <TextInput
              testID="login-password-input"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              placeholder="••••••••"
              placeholderTextColor={theme.textMuted}
              style={s.input}
            />

            {!!error && (
              <Text testID="login-error" style={s.errText}>
                ✗ {error}
              </Text>
            )}

            <TouchableOpacity
              testID="login-submit-btn"
              activeOpacity={0.7}
              onPress={onSubmit}
              disabled={busy}
              style={[s.primaryBtn, busy && { opacity: 0.6 }]}
            >
              {busy ? (
                <TerminalSpinner label="AUTHENTICATING" />
              ) : (
                <Text style={s.primaryBtnText}>▶ LOGIN</Text>
              )}
            </TouchableOpacity>

            <Link href="/register" asChild>
              <TouchableOpacity testID="goto-register-btn" style={s.secondaryBtn} activeOpacity={0.7}>
                <Text style={s.secondaryBtnText}>+ CREATE ACCOUNT</Text>
              </TouchableOpacity>
            </Link>
          </View>

          <View style={s.footer}>
            <Text style={s.footerLine}>┌─ system info ─</Text>
            <Text style={s.footerLine}>│ admin@fbchecker.com / admin123</Text>
            <Text style={s.footerLine}>└─ pre-seeded admin account</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  scroll: {
    flexGrow: 1,
    padding: 20,
    justifyContent: "center",
    gap: 24,
  },
  header: { alignItems: "center", gap: 6 },
  brand: {
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
    letterSpacing: 1.5,
  },
  card: {
    backgroundColor: theme.panel,
    borderWidth: 1,
    borderColor: theme.borderDim,
    borderRadius: 4,
    padding: 18,
    gap: 10,
  },
  cardTitle: {
    fontFamily: theme.mono,
    color: theme.accent,
    fontSize: 13,
    marginBottom: 8,
    letterSpacing: 1,
  },
  label: {
    fontFamily: theme.mono,
    color: theme.textMuted,
    fontSize: 10,
    letterSpacing: 1.5,
    marginTop: 6,
  },
  input: {
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: theme.borderNeutral,
    borderRadius: 2,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: theme.accent,
    fontFamily: theme.mono,
    fontSize: 14,
  },
  errText: {
    fontFamily: theme.mono,
    color: theme.err,
    fontSize: 12,
    marginTop: 4,
  },
  primaryBtn: {
    marginTop: 14,
    backgroundColor: theme.accentSoft,
    borderWidth: 1,
    borderColor: theme.accent,
    borderRadius: 2,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: {
    fontFamily: theme.mono,
    color: theme.accent,
    fontWeight: "700",
    letterSpacing: 2,
  },
  secondaryBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: theme.borderNeutral,
    borderStyle: "dashed",
    borderRadius: 2,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryBtnText: {
    fontFamily: theme.mono,
    color: theme.textSecondary,
    letterSpacing: 1.5,
    fontSize: 12,
  },
  footer: { alignItems: "flex-start", gap: 2, paddingHorizontal: 4 },
  footerLine: {
    fontFamily: theme.mono,
    color: theme.textMuted,
    fontSize: 11,
  },
});
