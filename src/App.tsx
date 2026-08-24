import { useEffect, useMemo, useRef, useState } from 'react'
import {
  snapshotSchema,
  type Availability,
  type Channel,
  type ChannelId,
  type DateAvailability,
  type RouteWindow,
  type SaleStatus,
  type Snapshot,
} from './schema.ts'

const RELOAD_MS = 60_000

const peruTimestampFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Lima',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function formatTimestamp(value: string) {
  const parts = Object.fromEntries(
    peruTimestampFormatter.formatToParts(new Date(value)).map((part) => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`
}

function describeChannel(channel: Channel) {
  if (channel.id === 'in-person') {
    const selling = channel.dates.filter((entry) => entry.status === 'selling')
    if (selling.length === 0) {
      return { headline: 'no open sales', detail: 'No date has open sales in this window.' }
    }
    const closest = selling[0]
    return {
      headline: `${selling.length} of ${channel.dates.length} dates with tickets`,
      detail:
        `${selling.length} of ${channel.dates.length} dates with tickets, the closest one ` +
        `${closest.date} with ${closest.available} of ${closest.quota} available.`,
    }
  }

  const open = channel.routes.filter((route) => route.dates.length > 0)
  if (open.length === 0) {
    return {
      headline: 'no open sales',
      detail: `No route has tickets in the next ${channel.scanned} dates.`,
    }
  }
  const closest = open.map((route) => route.dates[0].date).sort()[0]
  return {
    headline: `${open.length} of ${channel.routes.length} routes with tickets`,
    detail:
      `${open.length} of ${channel.routes.length} routes with tickets in the next ` +
      `${channel.scanned} dates, the closest one ${closest}.`,
  }
}

function isSnapshot(value: unknown): value is Snapshot {
  return snapshotSchema.safeParse(value).success
}

const statusStyles: Record<SaleStatus, { label: string; className: string }> = {
  'sold out': { label: 'Sold out', className: 'bg-red-500/15 text-red-300' },
  selling: { label: 'Selling', className: 'bg-amber-500/15 text-amber-300' },
  'no sales': { label: 'No sales', className: 'bg-slate-800 text-slate-300' },
}

function StatusBadge({ status, className = '' }: { status: SaleStatus; className?: string }) {
  const style = statusStyles[status]
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 font-semibold ${style.className} ${className}`}
    >
      {style.label}
    </span>
  )
}

function TicketBar({ sold, available }: Pick<Availability, 'sold' | 'available'>) {
  const total = sold + available
  return (
    <div
      className="flex h-2 overflow-hidden rounded-full bg-slate-800"
      role="img"
      aria-label={`${sold} tickets sold and ${available} tickets available`}
    >
      {sold > 0 && total > 0 && (
        <span className="bg-red-500" style={{ width: `${(sold / total) * 100}%` }} />
      )}
      {available > 0 && total > 0 && (
        <span className="bg-green-500" style={{ width: `${(available / total) * 100}%` }} />
      )}
    </div>
  )
}

function TicketCounts({ entry, className = '' }: { entry: Availability; className?: string }) {
  return (
    <span className={`shrink-0 whitespace-nowrap tabular-nums text-slate-300 ${className}`}>
      {entry.available}/{entry.quota}
      <span className="hidden @md:inline"> available, {entry.sold} sold</span>
    </span>
  )
}

function DetailRow({ label, entry }: { label: string; entry: Availability }) {
  return (
    <li className="flex h-5 items-center gap-2 text-sm @md:gap-3">
      <span className="min-w-0 flex-1 truncate" title={label}>
        {label}
      </span>
      <span className="hidden w-20 shrink-0 justify-end @md:flex">
        <StatusBadge status={entry.status} className="text-xs" />
      </span>
      <span className="hidden w-16 shrink-0 @xs:block @md:w-28">
        <TicketBar sold={entry.sold} available={entry.available} />
      </span>
      <TicketCounts entry={entry} className="text-right @md:w-48" />
    </li>
  )
}

interface CardProps {
  title: string
  totals: Availability
  rows: React.ReactNode[]
  rowCount: number
  emptyLabel?: string
}

