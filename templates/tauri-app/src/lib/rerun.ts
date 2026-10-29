import { useAppStore } from "../stores/appStore";
import { useSampleStore } from "../stores/sampleStore";
import type { TabId } from "../types/__APP_ID__";

/** F5 / "Run again": what each module re-runs. */
const RERUN: Record<TabId, () => unknown> = {
  stats: () => useSampleStore.getState().run(),
};

export function runActiveModule() {
  void RERUN[useAppStore.getState().activeTab]?.();
}
