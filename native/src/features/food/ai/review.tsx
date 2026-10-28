import { useEffect, useState } from "react";
import { View, Image } from "react-native";
import type { Repository } from "../../../data/repository";
import { Button } from "../../../components/button";
import { ThemedText } from "../../../components/themed-text";
import { t } from "../../../i18n/en";
import { attributedDay } from "../model";
import { today } from "../../onboarding/model";
import {
  aiState,
  confirmEstimate,
  dismissReview,
  logEstimates,
  yesterdayReview,
} from "./service";
import { EstimateEditor } from "./editor";
export function LocalMealThumbnail({ data }: { data?: string }) {
  return data ? (
    <Image
      source={{ uri: "data:image/jpeg;base64," + data }}
      style={{ width: 64, height: 64 }}
      accessibilityLabel={t("foodAiThumbnail")}
    />
  ) : null;
}
export function FoodAiResults({
  repo,
  onDescribe,
  onManual,
}: {
  repo: Repository;
  onDescribe: (id: number) => void;
  onManual: (id: number) => void;
}) {
  "use no memo";
  const state = aiState(repo);
  return (
    <>
      {state.ready.map((job) => (
        <View key={job.id} style={{ gap: 16 }}>
          <LocalMealThumbnail data={job.thumbnail} />
          <EstimateEditor
            items={job.items}
            onSave={(items) =>
              logEstimates(repo, job.day, job.meal, items, job.id)
            }
          />
        </View>
      ))}
      {state.fallback.map((job) => (
        <View key={job.id} style={{ gap: 8 }}>
          <ThemedText>{t("foodAiFallback")}</ThemedText>
          <LocalMealThumbnail data={job.thumbnail} />
          <Button
            label={t("foodDescribe")}
            onPress={() => onDescribe(job.id)}
          />
          <Button label={t("foodManual")} onPress={() => onManual(job.id)} />
        </View>
      ))}
    </>
  );
}
export function FoodAiMorningReview({ repo }: { repo: Repository }) {
  "use no memo";
  const [day] = useState(today),
    [rows] = useState(() =>
      attributedDay() === day ? yesterdayReview(repo, day) : [],
    ),
    [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (rows.length) dismissReview(repo, day);
  }, [repo, day, rows]);
  const remaining = rows.filter(
    (row) =>
      aiState(repo).entries[row.id]?.confirmed === false &&
      repo.get("food_entries", row.id)?.deleted_at === null,
  );
  if (hidden || !remaining.length) return null;
  return (
    <View style={{ gap: 8 }}>
      <ThemedText>{t("foodAiReview")}</ThemedText>
      {remaining.map((row) => (
        <Button
          key={row.id}
          label={t("foodAiConfirm").replace("{name}", String(row.data.name))}
          variant="secondary"
          onPress={() => confirmEstimate(repo, row.id)}
        />
      ))}
      <Button
        label={t("foodAiDismiss")}
        variant="secondary"
        onPress={() => setHidden(true)}
      />
    </View>
  );
}
