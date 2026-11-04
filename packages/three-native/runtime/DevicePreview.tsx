import type { ReactNode } from "react";
export interface DevicePreviewProps {
  children: ReactNode;
  device?: string;
  orientation?: "portrait" | "landscape";
  simulatorUrl?: string;
}
export function DevicePreview({ children }: DevicePreviewProps) {
  return <>{children}</>;
}
