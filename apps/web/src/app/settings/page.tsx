"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";

import { AppShell } from "@/components/dashboard/AppShell";
import { apiFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_COMPARISON_FIELD_GROUPS,
  fetchComparisonGroups,
  normalizeComparisonGroupKey,
  saveComparisonGroups,
  sanitizeComparisonGroups,
  type ComparisonFieldGroup,
} from "@/lib/comparison-groups";
import {
  DOC_TYPE_EXTRACTION_FIELDS,
  FIELD_DEFINITIONS,
  FIELD_LABELS,
  IGNORED_PACKET_FIELD_KEYS,
  buildPacketFieldConfiguration,
  setPacketFieldConfiguration,
} from "@/lib/document-schema";
import type { DocType, FieldKey } from "@/types/pipeline";

type ActiveTab = "documents" | "groups";
type BannerState = {
  tone: "success" | "error";
  text: string;
} | null;

type SettingsResponse = {
  fieldSettings?: Array<{ doc_type: string; field_key: string; enabled: boolean }>;
  docTypeSettings?: Array<{ doc_type: string; enabled: boolean }>;
  error?: string;
};

type DocTypeEnabledState = Record<string, boolean>;
type FieldEnabledState = Record<string, Record<string, boolean>>;

const AVAILABLE_DOC_TYPES = (Object.keys(DOC_TYPE_EXTRACTION_FIELDS) as DocType[]).filter(
  (docType) => docType !== "Unknown"
);

const HIDDEN_SETTING_FIELD_KEYS = new Set<string>(IGNORED_PACKET_FIELD_KEYS);
const PRIORITY_FIELD_KEYS = new Set<FieldKey>(
  FIELD_DEFINITIONS.filter((field) => field.important).map((field) => field.key)
);

function getConfigurableFields(docType: string): FieldKey[] {
  const seen = new Set<string>();

  return (DOC_TYPE_EXTRACTION_FIELDS[docType as DocType] ?? []).flatMap((fieldKey) => {
    if (HIDDEN_SETTING_FIELD_KEYS.has(fieldKey) || seen.has(fieldKey)) {
      return [];
    }

    seen.add(fieldKey);
    return [fieldKey];
  });
}

function createDefaultDocTypeState(): DocTypeEnabledState {
  return Object.fromEntries(AVAILABLE_DOC_TYPES.map((docType) => [docType, true]));
}

function createDefaultFieldState(): FieldEnabledState {
  return Object.fromEntries(
    AVAILABLE_DOC_TYPES.map((docType) => [
      docType,
      Object.fromEntries(getConfigurableFields(docType).map((fieldKey) => [fieldKey, true])),
    ])
  );
}

function buildStateFromPayload(payload?: SettingsResponse) {
  const docTypeEnabled = createDefaultDocTypeState();
  const fieldEnabled = createDefaultFieldState();

  for (const setting of payload?.docTypeSettings ?? []) {
    if (setting.doc_type in docTypeEnabled) {
      docTypeEnabled[setting.doc_type] = Boolean(setting.enabled);
    }
  }

  for (const setting of payload?.fieldSettings ?? []) {
    if (!(setting.doc_type in fieldEnabled)) {
      continue;
    }

    if (!(setting.field_key in fieldEnabled[setting.doc_type])) {
      continue;
    }

    fieldEnabled[setting.doc_type][setting.field_key] = Boolean(setting.enabled);
  }

  return { docTypeEnabled, fieldEnabled };
}

function serializeSettings(docTypeEnabled: DocTypeEnabledState, fieldEnabled: FieldEnabledState) {
  return JSON.stringify({
    docTypeSettings: AVAILABLE_DOC_TYPES.map((docType) => [docType, docTypeEnabled[docType] ?? true]),
    fieldSettings: AVAILABLE_DOC_TYPES.flatMap((docType) =>
      getConfigurableFields(docType).map((fieldKey) => [
        docType,
        fieldKey,
        fieldEnabled[docType]?.[fieldKey] ?? true,
      ])
    ),
  });
}

function serializeComparisonGroups(groups: ComparisonFieldGroup[]) {
  return JSON.stringify(
    sanitizeComparisonGroups(groups).map((group, index) => ({
      groupKey: group.groupKey,
      label: group.label,
      fields: group.fields,
      enabled: group.enabled,
      sortOrder: group.sortOrder || (index + 1) * 10,
    }))
  );
}

