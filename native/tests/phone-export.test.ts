import { exportPhoneBackup } from '../src/phone-only/export';
import { createPhoneBackup } from '../src/phone-only/backup';
import { memoryRepository } from './workout-repository';
import * as Sharing from 'expo-sharing';
const mockFiles: {uri: string; value?: string}[] = [];
const mockDeleted: string[] = [];
jest.mock('../src/phone-only/backup', () => ({ createPhoneBackup: jest.fn(() => '{"synthetic":true}') }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'synthetic-id' }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => {}) }));
jest.mock('expo-file-system', () => ({ Paths: { cache: 'file:///cache' }, Directory: class {
  uri: string;
  constructor(parent: string, name: string) { this.uri = `${parent}/${name}`; }
  create() {}
  delete() { mockDeleted.push(this.uri); }
}, File: class {
  uri: string;
  constructor(directory: {uri:string}, name: string) { this.uri = `${directory.uri}/${name}`; }
  write(value: string) { mockFiles.push({ uri: this.uri, value }); }
} }));
beforeEach(() => { jest.clearAllMocks(); mockFiles.length = 0; mockDeleted.length = 0; });
test.each([false, true])('JSON share exports locally and cleans temporary data even on share failure=%s', async fail => {
  if (fail) jest.mocked(Sharing.shareAsync).mockRejectedValueOnce(new Error('synthetic share failure'));
  const repo = memoryRepository();
  if (fail) await expect(exportPhoneBackup(repo)).rejects.toThrow('synthetic share failure'); else await exportPhoneBackup(repo);
  expect(createPhoneBackup).toHaveBeenCalledWith(repo);
  expect(mockFiles).toEqual([{ uri: 'file:///cache/phone-backup-synthetic-id/insight-phone-backup.json', value: '{"synthetic":true}' }]);
  expect(Sharing.shareAsync).toHaveBeenCalledWith(mockFiles[0].uri, { mimeType: 'application/json', UTI: 'public.json' });
  expect(mockDeleted).toEqual(['file:///cache/phone-backup-synthetic-id']);
});
test('unavailable sharing fails calmly before writing a backup', async () => {
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValueOnce(false);
  await expect(exportPhoneBackup(memoryRepository())).rejects.toThrow('Sharing is unavailable.');
  expect(mockFiles).toEqual([]);
});
