import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button } from "../../../components/button";
import { ThemedText } from "../../../components/themed-text";
import { useTheme } from "../../../design/theme-provider";
import { t } from "../../../i18n/en";
import { Field } from "../../onboarding/fields";
import { adjustEstimate, type Estimate } from "./service";
function EstimateItem({
  item,
  onChange,
}: {
  item: Estimate;
  onChange: (item: Estimate | null) => void;
}) {
  const [multiple, setMultiple] = useState(1),
    [weight, setWeight] = useState(""),
    [unit, setUnit] = useState<"g" | "oz">("g"),
    [confirmed, setConfirmed] = useState(item.confirmed),
    [invalid, setInvalid] = useState(false);
  const label = (key: "foodAiPortion" | "foodAiWeight" | "foodAiConfirm") =>
    t(key).replace("{name}", String(item.food.name)).replace("{unit}", unit);
  const change = (m: number, w: string, u: "g" | "oz", c = confirmed) => {
    try {
      const next = adjustEstimate({ ...item, confirmed: c }, m, w, u);
      onChange(next);
      setInvalid(false);
      setConfirmed(next.confirmed);
    } catch {
      onChange(null);
      setInvalid(true);
    }
  };
  let displayed = item;
  try {
    displayed = adjustEstimate({ ...item, confirmed }, multiple, weight, unit);
  } catch {
    /* Keep the prior estimate while a field is incomplete. */
  }
  return (
    <View style={{ gap: 8 }}>
      <ThemedText variant="headline">{String(item.food.name)}</ThemedText>
      {item.unsure && <ThemedText>{t("foodAiUnsure")}</ThemedText>}
      <ThemedText>
        {t("foodEnergy").replace(
          "{value}",
          String(Math.round(Number(displayed.food.energy_kj) / 4.184)),
        )}
      </ThemedText>
      <View
        accessibilityLabel={label("foodAiPortion")}
        style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}
      >
        {[0.5, 1, 1.5, 2].map((m) => (
          <Button
            key={m}
            label={`${m}× ${String(item.food.name)}`}
            selected={multiple === m}
            variant="secondary"
            onPress={() => {
              setMultiple(m);
              setWeight("");
              change(m, "", unit);
            }}
          />
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 4 }}>
        {(["g", "oz"] as const).map((u) => (
          <Button
            key={u}
            label={
              t(u === "g" ? "foodAiGrams" : "foodAiOunces") +
              " · " +
              String(item.food.name)
            }
            selected={u === unit}
            variant="secondary"
            onPress={() => {
              setUnit(u);
              setWeight("");
              change(multiple, "", u);
            }}
          />
        ))}
      </View>
      <Field
        label={label("foodAiWeight")}
        numeric
        value={weight}
        onChange={(w) => {
          setWeight(w);
          change(multiple, w, unit);
        }}
      />
      {invalid && (
        <ThemedText accessibilityRole="alert">{t("foodInvalid")}</ThemedText>
      )}
      <Button
        label={
          confirmed
            ? t("foodAiConfirmed") + " · " + String(item.food.name)
            : label("foodAiConfirm")
        }
        variant="secondary"
        disabled={invalid}
        onPress={() => {
          setConfirmed(true);
          change(multiple, weight, unit, true);
        }}
      />
    </View>
  );
}
export function EstimateEditor({
  items,
  onSave,
}: {
  items: Estimate[];
  onSave: (items: Estimate[]) => void;
}) {
  const { reduceMotion } = useTheme(),
    [visible, setVisible] = useState(reduceMotion ? items.length : 1),
    [draft, setDraft] = useState<(Estimate | null)[]>(items),
    [error, setError] = useState(false);
  const shown = reduceMotion ? items.length : visible;
  useEffect(() => {
    if (reduceMotion || visible >= items.length) return;
    const timer = setTimeout(() => setVisible((v) => v + 1), 250);
    return () => clearTimeout(timer);
  }, [visible, items.length, reduceMotion]);
  return (
    <View style={{ gap: 16 }}>
      {(["named", "added"] as const).map((origin) => (
        <View key={origin} style={{ gap: 16 }}>
          <ThemedText variant="headline">
            {t(origin === "named" ? "foodAiNamed" : "foodAiAdded")}
          </ThemedText>
          {items
            .slice(0, shown)
            .map(
              (item, i) =>
                item.origin === origin && (
                  <EstimateItem
                    key={i}
                    item={item}
                    onChange={(value) =>
                      setDraft((d) => d.map((v, j) => (i === j ? value : v)))
                    }
                  />
                ),
            )}
        </View>
      ))}
      {error && (
        <ThemedText accessibilityRole="alert">{t("foodFailure")}</ThemedText>
      )}
      <Button
        label={t("foodAiSave")}
        disabled={shown < items.length || draft.some((i) => i === null)}
        onPress={() => {
          try {
            onSave(draft as Estimate[]);
          } catch {
            setError(true);
          }
        }}
      />
    </View>
  );
}
