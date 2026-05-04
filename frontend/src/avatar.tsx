import React, { useState } from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import { theme } from "./theme";

// Deterministic color palette for placeholder avatars (12 hues)
const PALETTE = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308",
  "#84cc16", "#22c55e", "#10b981", "#06b6d4",
  "#3b82f6", "#6366f1", "#a855f7", "#ec4899",
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function initialsFor(account: {
  profile_name?: string | null;
  identifier: string;
  type: string;
}): string {
  if (account.profile_name) {
    const parts = account.profile_name.trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase() || "").join("") || "•";
  }
  if (account.type === "email") {
    return (account.identifier[0] || "@").toUpperCase();
  }
  // For UID, show last 2 digits
  return account.identifier.slice(-2);
}

type AvatarProps = {
  account: {
    profile_pic?: string | null;
    profile_name?: string | null;
    identifier: string;
    type: string;
  };
  size?: number;
  testID?: string;
};

export function Avatar({ account, size = 48, testID }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const showImage = !!account.profile_pic && !failed;
  const initials = initialsFor(account);
  const color = PALETTE[hashString(account.identifier) % PALETTE.length];

  return (
    <View
      testID={testID}
      style={[
        s.wrap,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: showImage ? "#000" : color,
        },
      ]}
    >
      {showImage ? (
        <Image
          source={{ uri: account.profile_pic! }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          onError={() => setFailed(true)}
        />
      ) : (
        <Text style={[s.initials, { fontSize: Math.max(10, size * 0.36) }]}>
          {initials}
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.borderDim,
  },
  initials: {
    color: "#fff",
    fontWeight: "700",
    fontFamily: theme.mono,
    letterSpacing: 0.5,
  },
});
