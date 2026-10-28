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
import { Alert, TextInput, AppState } from "react-native";
import { getSharedPayloads, clearSharedPayloads } from "expo-sharing";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../auth/provider";
import { useTheme } from "../../design/theme-provider";
import { Screen } from "../../components/screen";
import { Button } from "../../components/button";
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
const t = (key: MessageKey, values: Record<string, string | number> = {}) =>
  message(key).replace(/\{(\w+)\}/g, (token, key) =>
    String(values[key] ?? token),
  );
const bank = exerciseLibrary.map((e) => e.name);
export function ImportScreen() {
  const { repository } = useAuth();
  return <ImportBody key={repository?.owner ?? "unavailable"} />;
}
function ImportBody() {
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
    [done, setDone] = useState(false);
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
    try {
      await task();
    } catch {
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
  return (
    <>
      <Stack.Screen options={{ title: t("importTitle") }} />
      <Screen title={t("importTitle")}>
        <ThemedText>{t("importIntro")}</ThemedText>
        <Button
          label={t("importChoose")}
          disabled={busy}
          onPress={() => {
            void run(async () => {
              const owner = repo?.owner,
                v = await pickBackup();
              if (v !== undefined && currentOwner.current === owner)
                await receive(v);
            });
          }}
        />
        {auth.session && auth.legacyImport && (
          <Button
            label={t("importAccount")}
            disabled={busy}
            onPress={() => {
              void loadServer();
            }}
          />
        )}
        {!auth.session && <ThemedText>{t("importSignedOut")}</ThemedText>}
        {(error || derived.error) && (
          <ThemedText accessibilityRole="alert">{t("importError")}</ThemedText>
        )}
        {invalidMapping && (
          <ThemedText accessibilityRole="alert">
            {t("importMapInvalid")}
          </ThemedText>
        )}
        {done && (
          <ThemedText accessibilityRole="alert">{t("importDone")}</ThemedText>
        )}
        {preview && !done && (
          <>
            <ThemedText accessibilityRole="header">
              {t("importPreview")}
            </ThemedText>
            <ThemedText>
              {t("importCounts", {
                rows: preview.plan.rows.length,
                existing: preview.existing,
                flags: preview.plan.issues.length,
                removed: preview.removed,
              })}
            </ThemedText>
            {Object.entries(preview.counts).map(([table, count]) => (
              <ThemedText key={table}>
                {t(("importCount_" + table) as MessageKey, { count })}
              </ThemedText>
            ))}
            <ThemedText>{t("importFlags")}</ThemedText>
            {preview.plan.issues.map((issue, i) => (
              <ThemedText key={i}>
                {t("importIssue", { path: issue.path, reason: issue.reason })}
              </ThemedText>
            ))}
            {derived.names.map((name) => (
              <TextInput
                key={name}
                accessibilityLabel={t("importMapLabel", { name })}
                placeholder={t("importKeepCustom", { name })}
                value={mapping[name] === "custom" ? "" : (mapping[name] ?? "")}
                onChangeText={(value) =>
                  setMapping((m) => ({ ...m, [name]: value || "custom" }))
                }
                style={{
                  color: colors.text,
                  borderColor: colors["surface-2"],
                  borderWidth: 1,
                  minHeight: 48,
                  padding: 12,
                }}
              />
            ))}
            {server && (
              <Button
                label={t("importRefreshMapping")}
                disabled={busy}
                onPress={() => {
                  void loadServer();
                }}
              />
            )}
            {!server && (
              <Button
                label={t(
                  mode === "merge"
                    ? "importSelectReplace"
                    : "importSelectMerge",
                )}
                variant="secondary"
                onPress={() =>
                  setMode((m) => (m === "merge" ? "replace" : "merge"))
                }
              />
            )}
            <Button
              label={t(mode === "replace" ? "importReplace" : "importMerge")}
              disabled={
                busy ||
                !repo ||
                invalidMapping ||
                (server && serverMapping !== JSON.stringify(mapping))
              }
              onPress={confirm}
            />
          </>
        )}
        <Button
          label={t("importClose")}
          variant="secondary"
          onPress={() => router.replace(auth.session ? "/settings" : "/auth")}
        />
      </Screen>
    </>
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
