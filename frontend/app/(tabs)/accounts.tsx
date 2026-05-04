import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Slider from "@react-native-community/slider";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { theme, statusColor } from "../../src/theme";
import { Accounts, Account } from "../../src/api";
import { StatusBadge } from "../../src/ui";
import { TerminalSpinner } from "../../src/spinner";

const FILTERS = ["all", "pending", "valid", "invalid"] as const;
type Filter = (typeof FILTERS)[number];

export default function AccountsScreen() {
  const [items, setItems] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reveal, setReveal] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [delayMs, setDelayMs] = useState(300);
  const [progress, setProgress] = useState({ done: 0, total: 0, valid: 0, invalid: 0 });

  const load = useCallback(async () => {
    try {
      const res = await Accounts.list(filter === "all" ? undefined : filter);
      setItems(res.accounts);
    } catch (e: any) {
      Alert.alert("Load failed", e?.message || "Unknown error");
    }
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load]),
  );

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [filter, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((i) => i.id)));
  };

  const onDeleteSelected = async () => {
    if (!selected.size) return;
    Alert.alert(
      "Delete?",
      `Remove ${selected.size} account(s)?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await Accounts.bulkDelete(Array.from(selected));
              setSelected(new Set());
              await load();
            } catch (e: any) {
              Alert.alert("Delete failed", e?.message || "Unknown error");
            }
          },
        },
      ],
      { cancelable: true },
    );
  };

  const startCheck = async () => {
    const targets = selected.size > 0 ? Array.from(selected) : items.map((i) => i.id);
    if (!targets.length) {
      Alert.alert("Nothing to check", "Select accounts or load some first.");
      return;
    }
    setChecking(true);
    setProgress({ done: 0, total: targets.length, valid: 0, invalid: 0 });
    try {
      // chunk requests so we can show progress with delay
      const CHUNK = 5;
      let done = 0,
        valid = 0,
        invalid = 0;
      for (let i = 0; i < targets.length; i += CHUNK) {
        const slice = targets.slice(i, i + CHUNK);
        const res = await Accounts.check(slice);
        done += res.checked;
        valid += res.valid;
        invalid += res.invalid;
        setProgress({ done, total: targets.length, valid, invalid });
        if (delayMs > 0 && i + CHUNK < targets.length) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
      await load();
    } catch (e: any) {
      Alert.alert("Check failed", e?.message || "Unknown error");
    } finally {
      setChecking(false);
    }
  };

  const renderItem = ({ item }: { item: Account }) => {
    const isSelected = selected.has(item.id);
    const c = statusColor(item.status);
    return (
      <TouchableOpacity
        testID={`account-item-${item.id}`}
        onLongPress={() => toggleSelect(item.id)}
        onPress={() => toggleSelect(item.id)}
        activeOpacity={0.7}
        style={[
          a.row,
          { borderLeftColor: c.border },
          isSelected && { backgroundColor: theme.accentSoft },
        ]}
      >
        <View style={a.checkbox}>
          {isSelected ? (
            <Ionicons name="checkbox" size={18} color={theme.accent} />
          ) : (
            <Ionicons name="square-outline" size={18} color={theme.textMuted} />
          )}
        </View>
        <View style={a.rowMain}>
          <View style={a.rowTop}>
            <Text
              style={[a.idText, { color: item.type === "email" ? theme.cyan : theme.textPrimary }]}
              numberOfLines={1}
            >
              {item.identifier}
            </Text>
            <StatusBadge status={item.status} testID={`status-${item.id}`} />
          </View>
          <Text style={a.passText} numberOfLines={1}>
            {reveal ? item.password : "•".repeat(Math.min(item.password.length, 12))}
            <Text style={a.typeTag}>  · {item.type.toUpperCase()}</Text>
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={a.safe} edges={["top"]}>
      <View style={a.headerRow}>
        <View>
          <Text style={a.title}>TARGET · DATABASE</Text>
          <Text style={a.subtitle}>// {items.length} record(s) loaded</Text>
        </View>
        <TouchableOpacity testID="reveal-toggle" onPress={() => setReveal((v) => !v)}>
          <Ionicons name={reveal ? "eye-off-outline" : "eye-outline"} size={22} color={theme.accent} />
        </TouchableOpacity>
      </View>

      {/* Filters */}
      <View style={a.filters}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            testID={`filter-${f}`}
            onPress={() => setFilter(f)}
            activeOpacity={0.7}
            style={[a.chip, filter === f && a.chipActive]}
          >
            <Text style={[a.chipText, filter === f && a.chipTextActive]}>{f.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Bulk actions */}
      <View style={a.bulkRow}>
        <TouchableOpacity
          testID="select-all-btn"
          onPress={toggleSelectAll}
          activeOpacity={0.7}
          style={a.bulkBtn}
        >
          <Text style={a.bulkBtnText}>
            {selected.size === items.length && items.length > 0 ? "UNSELECT ALL" : "SELECT ALL"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="open-check-btn"
          onPress={() => setCheckOpen(true)}
          activeOpacity={0.7}
          style={[a.bulkBtn, a.checkBtn]}
        >
          <Ionicons name="play" size={12} color={theme.accent} />
          <Text style={[a.bulkBtnText, { color: theme.accent }]}>
            CHECK {selected.size > 0 ? `(${selected.size})` : "ALL"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="bulk-delete-btn"
          onPress={onDeleteSelected}
          disabled={selected.size === 0}
          activeOpacity={0.7}
          style={[a.bulkBtn, a.deleteBtn, selected.size === 0 && { opacity: 0.4 }]}
        >
          <Ionicons name="trash-outline" size={12} color={theme.err} />
          <Text style={[a.bulkBtnText, { color: theme.err }]}>DEL {selected.size}</Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {loading ? (
        <View style={a.empty}>
          <TerminalSpinner label="LOADING DATA" />
        </View>
      ) : items.length === 0 ? (
        <View style={a.empty}>
          <Ionicons name="folder-open-outline" size={36} color={theme.textMuted} />
          <Text style={a.emptyText}>// no records — head to Parser to add some</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.accent}
              colors={[theme.accent]}
            />
          }
          testID="accounts-list"
        />
      )}

      {/* Mock Check Modal */}
      <Modal
        visible={checkOpen}
        transparent
        animationType="slide"
        onRequestClose={() => !checking && setCheckOpen(false)}
      >
        <View style={a.modalRoot}>
          <TouchableOpacity
            style={a.modalBackdrop}
            activeOpacity={1}
            onPress={() => !checking && setCheckOpen(false)}
          />
          <View style={a.sheet}>
            <View style={a.sheetHandle} />
            <Text style={a.sheetTitle}>$ mock-check</Text>
            <Text style={a.sheetCaption}>
              // simulated validation — runs locally, no real FB calls
            </Text>

            <View style={a.field}>
              <View style={a.fieldHead}>
                <Text style={a.fieldLabel}>DELAY BETWEEN BATCHES</Text>
                <Text style={a.fieldVal}>{delayMs} ms</Text>
              </View>
              <Slider
                testID="mock-check-slider"
                minimumValue={0}
                maximumValue={2000}
                step={50}
                value={delayMs}
                onValueChange={setDelayMs}
                minimumTrackTintColor={theme.accent}
                maximumTrackTintColor={theme.borderNeutral}
                thumbTintColor={theme.accent}
                disabled={checking}
              />
            </View>

            {checking || progress.done > 0 ? (
              <View style={a.progressBox}>
                <Text style={a.progressLine}>
                  [progress] {progress.done} / {progress.total}
                </Text>
                <View style={a.progressTrack}>
                  <View
                    style={[
                      a.progressFill,
                      {
                        width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
                      },
                    ]}
                  />
                </View>
                <View style={a.progressStats}>
                  <Text style={[a.progressLine, { color: theme.ok }]}>
                    valid: {progress.valid}
                  </Text>
                  <Text style={[a.progressLine, { color: theme.err }]}>
                    invalid: {progress.invalid}
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={a.sheetActions}>
              <TouchableOpacity
                testID="modal-close-btn"
                onPress={() => !checking && setCheckOpen(false)}
                disabled={checking}
                activeOpacity={0.7}
                style={a.sheetGhost}
              >
                <Text style={a.sheetGhostText}>{checking ? "RUNNING..." : "CLOSE"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="modal-start-check-btn"
                onPress={startCheck}
                disabled={checking}
                activeOpacity={0.7}
                style={[a.sheetPrimary, checking && { opacity: 0.5 }]}
              >
                {checking ? (
                  <TerminalSpinner label="CHECKING" />
                ) : (
                  <Text style={a.sheetPrimaryText}>▶ START CHECK</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const a = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    paddingBottom: 8,
  },
  title: {
    fontFamily: theme.mono,
    color: theme.accent,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 3,
  },
  subtitle: { fontFamily: theme.mono, color: theme.textMuted, fontSize: 11, letterSpacing: 1 },
  filters: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: theme.borderNeutral,
  },
  chipActive: {
    backgroundColor: theme.accentSoft,
    borderColor: theme.accent,
  },
  chipText: { fontFamily: theme.mono, color: theme.textMuted, fontSize: 10, letterSpacing: 1.2 },
  chipTextActive: { color: theme.accent },
  bulkRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 6,
  },
  bulkBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.borderNeutral,
    borderRadius: 2,
    gap: 4,
  },
  checkBtn: { borderColor: theme.accent, backgroundColor: theme.accentSoft },
  deleteBtn: { borderColor: theme.err, backgroundColor: theme.errSoft },
  bulkBtnText: {
    fontFamily: theme.mono,
    color: theme.textSecondary,
    fontSize: 10,
    letterSpacing: 1.2,
    fontWeight: "700",
  },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyText: { fontFamily: theme.mono, color: theme.textMuted, fontSize: 12 },
  row: {
    flexDirection: "row",
    backgroundColor: theme.panel,
    borderLeftWidth: 3,
    borderRadius: 2,
    padding: 12,
    alignItems: "center",
    gap: 12,
  },
  checkbox: { width: 22, alignItems: "center" },
  rowMain: { flex: 1 },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  idText: { fontFamily: theme.mono, fontSize: 13, fontWeight: "600", flex: 1 },
  passText: { fontFamily: theme.mono, color: theme.textMuted, fontSize: 11, marginTop: 4 },
  typeTag: { color: theme.textMuted, fontSize: 10, letterSpacing: 1 },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.7)" },
  sheet: {
    backgroundColor: theme.bgElev,
    borderTopWidth: 1,
    borderColor: theme.accent,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    padding: 20,
    paddingBottom: 32,
    gap: 14,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 3,
    backgroundColor: theme.textMuted,
    borderRadius: 2,
    marginBottom: 6,
  },
  sheetTitle: { fontFamily: theme.mono, color: theme.accent, fontSize: 16, letterSpacing: 1 },
  sheetCaption: { fontFamily: theme.mono, color: theme.textMuted, fontSize: 11 },
  field: { gap: 8 },
  fieldHead: { flexDirection: "row", justifyContent: "space-between" },
  fieldLabel: { fontFamily: theme.mono, color: theme.textMuted, fontSize: 10, letterSpacing: 1.2 },
  fieldVal: { fontFamily: theme.mono, color: theme.accent, fontSize: 12 },
  progressBox: {
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: theme.borderDim,
    padding: 10,
    gap: 8,
  },
  progressTrack: { height: 6, backgroundColor: theme.borderNeutral, borderRadius: 1 },
  progressFill: { height: 6, backgroundColor: theme.accent },
  progressLine: { fontFamily: theme.mono, color: theme.textPrimary, fontSize: 11 },
  progressStats: { flexDirection: "row", justifyContent: "space-between" },
  sheetActions: { flexDirection: "row", gap: 10 },
  sheetGhost: {
    flex: 1,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: theme.borderNeutral,
    borderStyle: "dashed",
    alignItems: "center",
  },
  sheetGhostText: { fontFamily: theme.mono, color: theme.textSecondary, letterSpacing: 1.5, fontSize: 12 },
  sheetPrimary: {
    flex: 2,
    paddingVertical: 12,
    backgroundColor: theme.accentSoft,
    borderWidth: 1,
    borderColor: theme.accent,
    alignItems: "center",
  },
  sheetPrimaryText: {
    fontFamily: theme.mono,
    color: theme.accent,
    fontWeight: "700",
    letterSpacing: 2,
  },
});
