import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { Button } from "../../../components/button";
import { ThemedText } from "../../../components/themed-text";
import type { Repository } from "../../../data/repository";
import { t } from "../../../i18n/en";
import { Field } from "../../onboarding/fields";
import { useFoodRevision } from "../use-food-revision";
import {
  aiState,
  FoodAiService,
  logEstimates,
  setConsent,
  type Estimate,
} from "./service";
import { FoodAiConsent } from "./privacy";
import { pickMealPhoto } from "./photos";
import { drainIfOnline, useFoodAiClient } from "./runtime";
import { EstimateEditor } from "./editor";
export function FoodAiEntry({
  repo,
  mode,
  day,
  meal,
  onClose,
  onManual,
  fallbackId,
}: {
  repo: Repository;
  mode: "snap" | "describe";
  day: string;
  meal: string;
  onClose: () => void;
  onManual: () => void;
  fallbackId?: number;
}) {
  "use no memo";
  useFoodRevision(repo);
  const client = useFoodAiClient(repo),
    service = useMemo(() => new FoodAiService(repo, client), [repo, client]);
  const [text, setText] = useState(""),
    [status, setStatus] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [consent, setSheet] = useState(!aiState(repo).consent),
    [items, setItems] = useState<Estimate[] | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      service.cancel();
    };
  }, [service]);
  const run = async (action: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setStatus(t("foodAiReading"));
    try {
      await action();
    } catch (error) {
      if (!mounted.current) return;
      const safe = [
        "foodAiLimit",
        "foodAiRateLimit",
        "foodAiCancelled",
        "foodAiBusy",
        "foodAiQueueFull",
        "foodAiBlocked",
        "foodAiUnavailable",
        "foodAiConsentRequired",
        "foodAiPermission",
      ] as const;
      setStatus(
        safe
          .map((k) => t(k))
          .find(
            (message) => error instanceof Error && error.message === message,
          ) ?? t("foodAiFailure"),
      );
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const s = aiState(repo);
  const photo = (camera: boolean) =>
    void run(async () => {
      const generation = aiState(repo).generation;
      if (!aiState(repo).consent) throw new Error(t("foodAiConsentRequired"));
      const result = await pickMealPhoto(camera, () => mounted.current && aiState(repo).consent && generation === aiState(repo).generation);
      if (!result) {
        if (mounted.current) setStatus(null);
        return;
      }
      if (!mounted.current || !aiState(repo).consent || generation !== aiState(repo).generation)
        return;
      service.enqueue(result, day, meal);
      setStatus(t("foodAiQueued"));
      await drainIfOnline(service);
      if (mounted.current) setStatus(null);
    });
  if (consent)
    return (
      <FoodAiConsent
        onCancel={onClose}
        onAccept={() => {
          try {
            setConsent(repo, true);
            setSheet(false);
          } catch {
            setStatus(t("preferenceError"));
          }
        }}
      />
    );
  return (
    <View style={{ gap: 16 }}>
      {!s.consent && (
        <Button label={t("foodAiAgree")} onPress={() => setSheet(true)} />
      )}
      {!consent && s.consent && (
        <>
          {mode === "snap" ? (
            <>
              <Button
                label={t("foodAiCamera")}
                disabled={busy}
                onPress={() => photo(true)}
              />
              <Button
                label={t("foodAiLibrary")}
                disabled={busy}
                onPress={() => photo(false)}
              />
            </>
          ) : (
            <>
              <Field
                label={t("foodAiDescription")}
                value={text}
                onChange={setText}
              />
              <Button
                label={t("foodAiEstimate")}
                disabled={busy || !!items || !text.trim()}
                onPress={() =>
                  void run(async () => {
                    const result = await service.describe(text);
                    if (!mounted.current) return;
                    setItems(result);
                    setStatus(null);
                  })
                }
              />
            </>
          )}
          {items && (
            <EstimateEditor
              items={items}
              onSave={(value) => {
                logEstimates(repo, day, meal, value, fallbackId);
                onClose();
              }}
            />
          )}
        </>
      )}
      {busy && (
        <ThemedText accessibilityLiveRegion="polite">
          {t("foodAiReading")}
        </ThemedText>
      )}
      {!busy && status && (
        <ThemedText accessibilityRole="alert">{status}</ThemedText>
      )}
      {!!s.queue.length && (
        <>
          <ThemedText accessibilityLiveRegion="polite">
            {t("foodAiQueued")}
          </ThemedText>
          <Button
            label={t("foodAiRetry")}
            disabled={busy}
            onPress={() =>
              void run(async () => {
                await drainIfOnline(service);
                if (mounted.current) setStatus(null);
              })
            }
          />
        </>
      )}
      <Button label={t("foodManual")} variant="secondary" onPress={onManual} />
      <Button label={t("cancel")} variant="secondary" onPress={onClose} />
    </View>
  );
}
