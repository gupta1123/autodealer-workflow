export type LiveValidationMasterOption = {
  id: string;
  name: string;
  parent: string | null;
  gstin: string | null;
  hsnCode: string | null;
  unitName: string | null;
  taxRate: number | null;
  groupPath: string | null;
  taxType: string | null;
  gstDutyHead: string | null;
  closingBalance: number | null;
  closingBalanceType: "Dr" | "Cr" | null;
};

export function liveValidationMasterRow(option: LiveValidationMasterOption) {
  return {
    name: option.name,
    guid: option.id.startsWith("live:") ? null : option.id,
    parent: option.parent,
    gstin: option.gstin,
    hsnCode: option.hsnCode,
    unitName: option.unitName,
    taxRate: option.taxRate,
    groupPath: option.groupPath,
    taxType: option.taxType,
    gstDutyHead: option.gstDutyHead,
    closingBalance: option.closingBalance,
    closingBalanceType: option.closingBalanceType,
  };
}

/**
 * The connector response also contains legacy top-level catalogue arrays.
 * Copy only validation metadata so those multi-megabyte arrays cannot leak
 * into the API request when the selected-master envelope is assembled.
 */
export function liveValidationMetadata(result: Record<string, unknown>) {
  return {
    source: result.source,
    companyName: result.companyName,
    fetchedAt: result.fetchedAt,
    syncRunId: result.syncRunId ?? null,
    totals: result.totals,
    companyProfile: result.companyProfile,
  };
}
