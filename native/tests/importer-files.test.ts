import {
  pickBackup,
  readBackup,
  localBackupUri,
} from "../src/features/importer/files";
import { File } from "expo-file-system";
import { getDocumentAsync } from "expo-document-picker";
jest.mock("expo-file-system", () => ({ File: jest.fn() }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
test("picker cancellation performs no file read, picker opens one cached JSON file", async () => {
  (getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: true });
  expect(await pickBackup()).toBeUndefined();
  expect(File).not.toHaveBeenCalled();
  (getDocumentAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///fixture.json" }],
  });
  (File as unknown as jest.Mock).mockImplementation(() => ({
    size: 20,
    text: async () => '{"sessions":[]}',
  }));
  expect(await pickBackup()).toEqual({ sessions: [] });
  expect(getDocumentAsync).toHaveBeenLastCalledWith(
    expect.objectContaining({ copyToCacheDirectory: true, multiple: false }),
  );
});
test("only local share URIs are readable; large and malformed files fail closed", async () => {
  for (const uri of [
    "https://example.invalid/test.json",
    "insight://file",
    "data:application/json,{}",
    "ftp://invalid",
  ])
    expect(() => localBackupUri(uri)).toThrow();
  expect(localBackupUri("content://fixture/backup")).toBe(
    "content://fixture/backup",
  );
  (File as unknown as jest.Mock).mockImplementation(() => ({
    size: 30 * 1024 * 1024,
    text: jest.fn(),
  }));
  await expect(readBackup("file:///large.json")).rejects.toThrow();
  (File as unknown as jest.Mock).mockImplementation(() => ({
    size: 5,
    text: async () => "bad",
  }));
  await expect(readBackup("file:///bad.json")).rejects.toThrow();
});