function AvailabilityCard({ title, totals, rows, rowCount, emptyLabel }: CardProps) {
  return (
    <section className="@container rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex h-6 items-center gap-x-2 @md:gap-x-3">
        <h3 className="m-0 min-w-0 truncate text-base font-bold" title={title}>
          {title}
        </h3>
        <StatusBadge status={totals.status} className="text-xs" />
        {totals.quota > 0 && <TicketCounts entry={totals} className="ml-auto text-sm" />}
      </div>
      <div className="mt-3">
        <TicketBar sold={totals.sold} available={totals.available} />
      </div>
      <ul className="m-0 mt-4 flex list-none flex-col gap-2 border-t border-slate-800 p-0 pt-3">
        {rows.length === 0 && emptyLabel ? (
          <li className="flex h-5 items-center text-sm text-slate-500">{emptyLabel}</li>
        ) : (
          rows
        )}
        {Array.from({ length: Math.max(0, rowCount - Math.max(rows.length, 1)) }, (_, index) => (
          <li key={`spacer-${index}`} className="h-5" aria-hidden="true" />
        ))}
      </ul>
    </section>
  )
}

function SkeletonCard({ rowCount }: { rowCount: number }) {
  return (
    <section className="@container rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex h-6 items-center gap-x-2">
        <span className="h-4 w-24 animate-pulse rounded bg-slate-800" />
        <span className="ml-auto h-4 w-16 animate-pulse rounded bg-slate-800" />
      </div>
      <div className="mt-3 h-2 animate-pulse rounded-full bg-slate-900" />
      <div className="mt-4 flex flex-col gap-2 border-t border-slate-800 pt-3">
        {Array.from({ length: rowCount }, (_, index) => (
          <span key={index} className="h-5 animate-pulse rounded bg-slate-900" />
        ))}
      </div>
    </section>
  )
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div>
}

function LoadingGrid({ cards, rows }: { cards: number; rows: number }) {
  return (
    <CardGrid>
      {Array.from({ length: cards }, (_, index) => (
        <SkeletonCard key={index} rowCount={rows} />
      ))}
    </CardGrid>
  )
}

function DateCards({ dates }: { dates: DateAvailability[] }) {
  return (
    <CardGrid>
      {dates.map((entry) => (
        <AvailabilityCard
          key={entry.date}
          title={entry.date}
          totals={entry}
          rows={entry.routes.map((route) => (
            <DetailRow key={route.name} label={route.name} entry={route} />
          ))}
          rowCount={6}
        />
      ))}
    </CardGrid>
  )
}

function RouteCards({ routes, scanned }: { routes: RouteWindow[]; scanned: number }) {
  return (
    <CardGrid>
      {routes.map((route) => (
        <AvailabilityCard
          key={route.name}
          title={route.name}
          totals={route}
          rows={route.dates.map((entry) => (
            <DetailRow key={entry.date} label={entry.date} entry={entry} />
          ))}
          rowCount={6}
          emptyLabel={`No tickets in the next ${scanned} dates.`}
        />
      ))}
    </CardGrid>
  )
}

function ChannelPanel({ channel }: { channel: Channel }) {
  const description = describeChannel(channel)
  return (
    <>
      <div className="mb-3 flex min-h-10 items-start gap-2 text-sm text-slate-400 sm:min-h-5 sm:items-center">
        <span className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-300">
          punto {channel.point}
        </span>
        <p className="m-0">{description.detail}</p>
      </div>
      {channel.id === 'in-person' ? (
        <DateCards dates={channel.dates} />
      ) : (
        <RouteCards routes={channel.routes} scanned={channel.scanned} />
      )}
    </>
  )
}

