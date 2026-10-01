"use client";

import { useEffect, useState } from "react";
import { Loader2, RotateCcw, Save, Shield } from "lucide-react";

import { AppShell } from "@/components/dashboard/AppShell";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { CashDiscountCustomerScopeSettings } from "@/components/settings/CashDiscountCustomerScopeSettings";
import { DocumentFieldsTab } from "@/components/settings/DocumentFieldsTab";
import { PaymentReminderSettings } from "@/components/settings/PaymentReminderSettings";
import { PurchaseAccountingSettingsPanel } from "@/components/settings/PurchaseAccountingSettingsPanel";
import { ReviewGroupsTab } from "@/components/settings/ReviewGroupsTab";
import { TeamAccessPanel } from "@/components/settings/TeamAccessPanel";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
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
  IGNORED_PACKET_FIELD_KEYS,
  buildPacketFieldConfiguration,
  setPacketFieldConfiguration,
} from "@/lib/document-schema";
import type { DocType, FieldKey } from "@/types/pipeline";

const TABS = [
  ["documents", "Documents & fields"],
  ["groups", "Review groups"],
  ["accounting", "Purchase accounting"],
  ["cashDiscount", "Cash discounts"],
  ["reminders", "Payment reminders"],
  ["team", "Team & access"],
] as const;

type ActiveTab = (typeof TABS)[number][0];
type BannerState = { tone: "success" | "error"; text: string } | null;
type SettingsResponse = {
  fieldSettings?: Array<{ doc_type: string; field_key: string; enabled: boolean }>;
  docTypeSettings?: Array<{ doc_type: string; enabled: boolean }>;
};
type DocTypeEnabledState = Record<string, boolean>;
type FieldEnabledState = Record<string, Record<string, boolean>>;

// Only these two tabs use the Save/Reset buttons; every other tab saves each change itself.
const EXPLICIT_SAVE_TABS = new Set<ActiveTab>(["documents", "groups"]);

const AVAILABLE_DOC_TYPES = (Object.keys(DOC_TYPE_EXTRACTION_FIELDS) as DocType[]).filter((docType) => docType !== "Unknown");
const HIDDEN_SETTING_FIELD_KEYS = new Set<string>(IGNORED_PACKET_FIELD_KEYS);
const PRIORITY_FIELD_KEYS = new Set<FieldKey>(FIELD_DEFINITIONS.filter((field) => field.important).map((field) => field.key));

function getConfigurableFields(docType: string): FieldKey[] {
  const seen = new Set<string>();
  return (DOC_TYPE_EXTRACTION_FIELDS[docType as DocType] ?? []).flatMap((fieldKey) => {
    if (HIDDEN_SETTING_FIELD_KEYS.has(fieldKey) || seen.has(fieldKey)) return [];
    seen.add(fieldKey);
    return [fieldKey];
  });
}

function createDefaultDocTypeState(): DocTypeEnabledState {
  return Object.fromEntries(AVAILABLE_DOC_TYPES.map((docType) => [docType, true]));
}

function createDefaultFieldState(): FieldEnabledState {
  return Object.fromEntries(
    AVAILABLE_DOC_TYPES.map((docType) => [docType, Object.fromEntries(getConfigurableFields(docType).map((fieldKey) => [fieldKey, true]))])
  );
}

function buildStateFromPayload(payload?: SettingsResponse) {
  const docTypeEnabled = createDefaultDocTypeState();
  const fieldEnabled = createDefaultFieldState();
  for (const setting of payload?.docTypeSettings ?? []) {
    if (setting.doc_type in docTypeEnabled) docTypeEnabled[setting.doc_type] = Boolean(setting.enabled);
  }
  for (const setting of payload?.fieldSettings ?? []) {
    if (fieldEnabled[setting.doc_type] && setting.field_key in fieldEnabled[setting.doc_type]) {
      fieldEnabled[setting.doc_type][setting.field_key] = Boolean(setting.enabled);
    }
  }
  return { docTypeEnabled, fieldEnabled };
}

