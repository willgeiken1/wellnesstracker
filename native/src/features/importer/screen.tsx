"use no memo";
// This screen subscribes to a mutable repository and explicitly derives previews by revision.
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useCallback,
} from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { getSharedPayloads, clearSharedPayloads } from "expo-sharing";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../auth/provider";
import { useTheme } from "../../design/theme-provider";
import { tokens } from "../../design/tokens";
import { Screen } from "../../components/screen";
import { Button } from "../../components/button";
import { Card } from "../../components/card";
import { ThemedText } from "../../components/themed-text";
import { t as message, type MessageKey } from "../../i18n/en";
import { exerciseLibrary } from "../../core/workout/library";
import {
  normalizePwa,
  previewImport,
  commitImport,
  type ImportPlan,
} from "./local";
import { pickBackup, readBackup } from "./files";
import { ImportPreviewConflict } from "./errors";
const t = (key: MessageKey, values: Record<string, string | number> = {}) =>
  message(key).replace(/\{(\w+)\}/g, (token, key) =>
    String(values[key] ?? token),
  );
const bank = exerciseLibrary.map((e) => e.name);
/** `inSettings`: opened as Settings › Data, where the page carries its own title and the header's Back is the way out. */
export function ImportScreen({ inSettings = false }: { inSettings?: boolean }) {
  const { repository } = useAuth();
  return <ImportBody key={repository?.owner ?? "unavailable"} inSettings={inSettings} />;
}
function ImportBody({ inSettings }: { inSettings: boolean }) {
  const auth = useAuth(),
    repo = auth.repository,
    { colors } = useTheme();
  const { source } = useLocalSearchParams<{ source?: string }>();
  const accountLoaded = useRef(false);
  const [serverMapping, setServerMapping] = useState("{}");
  const [input, setInput] = useState<unknown>(),
    [plan, setPlan] = useState<ImportPlan | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({}),
    [mode, setMode] = useState<"merge" | "replace">("merge"),
    [server, setServer] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    [previewConflict, setPreviewConflict] = useState(false),
    [done, setDone] = useState(false);
  const [lastAction, setLastAction] = useState<"file" | "account" | "save">(
      source === "account" ? "account" : "file",
    ),
    [summary, setSummary] = useState<{
      found: number;
      existing: number;
      flagged: number;
      removed: number;
      replaced: boolean;
    } | null>(null);
  const currentOwner = useRef(repo?.owner);
  useEffect(() => {
    currentOwner.current = repo?.owner;
    return () => {
      currentOwner.current = undefined;
    };
  }, [repo?.owner]);
  const guard = useRef(false);
  const receive = async (value: unknown) => {
    setInput(value);
    setServer(false);
    setMapping({});
    setDone(false);
    setError(false);
  };
  useEffect(() => {
    // Raw payloads only: resolving a shared URL would make a network request.
    const read = () => {
      const payload = (
        typeof getSharedPayloads === "function" ? getSharedPayloads() : []
      ).find(
        (p) => p.shareType === "file" && /^(file|content):\/\//i.test(p.value),
      );
      if (payload && !guard.current) {
        guard.current = true;
        const owner = repo?.owner;
        void readBackup(payload.value)
          .then((v) => {
            if (currentOwner.current === owner) void receive(v);
          })
          .catch(() => setError(true))
          .finally(() => {
            clearSharedPayloads();
            guard.current = false;
          });
      }
    };
    read();
    const listener = AppState.addEventListener("change", (s) => {
      if (s === "active") read();
    });
    return () => listener.remove();
  }, [repo?.owner]);
  const revision = useSyncExternalStore(
    useCallback((listener) => repo?.subscribe(listener) ?? (() => {}), [repo]),
    () => repo?.getRevision() ?? 0,
  );
  const invalidMapping = Object.values(mapping).some(
    (value) => value !== "custom" && !bank.includes(value),
  );
  const derived = useMemo(() => {
    void revision;
    if (!repo || done)
      return { preview: null, error: false, names: [] as string[] };
    try {
      const base = server
        ? plan
        : input === undefined
          ? null
          : normalizePwa(input, bank);
      const valid = Object.fromEntries(
        Object.entries(mapping).filter(
          ([, value]) => value === "custom" || bank.includes(value),
        ),
      );
      const converted =
        server || !base ? base : normalizePwa(input, bank, valid);
      return {
        preview: converted ? previewImport(repo, converted, mode) : null,
        error: false,
        names: base?.unmapped ?? [],
      };
    } catch {
      return { preview: null, error: true, names: [] as string[] };
    }
  }, [repo, input, mapping, mode, server, plan, done, revision]);
  const preview = derived.preview;
  const run = async (task: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(false);
    setPreviewConflict(false);
    try {
      await task();
    } catch (cause) {
      setPreviewConflict(cause instanceof ImportPreviewConflict);
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  const loadServer = () =>
    run(async () => {
      if (!auth.legacyImport) return;
      const p = await auth.legacyImport("preview", mapping);
      setPlan(p);
      setServerMapping(JSON.stringify(mapping));
      setServer(true);
      setMode("merge");
      setDone(false);
    });
  const requestImport = auth.legacyImport;
  useEffect(() => {
    if (source !== "account" || accountLoaded.current || !requestImport) return;
    accountLoaded.current = true;
    const owner = repo?.owner;
    void requestImport("preview")
      .then((p) => {
        if (currentOwner.current !== owner) return;
        setPlan(p);
        setServerMapping("{}");
        setServer(true);
        setMode("merge");
        setDone(false);
      })
      .catch(() => setError(true));
  }, [source, requestImport, repo?.owner]);
  const save = () =>
    run(async () => {
      if (!repo || !preview) return;
      if (preview.revision !== repo.getRevision()) throw Error();
      let p = preview;
      if (server) {
        if (!auth.legacyImport) throw Error();
        const imported = await auth.legacyImport("commit", mapping, preview.plan.previewId);
        if (currentOwner.current !== repo.owner) throw Error();
        p = previewImport(repo, imported);
      }
      commitImport(repo, p, true, mode === "replace");
      if (server) repo.localSave("pwaImportComplete", true);
      setDone(true);
      void auth.syncNow();
    });
  const confirm = () =>
    Alert.alert(
      t(mode === "replace" ? "importReplaceTitle" : "importConfirmTitle"),
      t(mode === "replace" ? "importReplaceBody" : "importConfirmBody"),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t(mode === "replace" ? "importReplaceConfirm" : "importMerge"),
          style: mode === "replace" ? "destructive" : "default",
          onPress: () => {
            void save();
          },
        },
      ],
    );
  // Presentation only from here: which existing handler Retry calls, and what the result card reports.
  const chooseFile = () => {
    setLastAction("file");
    void run(async () => {
      const owner = repo?.owner,
        v = await pickBackup();
      if (v !== undefined && currentOwner.current === owner) await receive(v);
    });
  };
  const fromAccount = () => {
    setLastAction("account");
    void loadServer();
  };
  const startImport = () => {
    if (!preview) return;
    setLastAction("save");
    setSummary({
      found: preview.plan.rows.length,
      existing: preview.existing,
      flagged: preview.plan.issues.length,
      removed: preview.removed,
      replaced: mode === "replace",
    });
    confirm();
  };
  const canUseAccount = !!auth.session && !!auth.legacyImport;
  const failed = error || derived.error;
  const retry =
    (previewConflict || lastAction === "account") && canUseAccount
      ? fromAccount
      : lastAction === "save" && preview && !previewConflict
        ? startImport
        : chooseFile;
  const waitingForAccount =
    source === "account" && !!requestImport && !plan && !server && !error;
  const mappingChanged = server && serverMapping !== JSON.stringify(mapping);
  const hair = { borderTopWidth: 1, borderTopColor: colors["surface-2"] };
  const field = {
    color: colors.text,
    backgroundColor: colors["surface-2"],
    borderRadius: tokens.radii.input,
    minHeight: 48,
    paddingHorizontal: tokens.spacing[2],
    paddingVertical: tokens.spacing[1],
    fontSize: tokens.type.body,
  };
  return (
    <>
      {!inSettings && <Stack.Screen options={{ title: t("importTitle") }} />}
      <Screen title={inSettings ? t("importTitle") : undefined}>
        <ThemedText muted>{t("importIntro")}</ThemedText>
        <Card testID="import-step-source" style={card}>
          <StepTitle step={1} label={t("importStepSource")} />
          <ThemedText muted variant="caption">
            {t("importSourceBody")}
          </ThemedText>
          <Button
            label={t("importChoose")}
            disabled={busy}
            onPress={chooseFile}
          />
          {canUseAccount && (
            <Button
              label={t("importAccount")}
              variant="secondary"
              disabled={busy}
              onPress={fromAccount}
            />
          )}
          {!auth.session && (
            <ThemedText muted variant="caption">
              {t("importSignedOut")}
            </ThemedText>
          )}
          {(busy || waitingForAccount) && (
            <View
              testID="import-progress"
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={t(
                busy ? BUSY_LABEL[lastAction] : "importBusyAccount",
              )}
              accessibilityLiveRegion="polite"
              style={[styles.note, { backgroundColor: colors["surface-2"] }]}
            >
              <ActivityIndicator color={colors["text-muted"]} />
              <ThemedText muted style={{ flex: 1 }}>
                {t(busy ? BUSY_LABEL[lastAction] : "importBusyAccount")}
              </ThemedText>
            </View>
          )}
          {failed && (
            <View
              testID="import-error"
              style={[styles.note, { backgroundColor: colors["surface-2"] }]}
            >
              <ThemedText
                muted
                accessibilityRole="alert"
                style={{ flex: 1 }}
              >
                {t(previewConflict ? "importPreviewAgain" : "importError")}
              </ThemedText>
              <Pressable
                testID="import-retry"
                accessibilityRole="button"
                accessibilityLabel={t("importRetry")}
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={retry}
                style={styles.quiet}
              >
                <ThemedText style={{ color: colors.accent, fontWeight: "600" }}>
                  {t("importRetry")}
                </ThemedText>
              </Pressable>
            </View>
          )}
        </Card>
        {done && (
          <Card testID="import-result" style={card}>
            <ThemedText
              variant="headline"
              accessibilityRole="alert"
              style={semibold}
            >
              {t("importDone")}
            </ThemedText>
            {summary && (
              <>
                <ThemedText muted variant="caption">
                  {t("importDoneBody")}
                </ThemedText>
                <View>
                  <Stat label={t("importFound")} value={summary.found} first />
                  <Stat label={t("importExisting")} value={summary.existing} />
                  <Stat label={t("importFlagged")} value={summary.flagged} />
                  {summary.replaced && (
                    <Stat label={t("importRemoved")} value={summary.removed} />
                  )}
                </View>
              </>
            )}
          </Card>
        )}
        {preview && !done && (
          <>
            <Card testID="import-step-review" style={card}>
              <StepTitle step={2} label={t("importStepReview")} />
              {preview.plan.rows.length === 0 && (
                <ThemedText muted>{t("importNothing")}</ThemedText>
              )}
              <View testID="import-summary">
                <Stat
                  label={t("importFound")}
                  value={preview.plan.rows.length}
                  first
                />
                <Stat label={t("importExisting")} value={preview.existing} />
                <Stat
                  label={t("importFlagged")}
                  value={preview.plan.issues.length}
                />
                {(mode === "replace" || preview.removed > 0) && (
                  <Stat label={t("importRemoved")} value={preview.removed} />
                )}
              </View>
              {Object.keys(preview.counts).length > 0 && (
                <>
                  <ThemedText
                    variant="headline"
                    accessibilityRole="header"
                    style={[semibold, { marginTop: tokens.spacing[1] }]}
                  >
                    {t("importWhat")}
                  </ThemedText>
                  <View testID="import-tables">
                    {Object.entries(preview.counts).map(
                      ([table, count], index) => (
                        <Stat
                          key={table}
                          label={tableLabel(table)}
                          value={count}
                          first={index === 0}
                        />
                      ),
                    )}
                  </View>
                </>
              )}
              <ThemedText muted variant="caption">
                {t("importFlags")}
              </ThemedText>
              {preview.plan.issues.map((issue, i) => (
                <ThemedText
                  key={i}
                  muted
                  variant="caption"
                  style={[hair, { paddingTop: tokens.spacing[1] }]}
                >
                  {t("importIssue", { path: issue.path, reason: issue.reason })}
                </ThemedText>
              ))}
            </Card>
            {derived.names.length > 0 && (
              <Card testID="import-match" style={card}>
                <ThemedText
                  variant="headline"
                  accessibilityRole="header"
                  style={semibold}
                >
                  {t("importMatchTitle")}
                </ThemedText>
                <ThemedText muted variant="caption">
                  {t("importMatchBody")}
                </ThemedText>
                {derived.names.map((name) => (
                  <View key={name} style={{ gap: tokens.spacing[0] }}>
                    <ThemedText style={semibold}>{name}</ThemedText>
                    <TextInput
                      accessibilityLabel={t("importMapLabel", { name })}
                      placeholder={t("importKeepCustom", { name })}
                      placeholderTextColor={colors["text-muted"]}
                      autoCorrect={false}
                      value={
                        mapping[name] === "custom" ? "" : (mapping[name] ?? "")
                      }
                      onChangeText={(value) =>
                        setMapping((m) => ({ ...m, [name]: value || "custom" }))
                      }
                      style={field}
                    />
                  </View>
                ))}
                {invalidMapping && (
                  <View
                    style={[
                      styles.note,
                      { backgroundColor: colors["surface-2"] },
                    ]}
                  >
                    <ThemedText
                      muted
                      accessibilityRole="alert"
                      style={{ flex: 1 }}
                    >
                      {t("importMapInvalid")}
                    </ThemedText>
                  </View>
                )}
                {server && (
                  <Button
                    label={t("importRefreshMapping")}
                    variant="secondary"
                    disabled={busy}
                    onPress={fromAccount}
                  />
                )}
              </Card>
            )}
            <Card testID="import-step-confirm" style={card}>
              <StepTitle step={3} label={t("importStepConfirm")} />
              {!server && (
                <View
                  accessibilityRole="radiogroup"
                  accessibilityLabel={t("importHow")}
                  style={{ gap: tokens.spacing[1] }}
                >
                  {(["merge", "replace"] as const).map((value) => {
                    const selected = mode === value;
                    const label = t(
                      value === "merge"
                        ? "importSelectMerge"
                        : "importSelectReplace",
                    );
                    const body = t(
                      value === "merge" ? "importMergeBody" : "importReplaceHint",
                    );
                    return (
                      <Pressable
                        key={value}
                        testID={`import-mode-${value}`}
                        accessibilityRole="radio"
                        accessibilityLabel={`${label}. ${body}`}
                        accessibilityState={{ selected, checked: selected }}
                        onPress={() => setMode(value)}
                        style={[
                          styles.option,
                          {
                            borderColor: selected
                              ? colors.accent
                              : colors["hair-2"],
                            backgroundColor: selected
                              ? colors["accent-tint"]
                              : colors.surface,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.dot,
                            {
                              borderColor: selected
                                ? colors.accent
                                : colors["text-muted"],
                            },
                          ]}
                        >
                          {selected && (
                            <View
                              style={[
                                styles.dotFill,
                                { backgroundColor: colors.accent },
                              ]}
                            />
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <ThemedText style={semibold}>{label}</ThemedText>
                          <ThemedText muted variant="caption">
                            {body}
                          </ThemedText>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
              {server && (
                <ThemedText muted variant="caption">
                  {t("importMergeBody")}
                </ThemedText>
              )}
              <Button
                label={t(mode === "replace" ? "importReplace" : "importMerge")}
                variant={mode === "replace" ? "destructive" : "primary"}
                disabled={busy || !repo || invalidMapping || mappingChanged}
                onPress={startImport}
              />
              {mappingChanged && (
                <ThemedText muted variant="caption">
                  {t("importMappingChanged")}
                </ThemedText>
              )}
            </Card>
          </>
        )}
        {/* In Settings the header's Back already leaves; only Done after an import earns its own button. */}
        {(!inSettings || done) && <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(done ? "importFinish" : "importClose")}
          onPress={() => router.replace(auth.session ? "/settings" : "/auth")}
          style={[styles.quiet, { alignSelf: "center" }]}
        >
          <ThemedText style={{ color: colors.accent, fontWeight: "600" }}>
            {t(done ? "importFinish" : "importClose")}
          </ThemedText>
        </Pressable>}
      </Screen>
    </>
  );
}
const semibold = { fontWeight: "600" } as const;
const card = { borderRadius: 18, padding: tokens.spacing[3] } as const;
const BUSY_LABEL = {
  file: "importBusyFile",
  account: "importBusyAccount",
  save: "importBusySave",
} as const;
/** "Workouts: {count}" in the shared copy becomes the row label "Workouts". */
const tableLabel = (table: string) =>
  (message(("importCount_" + table) as MessageKey) ?? table).replace(
    /:\s*\{count\}$/,
    "",
  );
const styles = StyleSheet.create({
  note: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing[1],
    borderRadius: tokens.radii.input,
    paddingHorizontal: tokens.spacing[2],
    paddingVertical: tokens.spacing[1],
    minHeight: 44,
  },
  quiet: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: tokens.spacing[1],
    alignItems: "center",
    justifyContent: "center",
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing[2],
    minHeight: 56,
    padding: tokens.spacing[2],
    borderRadius: tokens.radii.card,
    borderWidth: 2,
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  dotFill: { width: 10, height: 10, borderRadius: 5 },
  stat: { flexDirection: "row", alignItems: "center", minHeight: 44, gap: tokens.spacing[2] },
  step: {
    minWidth: 26,
    minHeight: 26,
    paddingHorizontal: 6,
    borderRadius: 99,
    alignItems: "center",
    justifyContent: "center",
  },
});
function StepTitle({ step, label }: { step: number; label: string }) {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={t("importStepLabel", { step, label })}
      style={{ flexDirection: "row", alignItems: "center", gap: tokens.spacing[1] }}
    >
      <View style={[styles.step, { backgroundColor: colors["accent-tint"] }]}>
        <ThemedText numeric variant="caption" style={{ color: colors.text, fontWeight: "600" }}>
          {step}
        </ThemedText>
      </View>
      <ThemedText variant="headline" style={[semibold, { flex: 1 }]}>
        {label}
      </ThemedText>
    </View>
  );
}
function Stat({ label, value, first = false }: { label: string; value: number; first?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={[styles.stat, { borderTopWidth: first ? 0 : 1, borderTopColor: colors["surface-2"] }]}
    >
      <ThemedText style={{ flex: 1 }}>{label}</ThemedText>
      <ThemedText numeric style={semibold}>
        {value.toLocaleString("en-US")}
      </ThemedText>
    </View>
  );
}
/** First native sign-in offers conversion; retry remains available in Data. */
export function LegacyImportPrompt() {
  const auth = useAuth(),
    attempted = useRef<string | null>(null);
  const {
    repository: repo,
    legacyImport: request,
    ready,
    initialPullComplete,
  } = auth;
  const userId = auth.session?.user.id;
  useEffect(() => {
    if (
      !userId ||
      !ready ||
      !initialPullComplete ||
      !request ||
      !repo ||
      repo.localGet("pwaImportComplete") ||
      attempted.current === repo.owner
    )
      return;
    attempted.current = repo.owner;
    let active = true;
    void request("preview")
      .then((plan) => {
        if (!active) return;
        if (plan.rows.length || plan.issues.length)
          Alert.alert(t("importAccountFound"), t("importAccountFoundBody"), [
            { text: t("importLater"), style: "cancel" },
            {
              text: t("importPreview"),
              onPress: () =>
                router.push({
                  pathname: "/import",
                  params: { source: "account" },
                }),
            },
          ]);
        else repo.localSave("pwaImportComplete", true);
      })
      .catch(() => {
        if (active) Alert.alert(t("importTitle"), t("importRetryAccount"));
      });
    return () => {
      active = false;
    };
  }, [userId, ready, initialPullComplete, repo, request]);
  return null;
}

export function SharedImportEntry() {
  const auth = useAuth();
  useEffect(() => {
    if (!auth.ready) return;
    const check = () => {
      try {
        if (
          typeof getSharedPayloads === "function" &&
          getSharedPayloads().some(
            (p) =>
              p.shareType === "file" && /^(file|content):\/\//i.test(p.value),
          )
        )
          router.push("/import");
      } catch {
        /* Receiving is optional in older dev builds. */
      }
    };
    check();
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => listener.remove();
  }, [auth.ready]);
  return null;
}
