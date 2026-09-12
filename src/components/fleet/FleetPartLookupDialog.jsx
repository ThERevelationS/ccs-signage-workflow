import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Barcode,
  Camera,
  Check,
  CheckCircle2,
  ImagePlus,
  Loader2,
  Package,
  Search,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";

const emptyCandidate = () => ({
  part_name: "",
  part_number: "",
  alternate_part_numbers: [],
  barcode_value: "",
  category: "other",
  subcategory: "",
  manufacturer: "",
  description: "",
  specification: "",
  preferred_vendor: "",
  vendor_sku: "",
  vendor_url: "",
  source_urls: [],
  identification_confidence: "",
  identification_notes: "",
  compatible_equipment_ids: [],
  compatibility_notes: "",
  quantity_on_hand: 1,
  minimum_stock: 1,
  unit_cost: "",
  location: "",
  storage_zone: "",
  storage_cabinet: "",
  storage_shelf: "",
  storage_bin: "",
  enable_low_stock_alerts: true,
});

/** @type {Array<{key:string, label:string, icon:any}>} */
const LOOKUP_MODES = [
  { key: "part_number", label: "Part #", icon: Search },
  { key: "photo", label: "Photo", icon: Camera },
  { key: "barcode", label: "Barcode", icon: Barcode },
  { key: "combined", label: "Combine", icon: Sparkles },
];

const confidenceStyle = {
  high: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  medium: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  low: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900",
};

