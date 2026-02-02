import React from "react";
import TemplateBuilder from "@/components/sips/TemplateBuilder";
import { useAuth } from "@/components/auth/EmailGate";

export default function TemplateBuilderPage() {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';

  return (
    <div className="h-full overflow-auto">
      <TemplateBuilder isOpen={true} onClose={() => window.history.back()} isAdmin={isAdmin} />
    </div>
  );
}