import { adminProcedure, createTRPCRouter } from '@/lib/trpc/init';
import { KiloClawInternalClient } from '@/lib/kiloclaw/kiloclaw-internal-client';
import * as z from 'zod';

const UpdateRegionsSchema = z.object({
  regions: z.array(z.string().min(1)).min(2, 'At least 2 regions required'),
});

export const adminKiloclawRegionsRouter = createTRPCRouter({
  getRegions: adminProcedure.query(async () => {
    const client = new KiloClawInternalClient();
    return client.getRegions();
  }),

  updateRegions: adminProcedure
    .input(UpdateRegionsSchema)
    .mutation(async ({ input }) => {
      const client = new KiloClawInternalClient();
      return client.updateRegions(input.regions);
    }),
});