function initialTab(): ChannelId {
  return location.hash === '#online' ? 'online' : 'in-person'
}

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState(false)
  const [activeTab, setActiveTab] = useState<ChannelId>(initialTab)
  const openedAt = useRef<number | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${import.meta.env.BASE_URL}index.json`, { cache: 'no-store', signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json() as Promise<unknown>
      })
      .then((value) => {
        if (!isSnapshot(value)) throw new Error('The snapshot must contain a channels array')
        setSnapshot(value)
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return
        console.error(loadError)
        setError(true)
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    openedAt.current = Date.now()
    function reloadWhenStale() {
      if (
        openedAt.current !== null &&
        document.visibilityState === 'visible' &&
        Date.now() - openedAt.current >= RELOAD_MS
      ) {
        location.reload()
      }
    }
    const interval = window.setInterval(reloadWhenStale, RELOAD_MS)
    document.addEventListener('visibilitychange', reloadWhenStale)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', reloadWhenStale)
    }
  }, [])

  const channels = useMemo(
    () =>
      snapshot?.channels.filter((channel) =>
        channel.id === 'in-person' ? channel.dates.length > 0 : channel.routes.length > 0,
      ) ?? [],
    [snapshot],
  )
  const visibleIds = channels.map((channel) => channel.id)
  const selectedId = visibleIds.includes(activeTab) ? activeTab : visibleIds[0] ?? activeTab
  const selectedChannel = channels.find((channel) => channel.id === selectedId)

  function activate(id: ChannelId) {
    setActiveTab(id)
    history.replaceState(null, '', `#${id}`)
  }

  function moveTab(event: React.KeyboardEvent<HTMLButtonElement>, id: ChannelId) {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key]
    if (step === undefined) return
    event.preventDefault()
    const current = visibleIds.indexOf(id)
    const next = visibleIds[(current + step + visibleIds.length) % visibleIds.length]
    activate(next)
    document.getElementById(`tab-${next}`)?.focus()
  }

  const summary = channels
    .map((channel) => `${channel.label}: ${describeChannel(channel).headline}.`)
    .join(' ')

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto w-full max-w-7xl p-6">
        <header>
          <h1 className="mb-1.5 text-2xl font-bold">Sale window</h1>
          <p className="m-0 min-h-18 text-slate-400 sm:min-h-12 lg:min-h-6">{summary}</p>
          <p className="m-0 mt-0.5 min-h-5 text-sm text-slate-500">
            {snapshot && `Snapshot from ${formatTimestamp(snapshot.utcTime)} Peru time`}
          </p>
        </header>

        {!error && channels.length > 0 && (
          <div
            role="tablist"
            aria-label="Sale channels"
            className="mt-6 flex gap-1 border-b border-slate-800"
          >
            {channels.map((channel) => (
              <button
                key={channel.id}
                type="button"
                role="tab"
                id={`tab-${channel.id}`}
                aria-controls={channel.id}
                aria-selected={selectedId === channel.id}
                tabIndex={selectedId === channel.id ? 0 : -1}
                onClick={() => activate(channel.id)}
                onKeyDown={(event) => moveTab(event, channel.id)}
                className="-mb-px cursor-pointer border-b-2 border-transparent px-3 py-2 text-sm font-semibold text-slate-400 hover:text-slate-200 aria-selected:border-slate-100 aria-selected:text-slate-100"
              >
                {channel.label}
              </button>
            ))}
          </div>
        )}

        <section
          id={selectedId}
          role="tabpanel"
          aria-labelledby={`tab-${selectedId}`}
          className="mt-4"
        >
          {error ? (
            <p className="py-20 text-center text-slate-400">
              Could not load the ticket sale window.
            </p>
          ) : selectedChannel ? (
            <ChannelPanel channel={selectedChannel} />
          ) : snapshot ? (
            <p className="py-20 text-center text-slate-400">
              There are no observations in the snapshot yet.
            </p>
          ) : (
            <>
              <div className="mb-3 min-h-10 sm:min-h-5" />
              <LoadingGrid cards={activeTab === 'in-person' ? 6 : 10} rows={6} />
            </>
          )}
        </section>

        <div className="mt-4 flex flex-wrap gap-5 text-sm">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
            Tickets sold
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
            Tickets available
          </span>
        </div>
      </main>

      <footer className="px-6 pb-6 text-center text-xs text-slate-400">
        <a
          className="hover:text-slate-200"
          href="https://marco-carvalho.github.io/machu-picchu-ticket-availability/"
        >
          marco-carvalho.github.io/machu-picchu-ticket-availability
        </a>
      </footer>
    </div>
  )
}
