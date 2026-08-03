import { useMemo } from "react";
import { JSONUIProvider, Renderer } from "@json-render/react";
import { registry } from "./chartRegistry";
import type { ChartType } from "./Chart";

// Renders a single chart the generative-UI way: we build the exact JSON spec an
// LLM (json-render) would stream — `{ root, elements }` referencing the catalog —
// and hand it to <Renderer/>, which resolves it against the registry into a live
// Recharts chart. So the chart is genuinely produced by the json-render pipeline,
// not hand-mounted.
type Spec = React.ComponentProps<typeof Renderer>["spec"];

export default function GenerativeChart({
  kind,
  seed,
}: {
  kind: ChartType;
  seed: number;
}) {
  const spec = useMemo(
    () =>
      ({
        root: "chart",
        elements: {
          chart: {
            type: "Chart",
            props: { kind, seed, title: null },
            children: [],
          },
        },
      }) as Spec,
    [kind, seed],
  );

  return (
    <JSONUIProvider registry={registry}>
      <Renderer spec={spec} registry={registry} />
    </JSONUIProvider>
  );
}