function signature(docTypeEnabled: DocTypeEnabledState, fieldEnabled: FieldEnabledState, groups: ComparisonFieldGroup[]) {
  return JSON.stringify({
    docTypes: AVAILABLE_DOC_TYPES.map((docType) => [docType, docTypeEnabled[docType] ?? true]),
    fields: AVAILABLE_DOC_TYPES.flatMap((docType) =>
      getConfigurableFields(docType).map((fieldKey) => [docType, fieldKey, fieldEnabled[docType]?.[fieldKey] ?? true])
    ),
    groups: sanitizeComparisonGroups(groups).map((group, index) => ({
      groupKey: group.groupKey,
      label: group.label,
      fields: group.fields,
      enabled: group.enabled,
      sortOrder: group.sortOrder || (index + 1) * 10,
    })),
  });
}

const AVAILABLE_GROUP_FIELD_KEYS = new Set<string>(
  FIELD_DEFINITIONS.filter((field) => !HIDDEN_SETTING_FIELD_KEYS.has(field.key)).map((field) => field.key)
);

// Each field is listed once, under the first document type that uses it.
const GROUP_FIELD_SECTIONS = AVAILABLE_DOC_TYPES.map((docType) => ({
  docType,
  fields: getConfigurableFields(docType).filter(
    (fieldKey) =>
      AVAILABLE_GROUP_FIELD_KEYS.has(fieldKey) &&
      AVAILABLE_DOC_TYPES.find((candidate) => getConfigurableFields(candidate).includes(fieldKey)) === docType
  ),
})).filter((section) => section.fields.length > 0);

