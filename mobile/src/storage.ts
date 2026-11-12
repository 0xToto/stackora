import { Platform } from "react-native";
import * as NativeStore from "expo-secure-store";
// Web is an optional local test harness; native sessions use the iOS Keychain.
export const storage = {
  async getItemAsync(key: string) {
    return Platform.OS === "web"
      ? (globalThis.sessionStorage?.getItem(key) ?? null)
      : NativeStore.getItemAsync(key);
  },
  async setItemAsync(key: string, value: string) {
    if (Platform.OS === "web") globalThis.sessionStorage?.setItem(key, value);
    else await NativeStore.setItemAsync(key, value);
  },
  async deleteItemAsync(key: string) {
    if (Platform.OS === "web") globalThis.sessionStorage?.removeItem(key);
    else await NativeStore.deleteItemAsync(key);
  },
};
