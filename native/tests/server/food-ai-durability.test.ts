import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Repository } from "../../src/data/repository";
import { localDatabase } from "./sqlite";
import {
  FoodAiService,
  aiState,
  setConsent,
  setThumbnails,
  logEstimates,
  yesterdayReview,
  dismissReview,
} from "../../src/features/food/ai/service";
import { totals } from "../../src/features/food/model";
const response = [
  {
    name: "Synthetic rice",
    energy_kj: 418.4,
    amount_g: 100,
    origin: "added",
    unsure: true,
  },
];
test("offline queue and quota survive loss of every handle, drain after disk reopen, no photo bytes in outbox", async () => {
  const folder = mkdtempSync(join(tmpdir(), "food-ai-")),
    path = join(folder, "synthetic.sqlite");
  try {
    const first = await localDatabase(path),
      owner = first.repo.owner,
      device = first.repo.device;
    const repo = new Repository(first.db, owner, device, randomUUID);
    setConsent(repo, true);
    new FoodAiService(repo).enqueue(
      { jpeg: "YWJj", thumbnail: "dGh1bWI=" },
      "2026-10-27",
      "fd000000-0000-4000-8000-000000000000",
    );
    expect(repo.pending()).toEqual([]);
    first.sqlite.close();
    const reopened = await localDatabase(path),
      restored = new Repository(reopened.db, owner, device, randomUUID);
    expect(aiState(restored).queue).toHaveLength(1);
    const other = new Repository(
      reopened.db,
      "synthetic-other",
      device,
      randomUUID,
    );
    expect(aiState(other).queue).toEqual([]);
    const client = jest.fn(async () => response);
    await new FoodAiService(restored, client, () => "2026-10-27").drain();
    expect(client).toHaveBeenCalledTimes(1);
    expect(aiState(restored).queue).toEqual([]);
    expect(aiState(restored).usage.photos).toBe(1);
    const job = aiState(restored).ready[0];
    logEstimates(restored, job.day, job.meal, job.items, job.id);
    expect(totals(restored.list("food_entries")).energy_kj).toBe(418.4);
    expect(yesterdayReview(restored, "2026-10-28")).toHaveLength(1);
    dismissReview(restored, "2026-10-28");
    expect(yesterdayReview(restored, "2026-10-28")).toEqual([]);
    expect(JSON.stringify(restored.pending())).not.toMatch(
      /YWJj|dGh1bWI|thumbnail|jpeg|foodAi/,
    );
    expect(Object.values(aiState(restored).entries)[0].thumbnail).toBe(
      "dGh1bWI=",
    );
    setThumbnails(restored, false);
    expect(JSON.stringify(aiState(restored))).not.toContain("dGh1bWI=");
    expect(restored.syncFlags.syncedV1Columns).toBe(false);
    reopened.sqlite.close();
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("an actual SIGKILL of a standalone queue writer retains the pending meal on disk", async () => {
  const folder = mkdtempSync(join(tmpdir(), "food-ai-kill-")),
    path = join(folder, "synthetic.sqlite");
  try {
    const child = spawnSync(
      process.execPath,
      [join(__dirname, "food-ai-kill.cjs"), path],
      { timeout: 20000 },
    );
    expect(child.signal).toBe("SIGKILL");
    const reopened = await localDatabase(path);
    expect(aiState(reopened.repo).queue).toHaveLength(1);
    const client = jest.fn(async () => response);
    await new FoodAiService(reopened.repo, client).drain();
    expect(client).toHaveBeenCalledTimes(1);
    expect(aiState(reopened.repo).queue).toEqual([]);
    reopened.sqlite.close();
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
