"use client";

import { useState } from "react";
import { Check, Search } from "lucide-react";

import { SettingsSwitch } from "@/components/settings/SettingsSwitch";
import type { ComparisonFieldGroup } from "@/lib/comparison-groups";
import { FIELD_LABELS } from "@/lib/document-schema";
import type { FieldKey } from "@/types/pipeline";

export function ReviewGroupsTab({ groups, loading, selectedGroupKey, fieldSections, onSelectGroup, onAddGroup, onUpdateGroup, onRenameGroup, onToggleGroupField, onDeleteGroup }: {
  groups: ComparisonFieldGroup[];
  loading: boolean;
  selectedGroupKey: string;
  fieldSections: Array<{ docType: string; fields: FieldKey[] }>;
  onSelectGroup: (groupKey: string) => void;
  onAddGroup: () => void;
  onUpdateGroup: (groupKey: string, updates: Partial<ComparisonFieldGroup>) => void;
  onRenameGroup: (groupKey: string, label: string) => void;
  onToggleGroupField: (groupKey: string, fieldKey: string) => void;
  onDeleteGroup: (groupKey: string) => void;
}) {
  const [search, setSearch] = useState("");
  const selectedGroup = groups.find((group) => group.groupKey === selectedGroupKey) ?? groups[0] ?? null;
  const query = search.trim().toLowerCase();
  const filteredSections = fieldSections
    .map((section) => ({
      ...section,
      fields: section.fields.filter((fieldKey) =>
        !query ||
        section.docType.toLowerCase().includes(query) ||
        fieldKey.toLowerCase().includes(query) ||
        (FIELD_LABELS[fieldKey] ?? "").toLowerCase().includes(query)
      ),
    }))
    .filter((section) => section.fields.length > 0);

  return (
    <>
      <aside className="w-full shrink-0 rounded-xl border border-[#ded8d0] bg-white p-3 shadow-2xs md:w-[280px]">
        <div className="mb-2.5 flex items-center justify-between px-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#8a7f72]">Review groups</span>
          <span className="text-xs font-semibold text-[#8a7f72]">{groups.length}</span>
        </div>
        <div className="max-h-[calc(100vh-260px)] space-y-1.5 overflow-y-auto pr-1">
          {groups.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#ded8d0] p-4 text-center text-xs text-[#8a7f72]">No groups configured.</div>
          ) : groups.map((group) => (
            <button
              className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                selectedGroup?.groupKey === group.groupKey
                  ? "border-[#c8bfb0] bg-[#ede6d9] font-medium text-[#2b1a10] shadow-2xs"
                  : "border-[#ded8d0] bg-[#fbfaf8] text-[#3d3530] hover:bg-[#f3eee7]"
              }`}
              key={group.groupKey}
              onClick={() => onSelectGroup(group.groupKey)}
              type="button"
            >
              <div className="flex items-center justify-between gap-2.5">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold">{group.label}</div>
                  <div className="mt-0.5 text-[11px] font-normal text-[#8a7f72]">{group.fields.length} field{group.fields.length === 1 ? "" : "s"}</div>
                </div>
                <span onClick={(event) => { event.stopPropagation(); onUpdateGroup(group.groupKey, { enabled: !group.enabled }); }}>
                  <SettingsSwitch checked={group.enabled} />
                </span>
              </div>
            </button>
          ))}
          <button
            className="w-full rounded-lg border border-dashed border-[#ded8d0] bg-[#fbfaf8] px-3 py-2 text-center text-xs font-medium text-[#5b4b3d] transition hover:border-[#2b1a10] hover:text-[#2b1a10]"
            onClick={onAddGroup}
            type="button"
          >
            + Add review group
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="rounded-xl border border-[#ded8d0] bg-white p-5 shadow-2xs">
          {loading ? (
            <div className="space-y-3">
              <div className="h-16 animate-pulse rounded-xl bg-[#ede6d9]/50" />
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 12 }).map((_, index) => <div className="h-12 animate-pulse rounded-lg bg-[#ede6d9]/50" key={index} />)}
              </div>
            </div>
          ) : selectedGroup ? (
            <div>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <label className="min-w-0 flex-1">
                  <div className="mb-1.5 text-xs font-bold uppercase tracking-wider text-[#8a7f72]">Group name</div>
                  <input
                    className="h-9 w-full rounded-lg border border-[#ded8d0] bg-[#fbfaf8] px-3 text-sm font-semibold text-[#111827] outline-none transition focus:border-[#2b1a10] focus:bg-white"
                    onChange={(event) => onRenameGroup(selectedGroup.groupKey, event.target.value)}
                    value={selectedGroup.label}
                  />
                  <p className="mt-1.5 text-xs text-[#8a7f72]">Reviewers see these related fields together whenever any one of them shows a mismatch.</p>
                </label>
                <div className="flex shrink-0 items-center gap-3 pt-6">
                  <button
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      selectedGroup.enabled ? "border-[#a7f3d0] bg-[#ecfdf5] text-[#047857]" : "border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]"
                    }`}
                    onClick={() => onUpdateGroup(selectedGroup.groupKey, { enabled: !selectedGroup.enabled })}
                    type="button"
                  >
                    {selectedGroup.enabled ? "Group enabled" : "Group disabled"}
                  </button>
                  <button className="text-xs font-medium text-[#b91c1c] transition hover:text-[#991b1b]" onClick={() => onDeleteGroup(selectedGroup.groupKey)} type="button">
                    Delete
                  </button>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-[#e8e2d8] bg-[#fbfaf8] p-3">
                {selectedGroup.fields.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedGroup.fields.map((fieldKey) => (
                      <span className="inline-flex max-w-full items-center truncate rounded-md border border-[#ded8d0] bg-white px-2.5 py-1 text-xs font-medium text-[#2b1a10] shadow-2xs" key={fieldKey}>
                        {FIELD_LABELS[fieldKey as FieldKey] ?? fieldKey}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-[#8a7f72]">No fields selected yet. Pick from the list below.</span>
                )}
              </div>

              <section className="mt-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#8a7f72]">Fields in group</h3>
                <p className="mt-0.5 text-xs text-[#8a7f72]">Pick every field that should be reviewed as one issue family, across all documents.</p>
                <div className="relative my-3 max-w-md">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8a7f72]" />
                  <input
                    className="w-full rounded-lg border border-[#ded8d0] bg-[#fbfaf8] py-1.5 pl-8 pr-3 text-xs text-[#111827] outline-none transition placeholder:text-[#a89e92] focus:border-[#2b1a10] focus:bg-white"
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search fields..."
                    type="search"
                    value={search}
                  />
                </div>
                <div className="max-h-[400px] overflow-y-auto rounded-lg border border-[#ded8d0]">
                  {filteredSections.map((section) => (
                    <div key={section.docType}>
                      <div className="sticky top-0 z-10 border-b border-[#e8e2d8] bg-[#ede6d9]/80 px-3.5 py-1.5 text-[11px] font-bold tracking-wider text-[#5b4b3d] backdrop-blur-xs">
                        {section.docType}
                      </div>
                      {section.fields.map((fieldKey) => {
                        const isSelected = selectedGroup.fields.includes(fieldKey);
                        const otherGroup = groups.find((group) => group.groupKey !== selectedGroup.groupKey && group.fields.includes(fieldKey));
                        return (
                          <button
                            aria-pressed={isSelected}
                            className="flex w-full items-center gap-3 border-b border-[#f0ece4] px-3.5 py-2 text-left transition hover:bg-[#fbfaf8]"
                            key={`${section.docType}-${fieldKey}`}
                            onClick={() => onToggleGroupField(selectedGroup.groupKey, fieldKey)}
                            type="button"
                          >
                            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                              isSelected ? "border-[#2b1a10] bg-[#2b1a10] text-white" : "border-[#ded8d0] bg-white text-transparent"
                            }`}>
                              <Check className="h-3 w-3" />
                            </span>
                            <span className="min-w-0 flex-1 truncate text-xs font-medium text-[#111827]">
                              {FIELD_LABELS[fieldKey]}
                              {otherGroup ? <span className="text-[#8a7f72]"> — in {otherGroup.label}</span> : null}
                            </span>
                            <span className="shrink-0 font-mono text-[11px] text-[#8a7f72]">{fieldKey}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                  {filteredSections.length === 0 ? <div className="px-4 py-8 text-center text-xs text-[#8a7f72]">No fields found.</div> : null}
                </div>
              </section>
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-[#ded8d0] bg-[#fbfaf8] text-xs font-medium text-[#8a7f72]">
              Create a group to start.
            </div>
          )}
        </div>
      </main>
    </>
  );
}
