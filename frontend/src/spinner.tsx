import React from "react";
import { Text, StyleSheet } from "react-native";
import { theme } from "./theme";

const FRAMES = ["|", "/", "-", "\\"];

export function TerminalSpinner({ label = "PROCESSING" }: { label?: string }) {
  const [i, setI] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % FRAMES.length), 120);
    return () => clearInterval(t);
  }, []);
  return (
    <Text style={s.text}>
      [{FRAMES[i]}] {label}
    </Text>
  );
}

const s = StyleSheet.create({
  text: {
    fontFamily: theme.mono,
    color: theme.accent,
    fontSize: 13,
    letterSpacing: 1,
  },
});
