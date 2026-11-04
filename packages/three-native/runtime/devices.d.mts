export interface IOSDevice {
  id: string;
  name: string;
  width: number;
  height: number;
  scale: number;
  pixelWidth: number;
  pixelHeight: number;
  source: string;
}
export const devices: IOSDevice[];
export const defaultDevice: string;
export function getDevice(id?: string): IOSDevice;
export function deviceViewport(
  id?: string,
  orientation?: "portrait" | "landscape",
): { width: number; height: number };
export function fitViewport(
  width: number,
  height: number,
  availableWidth: number,
  availableHeight: number,
): number;
