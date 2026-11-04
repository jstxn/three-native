function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      if (typeof listener !== "function")
        throw new Error(`Unsupported ${type} listener; use a function.`);
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatch(event) {
      event.currentTarget = this;
      for (const listener of [...(listeners.get(event.type) ?? [])])
        listener.call(this, event);
    },
  };
}

export async function createEntryScene(context, start) {
  if (!context.renderer)
    throw new Error(
      "The browser-entry adapter needs the host WebGPU renderer.",
    );
  let width = context.width,
    height = context.height,
    time = 0,
    nextFrame = 0,
    loop;
  let scene,
    camera,
    result,
    pressed = false;
  const frames = new Map();
  const document = eventTarget(),
    window = eventTarget();
  const canvas = Object.assign(eventTarget(), {
    style: {},
    ownerDocument: document,
    getRootNode: () => document,
    getBoundingClientRect: () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      width,
      height,
    }),
    setPointerCapture() {},
    releasePointerCapture() {},
  });
  for (const [object, key, value] of [
    [window, "innerWidth", () => width],
    [window, "innerHeight", () => height],
    [window, "devicePixelRatio", () => context.renderer.getPixelRatio()],
    [canvas, "clientWidth", () => width],
    [canvas, "clientHeight", () => height],
    [canvas, "width", () => width * context.renderer.getPixelRatio()],
    [canvas, "height", () => height * context.renderer.getPixelRatio()],
  ])
    Object.defineProperty(object, key, { get: value });
  const capture = (nextScene, nextCamera) => {
    if (!nextScene?.isScene || !nextCamera?.isCamera)
      throw new Error(
        "renderer.render() must receive a THREE.Scene and THREE.Camera.",
      );
    scene = nextScene;
    camera = nextCamera;
    if (result) {
      result.scene = scene;
      result.camera = camera;
    }
  };
  const overrides = {
    domElement: canvas,
    render: capture,
    setAnimationLoop: (callback) => {
      loop = callback;
    },
    setSize: () => context.renderer.setSize(width, height, false),
    setPixelRatio: (ratio) => {
      context.renderer.setPixelRatio(Math.min(Math.max(ratio, 0.5), 2));
      context.renderer.setSize(width, height, false);
    },
    init: async () => {},
    dispose: () => {
      loop = null;
      frames.clear();
    },
  };
  const renderer = new Proxy(overrides, {
    get(target, key) {
      if (key in target) return target[key];
      const value = context.renderer[key];
      return typeof value === "function" ? value.bind(context.renderer) : value;
    },
    set(target, key, value) {
      if (key in target)
        throw new Error(
          `Cannot replace renderer.${String(key)} in an automatically adapted entry.`,
        );
      context.renderer[key] = value;
      return true;
    },
  });
  const bridge = {
    renderer,
    canvas,
    document,
    window,
    createRenderer: () => renderer,
    mount: () => canvas,
    now: () => time,
    requestAnimationFrame(callback) {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
  };
  const step = (elapsed) => {
    time = elapsed * 1000;
    const pending = [...frames.entries()];
    for (const [id, callback] of pending) {
      if (!frames.delete(id)) continue;
      callback(time);
    }
    loop?.(time);
  };
  await start(bridge);
  step(0);
  if (!scene || !camera)
    throw new Error(
      "The entry did not render a scene during startup. Render once or schedule your loop immediately; delayed startup needs createScene(context).",
    );
  result = {
    scene,
    camera,
    update(_delta, elapsed) {
      step(elapsed);
    },
    resize(nextWidth, nextHeight) {
      width = nextWidth;
      height = nextHeight;
      window.dispatch({ type: "resize", target: window });
    },
    onPointerEvent({ type, x, y }) {
      if (type === "pointerdown") pressed = true;
      if (type === "pointerup" || type === "pointercancel") pressed = false;
      const event = {
        type,
        target: canvas,
        pointerId: 1,
        pointerType: "touch",
        isPrimary: true,
        clientX: x * width,
        clientY: y * height,
        pageX: x * width,
        pageY: y * height,
        offsetX: x * width,
        offsetY: y * height,
        button: 0,
        buttons: pressed ? 1 : 0,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault() {},
        stopPropagation() {},
      };
      canvas.dispatch(event);
      document.dispatch(event);
      window.dispatch(event);
      if (type === "pointerup") {
        event.type = "click";
        canvas.dispatch(event);
        document.dispatch(event);
        window.dispatch(event);
      }
    },
  };
  return result;
}
