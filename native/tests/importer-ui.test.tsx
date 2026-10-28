import { Alert } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { ImportScreen } from "../src/features/importer/screen";
import { AuthContext, type AuthState } from "../src/auth/provider";
import { ThemeProvider } from "../src/design/theme-provider";
import { memoryRepository } from "./workout-repository";
import { legacyV1, legacyV2 } from "../fixtures/pwa-import";
import { pickBackup } from "../src/features/importer/files";
import { t } from "../src/i18n/en";
jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({}),
}));
jest.mock("expo-sharing", () => ({
  getSharedPayloads: () => [],
  clearSharedPayloads: jest.fn(),
}));
jest.mock("../src/features/importer/files", () => ({
  pickBackup: jest.fn(),
  readBackup: jest.fn(),
}));
jest.mock("../src/auth/client", () => ({ getAuthClient: () => null }));
jest.mock("../src/data/database", () => ({ openLocalDatabase: jest.fn() }));
async function wrap() {
  const repository = memoryRepository();
  Object.defineProperty(repository, "device", {
    value: "20000000-0000-4000-8000-000000000001",
  });
  const state: AuthState = {
    repository,
    session: null,
    demo: false,
    ready: true,
    configured: false,
    configError: null,
    pending: 0,
    conflicts: 0,
    syncStatus: "idle",
    lookAround: jest.fn(),
    signIn: jest.fn(),
    createAccount: jest.fn(),
    signOut: jest.fn(),
    syncNow: jest.fn(async () => {}),
  };
  await render(
    <AuthContext.Provider value={state}>
      <ThemeProvider>
        <ImportScreen />
      </ThemeProvider>
    </AuthContext.Provider>,
  );
  return repository;
}
test("file picking previews without writes and Cancel never merges", async () => {
  (pickBackup as jest.Mock).mockResolvedValue(legacyV2);
  const repo = await wrap(),
    alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  await fireEvent.press(
    screen.getByRole("button", { name: t("importChoose") }),
  );
  expect(screen.getByText(t("importPreview"))).toBeTruthy();
  expect(repo.list("sessions")).toHaveLength(0);
  await fireEvent.press(screen.getByRole("button", { name: t("importMerge") }));
  expect(alert).toHaveBeenLastCalledWith(
    t("importConfirmTitle"),
    t("importConfirmBody"),
    expect.any(Array),
  );
  expect(repo.list("sessions")).toHaveLength(0);
  alert.mockRestore();
});
test("Replace requires its own destructive confirmation and preview counts", async () => {
  (pickBackup as jest.Mock).mockResolvedValue(legacyV2);
  const repo = await wrap();
  await act(async () => {
    repo.save("sessions", { name: "Native fixture" });
  });
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  await fireEvent.press(
    screen.getByRole("button", { name: t("importChoose") }),
  );
  await fireEvent.press(
    screen.getByRole("button", { name: t("importSelectReplace") }),
  );
  expect(screen.getByText(/1 rows to replace/)).toBeTruthy();
  await fireEvent.press(
    screen.getByRole("button", { name: t("importReplace") }),
  );
  expect(alert).toHaveBeenLastCalledWith(
    t("importReplaceTitle"),
    t("importReplaceBody"),
    expect.arrayContaining([
      expect.objectContaining({
        text: t("importReplaceConfirm"),
        style: "destructive",
      }),
    ]),
  );
  expect(repo.list("sessions")[0].data.name).toBe("Native fixture");
  alert.mockRestore();
});

test("exercise mapping remains editable while typing and updates the preview when valid", async () => {
  (pickBackup as jest.Mock).mockResolvedValue(legacyV1);
  await wrap();
  await fireEvent.press(
    screen.getByRole("button", { name: t("importChoose") }),
  );
  const label = t("importMapLabel").replace("{name}", "Fixture pulley");
  await fireEvent.changeText(screen.getByLabelText(label), "B");
  expect(screen.getByLabelText(label)).toHaveDisplayValue("B");
  expect(screen.getByRole("button", { name: t("importMerge") })).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText(label), "Bench Press");
  expect(screen.getByLabelText(label)).toHaveDisplayValue("Bench Press");
  expect(
    screen.getByRole("button", { name: t("importMerge") }),
  ).not.toBeDisabled();
});
