import { ImportPreviewConflict } from '../src/features/importer/errors';
import { Alert } from "react-native";
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
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
async function wrap(overrides: Partial<AuthState> = {}) {
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
    ...overrides,
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
  expect(screen.getByText(t("importStepReview"))).toBeTruthy();
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
  expect(screen.queryByLabelText(/^Will be removed/)).toBeNull();
  await fireEvent.press(
    screen.getByRole("radio", { name: new RegExp("^" + t("importSelectReplace")) }),
  );
  expect(screen.getByTestId("import-mode-replace")).toBeSelected();
  expect(screen.getByLabelText("Will be removed: 1")).toBeTruthy();
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

test("account confirmation sends the UUID from the reviewed preview", async () => {
  const previewId = "10000000-0000-4000-8000-000000000019";
  const legacyImport = jest.fn(async () => ({version: 1 as const, rows: [], issues: [], unmapped: [], legacy: {}, previewId}));
  const alert = jest.spyOn(Alert,"alert").mockImplementation(() => {});
  try {
    await wrap({session: {user:{id:"demo"}} as AuthState["session"], legacyImport});
    await fireEvent.press(screen.getByRole("button", {name:t("importAccount")}));
    await fireEvent.press(screen.getByRole("button", {name:t("importMerge")}));
    await act(async () => { alert.mock.calls.at(-1)?.[2]?.[1].onPress?.(); });
    expect(legacyImport).toHaveBeenLastCalledWith("commit", {}, previewId);
  } finally { alert.mockRestore(); }
});

test("expired account preview shows an accessible Preview again message", async () => {
  const legacyImport = jest.fn(async (action: string) => {
    if (action === "commit") throw new ImportPreviewConflict();
    return {version: 1 as const, rows: [], issues: [], unmapped: [], legacy: {}, previewId: "fixture"};
  });
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  try {
    await wrap({session: {user:{id:"demo"}} as AuthState["session"], legacyImport});
    await fireEvent.press(screen.getByRole("button", {name:t("importAccount")}));
    await fireEvent.press(screen.getByRole("button", {name:t("importMerge")}));
    await act(async () => { alert.mock.calls.at(-1)?.[2]?.[1].onPress?.(); });
    expect(screen.getByRole("alert")).toHaveTextContent(t("importPreviewAgain"));
    expect(screen.queryByText(t("importDone"))).toBeNull();
  } finally { alert.mockRestore(); }
});

test("opens with plain steps and no technical wording", async () => {
  await wrap();
  expect(screen.getByLabelText("Step 1: Choose your data")).toBeTruthy();
  expect(screen.getByText(/Bring in your data from the Insight web app/)).toBeTruthy();
  expect(screen.queryByText(/PWA|JSON|native|legacy|\brows?\b/i)).toBeNull();
  // Nothing has been read yet, so no counts, result or error are shown.
  expect(screen.queryByTestId("import-summary")).toBeNull();
  expect(screen.queryByTestId("import-result")).toBeNull();
  expect(screen.queryByTestId("import-error")).toBeNull();
  expect(screen.queryByTestId("import-progress")).toBeNull();
});

test("a file that cannot be read shows a quiet inline row, and Retry picks a file again", async () => {
  (pickBackup as jest.Mock).mockReset().mockRejectedValueOnce(new Error("unreadable")).mockResolvedValue(legacyV2);
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  try {
    await wrap();
    await fireEvent.press(screen.getByRole("button", { name: t("importChoose") }));
    expect(screen.getByTestId("import-error")).toHaveTextContent(new RegExp(t("importError")));
    expect(alert).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
    expect(pickBackup).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("import-error")).toBeNull();
    expect(screen.getByLabelText("Step 2: Check what was found")).toBeTruthy();
  } finally { alert.mockRestore(); }
});

test("an out-of-date account preview retries by previewing the account again", async () => {
  const legacyImport = jest.fn(async (action: string) => {
    if (action === "commit") throw new ImportPreviewConflict();
    return {version: 1 as const, rows: [], issues: [], unmapped: [], legacy: {}, previewId: "fixture"};
  });
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  try {
    await wrap({session: {user:{id:"demo"}} as AuthState["session"], legacyImport});
    await fireEvent.press(screen.getByRole("button", {name:t("importAccount")}));
    expect(screen.getByText(t("importNothing"))).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", {name:t("importMerge")}));
    await act(async () => { alert.mock.calls.at(-1)?.[2]?.[1].onPress?.(); });
    const previews = () => legacyImport.mock.calls.filter(call => call[0] === "preview").length;
    const before = previews();
    await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
    expect(previews()).toBe(before + 1);
    expect(screen.queryByTestId("import-error")).toBeNull();
  } finally { alert.mockRestore(); }
});

test("a finished import shows a result summary from the confirmed preview", async () => {
  (pickBackup as jest.Mock).mockReset().mockResolvedValue(legacyV2);
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  try {
    const repo = await wrap();
    Object.defineProperty(repo, "syncFlags", { value: { syncedV1Columns: true } });
    await fireEvent.press(screen.getByRole("button", { name: t("importChoose") }));
    const found = screen.getByLabelText(/^Entries found: \d+$/).props.accessibilityLabel;
    expect(screen.getByRole("radio", { name: new RegExp("^" + t("importSelectMerge")) })).toBeSelected();
    await fireEvent.press(screen.getByRole("button", { name: t("importMerge") }));
    await act(async () => { alert.mock.calls.at(-1)?.[2]?.[1].onPress?.(); });
    const result = within(screen.getByTestId("import-result"));
    expect(result.getByText(t("importDone"))).toBeTruthy();
    expect(result.getByLabelText(found)).toBeTruthy();
    expect(result.queryByLabelText(/^Will be removed/)).toBeNull();
    expect(repo.list("sessions").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("import-step-review")).toBeNull();
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
  } finally { alert.mockRestore(); }
});
