export function buildCustomerQuoteRows(estimate, pricing) {
  const sections = pricing?.sections || [];
  if (estimate?.hide_section_prices === true) {
    return [{
      key: "project-scope",
      name: "Project scope",
      category: "",
      quantity: "",
      description: estimate?.project_name || "",
      amount: Number(pricing?.subtotal || 0),
      bundled: true,
    }];
  }

  const rows = sections
    .filter((section) => section.include_in_customer !== false)
    .map((section, index) => ({
      key: section.line_id || section.project_id || `product-${index}`,
      name: section.client_product_name || section.project_name || section.product_category || `Product ${index + 1}`,
      category: section.product_category || "",
      quantity: section.quantity,
      description: section.customer_description || "",
      amount: Number(section.adjusted || 0),
      bundled: false,
    }));

  const bundledAmount = sections
    .filter((section) => section.include_in_customer === false)
    .reduce((sum, section) => sum + Number(section.adjusted || 0), 0);

  if (Math.abs(bundledAmount) > 0.005) {
    rows.push({
      key: "additional-project-scope",
      name: "Additional project scope",
      category: "",
      quantity: "",
      description: "Bundled scope included in project pricing.",
      amount: bundledAmount,
      bundled: true,
    });
  }

  return rows;
}

export function quoteRowsTotal(rows) {
  return (rows || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
}
