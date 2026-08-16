import type { PopupRequest, PopupResponse } from "../shared/messages";

export function call<T>(msg: PopupRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (res: PopupResponse<T>) => {
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
