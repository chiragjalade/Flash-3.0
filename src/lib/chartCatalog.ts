import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

// The generative-UI catalog: the small set of components the AI (json-render) is
// allowed to emit. For now it is just a single `Chart` component — the model
// picks a `kind` and the renderer turns the JSON into a live Recharts chart.
export const chartCatalog = defineCatalog(schema, {
  components: {
    Chart: {
      props: z.object({
        kind: z.enum(["candlestick", "line", "bar"]),
        seed: z.number().nullable(),
        title: z.string().nullable(),
      }),
      description:
        "A financial chart rendered from data. `kind` selects candlestick, line, or bar.",
    },
  },
  actions: {},
});
