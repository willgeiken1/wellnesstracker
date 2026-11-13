import { PrivacySwitches } from '../../settings/privacy-switches';
import { useState } from "react";
import { Modal, View } from "react-native";
import { Button } from "../../../components/button";
import { ThemedText } from "../../../components/themed-text";
import { Screen } from "../../../components/screen";
import { useAuth } from "../../../auth/provider";
import type { Repository } from "../../../data/repository";
import { useTheme } from "../../../design/theme-provider";
import { Group, QuietCard, SectionLabel, ToggleRow } from "../../settings/parts";
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
    <View style={{ gap: 12 }}>
      <SectionLabel>{t("settingsAi")}</SectionLabel>
      <Group testID="privacy-ai">
        <ToggleRow
          testID="privacy-ai-consent"
          label={t("foodAiPrivacy")}
          hint={t("foodAiRevokeHint")}
          value={s.consent}
          onValueChange={(v) => {
            if (v) setSheet(true);
            else run(() => setConsent(repo, false));
          }}
        />
      </Group>
      <SectionLabel>{t("settingsPhotos")}</SectionLabel>
      <Group testID="privacy-photos">
        <ToggleRow
          testID="privacy-thumbnails"
          label={t("foodAiThumbnails")}
          hint={t("foodAiThumbnailHint")}
          value={s.thumbnails}
          onValueChange={(v) => run(() => setThumbnails(repo, v))}
        />
      </Group>
      {error && (
        <ThemedText muted variant="caption" accessibilityRole="alert">
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
        <><PrivacySwitches /><FoodAiPrivacy repo={repository} /></>
      ) : (
        <QuietCard title={t("localError")} />
      )}
    </Screen>
  );
}
