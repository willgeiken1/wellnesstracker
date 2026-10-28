import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type PropsWithChildren,
} from "react";
import { AppState } from "react-native";
import * as Network from "expo-network";
import type { Repository } from "../../../data/repository";
import {
  FoodAiService,
  expireFoodAiPhotos,
  stopFoodAiRequests,
  type FoodAiClient,
} from "./service";
// The configured client can only use the existing loopback endpoint. CI injects stubs.
import { createLocalFoodAiClient } from "./client";
export const FoodAiClientContext = createContext<FoodAiClient | null>(
  null,
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
export function useFoodAiClient(repo: Repository | null) {
  const injected = useContext(FoodAiClientContext);
  return useMemo(() => injected ?? (repo ? createLocalFoodAiClient(repo) : null), [injected, repo]);
}
export async function drainIfOnline(service: FoodAiService) {
  const state = await Network.getNetworkStateAsync();
  if (state.isConnected && state.isInternetReachable !== false)
    await service.drain();
}
export function FoodAiRuntime({ repo }: { repo: Repository | null }) {
  const client = useFoodAiClient(repo);
  useEffect(() => {
    if (!repo) return;
    const service = new FoodAiService(repo, client);
    let mounted = true;
    const drain = () => {
      if (!mounted) return;
      expireFoodAiPhotos(repo);
      if (client)
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
    const retry = setInterval(drain, 30000);
    const network = Network.addNetworkStateListener((s) => {
      if (s.isConnected && s.isInternetReachable !== false) drain();
    });
    const app = AppState.addEventListener("change", (s) => {
      if (s === "active") drain();
    });
    return () => {
      mounted = false;
      clearInterval(retry);
      stopFoodAiRequests(repo);
      network.remove();
      app.remove();
    };
  }, [repo, client]);
  return null;
}
