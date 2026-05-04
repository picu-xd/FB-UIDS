import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Alert,
  ToastAndroid,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Slider from "@react-native-community/slider";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { theme } from "../../src/theme";
import { Accounts, Account } from "../../src/api";
import { Avatar } from "../../src/avatar";
import { TerminalSpinner } from "../../src/spinner";
import { labelFor, statusColors } from "../../src/status";

const FILTERS = ["all", "valid", "invalid", "pending"] as const;
type Filter = (typeof FILTERS)[number];

function showToast(msg: string) {
  if (Platform.OS === "android") {
    ToastAndroid.show(msg, ToastAndroid.SHORT);
  }
  // For iOS / web we silently no-op to avoid blocking; copy still works.
}

export default function AccountsScreen() {
  const [items, setItems] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reveal, setReveal] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [delayMs, setDelayMs] = useState(300);
  const [progress, setProgress] = useState({ done: 0, total: 0, valid: 0, invalid: 0 });

  // Counts for filter chips — based on the FULL set, computed on every load
  const [counts, setCounts] = useState({ all: 0, valid: 0, invalid: 0, pending: 0 });

  const load = useCallback(async () => {
    try {
      const all = await Accounts.list();
      const c = { all: all.accounts.length, valid: 0, invalid: 0, pending: 0 };
      all.accounts.forEach((a) => {
        if (a.status === "valid") c.valid += 1;
        else if (a.status === "invalid") c.invalid += 1;
        else c.pending += 1;
      });
      setCounts(c);
      if (filter === "all") setItems(all.accounts);
      else setItems(all.accounts.filter((a) => a.status === filter));
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

  const allSelected = items.length > 0 && selected.size === items.length;
  const toggleSelectAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(items.map((i) => i.id)));
  };

  const copyToClipboard = async (text: string, label: string) => {
    await Clipboard.setStringAsync(text);
    showToast(`${label} copied`);
  };

  const onDeleteSelected = () => {
    if (!selected.size) {
      Alert.alert("Nothing selected", "Select cards (long-press) to delete.");
      return;
    }
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

  const onDeleteOne = (id: string) => {
    Alert.alert(
      "Delete account?",
      "This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await Accounts.delete(id);
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

  const onEnrichAll = async () => {
    setEnriching(true);
    try {
      const ids = items.filter((i) => i.type === "uid").map((i) => i.id);
      if (!ids.length) {
        Alert.alert("No UID accounts", "Profile fetch only works for numeric UIDs.");
        return;
      }
      const res = await Accounts.enrich(ids);
      Alert.alert(
        "Profile fetch complete",
        `Fetched ${res.enriched} of ${res.total} profiles from public data.`,
      );
      await load();
    } catch (e: any) {
      Alert.alert("Fetch failed", e?.message || "Unknown error");
    } finally {
      setEnriching(false);
    }
  };

  const startCheck = async () => {
    const targets =
      selected.size > 0
        ? Array.from(selected)
        : items.map((i) => i.id);
    if (!targets.length) {
      Alert.alert("Nothing to check", "Add or select accounts first.");
      return;
    }
    setChecking(true);
    setProgress({ done: 0, total: targets.length, valid: 0, invalid: 0 });
    try {
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
    const c = statusColors(item.status);
    const displayName =
      item.profile_name ||
      (item.type === "email"
        ? item.identifier.split("@")[0]
        : `UID ${item.identifier.slice(-6)}`);
    const subText =
      item.type === "uid"
        ? `@${item.profile_username || item.identifier}`
        : item.identifier;

    return (
      <TouchableOpacity
        testID={`account-item-${item.id}`}
        onLongPress={() => toggleSelect(item.id)}
        onPress={() => toggleSelect(item.id)}
        activeOpacity={0.85}
        style={[
          ac.row,
          { borderLeftColor: c.border },
          isSelected && { backgroundColor: theme.accentSoft, borderColor: theme.accent },
        ]}
      >
        {/* Top: avatar + name/username + status badge + delete */}
        <View style={ac.headRow}>
          <Avatar account={item} size={56} testID={`avatar-${item.id}`} />
          <View style={ac.nameWrap}>
            <Text style={ac.nameText} numberOfLines={1} testID={`name-${item.id}`}>
              {displayName}
            </Text>
            <Text style={ac.subText} numberOfLines={1}>
              {subText}
            </Text>
          </View>
          <View
            testID={`status-${item.id}`}
            style={[
              ac.badge,
              { backgroundColor: c.bg, borderColor: c.border },
            ]}
          >
            <Text style={[ac.badgeText, { color: c.text }]}>{labelFor(item.status)}</Text>
          </View>
          <TouchableOpacity
            testID={`delete-${item.id}`}
            onPress={() => onDeleteOne(item.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={ac.delBtn}
          >
            <Ionicons name="trash-outline" size={16} color={theme.err} />
          </TouchableOpacity>
        </View>

        {/* UID + copy */}
        <View style={ac.dataRow}>
          <Text style={ac.dataLabel}>{item.type === "email" ? "EMAIL" : "UID"}</Text>
          <Text style={[ac.dataVal, { color: theme.accent }]} numberOfLines={1}>
            {item.identifier}
          </Text>
          <TouchableOpacity
            testID={`copy-uid-${item.id}`}
            onPress={() => copyToClipboard(item.identifier, item.type === "email" ? "Email" : "UID")}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={[ac.copyBtn, { borderColor: theme.accent }]}
          >
            <Ionicons name="copy-outline" size={14} color={theme.accent} />
          </TouchableOpacity>
        </View>

        {/* Password + copy */}
        <View style={ac.dataRow}>
          <Text style={ac.dataLabel}>PW</Text>
          <Text style={[ac.dataVal, { color: theme.warn }]} numberOfLines={1}>
            {reveal ? item.password : "•".repeat(Math.min(item.password.length, 14))}
          </Text>
          <TouchableOpacity
            testID={`copy-pw-${item.id}`}
            onPress={() => copyToClipboard(item.password, "Password")}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={[ac.copyBtn, { borderColor: theme.warn }]}
          >
            <Ionicons name="copy-outline" size={14} color={theme.warn} />
          </TouchableOpacity>
        </View>

        {/* Footer: combo (id:pw) + follower count if available */}
        <View style={ac.footerRow}>
          <TouchableOpacity
            testID={`copy-combo-${item.id}`}
            onPress={() => copyToClipboard(`${item.identifier}:${item.password}`, "Combo")}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            style={ac.comboBtn}
          >
            <Ionicons name="document-outline" size={11} color={theme.textSecondary} />
            <Text style={ac.comboText}>COPY ID:PW</Text>
          </TouchableOpacity>
          {!!item.follower_count && (
            <Text style={ac.followers}>
              {formatCount(item.follower_count)} followers
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={ac.safe} edges={["top"]}>
      {/* Sticky Header */}
      <View style={ac.stickyHeader}>
        <View style={ac.titleRow}>
          <View>
            <Text style={ac.title}>TARGET · DATABASE</Text>
            <Text style={ac.subtitle}>// {counts.all} record(s) · tap card to select</Text>
          </View>
          <TouchableOpacity testID="reveal-toggle" onPress={() => setReveal((v) => !v)}>
            <Ionicons name={reveal ? "eye-outline" : "eye-off-outline"} size={22} color={theme.accent} />
          </TouchableOpacity>
        </View>

        {/* Sticky action row */}
        <View style={ac.stickyActions}>
          <ActionButton
            testID="action-fetch"
            label={enriching ? "FETCHING..." : "FETCH INFO"}
            icon="cloud-download-outline"
            color={theme.cyan}
            onPress={onEnrichAll}
            disabled={enriching}
          />
          <ActionButton
            testID="action-check"
            label={selected.size > 0 ? `CHECK ${selected.size}` : "CHECK ALL"}
            icon="play"
            color={theme.accent}
            onPress={() => setCheckOpen(true)}
          />
          <ActionButton
            testID="action-select-all"
            label={allSelected ? "UNSEL." : "SEL. ALL"}
            icon="checkbox-outline"
            color={theme.textSecondary}
            onPress={toggleSelectAll}
          />
          <ActionButton
            testID="action-delete"
            label={`DEL ${selected.size}`}
            icon="trash-outline"
            color={theme.err}
            onPress={onDeleteSelected}
            disabled={selected.size === 0}
          />
        </View>

        {/* Filter chips with counts */}
        <View style={ac.filters}>
          <FilterChip
            testID="filter-all"
            active={filter === "all"}
            label={`ALL ${counts.all}`}
            onPress={() => setFilter("all")}
          />
          <FilterChip
            testID="filter-valid"
            active={filter === "valid"}
            label={`LIVE ${counts.valid}`}
            color={theme.ok}
            onPress={() => setFilter("valid")}
          />
          <FilterChip
            testID="filter-invalid"
            active={filter === "invalid"}
            label={`DIE ${counts.invalid}`}
            color={theme.err}
            onPress={() => setFilter("invalid")}
          />
          <FilterChip
            testID="filter-pending"
            active={filter === "pending"}
            label={`PENDING ${counts.pending}`}
            color={theme.warn}
            onPress={() => setFilter("pending")}
          />
        </View>
      </View>

      {/* List */}
      {loading ? (
        <View style={ac.empty}>
          <TerminalSpinner label="LOADING DATA" />
        </View>
      ) : items.length === 0 ? (
        <View style={ac.empty}>
          <Ionicons name="folder-open-outline" size={36} color={theme.textMuted} />
          <Text style={ac.emptyText}>// no records — head to Parser to add some</Text>
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
        <View style={ac.modalRoot}>
          <TouchableOpacity
            style={ac.modalBackdrop}
            activeOpacity={1}
            onPress={() => !checking && setCheckOpen(false)}
          />
          <View style={ac.sheet}>
            <View style={ac.sheetHandle} />
            <Text style={ac.sheetTitle}>$ mock-check</Text>
            <Text style={ac.sheetCaption}>
              // simulated validation — runs locally, no real FB calls
            </Text>

            <View style={ac.field}>
              <View style={ac.fieldHead}>
                <Text style={ac.fieldLabel}>DELAY BETWEEN BATCHES</Text>
                <Text style={ac.fieldVal}>{delayMs} ms</Text>
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
              <View style={ac.progressBox}>
                <Text style={ac.progressLine}>
                  [progress] {progress.done} / {progress.total}
                </Text>
                <View style={ac.progressTrack}>
                  <View
                    style={[
                      ac.progressFill,
                      { width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` },
                    ]}
                  />
                </View>
                <View style={ac.progressStats}>
                  <Text style={[ac.progressLine, { color: theme.ok }]}>LIVE: {progress.valid}</Text>
                  <Text style={[ac.progressLine, { color: theme.err }]}>DIE: {progress.invalid}</Text>
                </View>
              </View>
            ) : null}

            <View style={ac.sheetActions}>
              <TouchableOpacity
                testID="modal-close-btn"
                onPress={() => !checking && setCheckOpen(false)}
                disabled={checking}
                activeOpacity={0.7}
                style={ac.sheetGhost}
              >
                <Text style={ac.sheetGhostText}>{checking ? "RUNNING..." : "CLOSE"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="modal-start-check-btn"
                onPress={startCheck}
                disabled={checking}
                activeOpacity={0.7}
                style={[ac.sheetPrimary, checking && { opacity: 0.5 }]}
              >
                {checking ? (
                  <TerminalSpinner label="CHECKING" />
                ) : (
                  <Text style={ac.sheetPrimaryText}>▶ START CHECK</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ActionButton({
  testID,
  label,
  icon,
  color,
  onPress,
  disabled,
}: {
  testID: string;
  label: string;
  icon: any;
  color: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={[
        ac.actionBtn,
        { borderColor: color },
        disabled && { opacity: 0.4 },
      ]}
    >
      <Ionicons name={icon} size={12} color={color} />
      <Text style={[ac.actionText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function FilterChip({
  testID,
  active,
  label,
  color = theme.accent,
  onPress,
}: {
  testID: string;
  active: boolean;
  label: string;
  color?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        ac.chip,
        { borderColor: active ? color : theme.borderNeutral },
        active && { backgroundColor: `${color}22` },
      ]}
    >
      <Text style={[ac.chipText, { color: active ? color : theme.textMuted }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const ac = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  stickyHeader: {
    backgroundColor: theme.bg,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderDim,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 10,
  },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: theme.mono, color: theme.accent, fontSize: 18, fontWeight: "700", letterSpacing: 2.5 },
  subtitle: { fontFamily: theme.mono, color: theme.textMuted, fontSize: 10, letterSpacing: 1 },
  stickyActions: { flexDirection: "row", gap: 6 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderRadius: 2,
    gap: 4,
  },
  actionText: { fontFamily: theme.mono, fontSize: 9, letterSpacing: 1, fontWeight: "700" },
  filters: { flexDirection: "row", gap: 6 },
  chip: { flex: 1, paddingHorizontal: 6, paddingVertical: 6, borderRadius: 2, borderWidth: 1, alignItems: "center" },
  chipText: { fontFamily: theme.mono, fontSize: 10, letterSpacing: 1, fontWeight: "700" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyText: { fontFamily: theme.mono, color: theme.textMuted, fontSize: 12 },
  // Card
  row: {
    backgroundColor: theme.panel,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: theme.borderDim,
    borderRadius: 3,
    padding: 10,
    gap: 6,
  },
  headRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  nameWrap: { flex: 1 },
  nameText: { fontFamily: theme.mono, color: theme.textPrimary, fontSize: 13, fontWeight: "700" },
  subText: { fontFamily: theme.mono, color: theme.textMuted, fontSize: 10, marginTop: 2 },
  badge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 2, borderWidth: 1 },
  badgeText: { fontFamily: theme.mono, fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  delBtn: {
    width: 28,
    height: 28,
    borderRadius: 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.errSoft,
  },
  dataRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dataLabel: {
    fontFamily: theme.mono,
    color: theme.textMuted,
    fontSize: 9,
    letterSpacing: 1,
    width: 36,
  },
  dataVal: { flex: 1, fontFamily: theme.mono, fontSize: 12 },
  copyBtn: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 2,
    borderWidth: 1,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 2,
  },
  comboBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: theme.borderNeutral,
    borderStyle: "dashed",
  },
  comboText: { fontFamily: theme.mono, fontSize: 9, color: theme.textSecondary, letterSpacing: 1 },
  followers: { fontFamily: theme.mono, fontSize: 10, color: theme.textMuted },
  // Modal
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
  sheetPrimaryText: { fontFamily: theme.mono, color: theme.accent, fontWeight: "700", letterSpacing: 2 },
});
