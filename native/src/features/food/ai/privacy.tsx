import { useState } from "react";
import { Modal, Switch, View } from "react-native";
import { Button } from "../../../components/button";
import { ThemedText } from "../../../components/themed-text";
import { Screen } from "../../../components/screen";
import { useAuth } from "../../../auth/provider";
import type { Repository } from "../../../data/repository";
import { useTheme } from "../../../design/theme-provider";
import { t } from "../../../i18n/en";
import { useFoodRevision } from "../use-food-revision";
import { aiState, setConsent, setThumbnails } from "./service";
export function FoodAiConsent({
  onAccept,
  onCancel,
}: {
  onAccept: () => void;
  onCancel: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Modal transparent animationType="none" onRequestClose={onCancel}>
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          padding: 24,
          backgroundColor: "#0009",
        }}
      >
        <View
          accessibilityViewIsModal
          style={{ padding: 20, gap: 16, backgroundColor: colors.surface }}
        >
          <ThemedText variant="headline">{t("foodAiConsentTitle")}</ThemedText>
          <ThemedText>{t("foodAiConsentBody")}</ThemedText>
          <Button label={t("foodAiAgree")} onPress={onAccept} />
          <Button label={t("cancel")} variant="secondary" onPress={onCancel} />
        </View>
      </View>
    </Modal>
  );
}
export function FoodAiPrivacy({ repo }: { repo: Repository }) {
  "use no memo";
  useFoodRevision(repo);
  const s = aiState(repo),
    [consent, setSheet] = useState(false),
    [error, setError] = useState(false);
  const run = (fn: () => void) => {
    try {
      fn();
      setError(false);
    } catch {
      setError(true);
    }
  };
  return (
    <View style={{ gap: 16 }}>
      <ThemedText>{t("foodAiPrivacy")}</ThemedText>
      <Switch
        accessibilityLabel={t("foodAiPrivacy")}
        value={s.consent}
        onValueChange={(v) => {
          if (v) setSheet(true);
          else run(() => setConsent(repo, false));
        }}
      />
      <ThemedText>{t("foodAiRevokeHint")}</ThemedText>
      <ThemedText>{t("foodAiThumbnails")}</ThemedText>
      <Switch
        accessibilityLabel={t("foodAiThumbnails")}
        value={s.thumbnails}
        onValueChange={(v) => run(() => setThumbnails(repo, v))}
      />
      <ThemedText>{t("foodAiThumbnailHint")}</ThemedText>
      {error && (
        <ThemedText accessibilityRole="alert">
          {t("preferenceError")}
        </ThemedText>
      )}
      {consent && (
        <FoodAiConsent
          onCancel={() => setSheet(false)}
          onAccept={() =>
            run(() => {
              setConsent(repo, true);
              setSheet(false);
            })
          }
        />
      )}
    </View>
  );
}
export function FoodPrivacyScreen() {
  const { repository } = useAuth();
  return (
    <Screen title={t("privacy")}>
      {repository ? (
        <FoodAiPrivacy repo={repository} />
      ) : (
        <ThemedText>{t("localError")}</ThemedText>
      )}
    </Screen>
  );
}
