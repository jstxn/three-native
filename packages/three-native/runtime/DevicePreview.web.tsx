import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import type { DevicePreviewProps } from "./DevicePreview";
import {
  defaultDevice,
  devices,
  deviceViewport,
  fitViewport,
  getDevice,
} from "./devices.mjs";

const embedKey = "__three_native_viewport";
const subscribeToLocation = () => () => {};
const getLocation = () => window.location.href;
const getServerLocation = () => "";
const control: CSSProperties = {
  font: "inherit",
  color: "#183548",
  border: "1px solid #c9d9e2",
  borderRadius: 10,
  background: "#fff",
  minHeight: 44,
  padding: "10px 14px",
};

export function DevicePreview({
  children,
  device = defaultDevice,
  orientation = "portrait",
  simulatorUrl,
}: DevicePreviewProps) {
  const href = useSyncExternalStore(
    subscribeToLocation,
    getLocation,
    getServerLocation,
  );
  const url = href ? new URL(href) : null;
  const mode = !url
    ? "loading"
    : url.searchParams.get(embedKey) === "1"
      ? "embed"
      : "preview";
  url?.searchParams.set(embedKey, "1");
  const source = url?.href;
  const [selected, setSelected] = useState(device);
  const [direction, setDirection] = useState(orientation);
  const [actualSize, setActualSize] = useState(false);
  const [space, setSpace] = useState({ width: 0, height: 0 });
  const area = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (mode !== "preview" || !area.current) return;
    const element = area.current;
    const observer = new ResizeObserver(() =>
      setSpace({
        width: element.clientWidth - 44,
        height: element.clientHeight - 44,
      }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [mode]);
  if (mode === "loading") return null;
  if (mode === "embed") return <>{children}</>;
  const profile = getDevice(selected);
  const viewport = deviceViewport(selected, direction);
  const scale = actualSize
    ? 1
    : fitViewport(viewport.width, viewport.height, space.width, space.height);
  return (
    <main
      style={{
        minHeight: "100vh",
        height: "100vh",
        overflowY: "auto",
        boxSizing: "border-box",
        padding: "clamp(16px, 3vw, 32px)",
        background: "#f4f7fa",
        color: "#183548",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <style>{`.three-native-control:focus-visible { outline: 3px solid #297d8d; outline-offset: 3px; }`}</style>
      <header
        style={{
          maxWidth: 1240,
          margin: "0 auto 22px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 18,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              color: "#297d8d",
              fontSize: 11,
              fontWeight: 750,
              letterSpacing: 2,
              marginBottom: 7,
            }}
          >
            THREE NATIVE
          </div>
          <h1 style={{ fontSize: 27, letterSpacing: -0.8, margin: 0 }}>
            Device preview
          </h1>
          <p style={{ color: "#64798b", fontSize: 14, margin: "7px 0 0" }}>
            Your app at an iOS device’s screen size.
          </p>
        </div>
        {simulatorUrl && (
          <a
            className="three-native-control"
            href={simulatorUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              ...control,
              textDecoration: "none",
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              fontSize: 13,
            }}
          >
            Open live iOS Simulator ↗
          </a>
        )}
      </header>
      <section
        aria-label="Device preview controls"
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          background: "#fff",
          border: "1px solid #d5e0e8",
          borderRadius: 16,
          padding: 18,
          display: "flex",
          gap: 16,
          alignItems: "end",
          flexWrap: "wrap",
        }}
      >
        <label
          style={{ display: "grid", gap: 7, fontSize: 12, fontWeight: 600 }}
        >
          Target device
          <select
            className="three-native-control"
            aria-label="Target device"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            style={{ ...control, minWidth: 230, maxWidth: "100%" }}
          >
            <optgroup label="iPhone">
              {devices
                .filter((item) => item.id.startsWith("iphone"))
                .map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
            </optgroup>
            <optgroup label="iPad">
              {devices
                .filter((item) => item.id.startsWith("ipad"))
                .map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
            </optgroup>
          </select>
        </label>
        <button
          className="three-native-control"
          type="button"
          onClick={() =>
            setDirection((value) =>
              value === "portrait" ? "landscape" : "portrait",
            )
          }
          aria-label={`Rotate to ${direction === "portrait" ? "landscape" : "portrait"}`}
          style={{ ...control, cursor: "pointer" }}
        >
          ↻ {direction === "portrait" ? "Portrait" : "Landscape"}
        </button>
        <button
          className="three-native-control"
          type="button"
          aria-pressed={actualSize}
          onClick={() => setActualSize((value) => !value)}
          style={{ ...control, cursor: "pointer" }}
        >
          {actualSize ? "Fit to window" : "View at 100%"}
        </button>
        <div
          aria-live="polite"
          style={{ flex: 1, minWidth: 210, paddingBottom: 2 }}
        >
          <div style={{ fontSize: 14, fontWeight: 650 }}>
            {viewport.width} × {viewport.height} pt{" "}
            <span style={{ color: "#7c919f", fontWeight: 400 }}>
              {" "}
              / {Math.round(scale * 100)}% zoom
            </span>
          </div>
          <div style={{ fontSize: 12, color: "#64798b", marginTop: 5 }}>
            {profile.pixelWidth} × {profile.pixelHeight} display pixels · @
            {profile.scale}x
          </div>
        </div>
        <a
          className="three-native-control"
          href={profile.source}
          target="_blank"
          rel="noreferrer"
          style={{ color: "#297d8d", fontSize: 12, paddingBottom: 5 }}
        >
          Apple specifications ↗
        </a>
      </section>
      <div
        ref={area}
        aria-label="Device preview area"
        style={{
          maxWidth: 1278,
          margin: "18px auto 0",
          height: "max(420px, calc(100vh - 270px))",
          overflow: "auto",
          border: "1px solid #dce6ec",
          borderRadius: 18,
          backgroundColor: "#e9f0f4",
          backgroundImage: "radial-gradient(#c6d6df 0.7px, transparent 0.7px)",
          backgroundSize: "14px 14px",
          boxSizing: "border-box",
          padding: 22,
        }}
      >
        <div
          style={{
            width: viewport.width * scale,
            height: viewport.height * scale,
            margin: "0 auto",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: viewport.width,
              height: viewport.height,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              borderRadius: 18,
              boxShadow: "0 0 0 7px #203749, 0 20px 65px #24455d33",
              overflow: "hidden",
              background: "#fff",
            }}
          >
            <iframe
              title={`${profile.name} app preview`}
              src={source}
              width={viewport.width}
              height={viewport.height}
              style={{
                display: "block",
                border: 0,
                width: viewport.width,
                height: viewport.height,
              }}
            />
          </div>
        </div>
      </div>
      <p
        style={{
          maxWidth: 1240,
          margin: "16px auto 0",
          color: "#64798b",
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        The app receives the full viewport in points. Fit only changes the
        preview’s visual scale. Use the live Simulator to validate native
        behavior and system safe areas.
      </p>
    </main>
  );
}
