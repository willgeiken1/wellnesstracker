jest.mock("expo-router", () => ({router:{canDismiss:()=>false,replace:jest.fn()}}));
import * as ReactNative from "react-native";
import { render, screen, within } from "@testing-library/react-native";
import { ThemeProvider } from "../src/design/theme-provider";
import { createTheme } from "../src/design/tokens";
import { SetRow } from "../src/features/workout/set-row";
import { SyncBadge } from "../src/features/workout/badge";
import { Keypad } from "../src/features/workout/keypad";
import { WorkoutStore } from "../src/data/workout/store";
import { memoryRepository } from "./workout-repository";
import { createLoggerFixture } from "../src/features/workout/devFixture";
import { WorkoutSummary } from "../src/features/workout/summary";
import { Pill } from "../src/features/workout/primitives";

test.each(["dark", "light"] as const)(
  "demo defaults to %s system appearance and uses semantic fills",
  async (mode) => {
    const scheme = jest
      .spyOn(ReactNative, "useColorScheme")
      .mockReturnValue(mode);
    const c = createTheme(mode, "sea");
    try {
      await render(
        <ThemeProvider>
          <SetRow
            exercise="Synthetic bench"
            index={0}
            draft={{ weight: "185", reps: "8", setId: "synthetic" }}
            previous="185 × 8"
            hint="190"
            onEdit={() => {}}
            onDone={() => {}}
            onRemove={() => {}}
          />
          <SyncBadge local pending={0} status="offline" />
          <Pill testID="finish" label="Finish" compact onPress={() => {}} />
        </ThemeProvider>,
      );
      expect(screen.getByTestId("finish")).toHaveStyle({
        backgroundColor: c.accent,
        borderRadius: 99,
        minHeight: 33,
      });
      expect(screen.getByTestId("set-row-0-0")).toHaveStyle({
        backgroundColor: c["accent-tint"],
      });
      expect(screen.getByTestId("set-0-0-done")).toHaveStyle({
        backgroundColor: c.accent,
      });
      expect(screen.getByTestId("set-0-0-done").queryAll(node => node.type === "RNSVGPath")[0].props.stroke).toEqual({type:0,payload:ReactNative.processColor(c["on-accent"])});
      expect(screen.getByTestId("sync-chip")).toHaveStyle({
        backgroundColor: c["surface-2"],
      });
    } finally {
      scheme.mockRestore();
    }
  },
);
test.each(["dark", "light"] as const)(
  "keypad uses %s sheet and accent action tokens",
  async (mode) => {
    const scheme = jest
      .spyOn(ReactNative, "useColorScheme")
      .mockReturnValue(mode);
    const c = createTheme(mode, "sea");
    try {
      await render(
        <ThemeProvider>
          <Keypad
            label="Bench Press · Set 3 · Weight"
            field="weight"
            equipment="barbell"
            unit="lb"
            value="190"
            previous="185 × 7"
            onChange={() => {}}
            onNext={() => {}}
            onClose={() => {}}
          />
        </ThemeProvider>,
      );
      expect(screen.getByTestId("keypad-sheet")).toHaveStyle({
        backgroundColor: c.surface,
      });
      expect(screen.getByTestId("keypad-next")).toHaveStyle({
        backgroundColor: c.accent,
      });
    } finally {
      scheme.mockRestore();
    }
  },
);


test.each(["dark", "light"] as const)("summary uses %s card and action tokens", async (mode) => {
 const scheme=jest.spyOn(ReactNative,"useColorScheme").mockReturnValue(mode);
 try {
  const store=new WorkoutStore(memoryRepository());
  const fixture=createLoggerFixture(store,{isDev:true,demo:true,signedIn:false},"summary")!;
  const c=createTheme(mode,"sea");
  await render(<ThemeProvider><WorkoutSummary store={store} id={fixture.sessionId}/></ThemeProvider>);
  for (const id of ["summary-stats","summary-pr","summary-shelf"]) expect(screen.getByTestId(id)).toHaveStyle({backgroundColor:c.surface});
  expect(screen.getByTestId("summary-done")).toHaveStyle({backgroundColor:c.accent});
  expect(within(screen.getByTestId("summary-done")).getByText("Done")).toHaveStyle({color:c["on-accent"]});
  expect(screen.getByText("7 tokens ›")).toBeTruthy();
  expect(screen.queryByText("AI summary")).toBeNull();
 } finally {scheme.mockRestore();}
});


test.each(['dark','light'] as const)('older shelf tokens are desaturated in %s while the newest keeps its accent',async(mode)=>{
 const scheme=jest.spyOn(ReactNative,'useColorScheme').mockReturnValue(mode);
 try {
  const store=new WorkoutStore(memoryRepository());
  const fixture=createLoggerFixture(store,{isDev:true,demo:true,signedIn:false},'summary')!;
  await render(<ThemeProvider><WorkoutSummary store={store} id={fixture.sessionId}/></ThemeProvider>);
  const old=screen.getAllByTestId('summit-token-muted');
  expect(old).toHaveLength(4);
  for(const token of old){
   const gradients=token.queryAll(n=>n.type==='RNSVGRadialGradient'||n.type==='RNSVGLinearGradient');
   expect(gradients).toHaveLength(3);
   const colors=gradients.flatMap(n=>n.props.gradient);
   expect(colors).not.toContain((ReactNative.processColor(createTheme(mode,'sea').accent) as number) | 0);
   expect(colors).toContain((ReactNative.processColor(createTheme(mode,'sea')['token-muted']) as number) | 0);
  }
  expect(screen.getAllByTestId('summit-token-new')).toHaveLength(1);
  const newest=screen.getByTestId('summit-token-new').queryAll(n=>n.type==='RNSVGRadialGradient'||n.type==='RNSVGLinearGradient').flatMap(n=>n.props.gradient);
  expect(newest).toContain((ReactNative.processColor(createTheme(mode,'sea').accent) as number) | 0);
 } finally {scheme.mockRestore();}
});
