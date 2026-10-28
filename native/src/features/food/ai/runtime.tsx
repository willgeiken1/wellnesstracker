import {
  createContext,
  useContext,
  useEffect,
  type PropsWithChildren,
} from "react";
import { AppState } from "react-native";
import * as Network from "expo-network";
import type { Repository } from "../../../data/repository";
import {
  FoodAiService,
  stopFoodAiRequests,
  type FoodAiClient,
} from "./service";
// The configured client can only use the existing loopback endpoint. CI injects stubs.
import { localFoodAiClient } from "./client";
export const FoodAiClientContext = createContext<FoodAiClient | null>(
  localFoodAiClient,
);
export function FoodAiClientProvider({
  client,
  children,
}: PropsWithChildren<{ client: FoodAiClient }>) {
  return (
    <FoodAiClientContext.Provider value={client}>
      {children}
    </FoodAiClientContext.Provider>
  );
}
export function useFoodAiClient() {
  return useContext(FoodAiClientContext);
}
export async function drainIfOnline(service: FoodAiService) {
  const state = await Network.getNetworkStateAsync();
  if (state.isConnected && state.isInternetReachable !== false)
    await service.drain();
}
export function FoodAiRuntime({ repo }: { repo: Repository | null }) {
  const client = useFoodAiClient();
  useEffect(() => {
    if (!repo || !client) return;
    const service = new FoodAiService(repo, client);
    let mounted = true;
    const drain = () => {
      if (mounted)
        void Network.getNetworkStateAsync()
          .then((state) => {
            if (
              mounted &&
              state.isConnected &&
              state.isInternetReachable !== false
            )
              return service.drain();
          })
          .catch(() => {});
    };
    drain();
    const network = Network.addNetworkStateListener((s) => {
      if (s.isConnected && s.isInternetReachable !== false) drain();
    });
    const app = AppState.addEventListener("change", (s) => {
      if (s === "active") drain();
    });
    return () => {
      mounted = false;
      stopFoodAiRequests(repo);
      network.remove();
      app.remove();
    };
  }, [repo, client]);
  return null;
}
