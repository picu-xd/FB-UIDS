import { Tabs, Redirect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/auth-context";
import { theme } from "../../src/theme";
import { View, Text, StyleSheet } from "react-native";

type IconProps = { color: string; size: number };
const ParserIcon = ({ color, size }: IconProps) => (
  <Ionicons name="construct-outline" size={size} color={color} />
);
const AccountsIcon = ({ color, size }: IconProps) => (
  <Ionicons name="grid-outline" size={size} color={color} />
);
const StatsIcon = ({ color, size }: IconProps) => (
  <Ionicons name="pulse-outline" size={size} color={color} />
);
const SettingsIcon = ({ color, size }: IconProps) => (
  <Ionicons name="settings-outline" size={size} color={color} />
);

export default function TabsLayout() {
  const { status } = useAuth();
  if (status === "checking") {
    return (
      <View style={s.center}>
        <Text style={s.loading}>// loading...</Text>
      </View>
    );
  }
  if (status === "guest") return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.bg,
          borderTopColor: theme.borderDim,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarLabelStyle: {
          fontFamily: theme.mono,
          fontSize: 10,
          letterSpacing: 1.2,
          textTransform: "uppercase",
        },
      }}
    >
      <Tabs.Screen
        name="parser"
        options={{
          title: "Parser",
          tabBarIcon: ParserIcon,
          tabBarTestID: "tab-parser",
        }}
      />
      <Tabs.Screen
        name="accounts"
        options={{
          title: "Accounts",
          tabBarIcon: AccountsIcon,
          tabBarTestID: "tab-accounts",
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: "Stats",
          tabBarIcon: StatsIcon,
          tabBarTestID: "tab-stats",
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "System",
          tabBarIcon: SettingsIcon,
          tabBarTestID: "tab-settings",
        }}
      />
    </Tabs>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg },
  loading: { fontFamily: theme.mono, color: theme.textMuted },
});
