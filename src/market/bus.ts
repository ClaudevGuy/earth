const bus = new EventTarget();

export function emitMarket(): void {
  bus.dispatchEvent(new Event("change"));
}

export function subscribeMarket(fn: () => void): () => void {
  bus.addEventListener("change", fn);
  return () => bus.removeEventListener("change", fn);
}
