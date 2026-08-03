import { defineRegistry } from "@json-render/react";
import { chartCatalog } from "../lib/chartCatalog";
import Chart from "./Chart";

// Maps the catalog's component names to real React implementations. This is the
// "you control the rendering" half of json-render: the AI only chooses the
// structure/props, our own <Chart/> (Recharts) does the drawing.
export const { registry } = defineRegistry(chartCatalog, {
  components: {
    Chart: ({ props }) => <Chart type={props.kind} seed={props.seed ?? 7} />,
  },
});
