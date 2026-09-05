import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { generateDocNumber } from "@/functions/generateDocNumber";
import { ensureNewEstimate, newEstimateCreationKey } from "./estimateCreationService";
import { loadAllCustomers, upsertCustomerFromEstimate } from "./customerSync";

export default function NewEstimateDialog({ open, onClose, onCreated }) {
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const createAttemptRef = useRef({ signature: "", key: "", estimateNumber: "" });

  useEffect(() => {
    if (!open) return;
    setError("");
    createAttemptRef.current = { signature: "", key: "", estimateNumber: "" };
    loadAllCustomers().then((res) => setCustomers(res || [])).catch((err) => setError(err?.message || "Customers could not be loaded."));
  }, [open]);

  const handleCreate = async () => {
    setError("");
    const selected = customers.find((c) => c.id === customerId);
    const clientName = selected ? selected.company_name : newClientName.trim();
    if (!projectName.trim() || !clientName) {
      setError("Enter an estimate description and pick or type a client.");
      return;
    }
    setSaving(true);
    try {
      const signature = JSON.stringify([projectName.trim(), selected?.id || "", clientName]);
      if (createAttemptRef.current.signature !== signature) {
        createAttemptRef.current = {
          signature,
          key: newEstimateCreationKey(),
          estimateNumber: "",
        };
      }

      const customer = await upsertCustomerFromEstimate(
        { client_name: clientName, customer_id: selected?.id || "" },
        customers
      );

      if (!createAttemptRef.current.estimateNumber) {
        const res = await generateDocNumber({ doc_type: "estimate" });
        createAttemptRef.current.estimateNumber = String(res?.data?.number || "").trim();
      }

      const estimate = await ensureNewEstimate({
        creationKey: createAttemptRef.current.key,
        estimate: {
          project_name: projectName.trim(),
          client_name: clientName,
          customer_id: customer?.id || null,
          estimate_number: createAttemptRef.current.estimateNumber,
          status: "draft",
        },
      });
      setProjectName("");
      setNewClientName("");
      setCustomerId("");
      createAttemptRef.current = { signature: "", key: "", estimateNumber: "" };
      onCreated(estimate);
    } catch (e) {
      setError(e.message || "Could not create the estimate.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Estimate</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="est-desc">Estimate description</Label>
            <Input
              id="est-desc"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g. Pylon sign rebrand"
            />
          </div>

          <div>
            <Label htmlFor="est-client">Existing client</Label>
            <select
              id="est-client"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="">— New client —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name}
                </option>
              ))}
            </select>
          </div>

          {!customerId && (
            <div>
              <Label htmlFor="est-new-client">New client name</Label>
              <Input
                id="est-new-client"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="Company name"
              />
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">
            {saving ? "Creating…" : "Create Estimate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}