import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme } from "../../src/theme";
import { Accounts } from "../../src/api";
import { TerminalSpinner } from "../../src/spinner";

const SAMPLE = `100012345678:abc123
user@gmail.com|MyPass1
Spam line ignored
100099887766,Strong!Pass2
duplicate100012345678:abc123
hacker@protonmail.com:Sup3rS3cret
100022112233 Hello!Pass`;

type Parsed = { identifier: string; password: string; type: "uid" | "email" };

export default function ParserScreen() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<Parsed[]>([]);
  const [duplicatesRemoved, setDuplicatesRemoved] = useState(0);
  const [busy, setBusy] = useState(false);
  const [savingMsg, setSavingMsg] = useState<string | null>(null);

  const onParse = useCallback(async () => {
    setSavingMsg(null);
    if (!text.trim()) {
      Alert.alert("Empty input", "Paste some lines to parse.");
      return;
    }
    setBusy(true);
    try {
      const linesIn = text.split(/[\r\n]+/).filter((l) => l.trim()).length;
      const res = await Accounts.parse(text);
      setParsed(res.accounts);
      setDuplicatesRemoved(Math.max(0, linesIn - res.count));
    } catch (e: any) {
      Alert.alert("Parse failed", e?.message || "Unknown error");
    } finally {
      setBusy(false);
    }
  }, [text]);

  const onLoadSample = () => {
    setText(SAMPLE);
    setSavingMsg(null);
    setParsed([]);
    setDuplicatesRemoved(0);
  };

  const onClear = () => {
    setText("");
    setParsed([]);
    setDuplicatesRemoved(0);
    setSavingMsg(null);
  };

  const onSave = useCallback(async () => {
    if (!parsed.length) {
      Alert.alert("Nothing to save", "Run the parser first.");
      return;
    }
    setBusy(true);
    setSavingMsg(null);
    try {
      const res = await Accounts.bulk(parsed);
      setSavingMsg(
        `Saved ${res.inserted} new account(s) • ${res.duplicates} duplicate(s) skipped • fetching profiles...`,
      );
      // Auto-jump to Accounts tab so user sees the new records + enrichment results
      setTimeout(() => {
        router.push("/(tabs)/accounts");
      }, 700);
    } catch (e: any) {
      Alert.alert("Save failed", e?.message || "Unknown error");
    } finally {
      setBusy(false);
    }
  }, [parsed, router]);

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.headerRow}>
            <View>
              <Text style={s.title}>SMART · PARSER</Text>
              <Text style={s.subtitle}>// drop messy text — auto extract & dedupe</Text>
            </View>
            <Ionicons name="construct" size={22} color={theme.accent} />
          </View>

          <View style={s.editorWrap}>
            <View style={s.editorBar}>
              <Text style={s.editorBarText}>parser.input</Text>
              <Text style={s.editorBarText}>{text.length} chars</Text>
            </View>
            <TextInput
              testID="parser-textarea"
              value={text}
              onChangeText={setText}
              placeholder={
                "uid:password\nemail|password\n100012345678,SecretPass\n... awaiting input"
              }
              placeholderTextColor="#3F3F46"
              multiline
              textAlignVertical="top"
              style={s.editor}
            />
          </View>

          <View style={s.actionsRow}>
            <TouchableOpacity
              testID="parser-load-sample"
              onPress={onLoadSample}
              activeOpacity={0.7}
              style={s.ghostBtn}
            >
              <Text style={s.ghostBtnText}>LOAD SAMPLE</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="parser-clear"
              onPress={onClear}
              activeOpacity={0.7}
              style={s.ghostBtn}
            >
              <Text style={s.ghostBtnText}>CLEAR</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            testID="parser-extract-btn"
            onPress={onParse}
            disabled={busy}
            activeOpacity={0.7}
            style={[s.primaryBtn, busy && { opacity: 0.5 }]}
          >
            {busy ? (
              <TerminalSpinner label="EXTRACTING" />
            ) : (
              <Text style={s.primaryBtnText}>▶ PARSE & DEDUPE</Text>
            )}
          </TouchableOpacity>

          {/* Summary */}
          <View style={s.summary}>
            <View style={s.statBox}>
              <Text style={s.statLabel}>FOUND</Text>
              <Text testID="parser-found-count" style={s.statValue}>
                {parsed.length}
              </Text>
            </View>
            <View style={s.statBox}>
              <Text style={s.statLabel}>DUPES REMOVED</Text>
              <Text style={s.statValue}>{duplicatesRemoved}</Text>
            </View>
            <View style={s.statBox}>
              <Text style={s.statLabel}>EMAIL / UID</Text>
              <Text style={s.statValue}>
                {parsed.filter((p) => p.type === "email").length} /{" "}
                {parsed.filter((p) => p.type === "uid").length}
              </Text>
            </View>
          </View>

          {/* Preview */}
          {parsed.length > 0 && (
            <View style={s.previewPanel}>
              <View style={s.editorBar}>
                <Text style={s.editorBarText}>// preview ({parsed.length})</Text>
                <Text style={s.editorBarText}>type · id : pass</Text>
              </View>
              {parsed.slice(0, 12).map((p, i) => (
                <View key={`${p.identifier}-${i}`} style={s.previewItem} testID={`preview-${i}`}>
                  <Text style={[s.previewType, { color: p.type === "email" ? theme.cyan : theme.accent }]}>
                    [{p.type.toUpperCase()}]
                  </Text>
                  <Text style={s.previewId} numberOfLines={1}>
                    {p.identifier}
                  </Text>
                  <Text style={s.previewPass} numberOfLines={1}>
                    : {"•".repeat(Math.min(p.password.length, 10))}
                  </Text>
                </View>
              ))}
              {parsed.length > 12 && (
                <Text style={s.previewMore}>… +{parsed.length - 12} more</Text>
              )}
            </View>
          )}

          {!!savingMsg && (
            <Text testID="parser-saved-msg" style={s.savedMsg}>
              ✓ {savingMsg}
            </Text>
          )}
        </ScrollView>

        {/* Sticky save CTA */}
        {parsed.length > 0 && (
          <View style={s.stickyBar}>
            <TouchableOpacity
              testID="parser-save-btn"
              onPress={onSave}
              disabled={busy}
              activeOpacity={0.7}
              style={[s.saveBtn, busy && { opacity: 0.5 }]}
            >
              {busy ? (
                <TerminalSpinner label="SAVING" />
              ) : (
                <Text style={s.saveBtnText}>＋ SAVE {parsed.length} ACCOUNTS</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  scroll: { padding: 16, gap: 14, paddingBottom: 120 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  title: {
    fontFamily: theme.mono,
    color: theme.accent,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 3,
  },
  subtitle: { fontFamily: theme.mono, color: theme.textMuted, fontSize: 11, letterSpacing: 1 },
  editorWrap: {
    borderWidth: 1,
    borderColor: theme.borderMed,
    borderStyle: "dashed",
    borderRadius: 4,
    backgroundColor: "#000",
  },
  editorBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderDim,
    backgroundColor: theme.bgElev,
  },
  editorBarText: { fontFamily: theme.mono, color: theme.textMuted, fontSize: 10, letterSpacing: 1 },
  editor: {
    minHeight: 200,
    padding: 12,
    color: theme.accent,
    fontFamily: theme.mono,
    fontSize: 13,
    lineHeight: 20,
  },
  actionsRow: { flexDirection: "row", gap: 10 },
  ghostBtn: {
    flex: 1,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: theme.borderNeutral,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 2,
  },
  ghostBtnText: {
    fontFamily: theme.mono,
    color: theme.textSecondary,
    fontSize: 11,
    letterSpacing: 1.5,
  },
  primaryBtn: {
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
  summary: { flexDirection: "row", gap: 10 },
  statBox: {
    flex: 1,
    backgroundColor: theme.panel,
    borderWidth: 1,
    borderColor: theme.borderDim,
    padding: 12,
    borderRadius: 2,
  },
  statLabel: {
    fontFamily: theme.mono,
    color: theme.textMuted,
    fontSize: 9,
    letterSpacing: 1.5,
  },
  statValue: {
    fontFamily: theme.mono,
    color: theme.accent,
    fontSize: 22,
    fontWeight: "700",
    marginTop: 6,
  },
  previewPanel: {
    backgroundColor: theme.panel,
    borderWidth: 1,
    borderColor: theme.borderDim,
    borderRadius: 4,
  },
  previewItem: {
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderDim,
    alignItems: "center",
  },
  previewType: { fontFamily: theme.mono, fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  previewId: { flex: 1, fontFamily: theme.mono, color: theme.textPrimary, fontSize: 12 },
  previewPass: { fontFamily: theme.mono, color: theme.textMuted, fontSize: 12 },
  previewMore: {
    fontFamily: theme.mono,
    color: theme.textMuted,
    fontSize: 11,
    padding: 10,
    textAlign: "center",
  },
  savedMsg: {
    fontFamily: theme.mono,
    color: theme.ok,
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 6,
  },
  stickyBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 12,
    backgroundColor: theme.bg,
    borderTopWidth: 1,
    borderTopColor: theme.borderDim,
  },
  saveBtn: {
    backgroundColor: theme.accent,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 2,
  },
  saveBtnText: {
    fontFamily: theme.mono,
    color: "#000",
    fontWeight: "700",
    letterSpacing: 2,
  },
});