export default function FleetPartLookupDialog({ open, equipment = [], parts = [], isAdmin = false, initialEquipmentId = "", organizeMode = false, onClose, onChanged }) {
  const [step, setStep] = useState("identify");
  const [sessionKey, setSessionKey] = useState("");
  const [identification, setIdentification] = useState(null);
  const [searchMode, setSearchMode] = useState("part_number");
  const [query, setQuery] = useState("");
  const [barcodeValue, setBarcodeValue] = useState("");
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploadedUrl, setUploadedUrl] = useState("");
  const [candidate, setCandidate] = useState(emptyCandidate());
  const [aiResult, setAiResult] = useState(null);
  const [duplicateIds, setDuplicateIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    const key = `partlookup-${crypto.randomUUID()}`;
    setStep("identify");
    setSessionKey(key);
    setIdentification(null);
    setSearchMode(organizeMode ? "combined" : "part_number");
    setQuery("");
    setBarcodeValue("");
    setFile(null);
    setPreviewUrl("");
    setUploadedUrl("");
    setCandidate({ ...emptyCandidate(), compatible_equipment_ids: initialEquipmentId ? [initialEquipmentId] : [] });
    setAiResult(null);
    setDuplicateIds([]);
    setBusy(false);
    setError("");
    setSavedMessage("");
  }, [open, initialEquipmentId, organizeMode]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const duplicates = useMemo(() => duplicateIds.map(id => parts.find(part => part.id === id)).filter(Boolean), [duplicateIds, parts]);
  const activeEquipment = useMemo(() => equipment.filter(item => item.status !== "retired"), [equipment]);

  if (!open) return null;

  const chooseFile = async (selected) => {
    if (!selected) return;
    if (!selected.type?.startsWith("image/")) return setError("Choose a photo file for visual part identification.");
    if (selected.size > 15 * 1024 * 1024) return setError("Part photos must be 15 MB or smaller.");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
    setUploadedUrl("");
    setError("");
    setSearchMode(current => current === "part_number" && !query.trim() ? "photo" : "combined");
    try {
      if (typeof window !== "undefined" && "BarcodeDetector" in window) {
        const Detector = /** @type {any} */ (window.BarcodeDetector);
        const detector = new Detector({ formats: ["code_128","code_39","ean_13","ean_8","upc_a","upc_e","qr_code","data_matrix"] });
        const bitmap = await createImageBitmap(selected);
        const found = await detector.detect(bitmap);
        bitmap.close?.();
        const raw = String(found?.[0]?.rawValue || "").trim();
        if (raw) { setBarcodeValue(raw); setSearchMode("combined"); }
      }
    } catch {
      // Barcode detection is a convenience only; AI still receives the photo.
    }
  };

  const analyze = async () => {
    if (!query.trim() && !barcodeValue.trim() && !file) return setError("Enter a part number/description, scan a barcode, or add a photo first.");
    setBusy(true);
    setError("");
    setSavedMessage("");
    try {
      let photoUrl = uploadedUrl;
      if (file && !photoUrl) {
        const upload = await base44.integrations.Core.UploadFile({ file });
        if (!upload?.file_url) throw new Error("Part photo upload failed.");
        photoUrl = upload.file_url;
        setUploadedUrl(photoUrl);
      }
      const equipmentContext = activeEquipment.slice(0, 100).map(item => ({ id: item.id, name: item.name, type: item.type, year: item.year, make: item.make, model: item.model, vin: item.vin || "", engine_details: item.engine_details || "" }));
      const inventoryContext = parts.slice(0, 250).map(item => ({ id: item.id, name: item.part_name, part_number: item.part_number || "", alternate_part_numbers: item.alternate_part_numbers || [], barcode: item.barcode_value || "", manufacturer: item.manufacturer || "", category: item.category || "" }));
      const equipmentIds = activeEquipment.map(item => item.id);
      const responseSchema = {
        type: "object",
        properties: {
          detected_text: { type: "string" },
          part_name: { type: "string" },
          part_number: { type: "string" },
          alternate_part_numbers: { type: "array", items: { type: "string" } },
          barcode_value: { type: "string" },
          category: { type: "string" },
          subcategory: { type: "string" },
          manufacturer: { type: "string" },
          description: { type: "string" },
          specification: { type: "string" },
          preferred_vendor: { type: "string" },
          vendor_sku: { type: "string" },
          vendor_url: { type: "string" },
          source_urls: { type: "array", items: { type: "string" } },
          suggested_equipment_ids: { type: "array", items: equipmentIds.length ? { type: "string", enum: equipmentIds } : { type: "string" } },
          compatibility_notes: { type: "string" },
          confidence: { type: "string", enum: ["low","medium","high"] },
          reasoning: { type: "string" },
          verification_notes: { type: "string" },
        },
        required: ["part_name","part_number","category","manufacturer","description","confidence","reasoning","verification_notes","suggested_equipment_ids"],
      };
      const prompt = `You are the review-only CCS Fleet Part Identifier. Identify the physical fleet-maintenance part from the supplied number, barcode, text and/or photo. Internet research is enabled.\n\nUser text/part number: ${query.trim() || "(none)"}\nBarcode detected/entered: ${barcodeValue.trim() || "(none)"}\n\nCurrent active Fleet equipment (ONLY suggest ids from this exact list, and only when fitment is supported): ${JSON.stringify(equipmentContext)}\n\nExisting Fleet parts for duplicate awareness: ${JSON.stringify(inventoryContext)}\n\nRules:\n- Never invent a part number, OEM fitment, specification, vendor, price, or equipment compatibility.\n- Read visible labels/markings from the photo when possible. Put extracted label text in detected_text.\n- Use internet research to corroborate exact part numbers/manufacturers/cross-references.\n- source_urls should contain useful corroborating pages when available, not generic search pages.\n- suggested_equipment_ids are REVIEW-ONLY. Return [] unless the evidence strongly supports fitment to equipment from the supplied list.\n- If multiple products are plausible, choose the best candidate but use low/medium confidence and explain alternatives in verification_notes.\n- Keep part_name concise and inventory-friendly. category should be practical (filters, belts, electrical, brakes, engine, hydraulic, hardware, lighting, body, drivetrain, ignition, fuel, cooling, other, etc.).\n- This result does NOT create inventory.`;
      const ai = /** @type {any} */ (await base44.integrations.Core.InvokeLLM({
        prompt,
        ...(photoUrl ? { file_urls: [photoUrl] } : {}),
        add_context_from_internet: true,
        response_json_schema: responseSchema,
      }));
      if (!ai || typeof ai !== "object") throw new Error("AI returned no usable part candidate.");
      const confirmedEquipment = initialEquipmentId ? [initialEquipmentId] : [];
      const lookupPayload = {
        query_text: query.trim(),
        uploaded_photo_urls: photoUrl ? [photoUrl] : [],
        detected_text: String(ai.detected_text || ""),
        candidate_part_name: String(ai.part_name || ""),
        candidate_part_number: String(ai.part_number || ""),
        candidate_alternate_part_numbers: Array.isArray(ai.alternate_part_numbers) ? ai.alternate_part_numbers : [],
        candidate_barcode_value: String(ai.barcode_value || barcodeValue || ""),
        candidate_category: String(ai.category || "other"),
        candidate_subcategory: String(ai.subcategory || ""),
        candidate_manufacturer: String(ai.manufacturer || ""),
        candidate_description: String(ai.description || ""),
        candidate_specification: String(ai.specification || ""),
        candidate_source_urls: Array.isArray(ai.source_urls) ? ai.source_urls : [],
        candidate_vendor: String(ai.preferred_vendor || ""),
        candidate_vendor_sku: String(ai.vendor_sku || ""),
        candidate_vendor_url: String(ai.vendor_url || ""),
        confidence: ["low","medium","high"].includes(ai.confidence) ? ai.confidence : "low",
        reasoning: String(ai.reasoning || ""),
        verification_notes: String(ai.verification_notes || ""),
        suggested_equipment_ids: Array.isArray(ai.suggested_equipment_ids) ? ai.suggested_equipment_ids : [],
        confirmed_equipment_ids: confirmedEquipment,
        compatibility_notes: String(ai.compatibility_notes || ""),
      };
      const { data } = await base44.functions.invoke("fleetPartLookupAction", { action: "analyze_result", creation_key: sessionKey, search_mode: file && (query.trim() || barcodeValue.trim()) ? "combined" : file ? "photo" : barcodeValue.trim() && !query.trim() ? "barcode" : searchMode, identification: lookupPayload });
      if (data?.error) throw new Error(data.error);
      const record = data?.identification;
      setIdentification(record);
      setDuplicateIds(data?.duplicate_part_ids || record?.duplicate_part_ids || []);
      setAiResult(ai);
      setCandidate(prev => ({
        ...prev,
        part_name: String(ai.part_name || ""),
        part_number: String(ai.part_number || ""),
        alternate_part_numbers: Array.isArray(ai.alternate_part_numbers) ? ai.alternate_part_numbers : [],
        barcode_value: String(ai.barcode_value || barcodeValue || ""),
        category: String(ai.category || "other"),
        subcategory: String(ai.subcategory || ""),
        manufacturer: String(ai.manufacturer || ""),
        description: String(ai.description || ""),
        specification: String(ai.specification || ""),
        preferred_vendor: String(ai.preferred_vendor || ""),
        vendor_sku: String(ai.vendor_sku || ""),
        vendor_url: String(ai.vendor_url || ""),
        source_urls: Array.isArray(ai.source_urls) ? ai.source_urls : [],
        identification_confidence: ai.confidence || "low",
        identification_notes: [ai.reasoning, ai.verification_notes].filter(Boolean).join("\n\n"),
        compatible_equipment_ids: confirmedEquipment,
        compatibility_notes: String(ai.compatibility_notes || ""),
        primary_photo_url: photoUrl || "",
        photo_urls: photoUrl ? [photoUrl] : [],
      }));
      setStep("verify");
    } catch (e) {
      setError(e?.message || "Part identification failed.");
    } finally {
      setBusy(false);
    }
  };

  const saveReview = async () => {
    if (!identification) return;
    setBusy(true); setError("");
    try {
      const { data } = await base44.functions.invoke("fleetPartLookupAction", {
        action: "update_review",
        id: identification.id,
        expected_updated_date: identification.updated_date || "",
        identification: {
          candidate_part_name: candidate.part_name,
          candidate_part_number: candidate.part_number,
          candidate_alternate_part_numbers: candidate.alternate_part_numbers,
          candidate_barcode_value: candidate.barcode_value,
          candidate_category: candidate.category,
          candidate_subcategory: candidate.subcategory,
          candidate_manufacturer: candidate.manufacturer,
          candidate_description: candidate.description,
          candidate_specification: candidate.specification,
          candidate_source_urls: candidate.source_urls,
          candidate_vendor: candidate.preferred_vendor,
          candidate_vendor_sku: candidate.vendor_sku,
          candidate_vendor_url: candidate.vendor_url,
          confirmed_equipment_ids: candidate.compatible_equipment_ids,
          compatibility_notes: candidate.compatibility_notes,
          quantity_found: candidate.quantity_on_hand,
          storage_zone: candidate.storage_zone,
          storage_cabinet: candidate.storage_cabinet,
          storage_shelf: candidate.storage_shelf,
          storage_bin: candidate.storage_bin,
        },
      });
      if (data?.error) throw new Error(data.error);
      setIdentification(data.identification);
      setDuplicateIds(data.duplicate_part_ids || []);
      setSavedMessage("Review saved to the Parts Identification Inbox.");
    } catch (e) { setError(e?.message || "Unable to save the lookup review."); }
    finally { setBusy(false); }
  };

  const matchExisting = async (part) => {
    if (!identification || !part) return;
    setBusy(true); setError("");
    try {
      const { data } = await base44.functions.invoke("fleetPartLookupAction", { action: "match_existing", id: identification.id, expected_updated_date: identification.updated_date || "", part_id: part.id });
      if (data?.error) throw new Error(data.error);
      setIdentification(data.identification);
      setSavedMessage(`Matched to existing Fleet part: ${part.part_name}.`);
      await onChanged?.();
      setStep("done");
    } catch (e) { setError(e?.message || "Unable to match the existing Fleet part."); }
    finally { setBusy(false); }
  };

  const promote = async (overrideDuplicate = false) => {
    if (!identification || !isAdmin) return;
    if (!candidate.part_name.trim() || !candidate.category.trim()) return setError("Part name and category are required before adding to inventory.");
    setBusy(true); setError("");
    try {
      const { data } = await base44.functions.invoke("fleetPartLookupAction", {
        action: "promote",
        id: identification.id,
        expected_updated_date: identification.updated_date || "",
        confirm_duplicate_override: overrideDuplicate,
        part: { ...candidate, identification_method: file ? "photo" : barcodeValue ? "barcode" : "part_number", identity_status: candidate.identification_confidence === "high" ? "verified" : "review_needed" },
      });
      if (data?.error) throw new Error(data.error);
      setIdentification(data.identification);
      setSavedMessage(`Added ${data.part?.part_name || "part"} to Fleet inventory.`);
      await onChanged?.();
      setStep("done");
    } catch (e) {
      setError(e?.message || "Unable to add the reviewed part to inventory.");
    } finally { setBusy(false); }
  };

  const toggleEquipment = id => setCandidate(prev => ({ ...prev, compatible_equipment_ids: prev.compatible_equipment_ids.includes(id) ? prev.compatible_equipment_ids.filter(value => value !== id) : [...prev.compatible_equipment_ids, id] }));
  const set = (key, value) => setCandidate(prev => ({ ...prev, [key]: value }));

  return <div className="fixed inset-0 z-[110] bg-black/60 p-2 sm:p-4 overflow-y-auto">
    <div role="dialog" aria-modal="true" aria-labelledby="fleet-part-lookup-title" className="mx-auto w-full max-w-6xl min-h-[min(760px,96dvh)] rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 overflow-hidden flex flex-col">
      <div className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-indigo-600" /><h2 id="fleet-part-lookup-title" className="text-lg font-bold text-gray-900 dark:text-slate-100">{organizeMode ? "Organize Parts" : "AI Part Finder"}</h2></div><p className="mt-1 text-xs text-gray-500 dark:text-slate-400">Identify → verify → assign equipment → put it in a real location. AI never silently creates inventory.</p></div><button type="button" disabled={busy} onClick={onClose} className="min-h-11 min-w-11 rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-slate-800" aria-label="Close part lookup"><X className="w-5 h-5 mx-auto" /></button></div>
        <div className="mt-3 flex gap-2 overflow-x-auto">{[["identify","1","Identify"],["verify","2","Verify"],["organize","3","Organize"],["done","✓","Done"]].map(([key,num,label]) => <div key={key} className={`shrink-0 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${step === key ? "bg-indigo-600 text-white" : ["verify","organize","done"].indexOf(step) > ["identify","verify","organize","done"].indexOf(key) ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400"}`}><span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-current px-0.5 text-[9px]">{num}</span>{label}</div>)}</div>
      </div>

      <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
        {savedMessage && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">{savedMessage}</div>}

        {step === "identify" && <div className="grid lg:grid-cols-[1fr_1fr] gap-5">
          <section className="space-y-4">
            <div><h3 className="text-xl font-bold text-gray-900 dark:text-slate-100">What do you have?</h3><p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Use whatever is easiest. A clear label/photo plus a visible number gives the best result.</p></div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{[["part_number",Search,"Part #"],["photo",Camera,"Photo"],["barcode",Barcode,"Barcode"],["combined",Sparkles,"Combine"]].map(([key,Icon,label]) => <button key={key} type="button" onClick={() => setSearchMode(key)} className={`min-h-20 rounded-xl border p-3 text-left ${searchMode === key ? "border-indigo-400 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950/30" : "border-gray-200 dark:border-slate-700"}`}><Icon className="w-5 h-5 text-indigo-500" /><div className="mt-2 text-sm font-semibold">{label}</div></button>)}</div>
            <label className="block"><span className="text-xs font-semibold text-gray-500 dark:text-slate-400">Part number, label text, or description</span><textarea rows={3} value={query} onChange={e => setQuery(e.target.value)} placeholder="Example: WIX 51515, alternator label, Kubota fuel filter…" className="field mt-1" /></label>
            <label className="block"><span className="text-xs font-semibold text-gray-500 dark:text-slate-400">Barcode / UPC / QR value</span><div className="relative mt-1"><Barcode className="absolute left-3 top-3 w-4 h-4 text-gray-400" /><input value={barcodeValue} onChange={e => setBarcodeValue(e.target.value)} className="field pl-9" placeholder="Detected automatically on supported phones, or type it" /></div></label>
            <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 p-5 text-center hover:border-indigo-400 hover:bg-indigo-50/40 dark:border-slate-700 dark:bg-slate-800/40 dark:hover:border-indigo-700">
              <ImagePlus className="w-8 h-8 mx-auto text-indigo-500" /><div className="mt-2 font-semibold text-gray-800 dark:text-slate-200">Take or upload a part photo</div><div className="mt-1 text-xs text-gray-500">Photograph the label, markings, connector/threads and the whole part when possible.</div><input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { chooseFile(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            <button type="button" onClick={analyze} disabled={busy} className="w-full min-h-12 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white inline-flex items-center justify-center gap-2 disabled:opacity-50">{busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <WandSparkles className="w-5 h-5" />}{busy ? "Identifying & researching…" : "Identify This Part"}</button>
          </section>
          <section className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-800/40">
            {previewUrl ? <div><img src={previewUrl} alt="Part lookup preview" className="w-full max-h-[440px] object-contain rounded-xl bg-white dark:bg-slate-950" /><div className="mt-3 flex items-center justify-between gap-2"><div className="text-xs text-gray-500 truncate">{file?.name}</div>{barcodeValue && <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">Barcode detected: {barcodeValue}</span>}</div></div> : <div className="min-h-[360px] flex flex-col items-center justify-center text-center"><Camera className="w-12 h-12 text-gray-300" /><div className="mt-3 font-semibold text-gray-600 dark:text-slate-300">Your photo appears here</div><p className="mt-1 max-w-sm text-xs text-gray-400">For loose parts, take multiple angles separately if needed; start with the clearest identifying label or stamped number.</p></div>}
          </section>
        </div>}

        {step === "verify" && <div className="space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3"><div><h3 className="text-xl font-bold text-gray-900 dark:text-slate-100">Verify the identity</h3><p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Correct anything AI got wrong before this becomes inventory.</p></div>{aiResult?.confidence && <span className={`inline-flex w-fit rounded-full border px-3 py-1.5 text-sm font-bold capitalize ${confidenceStyle[aiResult.confidence] || confidenceStyle.low}`}>{aiResult.confidence} confidence</span>}</div>
          {duplicates.length > 0 && <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/20"><div className="flex items-start gap-2"><AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" /><div><div className="font-bold text-amber-900 dark:text-amber-100">Possible duplicate found</div><div className="text-xs text-amber-800 dark:text-amber-300 mt-1">Do not create another record if this is already the same physical part type.</div></div></div><div className="mt-3 grid md:grid-cols-2 gap-2">{duplicates.map(part => <div key={part.id} className="rounded-lg border border-amber-200 bg-white p-3 dark:border-amber-900 dark:bg-slate-900"><div className="font-semibold text-gray-900 dark:text-slate-100">{part.part_name}</div><div className="text-xs text-gray-500 mt-1">{part.manufacturer || "Unknown manufacturer"} · {part.part_number || "No part #"} · stock {part.quantity_on_hand ?? 0}</div>{isAdmin && <button type="button" onClick={() => matchExisting(part)} disabled={busy} className="mt-2 text-xs font-semibold text-indigo-600 dark:text-indigo-300">This is the same part → match it</button>}</div>)}</div></section>}
          <div className="grid lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 rounded-xl border border-gray-200 p-4 dark:border-slate-700"><div className="grid md:grid-cols-2 gap-3">
              <Field label="Part name *"><input value={candidate.part_name} onChange={e => set("part_name", e.target.value)} className="field" /></Field>
              <Field label="Primary part number"><input value={candidate.part_number} onChange={e => set("part_number", e.target.value)} className="field" /></Field>
              <Field label="Manufacturer"><input value={candidate.manufacturer} onChange={e => set("manufacturer", e.target.value)} className="field" /></Field>
              <Field label="Barcode"><input value={candidate.barcode_value} onChange={e => set("barcode_value", e.target.value)} className="field" /></Field>
              <Field label="Category *"><input value={candidate.category} onChange={e => set("category", e.target.value)} className="field" /></Field>
              <Field label="Subcategory"><input value={candidate.subcategory} onChange={e => set("subcategory", e.target.value)} className="field" /></Field>
            </div><Field label="Alternate / cross-reference numbers"><input value={(candidate.alternate_part_numbers || []).join(", ")} onChange={e => set("alternate_part_numbers", e.target.value.split(",").map(value => value.trim()).filter(Boolean))} className="field" placeholder="Separate numbers with commas" /></Field><Field label="Description"><textarea rows={3} value={candidate.description} onChange={e => set("description", e.target.value)} className="field" /></Field><Field label="Specification / identifying details"><textarea rows={3} value={candidate.specification} onChange={e => set("specification", e.target.value)} className="field" /></Field></div>
            <div className="space-y-4"><InfoCard title="Why AI chose this" text={aiResult?.reasoning || "No reasoning returned."} /><InfoCard title="Verify before use" text={aiResult?.verification_notes || "Confirm identity and fitment before use."} attention /><InfoCard title="Detected label text" text={aiResult?.detected_text || identification?.detected_text || "No readable label text extracted."} /></div>
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2"><button type="button" onClick={() => setStep("identify")} disabled={busy} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-700 inline-flex items-center justify-center gap-2"><ArrowLeft className="w-4 h-4" />Try another search</button><div className="flex flex-col sm:flex-row gap-2"><button type="button" onClick={saveReview} disabled={busy} className="px-4 py-2 rounded-lg border border-indigo-300 text-indigo-700 dark:text-indigo-300 font-semibold">Save to Review Inbox</button><button type="button" onClick={() => setStep("organize")} disabled={busy} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold inline-flex items-center justify-center gap-2">Organize It <ArrowRight className="w-4 h-4" /></button></div></div>
        </div>}

        {step === "organize" && <div className="space-y-5">
          <div><h3 className="text-xl font-bold text-gray-900 dark:text-slate-100">Where does it belong?</h3><p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Connect the digital record to the actual shelf and the equipment it fits.</p></div>
          <div className="grid lg:grid-cols-2 gap-5">
            <section className="rounded-xl border border-gray-200 p-4 dark:border-slate-700 space-y-4"><h4 className="font-bold text-gray-900 dark:text-slate-100">Stock & physical location</h4><div className="grid grid-cols-2 gap-3"><Field label="Quantity found"><input type="number" min="0" step="1" value={candidate.quantity_on_hand} onChange={e => set("quantity_on_hand", Number(e.target.value || 0))} className="field" /></Field><Field label="Minimum stock"><input type="number" min="0" step="1" value={candidate.minimum_stock} onChange={e => set("minimum_stock", Number(e.target.value || 0))} className="field" /></Field><Field label="Area / Zone"><input value={candidate.storage_zone} onChange={e => set("storage_zone", e.target.value)} className="field" placeholder="Parts room" /></Field><Field label="Cabinet / Rack"><input value={candidate.storage_cabinet} onChange={e => set("storage_cabinet", e.target.value)} className="field" placeholder="Rack A" /></Field><Field label="Shelf"><input value={candidate.storage_shelf} onChange={e => set("storage_shelf", e.target.value)} className="field" placeholder="Shelf 3" /></Field><Field label="Bin"><input value={candidate.storage_bin} onChange={e => set("storage_bin", e.target.value)} className="field" placeholder="Bin B12" /></Field></div><Field label="Legacy/freeform location"><input value={candidate.location} onChange={e => set("location", e.target.value)} className="field" placeholder="Optional existing location wording" /></Field></section>
            <section className="rounded-xl border border-gray-200 p-4 dark:border-slate-700"><div className="flex items-start justify-between gap-3"><div><h4 className="font-bold text-gray-900 dark:text-slate-100">Compatible equipment</h4><p className="text-xs text-gray-500 mt-1">Select only fitment you are comfortable confirming.</p></div>{(aiResult?.suggested_equipment_ids || []).length > 0 && <span className="text-[10px] rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300 px-2 py-1">AI suggested {(aiResult.suggested_equipment_ids || []).length}</span>}</div><div className="mt-3 grid sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto">{activeEquipment.map(eq => { const selected = candidate.compatible_equipment_ids.includes(eq.id); const suggested = (aiResult?.suggested_equipment_ids || []).includes(eq.id); return <button key={eq.id} type="button" onClick={() => toggleEquipment(eq.id)} className={`text-left rounded-lg border p-3 ${selected ? "border-indigo-400 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950/30" : suggested ? "border-amber-300 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20" : "border-gray-200 dark:border-slate-700"}`}><div className="flex items-center justify-between gap-2"><div className="font-semibold text-sm text-gray-900 dark:text-slate-100">{eq.name}</div>{selected && <CheckCircle2 className="w-4 h-4 text-indigo-600" />}</div><div className="text-xs text-gray-500 mt-1">{[eq.year,eq.make,eq.model].filter(Boolean).join(" ") || eq.type}</div>{suggested && !selected && <div className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 mt-1">AI suggestion — tap to confirm</div>}</button>; })}</div><Field label="Fitment notes"><textarea rows={3} value={candidate.compatibility_notes} onChange={e => set("compatibility_notes", e.target.value)} className="field mt-3" placeholder="Example: fits both Isuzu trucks; verify engine option before installation" /></Field></section>
          </div>
          <section className="rounded-xl border border-gray-200 p-4 dark:border-slate-700"><h4 className="font-bold text-gray-900 dark:text-slate-100 mb-3">Procurement</h4><div className="grid md:grid-cols-3 gap-3"><Field label="Preferred vendor"><input value={candidate.preferred_vendor} onChange={e => set("preferred_vendor", e.target.value)} className="field" /></Field><Field label="Vendor SKU"><input value={candidate.vendor_sku} onChange={e => set("vendor_sku", e.target.value)} className="field" /></Field><Field label="Unit cost"><input type="number" min="0" step="0.01" value={candidate.unit_cost} onChange={e => set("unit_cost", e.target.value)} className="field" /></Field></div></section>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2"><button type="button" onClick={() => setStep("verify")} disabled={busy} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-700 inline-flex items-center justify-center gap-2"><ArrowLeft className="w-4 h-4" />Back to identity</button><div className="flex flex-col sm:flex-row gap-2"><button type="button" onClick={saveReview} disabled={busy} className="px-4 py-2 rounded-lg border border-indigo-300 text-indigo-700 dark:text-indigo-300 font-semibold">Save for Later</button>{isAdmin && <button type="button" onClick={() => promote(false)} disabled={busy || duplicates.length > 0} title={duplicates.length ? "Resolve the possible duplicate before creating another part." : "Add reviewed part to Fleet inventory"} className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}Add to Fleet Parts</button>}{isAdmin && duplicates.length > 0 && <button type="button" onClick={() => promote(true)} disabled={busy} className="px-4 py-2 rounded-lg border border-red-300 text-red-700 dark:text-red-300 font-semibold">Create Separate Anyway</button>}</div></div>
        </div>}

        {step === "done" && <div className="min-h-[420px] flex flex-col items-center justify-center text-center"><div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center"><Check className="w-10 h-10 text-emerald-600" /></div><h3 className="mt-5 text-2xl font-bold text-gray-900 dark:text-slate-100">Part processed</h3><p className="mt-2 max-w-md text-sm text-gray-500 dark:text-slate-400">{savedMessage || "The part lookup has been reviewed."}</p><div className="mt-5 flex flex-col sm:flex-row gap-2"><button type="button" onClick={() => { const key = `partlookup-${crypto.randomUUID()}`; setSessionKey(key); setIdentification(null); setAiResult(null); setDuplicateIds([]); setQuery(""); setBarcodeValue(""); setFile(null); setPreviewUrl(""); setUploadedUrl(""); setCandidate({ ...emptyCandidate(), compatible_equipment_ids: initialEquipmentId ? [initialEquipmentId] : [] }); setSavedMessage(""); setStep("identify"); }} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold inline-flex items-center justify-center gap-2"><Camera className="w-4 h-4" />Process Next Part</button><button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-700">Done</button></div></div>}
      </div>
    </div>
    <style>{`.field{width:100%;border:1px solid rgb(209 213 219);border-radius:.6rem;padding:.6rem .72rem;background:white;color:inherit}.dark .field{background:rgb(15 23 42);border-color:rgb(51 65 85)}.field:focus{outline:2px solid rgb(99 102 241 / .35);outline-offset:1px}`}</style>
  </div>;
}

function Field({ label, children }) { return <label className="block mt-3"><span className="block text-xs font-semibold text-gray-500 dark:text-slate-400 mb-1">{label}</span>{children}</label>; }
function InfoCard({ title, text, attention = false }) { return <div className={`rounded-xl border p-3 ${attention ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20" : "border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-800/50"}`}><div className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">{title}</div><div className="mt-1 text-sm text-gray-700 dark:text-slate-200 whitespace-pre-wrap">{text}</div></div>; }
