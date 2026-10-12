import { focusManager, onlineManager } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';

import { clearTestQueryClients } from './src/test/renderScreen';

focusManager.setEventListener(() => () => undefined);
onlineManager.setEventListener(() => () => undefined);
focusManager.setFocused(true);
onlineManager.setOnline(true);

jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({
  remove: jest.fn(),
}));

beforeEach(() => {
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
  (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);
});

afterEach(async () => {
  await clearTestQueryClients();
  jest.useRealTimers();
});
