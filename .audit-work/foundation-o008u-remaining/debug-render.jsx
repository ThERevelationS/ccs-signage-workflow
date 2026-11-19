import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import InventoryTable from "./testtree/src/components/masterInventory/InventoryTable.jsx";

const laborSource = {
  key: "labor_services", label: "Labor & Services", nameField: "service_name",
  fields: [
    { name: "service_name", label: "Name", type: "text", required: true, table: true },
    { name: "default_rate", label: "Rate", type: "number", required: true, table: true },
    { name: "vendor_name", label: "Vendor", type: "text", table: true },
  ],
};
const html = renderToStaticMarkup(h(InventoryTable, {
  source: laborSource, canEdit: true,
  items: [
    { id: "L1", service_name: "Citywide 3500", default_rate: 155, vendor_name: "Citywide" },
    { id: "L2", service_name: "Citywide SL", default_rate: 0, vendor_name: " citywide " },
  ],
}));
console.log(html);
