"use client";

import { useState } from "react";
import { Check, Search } from "lucide-react";

import { SettingsSwitch } from "@/components/settings/SettingsSwitch";
import { Button } from "@/components/ui/button";
import { FIELD_LABELS } from "@/lib/document-schema";
import type { FieldKey } from "@/types/pipeline";

function FieldToggle({ enabled, disabled, label, onToggle }: {
  enabled: boolean; disabled: boolean; label: string; onToggle: () => void;
}) {
  return (
    <button
      aria-pressed={enabled}
      className={`flex min-h-10 items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition ${
        enabled ? "border-[#ded8d0] bg-[#fdfcfa] hover:border-[#c8bfb0]" : "border-[#e8e2d8] bg-[#f9f8f6] opacity-60"
      } ${disabled ? "opacity-40" : "hover:bg-[#f5f1eb]"}`}
      disabled={disabled}
      onClick={onToggle}
      type="button"
    >
      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
        enabled ? "border-[#2b1a10] bg-[#2b1a10] text-white" : "border-[#ded8d0] bg-white text-transparent"
      }`}>
        <Check className="h-3 w-3" />
      </span>
      <span className="min-w-0 truncate text-xs font-medium text-[#111827]">{label}</span>
    </button>
  );
}

function FieldSection({ title, description, fields, fieldMap, disabled, onToggle }: {
  title: string; description: string; fields: FieldKey[]; fieldMap: Record<string, boolean>;
  disabled: boolean; onToggle: (fieldKey: FieldKey) => void;
}) {
  if (fields.length === 0) return null;
  return (
    <section>
      <div className="mb-2.5 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#8a7f72]">{title}</h3>
          <p className="text-xs text-[#8a7f72]">{description}</p>
        </div>
        <span className="text-xs font-medium text-[#8a7f72]">
          {fields.filter((fieldKey) => fieldMap[fieldKey] ?? true).length}/{fields.length} active
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        {fields.map((fieldKey) => (
          <FieldToggle
            disabled={disabled}
            enabled={fieldMap[fieldKey] ?? true}
            key={fieldKey}
            label={FIELD_LABELS[fieldKey]}
            onToggle={() => onToggle(fieldKey)}
          />
        ))}
      </div>
    </section>
  );
}

export function DocumentFieldsTab({ docTypes, loading, docTypeEnabled, fieldEnabled, configurableFields, isPriorityField, onToggleDocType, onToggleField, onSetAllFields }: {
  docTypes: string[];
  loading: boolean;
  docTypeEnabled: Record<string, boolean>;
  fieldEnabled: Record<string, Record<string, boolean>>;
  configurableFields: (docType: string) => FieldKey[];
  isPriorityField: (fieldKey: FieldKey) => boolean;
  onToggleDocType: (docType: string) => void;
  onToggleField: (docType: string, fieldKey: FieldKey) => void;
  onSetAllFields: (docType: string, enabled: boolean) => void;
}) {
  const [selectedDocType, setSelectedDocType] = useState(docTypes[0] ?? "");
  const [search, setSearch] = useState("");
  const filteredDocTypes = docTypes.filter((docType) => docType.toLowerCase().includes(search.trim().toLowerCase()));
  const selectedEnabled = docTypeEnabled[selectedDocType] ?? true;
  const selectedFields = configurableFields(selectedDocType);
  const selectedFieldMap = fieldEnabled[selectedDocType] ?? {};

  return (
    <>
      <aside className="w-full shrink-0 rounded-xl border border-[#ded8d0] bg-white p-3 shadow-2xs md:w-[280px]">
        <div className="relative mb-2.5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8a7f72]" />
          <input
            className="w-full rounded-lg border border-[#ded8d0] bg-[#fbfaf8] py-1.5 pl-8 pr-3 text-xs text-[#111827] outline-none transition placeholder:text-[#a89e92] focus:border-[#2b1a10] focus:bg-white"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search documents..."
            type="search"
            value={search}
          />
        </div>
        <div className="max-h-[560px] space-y-1 overflow-y-auto pr-1">
          {filteredDocTypes.map((docType) => {
            const fields = configurableFields(docType);
            const activeCount = fields.filter((fieldKey) => fieldEnabled[docType]?.[fieldKey] ?? true).length;
            return (
              <button
                className={`w-full rounded-lg px-2.5 py-2 text-left transition ${
                  selectedDocType === docType ? "bg-[#ede6d9] font-medium text-[#2b1a10] shadow-2xs" : "text-[#3d3530] hover:bg-[#f7f4ef]"
                }`}
                key={docType}
                onClick={() => setSelectedDocType(docType)}
                type="button"
              >
                <div className="flex items-center justify-between gap-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold">{docType}</div>
                    <div className="mt-0.5 text-[11px] font-normal text-[#8a7f72]">{activeCount}/{fields.length} fields active</div>
                  </div>
                  <span onClick={(event) => { event.stopPropagation(); onToggleDocType(docType); }}>
                    <SettingsSwitch checked={docTypeEnabled[docType] ?? true} />
                  </span>
                </div>
              </button>
            );
          })}
          {filteredDocTypes.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#ded8d0] p-4 text-center text-xs text-[#8a7f72]">No document types found.</div>
          ) : null}
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        {loading ? (
          <div className="space-y-3">
            <div className="h-16 animate-pulse rounded-xl bg-[#ede6d9]/50" />
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 12 }).map((_, index) => <div className="h-12 animate-pulse rounded-lg bg-[#ede6d9]/50" key={index} />)}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-[#ded8d0] bg-white px-5 py-4 shadow-2xs">
            <div className="flex flex-col gap-3 border-b border-[#f0ece4] pb-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-base font-bold tracking-tight text-[#111827]">{selectedDocType}</h2>
                <p className="mt-1 text-xs text-[#5b4b3d]">Whether this document type takes part in extraction, comparison and mismatch review, and which of its fields are checked.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  aria-pressed={selectedEnabled}
                  className="flex items-center gap-2 rounded-lg border border-[#ded8d0] bg-[#fbfaf8] px-3 py-1.5 text-xs font-medium text-[#2b1a10] shadow-sm transition hover:bg-[#ede6d9]"
                  onClick={() => onToggleDocType(selectedDocType)}
                  type="button"
                >
                  <SettingsSwitch checked={selectedEnabled} />
                  <span>{selectedEnabled ? "Included" : "Excluded"}</span>
                </button>
                <Button className="h-7 rounded-md px-2.5 text-xs" disabled={!selectedEnabled} onClick={() => onSetAllFields(selectedDocType, true)} type="button" variant="outline">Enable all</Button>
                <Button className="h-7 rounded-md px-2.5 text-xs" disabled={!selectedEnabled} onClick={() => onSetAllFields(selectedDocType, false)} type="button" variant="outline">Disable all</Button>
              </div>
            </div>

            {selectedEnabled ? null : (
              <div className="mt-4 rounded-lg border border-[#f59e0b]/25 bg-[#fff7e6] px-3.5 py-2.5 text-xs font-medium text-[#a16207]">
                Excluded documents are ignored by the workflow until included again.
              </div>
            )}

            <div className="mt-4 space-y-5">
              <FieldSection
                description="Key fields checked most often for reconciliation."
                disabled={!selectedEnabled}
                fieldMap={selectedFieldMap}
                fields={selectedFields.filter(isPriorityField)}
                onToggle={(fieldKey) => onToggleField(selectedDocType, fieldKey)}
                title="Essential fields"
              />
              <FieldSection
                description="Additional fields available for this document type."
                disabled={!selectedEnabled}
                fieldMap={selectedFieldMap}
                fields={selectedFields.filter((fieldKey) => !isPriorityField(fieldKey))}
                onToggle={(fieldKey) => onToggleField(selectedDocType, fieldKey)}
                title="Optional fields"
              />
            </div>
          </div>
        )}
      </main>
    </>
  );
}
