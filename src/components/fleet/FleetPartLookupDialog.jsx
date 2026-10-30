import { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Barcode,
  Camera,
  Check,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  History,
  ImagePlus,
  Loader2,
  Package,
  RotateCcw,
  ScanLine,
  Search,
  ShoppingCart,
  Sparkles,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import { invokeFleet } from "@/components/fleet/fleetInvoke";

const MAX_PHOTOS = 4;

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
  primary_photo_url: "",
  photo_urls: [],
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

const FIT_LABEL = { fits: "Fits", likely: "Likely fits", uncertain: "Uncertain", unlikely: "Unlikely", does_not_fit: "Doesn't fit" };
const FIT_STYLE = {
  fits: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  likely: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900",
  uncertain: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  unlikely: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  does_not_fit: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900",
};

const confidenceStyle = {
  high: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  medium: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  low: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900",
};

const BARCODE_FORMATS = ["code_128","code_39","ean_13","ean_8","upc_a","upc_e","qr_code","data_matrix"];

const normKeyLocal = (value) => String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const newPhoto = (file) => ({ file, previewUrl: URL.createObjectURL(file), uploadedUrl: "", name: file.name || "part photo" });
const remotePhoto = (url) => ({ file: null, previewUrl: url, uploadedUrl: url, name: String(url).split("/").pop() || "part photo" });
const revokePhoto = (photo) => { if (photo?.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(photo.previewUrl); };

const inboxStatusStyle = {
  draft: "bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300",
  analyzed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  needs_review: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
};

export default function FleetPartLookupDialog({ open, equipment = [], parts = [], identifications = [], isAdmin = false, initialEquipmentId = "", organizeMode = false, resumeIdentification = null, onClose, onChanged }) {
  const [step, setStep] = useState("identify");
  const [sessionKey, setSessionKey] = useState("");
  const [identification, setIdentification] = useState(null);
  const [searchMode, setSearchMode] = useState("part_number");
  const [query, setQuery] = useState("");
  const [barcodeValue, setBarcodeValue] = useState("");
  const [photos, setPhotos] = useState([]);
  const [candidate, setCandidate] = useState(emptyCandidate());
  const [aiResult, setAiResult] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [activeCandidateIndex, setActiveCandidateIndex] = useState(0);
  const [duplicateIds, setDuplicateIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [actionedPart, setActionedPart] = useState(null);
  const [requestFor, setRequestFor] = useState(null);
  const [requestQty, setRequestQty] = useState(1);
  const [requestEquipmentId, setRequestEquipmentId] = useState("");
  const [requestJustification, setRequestJustification] = useState("");
  const [requestKey, setRequestKey] = useState("");
  const [requestDone, setRequestDone] = useState(null);
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [fitBusy, setFitBusy] = useState(false);
  const [fitResults, setFitResults] = useState(null);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const previousFocus = useRef(null);
  const closeCallback = useRef(onClose);
  const busyState = useRef(busy);
  const videoRef = useRef(null);
  const queryRef = useRef(query);
  const photosRef = useRef(photos);
  closeCallback.current = onClose;
  busyState.current = busy;
  queryRef.current = query;
  photosRef.current = photos;

  const barcodeSupported = typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia;

  const applyResumeIdentification = (row) => {
    if (!row) return;
    const urls = Array.isArray(row.uploaded_photo_urls) ? row.uploaded_photo_urls : [];
    const confidence = row.confidence || "low";
    photosRef.current.forEach(revokePhoto);
    setStep("verify");
    setSessionKey(row.creation_key || `partlookup-${crypto.randomUUID()}`);
    setIdentification(row);
    setSearchMode(row.search_mode || "combined");
    setQuery(row.query_text || "");
    setBarcodeValue(row.candidate_barcode_value || "");
    setPhotos(urls.map(remotePhoto));
    setCandidate({
      ...emptyCandidate(),
      part_name: row.candidate_part_name || "",
      part_number: row.candidate_part_number || "",
      alternate_part_numbers: row.candidate_alternate_part_numbers || [],
      barcode_value: row.candidate_barcode_value || "",
      category: row.candidate_category || "other",
      subcategory: row.candidate_subcategory || "",
      manufacturer: row.candidate_manufacturer || "",
      description: row.candidate_description || "",
      specification: row.candidate_specification || "",
      preferred_vendor: row.candidate_vendor || "",
      vendor_sku: row.candidate_vendor_sku || "",
      vendor_url: row.candidate_vendor_url || "",
      source_urls: row.candidate_source_urls || [],
      identification_confidence: confidence,
      identification_notes: [row.reasoning, row.verification_notes].filter(Boolean).join("\n\n"),
      compatible_equipment_ids: row.confirmed_equipment_ids?.length ? row.confirmed_equipment_ids : (initialEquipmentId ? [initialEquipmentId] : []),
      compatibility_notes: row.compatibility_notes || "",
      quantity_on_hand: row.quantity_found ?? 1,
      storage_zone: row.storage_zone || "",
      storage_cabinet: row.storage_cabinet || "",
      storage_shelf: row.storage_shelf || "",
      storage_bin: row.storage_bin || "",
      primary_photo_url: urls[0] || "",
      photo_urls: urls,
    });
    setAiResult({
      confidence,
      reasoning: row.reasoning || "",
      verification_notes: row.verification_notes || "",
      detected_text: row.detected_text || "",
      suggested_equipment_ids: row.suggested_equipment_ids || [],
      field_confidence: null,
      candidates: [],
    });
    setCandidates([]);
    setActiveCandidateIndex(0);
    setDuplicateIds(row.duplicate_part_ids || []);
    setBusy(false);
    setError("");
    setActionedPart(null);
    setRequestFor(null);
    setRequestDone(null);
    setRequestError("");
    setRequestBusy(false);
    setFitResults(null);
    setSavedMessage("Resumed from the Parts Identification Review Inbox.");
  };

  const resetForNewLookup = () => {
    photosRef.current.forEach(revokePhoto);
    setStep("identify");
    setSessionKey(`partlookup-${crypto.randomUUID()}`);
    setIdentification(null);
    setSearchMode(organizeMode ? "combined" : "part_number");
    setQuery("");
    setBarcodeValue("");
    setPhotos([]);
    setCandidate({ ...emptyCandidate(), compatible_equipment_ids: initialEquipmentId ? [initialEquipmentId] : [] });
    setAiResult(null);
    setCandidates([]);
    setActiveCandidateIndex(0);
    setDuplicateIds([]);
    setBusy(false);
    setError("");
    setSavedMessage("");
    setScanning(false);
    setScanError("");
    setActionedPart(null);
    setRequestFor(null);
    setRequestDone(null);
    setRequestError("");
    setRequestBusy(false);
    setFitResults(null);
  };

  useEffect(() => {
    if (!open) return undefined;
    previousFocus.current = document.activeElement;
    closeRef.current?.focus();
    const handleKey = event => {
      if (event.key === "Escape") {
        if (!busyState.current) { event.preventDefault(); closeCallback.current?.(); }
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const controls = [...dialogRef.current.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled)')]
        .filter(element => element.getClientRects().length > 0);
      if (!controls.length) { event.preventDefault(); dialogRef.current.focus(); return; }
      const first = controls[0], last = controls[controls.length - 1], active = document.activeElement;
      if (!dialogRef.current.contains(active) || active === dialogRef.current) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      photosRef.current.forEach(revokePhoto);
      setScanning(false);
      if (previousFocus.current?.isConnected) previousFocus.current.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (resumeIdentification) { applyResumeIdentification(resumeIdentification); return; }
    resetForNewLookup();
  }, [open, initialEquipmentId, organizeMode, resumeIdentification]);

  // Clipboard-paste photo capture is live only on the identify step, and only
  // for image files — text paste into the query/barcode fields is untouched.
  useEffect(() => {
    if (!open || step !== "identify") return undefined;
    const handlePaste = event => {
      const files = [...(event.clipboardData?.files || [])].filter(item => item.type?.startsWith("image/"));
      if (files.length) { event.preventDefault(); addFiles(files); }
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [open, step, photos.length]);

  // Live barcode scan: camera stream + BarcodeDetector polling while `scanning`.
  // The cleanup stops every track so the camera never outlives the dialog.
  useEffect(() => {
    if (!scanning) return undefined;
    let cancelled = false;
    let stream = null;
    let timer = 0;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (cancelled) { stream.getTracks().forEach(track => track.stop()); return; }
        const video = videoRef.current;
        if (!video) { setScanning(false); return; }
        video.srcObject = stream;
        await video.play().catch(() => {});
        const detector = new window.BarcodeDetector({ formats: BARCODE_FORMATS });
        while (!cancelled) {
          try {
            const found = await detector.detect(video);
            const raw = String(found?.[0]?.rawValue || "").trim();
            if (raw) {
              setBarcodeValue(raw);
              setScanning(false);
              setSearchMode(queryRef.current.trim() || photosRef.current.length ? "combined" : "barcode");
              break;
            }
          } catch {
            // A missed frame is normal while the camera focuses; keep polling.
          }
          await new Promise(resolve => { timer = setTimeout(resolve, 400); });
        }
      } catch {
        if (!cancelled) { setScanError("Camera access was denied or no camera is available. Type the barcode or photograph the label instead."); setScanning(false); }
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      stream?.getTracks().forEach(track => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [scanning]);

  const duplicates = useMemo(() => duplicateIds.map(id => parts.find(part => part.id === id)).filter(Boolean), [duplicateIds, parts]);
  const activeEquipment = useMemo(() => equipment.filter(item => item.status !== "retired"), [equipment]);
  const resumableSessions = useMemo(() => identifications.filter(row => !["promoted","matched_existing","dismissed"].includes(row.status) && row.id !== identification?.id).slice(0, 6), [identifications, identification?.id]);
  const sourceLinks = useMemo(() => (candidate.source_urls || []).filter(url => /^https?:\/\//i.test(url)), [candidate.source_urls]);

  // Live inventory awareness: exact number/barcode hits plus name contains,
  // surfaced before any AI call is spent.
  const inventoryMatches = useMemo(() => {
    const q = normKeyLocal(query.trim());
    const bc = normKeyLocal(barcodeValue.trim());
    if (!q && !bc) return [];
    const nameNeedle = query.trim().toLowerCase();
    return parts.filter(part => {
      const numbers = [part.part_number, part.barcode_value, ...(part.alternate_part_numbers || [])].map(normKeyLocal).filter(Boolean);
      if (bc && numbers.includes(bc)) return true;
      if (q && numbers.some(value => value === q)) return true;
      if (nameNeedle.length >= 3 && String(part.part_name || "").toLowerCase().includes(nameNeedle)) return true;
      if (q.length >= 5 && numbers.some(value => value.includes(q))) return true;
      return false;
    }).slice(0, 4);
  }, [parts, query, barcodeValue]);

  if (!open) return null;

  const addFiles = async (list) => {
    const incoming = [...(list || [])];
    if (!incoming.length) return;
    setError("");
    const room = MAX_PHOTOS - photosRef.current.length;
    if (room <= 0) return setError(`Up to ${MAX_PHOTOS} photos are supported per lookup.`);
    const accepted = [];
    for (const file of incoming.slice(0, room)) {
      if (!file.type?.startsWith("image/")) { setError("Only image files can be used for visual part identification."); continue; }
      if (file.size > 15 * 1024 * 1024) { setError("Part photos must be 15 MB or smaller."); continue; }
      accepted.push(newPhoto(file));
    }
    if (!accepted.length) return;
    setPhotos(prev => [...prev, ...accepted]);
    setSearchMode(current => current === "part_number" && !queryRef.current.trim() ? "photo" : "combined");
    if (!barcodeSupported || barcodeValue) return;
    for (const photo of accepted) {
      try {
        const detector = new window.BarcodeDetector({ formats: BARCODE_FORMATS });
        const bitmap = await createImageBitmap(photo.file);
        const found = await detector.detect(bitmap);
        bitmap.close?.();
        const raw = String(found?.[0]?.rawValue || "").trim();
        if (raw) { setBarcodeValue(raw); setSearchMode("combined"); break; }
      } catch {
        // Barcode detection is a convenience only; AI still receives the photo.
      }
    }
  };

  const removePhoto = (index) => setPhotos(prev => {
    const next = [...prev];
    const [removed] = next.splice(index, 1);
    revokePhoto(removed);
    return next;
  });

  const applyCandidate = (index) => {
    const chosen = candidates[index];
    if (!chosen) return;
    setActiveCandidateIndex(index);
    setCandidate(prev => ({
      ...prev,
      part_name: String(chosen.part_name || ""),
      part_number: String(chosen.part_number || ""),
      alternate_part_numbers: Array.isArray(chosen.alternate_part_numbers) ? chosen.alternate_part_numbers : [],
      category: String(chosen.category || "other"),
      subcategory: String(chosen.subcategory || ""),
      manufacturer: String(chosen.manufacturer || ""),
      description: String(chosen.description || ""),
      specification: String(chosen.specification || ""),
      preferred_vendor: String(chosen.preferred_vendor || ""),
      vendor_sku: String(chosen.vendor_sku || ""),
      vendor_url: String(chosen.vendor_url || ""),
      identification_confidence: ["low","medium","high"].includes(chosen.confidence) ? chosen.confidence : (aiResult?.confidence || "low"),
      compatibility_notes: String(chosen.fit_summary || aiResult?.compatibility_notes || prev.compatibility_notes || ""),
    }));
  };

  const newRequestKey = () => `partlookup-request-${crypto.randomUUID()}`;
  const openRequest = (part = null) => {
    setRequestFor(part ? {
      inventory_item_id: part.id,
      item_name: part.part_name,
      part_number: part.part_number || "",
      manufacturer_brand: part.manufacturer || "",
      unit_cost: part.unit_cost,
      vendor_link: "",
      photo_urls: [],
    } : {
      inventory_item_id: "",
      item_name: candidate.part_name,
      part_number: candidate.part_number,
      manufacturer_brand: candidate.manufacturer,
      unit_cost: candidate.unit_cost,
      vendor_link: candidate.vendor_url,
      photo_urls: candidate.photo_urls,
    });
    setRequestQty(1);
    setRequestEquipmentId(initialEquipmentId || candidate.compatible_equipment_ids?.[0] || "");
    const number = part?.part_number || candidate.part_number;
    setRequestJustification(`Identified via AI Part Finder${number ? ` — ${number}` : ""}`);
    setRequestKey(newRequestKey());
    setRequestDone(null);
    setRequestError("");
  };

  // Any edit to the request draft regenerates the creation key, so a transport
  // retry of an unchanged draft stays idempotent while a genuinely different
  // draft can never collide with the backend's same-key/different-intent guard.
  const submitRequest = async () => {
    if (!requestFor || requestBusy) return;
    if (!requestJustification.trim()) return setRequestError("A short justification is required for the request.");
    if (!requestFor.item_name) return setRequestError("The part needs a name before it can be requested.");
    setRequestBusy(true); setRequestError("");
    try {
      const { data } = await invokeFleet("fleetRequestAction", {
        action: "create", creation_key: requestKey,
        request: {
          item_type: "part",
          ...(requestFor.inventory_item_id ? { inventory_item_id: requestFor.inventory_item_id } : {}),
          item_name: requestFor.item_name,
          part_number: requestFor.part_number || "",
          manufacturer_brand: requestFor.manufacturer_brand || "",
          quantity_needed: Number(requestQty) || 1,
          justification: requestJustification.trim(),
          ...(requestEquipmentId ? { equipment_id: requestEquipmentId } : {}),
          ...(requestFor.unit_cost !== "" && requestFor.unit_cost != null ? { unit_cost: requestFor.unit_cost } : {}),
          ...(requestFor.vendor_link ? { vendor_link: requestFor.vendor_link } : {}),
          ...(requestFor.photo_urls?.length ? { photo_urls: requestFor.photo_urls } : {}),
          ...(identification?.id ? { notes: `Raised from part-identification session ${identification.id}` } : {}),
        },
      });
      if (data?.error) throw new Error(data.error);
      setRequestDone(data.request || { id: "" });
      setSavedMessage(`Fleet request submitted for ${requestFor.item_name}.`);
      await onChanged?.();
    } catch (e) { setRequestError(e?.message || "Unable to submit the Fleet request."); }
    finally { setRequestBusy(false); }
  };

  // Cross-reference research keeps the same physical part's photos/barcode but
  // starts a fresh identification session so both lookups stay in the inbox.
  const reSearch = (value) => {
    const num = String(value || "").trim();
    if (!num || busy) return;
    setStep("identify");
    setSessionKey(`partlookup-${crypto.randomUUID()}`);
    setIdentification(null);
    setQuery(num);
    setSearchMode("part_number");
    setCandidates([]);
    setActiveCandidateIndex(0);
    setAiResult(null);
    setDuplicateIds([]);
    setError("");
    setActionedPart(null);
    setRequestFor(null);
    setRequestDone(null);
    setFitResults(null);
    setSavedMessage(`Loaded ${num} for a new lookup. The previous review is saved in the inbox.`);
  };

  // Review-only AI fitment verdicts for the human-selected equipment list.
  // Verdicts render as badges; they never toggle a selection on their own.
  const checkFitment = async () => {
    const selected = candidate.compatible_equipment_ids;
    if (!selected.length) return setError("Select at least one equipment unit first — fitment verdicts stay review-only.");
    if (!candidate.part_name.trim() && !candidate.part_number.trim()) return setError("Identify or name the part before checking fitment.");
    setFitBusy(true); setError("");
    try {
      const targets = selected.map(id => activeEquipment.find(eq => eq.id === id)).filter(Boolean)
        .map(eq => ({ id: eq.id, name: eq.name, type: eq.type, year: eq.year, make: eq.make, model: eq.model, vin: eq.vin || "", engine_details: eq.engine_details || "" }));
      const schema = { type: "object", properties: { fitment: { type: "array", items: { type: "object", properties: {
        equipment_id: { type: "string", enum: targets.map(t => t.id) },
        verdict: { type: "string", enum: ["fits","likely","uncertain","unlikely","does_not_fit"] },
        reason: { type: "string" },
      }, required: ["equipment_id","verdict","reason"] } } }, required: ["fitment"] };
      const prompt = `You are a fleet-maintenance parts fitment checker with internet research enabled. Decide whether this part fits each listed equipment unit.\n\nPart: ${JSON.stringify({ name: candidate.part_name, part_number: candidate.part_number, alternate_numbers: candidate.alternate_part_numbers, manufacturer: candidate.manufacturer, specification: candidate.specification, category: candidate.category, barcode: candidate.barcode_value })}\n\nEquipment units: ${JSON.stringify(targets)}\n\nRules:\n- Verdicts are REVIEW-ONLY guidance for a human; never claim certainty you lack.\n- fits only when OEM/aftermarket documentation or fitment data supports it; likely for strong indirect evidence; uncertain when information is missing; unlikely or does_not_fit when evidence contradicts.\n- reason: one short sentence citing the deciding factor (engine option, year range, model variant).`;
      const ai = await base44.integrations.Core.InvokeLLM({ prompt, add_context_from_internet: true, response_json_schema: schema });
      const map = {};
      for (const row of ai?.fitment || []) if (row?.equipment_id) map[row.equipment_id] = { verdict: row.verdict || "uncertain", reason: String(row.reason || "") };
      setFitResults(map);
      setSavedMessage(`AI fitment check complete for ${Object.keys(map).length} selection${Object.keys(map).length === 1 ? "" : "s"} — verdicts are review-only.`);
    } catch (e) { setError(e?.message || "Fitment check failed."); }
    finally { setFitBusy(false); }
  };

  const analyze = async () => {
    if (!query.trim() && !barcodeValue.trim() && !photos.length) return setError("Enter a part number/description, scan a barcode, or add a photo first.");
    setBusy(true);
    setError("");
    setSavedMessage("");
    setFitResults(null);
    try {
      const uploaded = photos.map(photo => photo.uploadedUrl || "");
      for (let i = 0; i < photos.length; i++) {
        if (uploaded[i]) continue;
        const upload = await base44.integrations.Core.UploadFile({ file: photos[i].file });
        if (!upload?.file_url) throw new Error("Part photo upload failed.");
        uploaded[i] = upload.file_url;
      }
      const photoUrls = uploaded.filter(Boolean);
      if (photoUrls.length) setPhotos(prev => prev.map((photo, i) => uploaded[i] ? { ...photo, uploadedUrl: uploaded[i] } : photo));
      const equipmentContext = activeEquipment.slice(0, 100).map(item => ({ id: item.id, name: item.name, type: item.type, year: item.year, make: item.make, model: item.model, vin: item.vin || "", engine_details: item.engine_details || "" }));
      const inventoryContext = parts.slice(0, 250).map(item => ({ id: item.id, name: item.part_name, part_number: item.part_number || "", alternate_part_numbers: item.alternate_part_numbers || [], barcode: item.barcode_value || "", manufacturer: item.manufacturer || "", category: item.category || "" }));
      const equipmentIds = activeEquipment.map(item => item.id);
      const candidateSchema = {
        type: "object",
        properties: {
          part_name: { type: "string" },
          part_number: { type: "string" },
          alternate_part_numbers: { type: "array", items: { type: "string" } },
          category: { type: "string" },
          subcategory: { type: "string" },
          manufacturer: { type: "string" },
          description: { type: "string" },
          specification: { type: "string" },
          preferred_vendor: { type: "string" },
          vendor_sku: { type: "string" },
          vendor_url: { type: "string" },
          confidence: { type: "string", enum: ["low","medium","high"] },
          fit_summary: { type: "string" },
        },
        required: ["part_name","confidence"],
      };
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
          field_confidence: {
            type: "object",
            properties: {
              part_number: { type: "string", enum: ["low","medium","high"] },
              manufacturer: { type: "string", enum: ["low","medium","high"] },
              category: { type: "string", enum: ["low","medium","high"] },
              specification: { type: "string", enum: ["low","medium","high"] },
              fitment: { type: "string", enum: ["low","medium","high"] },
            },
          },
          candidates: { type: "array", items: candidateSchema },
          vendor_options: { type: "array", items: { type: "object", properties: {
            vendor: { type: "string" }, sku: { type: "string" }, url: { type: "string" }, est_price: { type: "string" },
          }, required: ["vendor"] } },
        },
        required: ["part_name","part_number","category","manufacturer","description","confidence","reasoning","verification_notes","suggested_equipment_ids","candidates"],
      };
      const prompt = `You are the review-only CCS Fleet Part Identifier. Identify the physical fleet-maintenance part from the supplied number, barcode, text and/or photos. Internet research is enabled.\n\nUser text/part number: ${query.trim() || "(none)"}\nBarcode detected/entered: ${barcodeValue.trim() || "(none)"}\n\nCurrent active Fleet equipment (ONLY suggest ids from this exact list, and only when fitment is supported): ${JSON.stringify(equipmentContext)}\n\nExisting Fleet parts for duplicate awareness: ${JSON.stringify(inventoryContext)}\n\nRules:\n- Never invent a part number, OEM fitment, specification, vendor, price, or equipment compatibility.\n- Read visible labels/markings from every photo when possible. Put extracted label text in detected_text.\n- Use internet research to corroborate exact part numbers/manufacturers/cross-references.\n- source_urls should contain useful corroborating pages when available, not generic search pages.\n- candidates: return the BEST candidate first, plus up to 2 plausible alternatives when the identity is genuinely uncertain (different OEM vs aftermarket equivalent, superseded number, similar part). Return only the best candidate when the evidence is strong. Each candidate needs a confidence and a one-line fit_summary.\n- The top-level part_* fields must mirror candidates[0].\n- field_confidence: grade part_number, manufacturer, category, specification, and fitment independently — low when guessed rather than evidenced.\n- vendor_options: up to 3 real purchasable sources for this exact part — vendor name, sku, url, and est_price as a range like "$12-18". Only real, researched vendors; return [] when unsure.\n- suggested_equipment_ids are REVIEW-ONLY. Return [] unless the evidence strongly supports fitment to equipment from the supplied list.\n- Keep part_name concise and inventory-friendly. category should be practical (filters, belts, electrical, brakes, engine, hydraulic, hardware, lighting, body, drivetrain, ignition, fuel, cooling, other, etc.).\n- This result does NOT create inventory.`;
      const ai = /** @type {any} */ (await base44.integrations.Core.InvokeLLM({
        prompt,
        ...(photoUrls.length ? { file_urls: photoUrls } : {}),
        add_context_from_internet: true,
        response_json_schema: responseSchema,
      }));
      if (!ai || typeof ai !== "object") throw new Error("AI returned no usable part candidate.");
      const ranked = Array.isArray(ai.candidates) && ai.candidates.length ? ai.candidates : [{
        part_name: ai.part_name, part_number: ai.part_number, alternate_part_numbers: ai.alternate_part_numbers,
        category: ai.category, subcategory: ai.subcategory, manufacturer: ai.manufacturer, description: ai.description,
        specification: ai.specification, preferred_vendor: ai.preferred_vendor, vendor_sku: ai.vendor_sku,
        vendor_url: ai.vendor_url, confidence: ai.confidence, fit_summary: ai.compatibility_notes,
      }];
      const confirmedEquipment = initialEquipmentId ? [initialEquipmentId] : [];
      const lookupPayload = {
        query_text: query.trim(),
        uploaded_photo_urls: photoUrls,
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
      const { data } = await invokeFleet("fleetPartLookupAction", { action: "analyze_result", creation_key: sessionKey, search_mode: photos.length && (query.trim() || barcodeValue.trim()) ? "combined" : photos.length ? "photo" : barcodeValue.trim() && !query.trim() ? "barcode" : searchMode, identification: lookupPayload });
      if (data?.error) throw new Error(data.error);
      const record = data?.identification;
      setIdentification(record);
      setDuplicateIds(data?.duplicate_part_ids || record?.duplicate_part_ids || []);
      setAiResult(ai);
      setCandidates(ranked);
      setActiveCandidateIndex(0);
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
        primary_photo_url: photoUrls[0] || "",
        photo_urls: photoUrls,
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
      const { data } = await invokeFleet("fleetPartLookupAction", {
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
      const { data } = await invokeFleet("fleetPartLookupAction", { action: "match_existing", id: identification.id, expected_updated_date: identification.updated_date || "", part_id: part.id });
      if (data?.error) throw new Error(data.error);
      setIdentification(data.identification);
      setActionedPart(part);
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
      const { data } = await invokeFleet("fleetPartLookupAction", {
        action: "promote",
        id: identification.id,
        expected_updated_date: identification.updated_date || "",
        confirm_duplicate_override: overrideDuplicate,
        part: { ...candidate, identification_method: photos.length ? "photo" : barcodeValue ? "barcode" : "part_number", identity_status: candidate.identification_confidence === "high" ? "verified" : "review_needed" },
      });
      if (data?.error) throw new Error(data.error);
      setIdentification(data.identification);
      setActionedPart(data.part || null);
      setSavedMessage(`Added ${data.part?.part_name || "part"} to Fleet inventory.`);
      await onChanged?.();
      setStep("done");
    } catch (e) {
      setError(e?.message || "Unable to add the reviewed part to inventory.");
    } finally { setBusy(false); }
  };

  const toggleEquipment = id => setCandidate(prev => ({ ...prev, compatible_equipment_ids: prev.compatible_equipment_ids.includes(id) ? prev.compatible_equipment_ids.filter(value => value !== id) : [...prev.compatible_equipment_ids, id] }));
  const set = (key, value) => setCandidate(prev => ({ ...prev, [key]: value }));
  const fieldConfidence = key => aiResult?.field_confidence?.[key] || "";

  const requestPanel = requestFor && <section className="rounded-xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-900 dark:bg-sky-950/20">
    <div className="flex items-start gap-2"><ShoppingCart className="w-4 h-4 text-sky-600 mt-0.5 shrink-0" /><div className="min-w-0"><div className="font-bold text-sky-900 dark:text-sky-100">Request {requestFor.item_name || "this part"}</div><div className="text-xs text-sky-800 dark:text-sky-300 mt-0.5">{requestFor.inventory_item_id ? "Linked to the exact Fleet inventory record — receipt lands on the right part automatically." : "Free-text request — a reviewer links or creates the inventory record on receipt."}</div></div></div>
    <div className="mt-3 grid sm:grid-cols-[1fr_1.2fr_2fr] gap-2">
      <Field label="Qty needed"><input type="number" min="1" step="1" value={requestQty} onChange={e => { setRequestQty(Number(e.target.value || 1)); setRequestKey(newRequestKey()); }} className="field" /></Field>
      <Field label="For equipment"><select value={requestEquipmentId} onChange={e => { setRequestEquipmentId(e.target.value); setRequestKey(newRequestKey()); }} className="field"><option value="">Unspecified</option>{activeEquipment.map(eq => <option key={eq.id} value={eq.id}>{eq.name}</option>)}</select></Field>
      <Field label="Justification *"><input value={requestJustification} onChange={e => { setRequestJustification(e.target.value); setRequestKey(newRequestKey()); }} className="field" /></Field>
    </div>
    {requestError && <div role="alert" className="mt-2 text-xs font-semibold text-red-700 dark:text-red-300">{requestError}</div>}
    {requestDone ? <div role="status" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="w-3.5 h-3.5" />Request submitted — track it on the Fleet Requests page.</div> :
    <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={submitRequest} disabled={requestBusy || busy} className="px-3 py-2 rounded-lg bg-sky-600 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50">{requestBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShoppingCart className="w-3.5 h-3.5" />}Submit Request</button><button type="button" onClick={() => { setRequestFor(null); setRequestError(""); }} disabled={requestBusy} className="px-3 py-2 rounded-lg border border-sky-300 text-sky-800 dark:text-sky-200 text-xs font-semibold">Cancel</button></div>}
  </section>;

  return <div className="fixed inset-0 z-[110] bg-black/60 p-2 sm:p-4 overflow-y-auto">
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="fleet-part-lookup-title" aria-describedby="fleet-part-lookup-description" tabIndex={-1} className="mx-auto w-full max-w-6xl min-h-[min(760px,96dvh)] rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 overflow-hidden flex flex-col">
      <div className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-indigo-600" /><h2 id="fleet-part-lookup-title" className="text-lg font-bold text-gray-900 dark:text-slate-100">{organizeMode ? "Organize Parts" : "AI Part Finder"}</h2></div><p id="fleet-part-lookup-description" className="mt-1 text-xs text-gray-500 dark:text-slate-400">Identify → verify → assign equipment → put it in a real location. AI never silently creates inventory.</p></div><button type="button" ref={closeRef} type="button" disabled={busy} onClick={onClose} className="min-h-11 min-w-11 rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-slate-800" aria-label="Close part lookup"><X className="w-5 h-5 mx-auto" /></button></div>
        <div className="mt-3 flex gap-2 overflow-x-auto">{[["identify","1","Identify"],["verify","2","Verify"],["organize","3","Organize"],["done","✓","Done"]].map(([key,num,label]) => <div key={key} className={`shrink-0 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${step === key ? "bg-indigo-600 text-white" : ["verify","organize","done"].indexOf(step) > ["identify","verify","organize","done"].indexOf(key) ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400"}`}><span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-current px-0.5 text-[9px]">{num}</span>{label}</div>)}</div>
      </div>

      <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
        {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
        {savedMessage && <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">{savedMessage}</div>}

        {step === "identify" && <div className="grid lg:grid-cols-[1fr_1fr] gap-5">
          <section className="space-y-4">
            <div><h3 className="text-xl font-bold text-gray-900 dark:text-slate-100">What do you have?</h3><p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Use whatever is easiest. A clear label/photo plus a visible number gives the best result.</p></div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{LOOKUP_MODES.map(({key,icon:Icon,label}) => <button type="button" key={key} type="button" onClick={() => setSearchMode(key)} className={`min-h-20 rounded-xl border p-3 text-left ${searchMode === key ? "border-indigo-400 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950/30" : "border-gray-200 dark:border-slate-700"}`}><Icon className="w-5 h-5 text-indigo-500" /><div className="mt-2 text-sm font-semibold">{label}</div></button>)}</div>
            <label className="block"><span className="text-xs font-semibold text-gray-500 dark:text-slate-400">Part number, label text, or description</span><textarea rows={3} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); analyze(); } }} placeholder="Example: WIX 51515, alternator label, Kubota fuel filter… (Ctrl+Enter identifies)" className="field mt-1" /></label>
            <div className="block"><span className="text-xs font-semibold text-gray-500 dark:text-slate-400">Barcode / UPC / QR value</span><div className="relative mt-1"><Barcode className="absolute left-3 top-3 w-4 h-4 text-gray-400" /><input value={barcodeValue} onChange={e => setBarcodeValue(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && barcodeValue.trim()) { e.preventDefault(); analyze(); } }} className="field pl-9 pr-24" placeholder="Detected automatically, scanned, or typed" />{barcodeSupported && <button type="button" onClick={() => { setScanError(""); setScanning(true); }} disabled={busy || scanning} className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-40 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300"><ScanLine className="w-3.5 h-3.5" />Scan</button>}</div>{scanError && <div role="alert" className="mt-1 text-xs text-amber-700 dark:text-amber-300">{scanError}</div>}</div>
            {inventoryMatches.length > 0 && <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900 dark:bg-emerald-950/20"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-300"><Package className="w-3.5 h-3.5" />Already in Fleet inventory</div><div className="mt-2 space-y-1.5">{inventoryMatches.map(part => <div key={part.id} className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 dark:border-emerald-900 dark:bg-slate-900"><div className="min-w-0"><div className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{part.part_name}</div><div className="truncate text-[11px] text-gray-500">{[part.part_number, part.manufacturer, `stock ${part.quantity_on_hand ?? 0}`, [part.storage_zone,part.storage_cabinet,part.storage_shelf,part.storage_bin].filter(Boolean).join(" · ") || part.location].filter(Boolean).join(" · ")}</div></div><button type="button" onClick={() => openRequest(part)} disabled={busy} className="shrink-0 rounded-lg border border-sky-300 px-2.5 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-300 disabled:opacity-50">Request more</button></div>)}</div></section>}
            {requestPanel}
            <label
              onDragOver={e => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={e => { e.preventDefault(); setDragActive(false); }}
              onDrop={e => { e.preventDefault(); setDragActive(false); addFiles(e.dataTransfer?.files); }}
              className={`block cursor-pointer rounded-2xl border-2 border-dashed p-5 text-center ${dragActive ? "border-indigo-500 bg-indigo-100/60 dark:bg-indigo-950/40" : "border-gray-300 bg-gray-50 hover:border-indigo-400 hover:bg-indigo-50/40 dark:border-slate-700 dark:bg-slate-800/40 dark:hover:border-indigo-700"}`}>
              <ImagePlus className="w-8 h-8 mx-auto text-indigo-500" /><div className="mt-2 font-semibold text-gray-800 dark:text-slate-200">Take, upload, drop or paste part photos</div><div className="mt-1 text-xs text-gray-500">Up to {MAX_PHOTOS}: label close-up, stamped markings, connector/threads, and the whole part. Ctrl+V works anywhere in this step.</div><input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />
            </label>
            <button type="button" onClick={analyze} disabled={busy} className="w-full min-h-12 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white inline-flex items-center justify-center gap-2 disabled:opacity-50">{busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <WandSparkles className="w-5 h-5" />}{busy ? "Identifying & researching…" : "Identify This Part"}</button>
            {resumableSessions.length > 0 && <section className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden"><div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-800/50"><History className="w-4 h-4 text-gray-500" /><span className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Resume a recent lookup</span></div><div className="divide-y divide-gray-100 dark:divide-slate-800 max-h-48 overflow-y-auto">{resumableSessions.map(row => <button type="button" key={row.id} type="button" onClick={() => applyResumeIdentification(row)} disabled={busy} className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-indigo-50/60 dark:hover:bg-indigo-950/20 disabled:opacity-50"><div className="min-w-0"><div className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{row.candidate_part_name || row.query_text || row.candidate_part_number || "Unidentified part"}</div><div className="truncate text-[11px] text-gray-500">{[row.candidate_part_number, row.candidate_manufacturer, row.created_date ? new Date(row.created_date).toLocaleDateString() : ""].filter(Boolean).join(" · ")}</div></div><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${inboxStatusStyle[row.status] || inboxStatusStyle.draft}`}>{String(row.status || "draft").replace("_"," ")}</span></button>)}</div></section>}
          </section>
          <section className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-800/40">
            {scanning ? <div className="relative"><video ref={videoRef} autoPlay playsInline muted className="w-full max-h-[440px] rounded-xl bg-black object-contain" /><div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="h-28 w-3/4 rounded-xl border-2 border-emerald-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" /></div><div className="mt-3 flex items-center justify-between gap-2"><span className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><ScanLine className="w-4 h-4 animate-pulse" />Point the camera at a barcode…</span><button type="button" onClick={() => setScanning(false)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold dark:border-slate-600">Stop scan</button></div></div>
            : photos.length ? <div className="space-y-3"><img src={photos[0].previewUrl} alt="Primary part lookup preview" className="w-full max-h-[340px] object-contain rounded-xl bg-white dark:bg-slate-950" /><div className="grid grid-cols-4 gap-2">{photos.map((photo, index) => <div key={photo.previewUrl} className="relative group"><img src={photo.previewUrl} alt={`Part photo ${index + 1}`} className={`h-16 w-full rounded-lg object-cover border-2 ${index === 0 ? "border-indigo-400" : "border-gray-200 dark:border-slate-700"}`} /><button type="button" onClick={() => removePhoto(index)} aria-label={`Remove photo ${index + 1}`} className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white group-hover:flex"><Trash2 className="h-3 w-3" /></button>{index === 0 && <span className="absolute bottom-1 left-1 rounded bg-indigo-600/90 px-1 text-[9px] font-bold text-white">PRIMARY</span>}</div>)}{photos.length < MAX_PHOTOS && <label className="flex h-16 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-gray-400 hover:border-indigo-400 hover:text-indigo-500 dark:border-slate-600"><ImagePlus className="w-5 h-5" /><input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={e => { addFiles(e.target.files); e.target.value = ""; }} /></label>}</div><div className="flex items-center justify-between gap-2"><div className="text-xs text-gray-500 truncate">{photos.length} photo{photos.length === 1 ? "" : "s"} · first is primary</div>{barcodeValue && <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">Barcode detected: {barcodeValue}</span>}</div></div>
            : <div className="min-h-[360px] flex flex-col items-center justify-center text-center"><Camera className="w-12 h-12 text-gray-300" /><div className="mt-3 font-semibold text-gray-600 dark:text-slate-300">Your photos appear here</div><p className="mt-1 max-w-sm text-xs text-gray-400">Up to {MAX_PHOTOS} photos per lookup — the label close-up plus a whole-part shot dramatically improves identification.</p></div>}
          </section>
        </div>}

        {step === "verify" && <div className="space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3"><div><h3 className="text-xl font-bold text-gray-900 dark:text-slate-100">Verify the identity</h3><p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Pick the right candidate, then correct anything AI got wrong before this becomes inventory.</p></div>{aiResult?.confidence && <span className={`inline-flex w-fit rounded-full border px-3 py-1.5 text-sm font-bold capitalize ${confidenceStyle[aiResult.confidence] || confidenceStyle.low}`}>{aiResult.confidence} confidence</span>}</div>
          {candidates.length > 1 && <section className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-900 dark:bg-indigo-950/20"><div className="flex items-center gap-2"><ClipboardList className="w-4 h-4 text-indigo-600" /><div className="text-sm font-bold text-indigo-900 dark:text-indigo-100">AI returned {candidates.length} plausible identities — choose the right one</div></div><div className="mt-3 grid md:grid-cols-3 gap-2">{candidates.map((option, index) => <button type="button" key={index} type="button" onClick={() => applyCandidate(index)} disabled={busy} className={`text-left rounded-lg border p-3 ${index === activeCandidateIndex ? "border-indigo-500 bg-white ring-2 ring-indigo-200 dark:bg-slate-900 dark:ring-indigo-800" : "border-indigo-200 bg-white/60 dark:border-indigo-900 dark:bg-slate-900/50"}`}><div className="flex items-start justify-between gap-2"><div className="font-semibold text-sm text-gray-900 dark:text-slate-100">{option.part_name || "Candidate " + (index + 1)}</div>{index === activeCandidateIndex && <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />}</div><div className="text-xs text-gray-500 mt-1">{option.manufacturer || "Unknown manufacturer"} · {option.part_number || "No part #"}</div>{option.fit_summary && <div className="mt-1 text-[11px] text-gray-600 dark:text-slate-400">{option.fit_summary}</div>}<span className={`mt-2 inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold capitalize ${confidenceStyle[option.confidence] || confidenceStyle.low}`}>{option.confidence || "low"} confidence</span></button>)}</div></section>}
          {duplicates.length > 0 && <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/20"><div className="flex items-start gap-2"><AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" /><div><div className="font-bold text-amber-900 dark:text-amber-100">Possible duplicate found</div><div className="text-xs text-amber-800 dark:text-amber-300 mt-1">Do not create another record if this is already the same physical part type.</div></div></div><div className="mt-3 grid md:grid-cols-2 gap-2">{duplicates.map(part => <div key={part.id} className="rounded-lg border border-amber-200 bg-white p-3 dark:border-amber-900 dark:bg-slate-900"><div className="font-semibold text-gray-900 dark:text-slate-100">{part.part_name}</div><div className="text-xs text-gray-500 mt-1">{part.manufacturer || "Unknown manufacturer"} · {part.part_number || "No part #"} · stock {part.quantity_on_hand ?? 0}</div>{([part.storage_zone,part.storage_cabinet,part.storage_shelf,part.storage_bin].filter(Boolean).join(" · ") || part.location) && <div className="text-[11px] text-gray-500 mt-0.5">Location: {[part.storage_zone,part.storage_cabinet,part.storage_shelf,part.storage_bin].filter(Boolean).join(" · ") || part.location}</div>}<div className="mt-2 flex flex-wrap gap-3">{isAdmin && <button type="button" onClick={() => matchExisting(part)} disabled={busy} className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">This is the same part → match it</button>}<button type="button" onClick={() => openRequest(part)} disabled={busy} className="text-xs font-semibold text-sky-700 dark:text-sky-300">Request more of this</button></div></div>)}</div></section>}
          {requestPanel}
          <div className="grid lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 rounded-xl border border-gray-200 p-4 dark:border-slate-700"><div className="grid md:grid-cols-2 gap-3">
              <Field label="Part name *"><input value={candidate.part_name} onChange={e => set("part_name", e.target.value)} className="field" /></Field>
              <Field label="Primary part number" confidence={fieldConfidence("part_number")}><input value={candidate.part_number} onChange={e => set("part_number", e.target.value)} className="field" /></Field>
              <Field label="Manufacturer" confidence={fieldConfidence("manufacturer")}><input value={candidate.manufacturer} onChange={e => set("manufacturer", e.target.value)} className="field" /></Field>
              <Field label="Barcode"><input value={candidate.barcode_value} onChange={e => set("barcode_value", e.target.value)} className="field" /></Field>
              <Field label="Category *" confidence={fieldConfidence("category")}><input value={candidate.category} onChange={e => set("category", e.target.value)} className="field" /></Field>
              <Field label="Subcategory"><input value={candidate.subcategory} onChange={e => set("subcategory", e.target.value)} className="field" /></Field>
            </div><Field label="Alternate / cross-reference numbers"><input value={(candidate.alternate_part_numbers || []).join(", ")} onChange={e => set("alternate_part_numbers", e.target.value.split(",").map(value => value.trim()).filter(Boolean))} className="field" placeholder="Separate numbers with commas" /></Field><Field label="Description"><textarea rows={3} value={candidate.description} onChange={e => set("description", e.target.value)} className="field" /></Field><Field label="Specification / identifying details" confidence={fieldConfidence("specification")}><textarea rows={3} value={candidate.specification} onChange={e => set("specification", e.target.value)} className="field" /></Field></div>
            <div className="space-y-4"><InfoCard title="Why AI chose this" text={aiResult?.reasoning || "No reasoning returned."} /><InfoCard title="Verify before use" text={aiResult?.verification_notes || "Confirm identity and fitment before use."} attention /><InfoCard title="Detected label text" text={aiResult?.detected_text || identification?.detected_text || "No readable label text extracted."} />{(sourceLinks.length > 0 || candidate.vendor_url) && <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-slate-700 dark:bg-slate-800/50"><div className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Research sources</div><ul className="mt-2 space-y-1.5">{sourceLinks.slice(0, 5).map(url => <li key={url}><a href={url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1.5 truncate text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-300"><ExternalLink className="h-3 w-3 shrink-0" />{url.replace(/^https?:\/\//i, "").slice(0, 60)}</a></li>)}{candidate.vendor_url && /^https?:\/\//i.test(candidate.vendor_url) && <li><a href={candidate.vendor_url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1.5 truncate text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-300"><ExternalLink className="h-3 w-3 shrink-0" />{candidate.preferred_vendor || "Vendor"} listing</a></li>}</ul></div>}{(candidate.alternate_part_numbers || []).length > 0 && <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-slate-700 dark:bg-slate-800/50"><div className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Cross-reference numbers</div><div className="mt-2 flex flex-wrap gap-1.5">{candidate.alternate_part_numbers.slice(0, 8).map(num => <button type="button" key={num} type="button" onClick={() => reSearch(num)} disabled={busy} className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-white px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:bg-slate-900 dark:text-indigo-300"><RotateCcw className="w-3 h-3" />{num}</button>)}</div><div className="mt-1.5 text-[10px] text-gray-400">Tap a number to research it — this review stays saved in the inbox.</div></div>}</div>
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2"><button type="button" onClick={() => setStep("identify")} disabled={busy} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-700 inline-flex items-center justify-center gap-2"><ArrowLeft className="w-4 h-4" />Try another search</button><div className="flex flex-col sm:flex-row gap-2"><button type="button" onClick={() => openRequest(null)} disabled={busy || !candidate.part_name.trim()} title="Send this candidate to Fleet Requests without adding it to inventory" className="px-4 py-2 rounded-lg border border-sky-300 text-sky-800 dark:text-sky-200 font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40"><ShoppingCart className="w-4 h-4" />Request this part</button><button type="button" onClick={saveReview} disabled={busy} className="px-4 py-2 rounded-lg border border-indigo-300 text-indigo-700 dark:text-indigo-300 font-semibold">Save to Review Inbox</button><button type="button" onClick={() => setStep("organize")} disabled={busy} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold inline-flex items-center justify-center gap-2">Organize It <ArrowRight className="w-4 h-4" /></button></div></div>

        </div>}

        {step === "organize" && <div className="space-y-5">
          <div><h3 className="text-xl font-bold text-gray-900 dark:text-slate-100">Where does it belong?</h3><p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Connect the digital record to the actual shelf and the equipment it fits.</p></div>
          <div className="grid lg:grid-cols-2 gap-5">
            <section className="rounded-xl border border-gray-200 p-4 dark:border-slate-700 space-y-4"><h4 className="font-bold text-gray-900 dark:text-slate-100">Stock & physical location</h4><div className="grid grid-cols-2 gap-3"><Field label="Quantity found"><input type="number" min="0" step="1" value={candidate.quantity_on_hand} onChange={e => set("quantity_on_hand", Number(e.target.value || 0))} className="field" /></Field><Field label="Minimum stock"><input type="number" min="0" step="1" value={candidate.minimum_stock} onChange={e => set("minimum_stock", Number(e.target.value || 0))} className="field" /></Field><Field label="Area / Zone"><input value={candidate.storage_zone} onChange={e => set("storage_zone", e.target.value)} className="field" placeholder="Parts room" /></Field><Field label="Cabinet / Rack"><input value={candidate.storage_cabinet} onChange={e => set("storage_cabinet", e.target.value)} className="field" placeholder="Rack A" /></Field><Field label="Shelf"><input value={candidate.storage_shelf} onChange={e => set("storage_shelf", e.target.value)} className="field" placeholder="Shelf 3" /></Field><Field label="Bin"><input value={candidate.storage_bin} onChange={e => set("storage_bin", e.target.value)} className="field" placeholder="Bin B12" /></Field></div><Field label="Legacy/freeform location"><input value={candidate.location} onChange={e => set("location", e.target.value)} className="field" placeholder="Optional existing location wording" /></Field></section>
            <section className="rounded-xl border border-gray-200 p-4 dark:border-slate-700"><div className="flex items-start justify-between gap-3"><div><h4 className="font-bold text-gray-900 dark:text-slate-100">Compatible equipment</h4><p className="text-xs text-gray-500 mt-1">Select only fitment you are comfortable confirming.{fieldConfidence("fitment") ? " AI graded this fitment " + fieldConfidence("fitment") + " confidence." : ""}</p></div><div className="flex flex-col items-end gap-1.5">{(aiResult?.suggested_equipment_ids || []).length > 0 && <span className="text-[10px] rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300 px-2 py-1">AI suggested {(aiResult.suggested_equipment_ids || []).length}</span>}<button type="button" onClick={checkFitment} disabled={fitBusy || busy || !candidate.compatible_equipment_ids.length} title="Ask AI to verify fitment for the selected equipment — verdicts are review-only" className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-40 dark:border-indigo-800 dark:text-indigo-300">{fitBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <WandSparkles className="w-3.5 h-3.5" />}Check fitment</button></div></div><div className="mt-3 grid sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto">{activeEquipment.map(eq => { const selected = candidate.compatible_equipment_ids.includes(eq.id); const suggested = (aiResult?.suggested_equipment_ids || []).includes(eq.id); return <button type="button" key={eq.id} type="button" onClick={() => toggleEquipment(eq.id)} className={`text-left rounded-lg border p-3 ${selected ? "border-indigo-400 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950/30" : suggested ? "border-amber-300 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20" : "border-gray-200 dark:border-slate-700"}`}><div className="flex items-center justify-between gap-2"><div className="font-semibold text-sm text-gray-900 dark:text-slate-100">{eq.name}</div>{selected && <CheckCircle2 className="w-4 h-4 text-indigo-600" />}</div><div className="text-xs text-gray-500 mt-1">{[eq.year,eq.make,eq.model].filter(Boolean).join(" ") || eq.type}</div>{suggested && !selected && <div className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 mt-1">AI suggestion — tap to confirm</div>}{fitResults?.[eq.id] && <div className={`mt-1.5 rounded-md border px-2 py-1 text-[10px] font-semibold ${FIT_STYLE[fitResults[eq.id].verdict] || FIT_STYLE.uncertain}`}>{FIT_LABEL[fitResults[eq.id].verdict] || "Uncertain"}{fitResults[eq.id].reason ? ` — ${fitResults[eq.id].reason}` : ""}</div>}</button>; })}</div><Field label="Fitment notes"><textarea rows={3} value={candidate.compatibility_notes} onChange={e => set("compatibility_notes", e.target.value)} className="field mt-3" placeholder="Example: fits both Isuzu trucks; verify engine option before installation" /></Field></section>
          </div>
          <section className="rounded-xl border border-gray-200 p-4 dark:border-slate-700"><h4 className="font-bold text-gray-900 dark:text-slate-100 mb-3">Procurement</h4><div className="grid md:grid-cols-3 gap-3"><Field label="Preferred vendor"><input value={candidate.preferred_vendor} onChange={e => set("preferred_vendor", e.target.value)} className="field" /></Field><Field label="Vendor SKU"><input value={candidate.vendor_sku} onChange={e => set("vendor_sku", e.target.value)} className="field" /></Field><Field label="Unit cost"><input type="number" min="0" step="0.01" value={candidate.unit_cost} onChange={e => set("unit_cost", e.target.value)} className="field" /></Field></div>{(aiResult?.vendor_options || []).filter(opt => opt?.vendor).length > 0 && <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-slate-700 dark:bg-slate-800/40"><div className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">AI vendor options — tap to apply</div><div className="mt-2 grid sm:grid-cols-3 gap-2">{aiResult.vendor_options.filter(opt => opt?.vendor).slice(0, 3).map((opt, index) => <button type="button" key={index} type="button" onClick={() => { set("preferred_vendor", opt.vendor || ""); set("vendor_sku", opt.sku || ""); set("vendor_url", opt.url || ""); }} className="text-left rounded-lg border border-gray-200 bg-white p-2.5 hover:border-indigo-400 hover:bg-indigo-50/40 dark:border-slate-700 dark:bg-slate-900"><div className="text-sm font-semibold text-gray-900 dark:text-slate-100">{opt.vendor}</div><div className="text-[11px] text-gray-500 mt-0.5">{[opt.sku, opt.est_price].filter(Boolean).join(" · ") || "Details unverified"}</div>{opt.url && <div className="truncate text-[10px] text-indigo-600 dark:text-indigo-300 mt-0.5">{String(opt.url).replace(/^https?:\/\//i, "").slice(0, 50)}</div>}</button>)}</div></div>}</section>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2"><button type="button" onClick={() => setStep("verify")} disabled={busy} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-700 inline-flex items-center justify-center gap-2"><ArrowLeft className="w-4 h-4" />Back to identity</button><div className="flex flex-col sm:flex-row gap-2"><button type="button" onClick={saveReview} disabled={busy} className="px-4 py-2 rounded-lg border border-indigo-300 text-indigo-700 dark:text-indigo-300 font-semibold">Save for Later</button>{isAdmin && <button type="button" onClick={() => promote(false)} disabled={busy || duplicates.length > 0} title={duplicates.length ? "Resolve the possible duplicate before creating another part." : "Add reviewed part to Fleet inventory"} className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}Add to Fleet Parts</button>}{isAdmin && duplicates.length > 0 && <button type="button" onClick={() => promote(true)} disabled={busy} className="px-4 py-2 rounded-lg border border-red-300 text-red-700 dark:text-red-300 font-semibold">Create Separate Anyway</button>}</div></div>
        </div>}

        {step === "done" && <div className="min-h-[420px] flex flex-col items-center justify-center text-center"><div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center"><Check className="w-10 h-10 text-emerald-600" /></div><h3 className="mt-5 text-2xl font-bold text-gray-900 dark:text-slate-100">Part processed</h3><p className="mt-2 max-w-md text-sm text-gray-500 dark:text-slate-400">{savedMessage || "The part lookup has been reviewed."}</p><div className="mt-5 w-full max-w-lg">{requestPanel}</div><div className="mt-5 flex flex-col sm:flex-row gap-2">{actionedPart && !requestFor && !requestDone && <button type="button" onClick={() => openRequest(actionedPart)} className="px-4 py-2 rounded-lg border border-sky-300 text-sky-800 dark:text-sky-200 font-semibold inline-flex items-center justify-center gap-2"><ShoppingCart className="w-4 h-4" />Request more of this part</button>}<button type="button" onClick={resetForNewLookup} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold inline-flex items-center justify-center gap-2"><Camera className="w-4 h-4" />Process Next Part</button><button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-700">Done</button></div></div>}
      </div>
    </div>
    <style>{`.field{width:100%;border:1px solid rgb(209 213 219);border-radius:.6rem;padding:.6rem .72rem;background:white;color:inherit}.dark .field{background:rgb(15 23 42);border-color:rgb(51 65 85)}.field:focus{outline:2px solid rgb(99 102 241 / .35);outline-offset:1px}`}</style>
  </div>;
}

function Field({ label, children, confidence = "" }) {
  return <label className="block mt-3"><span className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-slate-400 mb-1">{label}{confidence && <span className={`inline-block rounded-full border px-1.5 py-px text-[9px] font-bold uppercase ${confidenceStyle[confidence] || confidenceStyle.low}`}>AI {confidence}</span>}</span>{children}</label>;
}
function InfoCard({ title, text, attention = false }) { return <div className={`rounded-xl border p-3 ${attention ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20" : "border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-800/50"}`}><div className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">{title}</div><div className="mt-1 text-sm text-gray-700 dark:text-slate-200 whitespace-pre-wrap">{text}</div></div>; }