async function getResponseError(response: Response) {
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  return payload?.error || `Request failed with status ${response.status}`;
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("documents");
  const [docTypeEnabled, setDocTypeEnabled] = useState<DocTypeEnabledState>(createDefaultDocTypeState);
  const [fieldEnabled, setFieldEnabled] = useState<FieldEnabledState>(createDefaultFieldState);
  const [comparisonGroups, setComparisonGroups] = useState<ComparisonFieldGroup[]>(DEFAULT_COMPARISON_FIELD_GROUPS);
  const [selectedGroupKey, setSelectedGroupKey] = useState(DEFAULT_COMPARISON_FIELD_GROUPS[0]?.groupKey ?? "");
  const [savedSignature, setSavedSignature] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<BannerState>(null);

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (TABS.some(([key]) => key === tab)) setActiveTab(tab as ActiveTab);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [response, loadedGroups] = await Promise.all([
          apiFetch("/api/settings/field", { method: "GET", cache: "no-store" }),
          fetchComparisonGroups(),
        ]);
        if (!response.ok) throw new Error(await getResponseError(response));
        const hydrated = buildStateFromPayload((await response.json()) as SettingsResponse);
        if (cancelled) return;
        setDocTypeEnabled(hydrated.docTypeEnabled);
        setFieldEnabled(hydrated.fieldEnabled);
        setComparisonGroups(loadedGroups);
        setSelectedGroupKey(loadedGroups[0]?.groupKey ?? "");
        setSavedSignature(signature(hydrated.docTypeEnabled, hydrated.fieldEnabled, loadedGroups));
      } catch (error) {
        if (cancelled) return;
        setSavedSignature(signature(createDefaultDocTypeState(), createDefaultFieldState(), DEFAULT_COMPARISON_FIELD_GROUPS));
        setBanner({ tone: "error", text: `${error instanceof Error ? error.message : "Could not load saved settings"}. Showing default settings.` });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const hasUnsavedChanges = savedSignature !== signature(docTypeEnabled, fieldEnabled, comparisonGroups);

  function change<T>(setter: (update: (current: T) => T) => void, update: (current: T) => T) {
    setBanner(null);
    setter(update);
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
    const index = comparisonGroups.length + 1;
    const group: ComparisonFieldGroup = {
      groupKey: `custom_group_${Date.now()}`,
      label: `New Group ${index}`,
      fields: [],
      enabled: true,
      sortOrder: index * 10,
    };
    change(setComparisonGroups, (current) => [...current, group]);
    setSelectedGroupKey(group.groupKey);
  }

  function handleRenameGroup(groupKey: string, label: string) {
    const nextKey = normalizeComparisonGroupKey(label, groupKey);
    change(setComparisonGroups, (current) =>
      current.map((group) => (group.groupKey === groupKey ? { ...group, label, groupKey: nextKey } : group))
    );
    setSelectedGroupKey(nextKey);
  }

  function handleDeleteGroup(groupKey: string) {
    const next = comparisonGroups.filter((group) => group.groupKey !== groupKey);
    change(setComparisonGroups, () => next);
    if (selectedGroupKey === groupKey) setSelectedGroupKey(next[0]?.groupKey ?? "");
  }

  async function handleSave() {
    try {
      setSaving(true);
      setBanner(null);
      const docTypeSettings = AVAILABLE_DOC_TYPES.map((docType) => ({ docType, enabled: docTypeEnabled[docType] ?? true }));
      const fieldSettings = AVAILABLE_DOC_TYPES.flatMap((docType) =>
        getConfigurableFields(docType).map((fieldKey) => ({ docType, fieldKey, enabled: fieldEnabled[docType]?.[fieldKey] ?? true }))
      );
      const [docTypeResponse, fieldResponse, groupResponse] = await Promise.all([
        apiFetch("/api/settings/doctype", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings: docTypeSettings }) }),
        apiFetch("/api/settings/field", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings: fieldSettings }) }),
        saveComparisonGroups(comparisonGroups.map((group, index) => ({ ...group, sortOrder: (index + 1) * 10 }))),
      ]);
      if (!docTypeResponse.ok) throw new Error(await getResponseError(docTypeResponse));
      if (!fieldResponse.ok) throw new Error(await getResponseError(fieldResponse));
      if (!groupResponse.success) throw new Error("Failed to save review groups.");

      setPacketFieldConfiguration(
        buildPacketFieldConfiguration({
          docTypeSettings: docTypeSettings.map((setting) => ({ doc_type: setting.docType, enabled: setting.enabled })),
          fieldSettings: fieldSettings.map((setting) => ({ doc_type: setting.docType, field_key: setting.fieldKey, enabled: setting.enabled })),
        })
      );
      const savedGroups = sanitizeComparisonGroups(groupResponse.groups);
      setComparisonGroups(savedGroups);
      setSavedSignature(signature(docTypeEnabled, fieldEnabled, savedGroups));
      setBanner({ tone: "success", text: "Settings saved. New reviews will use these document and review-group rules." });
    } catch (error) {
      setBanner({ tone: "error", text: error instanceof Error ? error.message : "Failed to save settings." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="min-h-full bg-[#f7f4ef] px-4 py-5 text-[#111827] sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-[1540px] flex-col gap-4">
          <PageHeader
            title="Settings"
            subtitle="Extraction rules, review groups, and accounting policies"
            badge={
              <div className="flex items-center gap-1.5 rounded-lg border border-[#e6ded2] bg-[#fbfaf8] px-2.5 py-1 text-xs font-medium text-[#5b4b3d] shadow-sm">
                <Shield className="h-3 w-3 text-[#8a7f72]" />
                <span>Admin view</span>
              </div>
            }
            actions={
              EXPLICIT_SAVE_TABS.has(activeTab) ? (
                <div className="flex items-center gap-2">
                  <Button
                    className="h-8 rounded-lg border border-[#ded8d0] bg-[#fbfaf8] px-3 text-xs font-medium text-[#3d3530] shadow-sm transition hover:bg-[#ede6d9]"
                    disabled={loading || saving}
                    onClick={handleResetDefaults}
                    type="button"
                    variant="ghost"
                  >
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5 text-[#8a7f72]" />
                    Reset defaults
                  </Button>
                  <Button
                    className="h-8 rounded-lg bg-[#2b1a10] px-4 text-xs font-medium text-white shadow-sm transition hover:bg-[#3d2718]"
                    disabled={loading || saving || !hasUnsavedChanges}
                    onClick={handleSave}
                    type="button"
                  >
                    {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                    {saving ? "Saving..." : "Save changes"}
                  </Button>
                </div>
              ) : null
            }
          />

          {banner && EXPLICIT_SAVE_TABS.has(activeTab) ? (
            <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${
              banner.tone === "success" ? "border-[#10b981]/25 bg-[#ecfdf5] text-[#047857]" : "border-[#ef4444]/25 bg-[#fff1f2] text-[#b91c1c]"
            }`}>
              {banner.text}
            </div>
          ) : null}

          <div className="inline-flex max-w-fit flex-wrap items-center gap-1 rounded-lg border border-[#e0d8cc] bg-[#ede6d9]/60 p-1">
            {TABS.map(([key, label]) => (
              <button
                className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition ${
                  activeTab === key ? "bg-white text-[#111827] shadow-2xs" : "text-[#6b5d50] hover:text-[#111827]"
                }`}
                key={key}
                onClick={() => setActiveTab(key)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-5 md:flex-row md:items-start">
            {activeTab === "documents" ? (
              <DocumentFieldsTab
                configurableFields={getConfigurableFields}
                docTypeEnabled={docTypeEnabled}
                docTypes={AVAILABLE_DOC_TYPES}
                fieldEnabled={fieldEnabled}
                isPriorityField={(fieldKey) => PRIORITY_FIELD_KEYS.has(fieldKey)}
                loading={loading}
                onSetAllFields={(docType, enabled) =>
                  change(setFieldEnabled, (current) => ({
                    ...current,
                    [docType]: Object.fromEntries(getConfigurableFields(docType).map((fieldKey) => [fieldKey, enabled])),
                  }))
                }
                onToggleDocType={(docType) =>
                  change(setDocTypeEnabled, (current) => ({ ...current, [docType]: !(current[docType] ?? true) }))
                }
                onToggleField={(docType, fieldKey) =>
                  change(setFieldEnabled, (current) => ({
                    ...current,
                    [docType]: { ...current[docType], [fieldKey]: !(current[docType]?.[fieldKey] ?? true) },
                  }))
                }
              />
            ) : activeTab === "groups" ? (
              <ReviewGroupsTab
                fieldSections={GROUP_FIELD_SECTIONS}
                groups={comparisonGroups}
                loading={loading}
                onAddGroup={handleAddGroup}
                onDeleteGroup={handleDeleteGroup}
                onRenameGroup={handleRenameGroup}
                onSelectGroup={setSelectedGroupKey}
                onToggleGroupField={(groupKey, fieldKey) =>
                  change(setComparisonGroups, (current) =>
                    current.map((group) =>
                      group.groupKey !== groupKey
                        ? group
                        : { ...group, fields: group.fields.includes(fieldKey) ? group.fields.filter((field) => field !== fieldKey) : [...group.fields, fieldKey] }
                    )
                  )
                }
                onUpdateGroup={(groupKey, updates) =>
                  change(setComparisonGroups, (current) => current.map((group) => (group.groupKey === groupKey ? { ...group, ...updates } : group)))
                }
                selectedGroupKey={selectedGroupKey}
              />
            ) : activeTab === "accounting" ? (
              <PurchaseAccountingSettingsPanel />
            ) : activeTab === "cashDiscount" ? (
              <CashDiscountCustomerScopeSettings />
            ) : activeTab === "reminders" ? (
              <PaymentReminderSettings />
            ) : (
              <TeamAccessPanel />
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
