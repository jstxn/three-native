// Full-screen portrait sizes at the standard iOS display scale; see docs/device-presets.md.
export const devices = [
  {
    id: "iphone-18-pro",
    name: "iPhone 18 Pro",
    width: 402,
    height: 874,
    scale: 3,
    pixelWidth: 1206,
    pixelHeight: 2622,
    source: "https://www.apple.com/iphone-18-pro/specs/",
  },
  {
    id: "iphone-18-pro-max",
    name: "iPhone 18 Pro Max",
    width: 440,
    height: 956,
    scale: 3,
    pixelWidth: 1320,
    pixelHeight: 2868,
    source: "https://www.apple.com/iphone-18-pro/specs/",
  },
  {
    id: "iphone-air",
    name: "iPhone Air",
    width: 420,
    height: 912,
    scale: 3,
    pixelWidth: 1260,
    pixelHeight: 2736,
    source: "https://www.apple.com/iphone-air/specs/",
  },
  {
    id: "iphone-17",
    name: "iPhone 17",
    width: 402,
    height: 874,
    scale: 3,
    pixelWidth: 1206,
    pixelHeight: 2622,
    source: "https://www.apple.com/iphone-17/specs/",
  },
  {
    id: "iphone-17-pro",
    name: "iPhone 17 Pro",
    width: 402,
    height: 874,
    scale: 3,
    pixelWidth: 1206,
    pixelHeight: 2622,
    source: "https://support.apple.com/en-us/125090",
  },
  {
    id: "iphone-17-pro-max",
    name: "iPhone 17 Pro Max",
    width: 440,
    height: 956,
    scale: 3,
    pixelWidth: 1320,
    pixelHeight: 2868,
    source: "https://support.apple.com/en-us/125091",
  },
  {
    id: "iphone-16",
    name: "iPhone 16",
    width: 393,
    height: 852,
    scale: 3,
    pixelWidth: 1179,
    pixelHeight: 2556,
    source: "https://www.apple.com/iphone-16/specs/",
  },
  {
    id: "iphone-16-plus",
    name: "iPhone 16 Plus",
    width: 430,
    height: 932,
    scale: 3,
    pixelWidth: 1290,
    pixelHeight: 2796,
    source: "https://support.apple.com/en-us/121030",
  },
  {
    id: "iphone-16-pro",
    name: "iPhone 16 Pro",
    width: 402,
    height: 874,
    scale: 3,
    pixelWidth: 1206,
    pixelHeight: 2622,
    source: "https://support.apple.com/en-us/121031",
  },
  {
    id: "iphone-16-pro-max",
    name: "iPhone 16 Pro Max",
    width: 440,
    height: 956,
    scale: 3,
    pixelWidth: 1320,
    pixelHeight: 2868,
    source: "https://support.apple.com/en-us/121032",
  },
  {
    id: "iphone-se-3",
    name: "iPhone SE (3rd generation)",
    width: 375,
    height: 667,
    scale: 2,
    pixelWidth: 750,
    pixelHeight: 1334,
    source: "https://support.apple.com/en-us/111866",
  },
  {
    id: "ipad-pro-11-m5",
    name: "iPad Pro 11-inch (M5)",
    width: 834,
    height: 1210,
    scale: 2,
    pixelWidth: 1668,
    pixelHeight: 2420,
    source: "https://www.apple.com/ipad-pro/specs/",
  },
  {
    id: "ipad-pro-13-m5",
    name: "iPad Pro 13-inch (M5)",
    width: 1032,
    height: 1376,
    scale: 2,
    pixelWidth: 2064,
    pixelHeight: 2752,
    source: "https://www.apple.com/ipad-pro/specs/",
  },
];
export const defaultDevice = "iphone-18-pro";
export function getDevice(id = defaultDevice) {
  const device = devices.find((item) => item.id === id);
  if (!device)
    throw new Error(
      `Unknown preview device: ${id}. Choose one of: ${devices.map((item) => item.id).join(", ")}`,
    );
  return device;
}
export function deviceViewport(id = defaultDevice, orientation = "portrait") {
  if (!["portrait", "landscape"].includes(orientation))
    throw new Error("preview.orientation must be portrait or landscape.");
  const device = getDevice(id);
  return orientation === "portrait"
    ? { width: device.width, height: device.height }
    : { width: device.height, height: device.width };
}
export function fitViewport(width, height, availableWidth, availableHeight) {
  if (
    [width, height, availableWidth, availableHeight].some(
      (value) => !Number.isFinite(value) || value <= 0,
    )
  )
    return 0;
  return Math.min(1, availableWidth / width, availableHeight / height);
}
