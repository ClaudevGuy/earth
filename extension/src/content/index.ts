import { CHANNEL } from "../shared/constants";

const injected = document.createElement("script");
injected.src = chrome.runtime.getURL("inpage.js");
injected.type = "text/javascript";
injected.addEventListener("load", () => injected.remove());
(document.head ?? document.documentElement).prepend(injected);

type InpageEnvelope = {
  channel: typeof CHANNEL;
  from: "inpage";
  id: string;
  method: string;
  params?: Record<string, string | string[] | boolean | undefined>;
};

function connectPort() {
  return chrome.runtime.connect({ name: "earth" });
}

let port = connectPort();

function attach(next: chrome.runtime.Port) {
  next.onDisconnect.addListener(() => {
    port = connectPort();
    attach(port);
  });
  next.onMessage.addListener((msg: { id: string; ok: boolean; result?: unknown; error?: string }) => {
    window.postMessage({ channel: CHANNEL, from: "content", ...msg }, "*");
  });
}

attach(port);

window.addEventListener("message", (event: MessageEvent<InpageEnvelope>) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.channel !== CHANNEL || data.from !== "inpage") return;
  try {
    port.postMessage({ id: data.id, method: data.method, params: data.params });
  } catch {
    port = connectPort();
    attach(port);
    port.postMessage({ id: data.id, method: data.method, params: data.params });
  }
});
