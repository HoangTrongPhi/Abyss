import { EmptyState, Segmented } from "@abyss/ui";
import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { AppCard } from "../components/AppCard";
import { SlotCard } from "../components/SlotCard";
import { useT } from "../i18n";
import { useAppViews, useFreeSlots, useUpdateCount, type AppView } from "../stores/launcherStore";
import { useUiStore, type AppFilter } from "../stores/uiStore";

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-[12px] font-semibold tracking-wide text-ink-muted uppercase">
        {title}
        {count !== undefined && <span className="font-normal text-ink-faint">{count}</span>}
      </h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-4">{children}</div>
    </section>
  );
}

function Hero({ installed, updates }: { installed: number; updates: number }) {
  const t = useT().apps;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-edge bg-panel px-6 py-5">
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{ background: "radial-gradient(ellipse 60% 120% at 85% 120%, rgba(94,234,212,0.18), transparent 60%), radial-gradient(ellipse 50% 90% at 100% 0%, rgba(59,130,246,0.16), transparent 60%)" }}
      />
      <div className="relative flex items-center gap-5">
        <img src="/abyss-icon.svg" alt="" className="size-14" draggable={false} />
        <div>
          <div className="text-[18px] font-semibold text-ink">Abyss</div>
          <div className="text-[12.5px] text-ink-muted">
            {t.installedCount(installed)} · {updates > 0 ? t.updatesWaiting(updates) : t.allCurrent}
          </div>
        </div>
      </div>
    </div>
  );
}

const matches = (v: AppView, q: string) => !q || [v.name, v.app?.tagline, v.app?.category].some((t) => t?.toLowerCase().includes(q));

export function AppsPage() {
  const t = useT().apps;
  const views = useAppViews();
  const freeSlots = useFreeSlots();
  const updates = useUpdateCount();
  const search = useUiStore((s) => s.search.trim().toLowerCase());
  const filter = useUiStore((s) => s.filter);
  const setFilter = useUiStore((s) => s.setFilter);

  const shown = views.filter((v) => matches(v, search));
  const installed = shown.filter((v) => v.status?.installed);
  const available = shown.filter((v) => !v.status?.installed && v.kind === "catalog" && v.app?.status !== "coming_soon");
  const soon = shown.filter((v) => v.app?.status === "coming_soon" || (v.kind === "local" && !v.status?.installed));
  const withUpdates = shown.filter((v) => v.latest?.updateAvailable);

  return (
    <div className="grid gap-7">
      <Hero installed={views.filter((v) => v.status?.installed).length} updates={updates} />
      <div className="-mb-2 flex items-center justify-between">
        <Segmented<AppFilter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: t.filterAll },
            { value: "installed", label: t.filterInstalled },
            { value: "updates", label: t.filterUpdates(updates) },
          ]}
        />
      </div>

      {filter === "updates" ? (
        withUpdates.length ? (
          <Section title={t.sectionUpdates} count={withUpdates.length}>
            {withUpdates.map((v) => <AppCard key={v.id} view={v} />)}
          </Section>
        ) : (
          <EmptyState icon={<Search className="size-4" />} title={t.noUpdates}>
            {t.noUpdatesHint}
          </EmptyState>
        )
      ) : (
        <>
          {installed.length > 0 && (
            <Section title={t.sectionInstalled} count={installed.length}>
              {installed.map((v) => <AppCard key={v.id} view={v} />)}
            </Section>
          )}
          {filter === "all" && available.length > 0 && (
            <Section title={t.sectionAvailable} count={available.length}>
              {available.map((v) => <AppCard key={v.id} view={v} />)}
            </Section>
          )}
          {filter === "all" && !search && (
            <Section title={t.sectionSoon}>
              {soon.map((v) => <AppCard key={v.id} view={v} />)}
              {Array.from({ length: freeSlots }, (_, i) => <SlotCard key={i} index={i + 1} />)}
            </Section>
          )}
          {search && !installed.length && !available.length && (
            <EmptyState icon={<Search className="size-4" />} title={t.noMatch(search)} />
          )}
        </>
      )}
    </div>
  );
}
