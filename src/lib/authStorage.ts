/**
 * Where the login session is kept on the phone: the iOS Keychain / Android
 * Keystore. The browser version is authStorage.web.ts.
 */
import * as SecureStore from 'expo-secure-store';

import { createChunkedStorage } from './secureStorage';

export const authStorage = createChunkedStorage({
  getItemAsync: (k) => SecureStore.getItemAsync(k),
  setItemAsync: (k, v) =>
    SecureStore.setItemAsync(k, v, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }),
  deleteItemAsync: (k) => SecureStore.deleteItemAsync(k),
});