const AVAILABLE_GROUP_FIELDS = FIELD_DEFINITIONS.filter(
  (field) => !HIDDEN_SETTING_FIELD_KEYS.has(field.key)
);

async function getResponseError(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };
    if (payload?.error) {
      return payload.error;
    }
  } catch {}

  try {
    const text = await response.text();
    if (text) {
      return text;
    }
  } catch {}

  return `Request failed with status ${response.status}`;
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("documents");
  const [selectedDocType, setSelectedDocType] = useState<string>(AVAILABLE_DOC_TYPES[0] ?? "");
  const [docTypeEnabled, setDocTypeEnabled] = useState<DocTypeEnabledState>(() =>
    createDefaultDocTypeState()
  );
  const [fieldEnabled, setFieldEnabled] = useState<FieldEnabledState>(() => createDefaultFieldState());
  const [comparisonGroups, setComparisonGroups] = useState<ComparisonFieldGroup[]>(() =>
    DEFAULT_COMPARISON_FIELD_GROUPS
  );
  const [selectedGroupKey, setSelectedGroupKey] = useState(
    DEFAULT_COMPARISON_FIELD_GROUPS[0]?.groupKey ?? ""
  );
  const [savedSignature, setSavedSignature] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<BannerState>(null);

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      try {
        setLoading(true);
        setBanner(null);

        const [response, loadedGroups] = await Promise.all([
          apiFetch("/api/settings/field", {
            method: "GET",
            cache: "no-store",
          }),
          fetchComparisonGroups(),
        ]);

        if (!response.ok) {
          throw new Error(await getResponseError(response));
        }

        const payload = (await response.json()) as SettingsResponse;
        const hydratedState = buildStateFromPayload(payload);

        if (cancelled) {
          return;
        }

        setDocTypeEnabled(hydratedState.docTypeEnabled);
        setFieldEnabled(hydratedState.fieldEnabled);
        setComparisonGroups(loadedGroups);
        setSelectedGroupKey(loadedGroups[0]?.groupKey ?? "");
        setSavedSignature(
          `${serializeSettings(hydratedState.docTypeEnabled, hydratedState.fieldEnabled)}:${serializeComparisonGroups(loadedGroups)}`
        );
      } catch (error) {
        const fallbackDocTypeState = createDefaultDocTypeState();
        const fallbackFieldState = createDefaultFieldState();
        const fallbackGroups = DEFAULT_COMPARISON_FIELD_GROUPS;

        if (cancelled) {
          return;
        }

        setDocTypeEnabled(fallbackDocTypeState);
        setFieldEnabled(fallbackFieldState);
        setComparisonGroups(fallbackGroups);
        setSelectedGroupKey(fallbackGroups[0]?.groupKey ?? "");
        setSavedSignature(
          `${serializeSettings(fallbackDocTypeState, fallbackFieldState)}:${serializeComparisonGroups(fallbackGroups)}`
        );
        setBanner({
          tone: "error",
          text:
            error instanceof Error
              ? `${error.message}. Showing default settings.`
              : "Could not load saved settings. Showing default settings.",
        });
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  const currentSignature = `${serializeSettings(docTypeEnabled, fieldEnabled)}:${serializeComparisonGroups(comparisonGroups)}`;
  const hasUnsavedChanges = savedSignature !== currentSignature;

  const selectedDocTypeEnabled = docTypeEnabled[selectedDocType] ?? true;
  const selectedFields = getConfigurableFields(selectedDocType);
  const selectedFieldMap = fieldEnabled[selectedDocType] ?? {};
  const selectedPriorityFields = selectedFields.filter((fieldKey) =>
    PRIORITY_FIELD_KEYS.has(fieldKey)
  );
  const selectedStandardFields = selectedFields.filter(
    (fieldKey) => !PRIORITY_FIELD_KEYS.has(fieldKey)
  );

  const enabledDocTypeCount = AVAILABLE_DOC_TYPES.filter(
    (docType) => docTypeEnabled[docType] ?? true
  ).length;
  const totalFieldCount = AVAILABLE_DOC_TYPES.reduce(
    (count, docType) => count + getConfigurableFields(docType).length,
    0
  );
  const enabledFieldCount = AVAILABLE_DOC_TYPES.reduce(
    (count, docType) =>
      count +
      getConfigurableFields(docType).filter((fieldKey) => fieldEnabled[docType]?.[fieldKey] ?? true)
        .length,
    0
  );
  const selectedGroup =
    comparisonGroups.find((group) => group.groupKey === selectedGroupKey) ?? comparisonGroups[0] ?? null;

  function handleToggleDocType(docType: string) {
    setBanner(null);
    setDocTypeEnabled((current) => ({
      ...current,
      [docType]: !(current[docType] ?? true),
    }));
  }

  function handleToggleField(docType: string, fieldKey: FieldKey) {
    setBanner(null);
    setFieldEnabled((current) => ({
      ...current,
      [docType]: {
        ...current[docType],
        [fieldKey]: !(current[docType]?.[fieldKey] ?? true),
      },
    }));
  }

  function handleSetAllFields(docType: string, enabled: boolean) {
    setBanner(null);
    setFieldEnabled((current) => ({
      ...current,
      [docType]: Object.fromEntries(
        getConfigurableFields(docType).map((fieldKey) => [fieldKey, enabled])
      ),
    }));
  }

  function handleResetDefaults() {
    setBanner(null);
    if (activeTab === "groups") {
      setComparisonGroups(DEFAULT_COMPARISON_FIELD_GROUPS);
      setSelectedGroupKey(DEFAULT_COMPARISON_FIELD_GROUPS[0]?.groupKey ?? "");
      return;
    }

    setDocTypeEnabled(createDefaultDocTypeState());
    setFieldEnabled(createDefaultFieldState());
  }

  function handleAddGroup() {
    setBanner(null);
    const index = comparisonGroups.length + 1;
    const group: ComparisonFieldGroup = {
      groupKey: `custom_group_${Date.now()}`,
      label: `New Group ${index}`,
      fields: [],
      enabled: true,
      sortOrder: index * 10,
    };
    setComparisonGroups((current) => [...current, group]);
    setSelectedGroupKey(group.groupKey);
    setActiveTab("groups");
  }

  function handleUpdateGroup(groupKey: string, updates: Partial<ComparisonFieldGroup>) {
    setBanner(null);
    setComparisonGroups((current) =>
      current.map((group) => (group.groupKey === groupKey ? { ...group, ...updates } : group))
    );
  }

  function handleRenameGroup(groupKey: string, label: string) {
    const nextKey = normalizeComparisonGroupKey(label, groupKey);
    setBanner(null);
    setComparisonGroups((current) =>
      current.map((group) =>
        group.groupKey === groupKey
          ? {
              ...group,
              label,
              groupKey: nextKey,
            }
          : group
      )
    );
    setSelectedGroupKey(nextKey);
  }

  function handleToggleGroupField(groupKey: string, fieldKey: string) {
    setBanner(null);
    setComparisonGroups((current) =>
      current.map((group) => {
        if (group.groupKey !== groupKey) return group;
        const fields = group.fields.includes(fieldKey)
          ? group.fields.filter((field) => field !== fieldKey)
          : [...group.fields, fieldKey];
        return { ...group, fields };
      })
    );
  }

  function handleDeleteGroup(groupKey: string) {
    setBanner(null);
    setComparisonGroups((current) => {
      const next = current.filter((group) => group.groupKey !== groupKey);
      if (selectedGroupKey === groupKey) {
        setSelectedGroupKey(next[0]?.groupKey ?? "");
      }
      return next;
    });
  }

  async function handleSave() {
    try {
      setSaving(true);
      setBanner(null);

      const docTypeSettingsPayload = AVAILABLE_DOC_TYPES.map((docType) => ({
        docType,
        enabled: docTypeEnabled[docType] ?? true,
      }));

      const fieldSettingsPayload = AVAILABLE_DOC_TYPES.flatMap((docType) =>
        getConfigurableFields(docType).map((fieldKey) => ({
          docType,
          fieldKey,
          enabled: fieldEnabled[docType]?.[fieldKey] ?? true,
        }))
      );

      const [docTypeResponse, fieldResponse, groupResponse] = await Promise.all([
        apiFetch("/api/settings/doctype", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ settings: docTypeSettingsPayload }),
        }),
        apiFetch("/api/settings/field", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ settings: fieldSettingsPayload }),
        }),
        saveComparisonGroups(
          comparisonGroups.map((group, index) => ({
            ...group,
            sortOrder: (index + 1) * 10,
          }))
        ),
      ]);

      if (!docTypeResponse.ok) {
        throw new Error(await getResponseError(docTypeResponse));
      }

      if (!fieldResponse.ok) {
        throw new Error(await getResponseError(fieldResponse));
      }

      if (!groupResponse.success) {
        throw new Error("Failed to save comparison groups.");
      }

      setPacketFieldConfiguration(
        buildPacketFieldConfiguration({
          docTypeSettings: docTypeSettingsPayload.map((setting) => ({
            doc_type: setting.docType,
            enabled: setting.enabled,
          })),
          fieldSettings: fieldSettingsPayload.map((setting) => ({
            doc_type: setting.docType,
            field_key: setting.fieldKey,
            enabled: setting.enabled,
          })),
        })
      );

      const savedGroups = sanitizeComparisonGroups(groupResponse.groups);
      setComparisonGroups(savedGroups);
      const nextSignature = `${serializeSettings(docTypeEnabled, fieldEnabled)}:${serializeComparisonGroups(savedGroups)}`;
      setSavedSignature(nextSignature);
      setBanner({
        tone: "success",
        text: "Settings saved. New checks will follow field settings, and mismatch pages will use the saved groups.",
      });
    } catch (error) {
      setBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "Failed to save settings.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="min-h-screen bg-[#f7f7f5] text-[#1a1a1a]">
        <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-8">
          <header className="mb-8 flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-tight">Document Field and Type Settings</h1>
            <div className="flex gap-3">
              <Button
                className="font-bold text-[#8a7f72]"
                disabled={loading || saving}
                onClick={handleResetDefaults}
                type="button"
                variant="ghost"
              >
                Reset to defaults
              </Button>
              <Button
                className="rounded-xl bg-[#1a1a1a] px-8 font-bold text-white shadow-lg shadow-[#1a1a1a]/20"
                disabled={loading || saving || !hasUnsavedChanges}
                onClick={handleSave}
                type="button"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save settings"
                )}
              </Button>
            </div>
          </header>

          {banner ? (
            <div
              className={`mb-6 rounded-2xl border px-4 py-3 text-sm font-medium ${
                banner.tone === "success"
                  ? "border-[#10b981]/20 bg-[#ecfdf5] text-[#047857]"
                  : "border-[#ef4444]/20 bg-[#fff1f2] text-[#b91c1c]"
              }`}
            >
              {banner.text}
            </div>
          ) : null}

          <div className="mb-4 inline-flex rounded-xl border border-[#e5ddd0] bg-white p-1 shadow-sm">
            <button
              className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
                activeTab === "documents"
                  ? "bg-[#1a1a1a] text-white"
                  : "text-[#8a7f72] hover:bg-[#f3eee7] hover:text-[#1a1a1a]"
              }`}
              onClick={() => setActiveTab("documents")}
              type="button"
            >
              Document fields
            </button>
            <button
              className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
                activeTab === "groups"
                  ? "bg-[#1a1a1a] text-white"
                  : "text-[#8a7f72] hover:bg-[#f3eee7] hover:text-[#1a1a1a]"
              }`}
              onClick={() => setActiveTab("groups")}
              type="button"
            >
              Comparison groups
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[#e5ddd0] bg-white shadow-sm">
            <div className="flex h-[calc(100vh-220px)] flex-col md:flex-row">
              {activeTab === "documents" ? (
                <>
                <aside className="w-full overflow-y-auto border-r border-[#e5ddd0] bg-[#fafafa]/50 p-4 md:w-80">
                  <div className="mb-4 px-2 text-[10px] font-bold uppercase tracking-widest text-[#8a7f72]">
                    DOCUMENT TYPES
                  </div>

                  <div className="space-y-2">
                    {AVAILABLE_DOC_TYPES.map((docType) => {
                      const docFields = getConfigurableFields(docType);
                      const docEnabledFieldCount = docFields.filter(
                        (fieldKey) => fieldEnabled[docType]?.[fieldKey] ?? true
                      ).length;
                      const isSelected = selectedDocType === docType;
                      const isEnabled = docTypeEnabled[docType] ?? true;

                      return (
                        <button
                          key={docType}
                          onClick={() => setSelectedDocType(docType)}
                          type="button"
                          className={`w-full rounded-xl p-3 text-left transition-all ${
                            isSelected
                              ? "bg-[#10b981]/10 ring-1 ring-[#10b981]/30"
                              : "hover:bg-[#f0ece6]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div
                                className={`text-sm font-bold ${
                                  isSelected ? "text-[#065f46]" : "text-[#1a1a1a]"
                                }`}
                              >
                                {docType}
                              </div>
                              <div
                                className={`mt-1 text-[11px] font-medium leading-tight ${
                                  isSelected ? "text-[#065f46]/70" : "text-[#8a7f72]"
                                }`}
                              >
                                {docEnabledFieldCount} of {docFields.length} checks on
                              </div>
                            </div>

                            <Badge
                              className={
                                isEnabled
                                  ? "border-[#10b981]/20 bg-[#ecfdf5] text-[#047857]"
                                  : "border-[#e5ddd0] bg-white text-[#8a7f72]"
                              }
                              variant="outline"
                            >
                              {isEnabled ? "On" : "Off"}
                            </Badge>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </aside>

                <main className="flex-1 overflow-y-auto p-6 sm:p-8">
                  {loading ? (
                    <div className="space-y-4">
                      <div className="h-14 animate-pulse rounded-2xl bg-[#f3eee7]" />
                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="h-24 animate-pulse rounded-2xl bg-[#f3eee7]" />
                        <div className="h-24 animate-pulse rounded-2xl bg-[#f3eee7]" />
                        <div className="h-24 animate-pulse rounded-2xl bg-[#f3eee7]" />
                      </div>
                      <div className="grid gap-4 lg:grid-cols-2">
                        {Array.from({ length: 6 }).map((_, index) => (
                          <div key={index} className="h-24 animate-pulse rounded-2xl bg-[#f3eee7]" />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mb-8 flex flex-col gap-4 rounded-2xl border border-[#e5ddd0] bg-[#fafafa] p-4 lg:flex-row lg:items-center lg:justify-between">
                        <label className="flex items-start gap-3">
                          <input
                            checked={selectedDocTypeEnabled}
                            className="mt-1 h-4 w-4 rounded border-[#d8ccbc] accent-[#10b981]"
                            onChange={() => handleToggleDocType(selectedDocType)}
                            type="checkbox"
                          />
                          <div>
                            <div className="text-sm font-bold text-[#1a1a1a]">
                              Use this document type in case checks
                            </div>
                            <div className="mt-0.5 text-[11px] font-medium text-[#8a7f72]">
                              If turned off, this document type will not affect extraction output,
                              comparison, or mismatch results.
                            </div>
                          </div>
                        </label>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            className="rounded-xl border-[#e5ddd0] bg-white text-[#1a1a1a] hover:bg-[#f3eee7]"
                            onClick={() => handleSetAllFields(selectedDocType, true)}
                            type="button"
                            variant="outline"
                          >
                            Enable all fields
                          </Button>
                          <Button
                            className="rounded-xl border-[#e5ddd0] bg-white text-[#1a1a1a] hover:bg-[#f3eee7]"
                            onClick={() => handleSetAllFields(selectedDocType, false)}
                            type="button"
                            variant="outline"
                          >
                            Disable all fields
                          </Button>
                        </div>
                      </div>

                      {selectedDocTypeEnabled ? null : (
                        <div className="mb-6 rounded-2xl border border-[#f59e0b]/20 bg-[#fff7e6] px-4 py-3 text-sm font-medium text-[#a16207]">
                          This document type is off. Its fields stay visible here so you can adjust
                          them, but the case workflow will ignore this document until you enable it
                          again.
                        </div>
                      )}

                      <div className="space-y-10">
                        <section>
                          <div className="mb-4">
                            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-[#8a7f72]">
                              PRIORITY CHECKS
                            </h3>
                            <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-[#b5aaa0]">
                              High-signal fields for quick case validation
                            </p>
                          </div>

                          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            {selectedPriorityFields.map((fieldKey) => {
                              const isEnabled = selectedFieldMap[fieldKey] ?? true;

                              return (
                                <button
                                  key={fieldKey}
                                  aria-pressed={isEnabled}
                                  className={`rounded-xl border p-4 text-left transition-all ${
                                    isEnabled
                                      ? "border-[#10b981]/30 bg-[#ecfdf5]"
                                      : "border-[#e5ddd0] bg-white"
                                  } ${selectedDocTypeEnabled ? "hover:bg-[#fafafa]" : "opacity-70"}`}
                                  disabled={!selectedDocTypeEnabled}
                                  onClick={() => handleToggleField(selectedDocType, fieldKey)}
                                  type="button"
                                >
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="text-sm font-bold text-[#1a1a1a]">
                                      {FIELD_LABELS[fieldKey]}
                                    </div>
                                    <div
                                      className={`flex h-6 w-6 items-center justify-center rounded-md border ${
                                        isEnabled
                                          ? "border-[#10b981] bg-[#10b981] text-white"
                                          : "border-[#d8ccbc] bg-white text-transparent"
                                      }`}
                                    >
                                      <Check className="h-4 w-4" />
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </section>

                        <section>
                          <div className="mb-4">
                            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-[#8a7f72]">
                              OTHER CHECKS
                            </h3>
                            <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-[#b5aaa0]">
                              Additional fields available for this document type
                            </p>
                          </div>

                          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            {selectedStandardFields.map((fieldKey) => {
                              const isEnabled = selectedFieldMap[fieldKey] ?? true;

                              return (
                                <button
                                  key={fieldKey}
                                  aria-pressed={isEnabled}
                                  className={`rounded-xl border p-4 text-left transition-all ${
                                    isEnabled
                                      ? "border-[#10b981]/30 bg-[#ecfdf5]"
                                      : "border-[#e5ddd0] bg-white"
                                  } ${selectedDocTypeEnabled ? "hover:bg-[#fafafa]" : "opacity-70"}`}
                                  disabled={!selectedDocTypeEnabled}
                                  onClick={() => handleToggleField(selectedDocType, fieldKey)}
                                  type="button"
                                >
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="text-sm font-bold text-[#1a1a1a]">
                                      {FIELD_LABELS[fieldKey]}
                                    </div>
                                    <div
                                      className={`flex h-6 w-6 items-center justify-center rounded-md border ${
                                        isEnabled
                                          ? "border-[#10b981] bg-[#10b981] text-white"
                                          : "border-[#d8ccbc] bg-white text-transparent"
                                      }`}
                                    >
                                      <Check className="h-4 w-4" />
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </section>
                      </div>
                    </>
                  )}
                </main>
                </>
              ) : (
                <>
                  <aside className="w-full overflow-y-auto border-r border-[#e5ddd0] bg-[#fafafa]/50 p-4 md:w-80">
                    <div className="mb-4 flex items-center justify-between gap-3 px-2">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-[#8a7f72]">
                        GROUPS
                      </div>
                      <Button
                        className="h-8 rounded-lg bg-[#1a1a1a] px-3 text-xs font-bold text-white"
                        onClick={handleAddGroup}
                        type="button"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add
                      </Button>
                    </div>

                    <div className="space-y-2">
                      {comparisonGroups.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-[#d8ccbc] bg-white p-4 text-sm font-medium text-[#8a7f72]">
                          No groups configured.
                        </div>
                      ) : (
                        comparisonGroups.map((group) => {
                          const isSelected = selectedGroup?.groupKey === group.groupKey;

                          return (
                            <button
                              key={group.groupKey}
                              className={`w-full rounded-xl p-3 text-left transition-all ${
                                isSelected
                                  ? "bg-[#10b981]/10 ring-1 ring-[#10b981]/30"
                                  : "hover:bg-[#f0ece6]"
                              }`}
                              onClick={() => setSelectedGroupKey(group.groupKey)}
                              type="button"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div
                                    className={`truncate text-sm font-bold ${
                                      isSelected ? "text-[#065f46]" : "text-[#1a1a1a]"
                                    }`}
                                  >
                                    {group.label}
                                  </div>
                                  <div
                                    className={`mt-1 text-[11px] font-medium leading-tight ${
                                      isSelected ? "text-[#065f46]/70" : "text-[#8a7f72]"
                                    }`}
                                  >
                                    {group.fields.length} field{group.fields.length === 1 ? "" : "s"}
                                  </div>
                                </div>
                                <Badge
                                  className={
                                    group.enabled
                                      ? "border-[#10b981]/20 bg-[#ecfdf5] text-[#047857]"
                                      : "border-[#e5ddd0] bg-white text-[#8a7f72]"
                                  }
                                  variant="outline"
                                >
                                  {group.enabled ? "On" : "Off"}
                                </Badge>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </aside>

                  <main className="flex-1 overflow-y-auto p-6 sm:p-8">
                    {loading ? (
                      <div className="space-y-4">
                        <div className="h-14 animate-pulse rounded-2xl bg-[#f3eee7]" />
                        <div className="grid gap-4 lg:grid-cols-2">
                          {Array.from({ length: 8 }).map((_, index) => (
                            <div key={index} className="h-16 animate-pulse rounded-2xl bg-[#f3eee7]" />
                          ))}
                        </div>
                      </div>
                    ) : selectedGroup ? (
                      <div className="space-y-6">
                        <div className="rounded-2xl border border-[#e5ddd0] bg-[#fafafa] p-4">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                            <label className="flex-1">
                              <div className="mb-1 text-[11px] font-black uppercase tracking-[0.2em] text-[#8a7f72]">
                                Group name
                              </div>
                              <input
                                className="w-full rounded-xl border border-[#d8ccbc] bg-white px-3 py-2 text-sm font-bold outline-none transition focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/20"
                                onChange={(event) =>
                                  handleRenameGroup(selectedGroup.groupKey, event.target.value)
                                }
                                value={selectedGroup.label}
                              />
                            </label>

                            <div className="flex flex-wrap gap-2">
                              <Button
                                className="rounded-xl border-[#e5ddd0] bg-white text-[#1a1a1a] hover:bg-[#f3eee7]"
                                onClick={() =>
                                  handleUpdateGroup(selectedGroup.groupKey, {
                                    enabled: !selectedGroup.enabled,
                                  })
                                }
                                type="button"
                                variant="outline"
                              >
                                {selectedGroup.enabled ? "Disable group" : "Enable group"}
                              </Button>
                              <Button
                                className="rounded-xl border-rose-200 bg-white text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                                onClick={() => handleDeleteGroup(selectedGroup.groupKey)}
                                type="button"
                                variant="outline"
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete
                              </Button>
                            </div>
                          </div>
                        </div>

                        <section>
                          <div className="mb-4">
                            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-[#8a7f72]">
                              FIELDS IN THIS GROUP
                            </h3>
                            <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-[#b5aaa0]">
                              These fields appear together on the mismatch review screen
                            </p>
                          </div>

                          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                            {AVAILABLE_GROUP_FIELDS.map((field) => {
                              const isSelected = selectedGroup.fields.includes(field.key);

                              return (
                                <button
                                  key={field.key}
                                  aria-pressed={isSelected}
                                  className={`rounded-xl border p-4 text-left transition-all ${
                                    isSelected
                                      ? "border-[#10b981]/30 bg-[#ecfdf5]"
                                      : "border-[#e5ddd0] bg-white hover:bg-[#fafafa]"
                                  }`}
                                  onClick={() => handleToggleGroupField(selectedGroup.groupKey, field.key)}
                                  type="button"
                                >
                                  <div className="flex items-start justify-between gap-4">
                                    <div>
                                      <div className="text-sm font-bold text-[#1a1a1a]">
                                        {FIELD_LABELS[field.key]}
                                      </div>
                                      <div className="mt-1 text-[11px] font-medium text-[#8a7f72]">
                                        {field.key}
                                      </div>
                                    </div>
                                    <div
                                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
                                        isSelected
                                          ? "border-[#10b981] bg-[#10b981] text-white"
                                          : "border-[#d8ccbc] bg-white text-transparent"
                                      }`}
                                    >
                                      <Check className="h-4 w-4" />
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </section>
                      </div>
                    ) : (
                      <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-[#d8ccbc] bg-[#fafafa] text-sm font-medium text-[#8a7f72]">
                        Create a group to start.
                      </div>
                    )}
                  </main>
                </>
              )}
              </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
