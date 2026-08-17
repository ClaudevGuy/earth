import type { PopupRequest, PopupResponse } from "../shared/messages";

export function call<T>(msg: PopupRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error("Wallet background is not responding. Reload Earth Wallet on chrome://extensions."));
    }, 12000);
    chrome.runtime.sendMessage(msg, (res: PopupResponse<T>) => {
      window.clearTimeout(timer);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!res || !res.ok) {
        reject(new Error(!res || res.ok ? "Wallet error" : res.error));
        return;
      }
      resolve(res.data);
    });
  });
}
