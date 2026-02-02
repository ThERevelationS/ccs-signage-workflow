import React from "react";
import TemplateBuilder from "@/components/sips/TemplateBuilder";

export default function TemplateBuilderPage() {
  return (
    <div className="h-full overflow-auto">
      <TemplateBuilder isOpen={true} onClose={() => window.history.back()} />
    </div>
  );
}