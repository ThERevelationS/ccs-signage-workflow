
const stub = (name) => {
  const fn = (props) => ({ type: "ui", props: { ...(props || {}), uiComponent: name } });
  return fn;
};
export const Input = stub("Input"), Button = stub("Button"), Label = stub("Label"), Badge = stub("Badge");
export const Tabs = stub("Tabs"), TabsContent = stub("TabsContent"), TabsList = stub("TabsList"), TabsTrigger = stub("TabsTrigger");
export const Select = stub("Select"), SelectContent = stub("SelectContent"), SelectItem = stub("SelectItem"), SelectTrigger = stub("SelectTrigger"), SelectValue = stub("SelectValue");
export const Card = stub("Card"), CardContent = stub("CardContent"), CardHeader = stub("CardHeader"), CardTitle = stub("CardTitle");
export const Dialog = stub("Dialog"), DialogContent = stub("DialogContent"), DialogHeader = stub("DialogHeader"), DialogTitle = stub("DialogTitle"), DialogDescription = stub("DialogDescription");
export const Switch = stub("Switch"), Checkbox = stub("Checkbox"), Textarea = stub("Textarea");
