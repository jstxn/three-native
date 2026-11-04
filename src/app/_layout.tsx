import "fast-text-encoding";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
export { ErrorBoundary } from "expo-router";
export default function Layout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
