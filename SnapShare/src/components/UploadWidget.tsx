import React, { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  Clock,
  Download,
  Eye,
  Image as ImageIcon,
  Key,
  Lock,
  Settings2,
  Shield,
  SlidersHorizontal,
  Timer,
  Trash2,
  Upload,
} from "lucide-react";
import { ImageState } from "../types";

interface UploadWidgetProps {
  onUploadSuccess: (id: string, expiresAt: number) => void;
}

function dataUrlToBlob(dataUrl: string) {
  const [header, encoded] = dataUrl.split(",");
  const mime = header.match(/data:([^;]+)/)?.[1] || "application/octet-stream";
  const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

export default function UploadWidget({ onUploadSuccess }: UploadWidgetProps) {
  const QUICK_EXPIRY_OPTIONS = [
    { id: "5m", label: "5m", minutes: 5 },
    { id: "10m", label: "10m", minutes: 10 },
    { id: "30m", label: "30m", minutes: 30 },
    { id: "1h", label: "1h", minutes: 60 },
  ] as const;

  const [files, setFiles] = useState<ImageState[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStep, setUploadStep] = useState("");
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(true);

  const [expiry, setExpiry] = useState("1h");
  const [customMinutes, setCustomMinutes] = useState(12);
  const [customExpiryInput, setCustomExpiryInput] = useState("12");
  const [expiryError, setExpiryError] = useState("");
  const [password, setPassword] = useState("");
  const [oneTimeView, setOneTimeView] = useState(false);
  const [selfDestruct, setSelfDestruct] = useState(false);
  const [hideFilename, setHideFilename] = useState(false);
  const [allowDownload, setAllowDownload] = useState(true);
  const [compressImage, setCompressImage] = useState(true);
  const [compressionLevel, setCompressionLevel] = useState(72);
  const [customSlug, setCustomSlug] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);

  const selectedQuick = QUICK_EXPIRY_OPTIONS.find((o) => o.id === expiry);
  const effectiveExpiryMinutes = selectedQuick ? selectedQuick.minutes : customMinutes;
  const expiryPreview = `${effectiveExpiryMinutes} minute${effectiveExpiryMinutes === 1 ? "" : "s"} (${new Date(Date.now() + effectiveExpiryMinutes * 60000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`;

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const pasted: File[] = [];
      for (let i = 0; i < items.length; i += 1) {
        const file = items[i].getAsFile();
        if (file && file.type.startsWith("image/")) pasted.push(file);
      }
      if (pasted.length) processFiles(pasted);
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const processFiles = (incoming: File[]) => {
    setError("");
    for (const file of incoming) {
      if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
        setError("Only images and videos are supported.");
        continue;
      }

      const limitMb = file.type.startsWith("video/") ? 10 : 15;
      if (file.size > limitMb * 1024 * 1024) {
        setError(`${file.name} is over ${limitMb}MB.`);
        continue;
      }

      const previewUrl = URL.createObjectURL(file);
      const reader = new FileReader();
      reader.onload = () => {
        const data = typeof reader.result === "string" ? reader.result : "";
        if (!data) return;
        setFiles((prev) => {
          if (prev.some((f) => f.name === file.name && f.size === file.size)) return prev;
          return [...prev, {
            id: Math.random().toString(36).slice(2),
            name: file.name,
            size: file.size,
            type: file.type,
            file,
            data,
            previewUrl,
            progress: 0,
          }];
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const compressImageLocal = (base64Data: string, mime: string) => new Promise<string>((resolve) => {
    const img = new Image();
    img.src = base64Data;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let { width, height } = img;
      const maxW = 2200;
      const maxH = 1800;
      if (width > maxW || height > maxH) {
        const scale = Math.min(maxW / width, maxH / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(base64Data);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const quality = Math.max(0.3, Math.min(0.95, compressionLevel / 100));
      const outputType = mime.includes("png") ? "image/jpeg" : mime;
      resolve(canvas.toDataURL(outputType, quality));
    };
    img.onerror = () => resolve(base64Data);
  });

  const handleUpload = async () => {
    if (!files.length || isUploading) return;
    if (expiryError) return;
    setIsUploading(true);
    setUploadProgress(12);
    setUploadStep("Preparing files");
    setError("");

    try {
      const images: Array<{ name: string; type: string; size: number; url: string }> = [];
      for (let i = 0; i < files.length; i += 1) {
        const f = files[i];
        let data = f.data;
        if (compressImage && f.type.startsWith("image/") && f.size > 700 * 1024) {
          setUploadStep(`Optimizing ${f.name}`);
          data = await compressImageLocal(f.data, f.type);
        }
        const uploadBody = data === f.data ? f.file : dataUrlToBlob(data);
        const blob = await upload(f.name, uploadBody, {
          access: "private",
          handleUploadUrl: "/api/blob-upload",
          contentType: f.type,
          multipart: f.size > 4 * 1024 * 1024,
          onUploadProgress: ({ percentage }) => setUploadProgress(76 + Math.round(percentage * 0.2)),
        });
        images.push({ name: f.name, type: f.type, size: f.size, url: blob.url });
        setUploadProgress(76 + Math.round(((i + 1) / files.length) * 20));
      }

      setUploadStep("Saving transfer settings");
      setUploadProgress(96);

      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images,
          expiry,
          customExpiryMinutes: expiry === "custom" ? customMinutes : undefined,
          password: password.trim() || undefined,
          oneTimeView,
          selfDestruct,
          hideFilename,
          allowDownload,
          customSlug: customSlug.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      const historyItem = {
        id: data.id,
        createdAt: Date.now(),
        expiresAt: data.expiresAt,
        imagesCount: files.length,
        totalSize: files.reduce((sum, f) => sum + f.size, 0),
        passwordProtected: !!password.trim(),
        oneTimeView,
      };
      const stored = localStorage.getItem("snapshare_history");
      const list = stored ? JSON.parse(stored) : [];
      localStorage.setItem("snapshare_history", JSON.stringify([historyItem, ...list].slice(0, 30)));

      setUploadProgress(100);
      setUploadStep("Transfer ready");
      onUploadSuccess(data.id, data.expiresAt);
      setFiles([]);
      setPassword("");
      setCustomSlug("");
    } catch (e: any) {
      setError(e.message || "Upload failed");
    } finally {
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
        setUploadStep("");
      }, 320);
    }
  };

  const bytes = files.reduce((s, f) => s + f.size, 0);
  const human = bytes > 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;

  const clampCustomMinutes = (raw: string) => {
    setCustomExpiryInput(raw);
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
      setExpiryError("Enter custom expiry between 1 and 60 minutes.");
      return;
    }
    if (parsed < 1 || parsed > 60) {
      setExpiryError("Custom expiry cannot exceed 60 minutes.");
      return;
    }
    setExpiryError("");
    setCustomMinutes(parsed);
  };

  const settingToggle = (label: string, description: string, value: boolean, setValue: (v: boolean) => void, Icon: React.ComponentType<{ className?: string }>) => (
    <button
      type="button"
      onClick={() => setValue(!value)}
      className="flex w-full items-start justify-between rounded-xl border border-slate-200/80 bg-white/70 p-3 text-left dark:border-slate-800 dark:bg-slate-950/50"
    >
      <span className="flex gap-3">
        <Icon className="mt-0.5 h-4 w-4 text-blue-500" />
        <span>
          <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">{description}</span>
        </span>
      </span>
      <span className={`h-6 w-11 rounded-full p-1 transition ${value ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-700"}`}>
        <span className={`block h-4 w-4 rounded-full bg-white transition ${value ? "translate-x-5" : "translate-x-0"}`} />
      </span>
    </button>
  );

  return (
    <div className="space-y-5">
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); processFiles(Array.from(e.dataTransfer.files)); }}
        onClick={() => inputRef.current?.click()}
        className={`premium-card gradient-hero cursor-pointer border-2 border-dashed p-8 text-center transition ${isDragging ? "border-blue-500" : "border-slate-300 dark:border-slate-700"}`}
      >
        <input ref={inputRef} type="file" className="hidden" multiple accept="image/*,video/*" onChange={(e) => processFiles(Array.from(e.target.files || []))} />
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm dark:bg-slate-900">
          <Upload className="h-6 w-6 text-blue-600" />
        </div>
        <h3 className="font-display text-xl font-bold">Drop files or click to upload</h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">PNG, JPG, WEBP, GIF, MP4. Paste screenshots from clipboard too.</p>
      </div>

      {!!error && <div className="rounded-xl border border-red-300/40 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">{error}</div>}

      {!!files.length && (
        <div className="premium-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">{files.length} files selected</p>
            <p className="text-xs text-slate-500">{human}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {files.map((file) => (
              <div key={file.id} className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                {file.type.startsWith("video/") ? <video src={file.previewUrl} className="h-full w-full object-cover" /> : <img src={file.previewUrl} alt={file.name} className="h-full w-full object-cover" />}
                <button type="button" onClick={(e) => { e.stopPropagation(); setFiles((prev) => prev.filter((x) => x.id !== file.id)); }} className="absolute right-2 top-2 rounded-full bg-black/55 p-1 text-white opacity-0 transition group-hover:opacity-100">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="premium-card overflow-hidden">
        <button type="button" onClick={() => setShowSettings((s) => !s)} className="flex w-full items-center justify-between p-4 text-left">
          <span className="flex items-center gap-2 font-display font-bold"><Settings2 className="h-4 w-4 text-blue-500" /> Advanced transfer settings</span>
          <SlidersHorizontal className={`h-4 w-4 text-slate-500 transition ${showSettings ? "rotate-180" : ""}`} />
        </button>
        <AnimatePresence>
          {showSettings && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-4 border-t border-slate-200 p-4 dark:border-slate-800">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="text-sm md:col-span-2">
                  <span className="mb-2 block font-semibold"><Clock className="mr-2 inline h-4 w-4 text-blue-500" />Expiry window</span>
                  <div className="grid grid-cols-5 gap-2">
                    {QUICK_EXPIRY_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => { setExpiry(option.id); setExpiryError(""); }}
                        className={`rounded-xl border px-2 py-2 text-center text-sm font-semibold transition ${expiry === option.id ? "border-blue-500 bg-blue-500 text-white shadow-sm" : "border-slate-300 bg-white hover:border-blue-300 dark:border-slate-700 dark:bg-slate-950"}`}
                      >
                        {option.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setExpiry("custom")}
                      className={`rounded-xl border px-2 py-2 text-center text-sm font-semibold transition ${expiry === "custom" ? "border-blue-500 bg-blue-500 text-white shadow-sm" : "border-slate-300 bg-white hover:border-blue-300 dark:border-slate-700 dark:bg-slate-950"}`}
                    >
                      Custom
                    </button>
                  </div>
                  {expiry === "custom" && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/70">
                      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                        <label className="text-sm">
                          <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Custom expiry (1-60 min)</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={60}
                            value={customExpiryInput}
                            onChange={(e) => clampCustomMinutes(e.target.value)}
                            className="w-full rounded-xl border border-slate-300 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-950"
                          />
                        </label>
                        <label className="text-sm">
                          <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Quick adjust</span>
                          <input
                            type="range"
                            min={1}
                            max={60}
                            value={customMinutes}
                            onChange={(e) => {
                              const next = Number(e.target.value);
                              setCustomMinutes(next);
                              setCustomExpiryInput(String(next));
                              setExpiryError("");
                            }}
                            className="w-full md:w-44"
                          />
                        </label>
                      </div>
                      {expiryError ? (
                        <p className="mt-2 text-xs font-medium text-red-500">{expiryError}</p>
                      ) : (
                        <p className="mt-2 text-xs text-slate-500">Allowed examples: 7, 12, 45, 59 minutes. Values above 60 are rejected.</p>
                      )}
                    </motion.div>
                  )}
                  <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-700 dark:border-blue-900/60 dark:text-blue-300">
                    <Timer className="h-3.5 w-3.5" />
                    Expires in {expiryPreview}
                  </div>
                </div>
                <label className="text-sm">
                  <span className="mb-1 block font-semibold"><Lock className="mr-2 inline h-4 w-4 text-blue-500" />Password protection</span>
                  <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Optional" className="w-full rounded-xl border border-slate-300 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-950" />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {settingToggle("One-time view", "Delete 15 seconds after first open.", oneTimeView, setOneTimeView, Eye)}
                {settingToggle("Auto-delete on first download", "Delete immediately after a download request.", selfDestruct, setSelfDestruct, Shield)}
                {settingToggle("Disable downloads", "Allow viewing but block direct download action.", !allowDownload, (v) => setAllowDownload(!v), Download)}
                {settingToggle("Hide original filenames", "Expose neutral names in the receiver UI.", hideFilename, setHideFilename, ImageIcon)}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block font-semibold">Compression</span>
                  <select value={compressImage ? "on" : "off"} onChange={(e) => setCompressImage(e.target.value === "on")} className="w-full rounded-xl border border-slate-300 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-950">
                    <option value="on">Smart compression</option>
                    <option value="off">Lossless source</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-semibold">Compression quality ({compressionLevel}%)</span>
                  <input type="range" min={45} max={95} value={compressionLevel} onChange={(e) => setCompressionLevel(Number(e.target.value))} className="w-full" />
                </label>
              </div>

              <label className="block text-sm">
                <span className="mb-1 block font-semibold"><Key className="mr-2 inline h-4 w-4 text-blue-500" />Custom link slug (optional)</span>
                <input value={customSlug} onChange={(e) => setCustomSlug(e.target.value.replace(/[^a-zA-Z0-9-_]/g, ""))} placeholder="team-handoff-2026" className="w-full rounded-xl border border-slate-300 bg-white p-2.5 font-mono dark:border-slate-700 dark:bg-slate-950" />
              </label>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <button disabled={!files.length || isUploading || !!expiryError} type="button" onClick={handleUpload} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3.5 font-display font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400 dark:disabled:bg-slate-700">
        {isUploading ? `Uploading ${uploadProgress}%` : "Create Secure Share"}
        <ArrowRight className="h-4 w-4" />
      </button>
      {isUploading && <p className="text-center text-xs font-mono text-slate-500">{uploadStep}</p>}
    </div>
  );
}
