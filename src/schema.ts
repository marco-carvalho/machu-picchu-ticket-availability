import { z } from 'zod'

export const saleStatusSchema = z.enum(['sold out', 'selling', 'no sales'])

export const availabilitySchema = z.object({
  quota: z.number(),
  available: z.number(),
  sold: z.number(),
  status: saleStatusSchema,
})

// Zod rebuilds parsed objects following the order the keys are declared, and `.extend()`
// appends them, so the shape is spread in place to keep the label first in the JSON.
export const routeAvailabilitySchema = z.object({
  name: z.string(),
  ...availabilitySchema.shape,
})
export const datedAvailabilitySchema = z.object({
  date: z.string(),
  ...availabilitySchema.shape,
})
export const dateAvailabilitySchema = z.object({
  date: z.string(),
  ...availabilitySchema.shape,
  routes: z.array(routeAvailabilitySchema),
})
export const routeWindowSchema = z.object({
  name: z.string(),
  ...availabilitySchema.shape,
  dates: z.array(datedAvailabilitySchema),
})

export const inPersonChannelSchema = z.object({
  id: z.literal('in-person'),
  label: z.string(),
  point: z.number(),
  days: z.number(),
  dates: z.array(dateAvailabilitySchema),
})

export const onlineChannelSchema = z.object({
  id: z.literal('online'),
  label: z.string(),
  point: z.number(),
  datesPerRoute: z.number(),
  horizon: z.number(),
  scanned: z.number(),
  routes: z.array(routeWindowSchema),
})

export const snapshotSchema = z.object({
  utcTime: z.string(),
  channels: z.array(z.discriminatedUnion('id', [inPersonChannelSchema, onlineChannelSchema])),
})

export type SaleStatus = z.infer<typeof saleStatusSchema>
export type Availability = z.infer<typeof availabilitySchema>
export type RouteAvailability = z.infer<typeof routeAvailabilitySchema>
export type DatedAvailability = z.infer<typeof datedAvailabilitySchema>
export type DateAvailability = z.infer<typeof dateAvailabilitySchema>
export type RouteWindow = z.infer<typeof routeWindowSchema>
export type InPersonChannel = z.infer<typeof inPersonChannelSchema>
export type OnlineChannel = z.infer<typeof onlineChannelSchema>
export type Channel = z.infer<typeof snapshotSchema>['channels'][number]
export type ChannelId = Channel['id']
export type Snapshot = z.infer<typeof snapshotSchema>

export function statusOf(quota: number, available: number): SaleStatus {
  if (available === 0) return 'sold out'
  return quota === available ? 'no sales' : 'selling'
}

export function totalsOf(parts: Availability[]): Availability {
  const quota = parts.reduce((sum, part) => sum + part.quota, 0)
  const available = parts.reduce((sum, part) => sum + part.available, 0)
  return { quota, available, sold: quota - available, status: statusOf(quota, available) }
}
