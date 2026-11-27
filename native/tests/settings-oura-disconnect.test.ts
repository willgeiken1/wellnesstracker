import { disconnectOura } from '../src/features/settings/pages';
import { showToast } from '../src/features/shell/toast';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() } }));
jest.mock('../src/features/shell/toast', () => ({ showToast: jest.fn(), ShellToast: () => null }));
beforeEach(() => jest.clearAllMocks());

describe('Disconnect Oura in Settings', () => {
  test('says Oura is disconnected only once it is', async () => {
    await disconnectOura({ disconnect: async () => true });
    expect(showToast).toHaveBeenCalledWith('Oura disconnected', expect.anything());
  });
  test('a disconnect that fails says Oura is still connected and offers to try again', async () => {
    const ring = { disconnect: jest.fn(async () => false) };
    await disconnectOura(ring);
    const [text, options] = jest.mocked(showToast).mock.calls[0];
    expect(text).toBe('Oura is still connected. Check your connection and try again.');
    expect(options?.action?.label).toBe('Try again');
    ring.disconnect.mockResolvedValueOnce(true);
    options!.action!.onAction();
    await Promise.resolve(); await Promise.resolve();
    expect(ring.disconnect).toHaveBeenCalledTimes(2);
    expect(showToast).toHaveBeenLastCalledWith('Oura disconnected', expect.anything());
  });
});
