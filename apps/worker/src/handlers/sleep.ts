import type { JobHandler } from "../runner";

/** Operations smoke job: waits `ms` (default 1000) in `steps` equal steps. */
export const sleepHandler: JobHandler<{ ms?: number; steps?: number }> = {
  async run(ctx) {
    const steps = Math.max(1, ctx.payload.steps ?? 1);
    const each = (ctx.payload.ms ?? 1000) / steps;
    for (let i = 1; i <= steps; i++) {
      await ctx.step(
        `sleep ${i}/${steps}`,
        () => new Promise((resolve) => setTimeout(resolve, each)),
      );
    }
  },
};
