
const icon = (name) => (props) => ({ type: "icon", props: { ...(props || {}), icon: name } });
export const Move = icon("Move"), ZoomIn = icon("ZoomIn"), ZoomOut = icon("ZoomOut");
