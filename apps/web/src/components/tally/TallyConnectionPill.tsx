"use client";

import Link from "next/link";
import {useEffect,useState} from 'react';
import {watchTallyConnection} from '@/lib/cash-discount-live';
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";

import { CompanyAvatar } from "@/components/ui/company-avatar";

export type TallyConnectionPillStatus = "checking" | "verified" | "warning";

type TallyConnectionPillAction =
  | { label: string; onClick: () => void; href?: never }
  | { label: string; href: string; onClick?: never };

type TallyConnectionPillProps = {
  title: string;
  subtitle: string;
  status?: TallyConnectionPillStatus;
  avatarName?: string | null;
  refreshing?: boolean;
  onRefresh: () => void;
  secondaryAction?: TallyConnectionPillAction | null;
  className?: string;
  connectionId?: string | null;
};

/**
 * Shared Tally connection status pill used on Bank Statements and the
 * case mismatch tally header. Same layout, tones, and actions in both.
 */
export function TallyConnectionPill({
  title,
  subtitle,
  status = "warning",
  avatarName = null,
  refreshing = false,
  onRefresh,
  secondaryAction = null,
  className = "",
  connectionId = null,
}: TallyConnectionPillProps) {
  const [live,setLive]=useState<{id:string;online:boolean|null}|null>(null);
  useEffect(()=>{
    if(!connectionId)return;
    return watchTallyConnection(connectionId,online=>setLive({id:connectionId,online}));
  },[connectionId]);
  const online=live?.id===connectionId?live?.online:null;
  const checkingLive=!!connectionId&&online===null;
  const disconnected=!!connectionId&&online===false;
  const shownStatus=checkingLive?'checking':disconnected?'warning':status;
  const shownTitle=checkingLive?'Checking live Tally connection':disconnected?'Live Tally connection unavailable':title;
  const shownSubtitle=checkingLive?'Connecting to the Local Agent':disconnected?'Keep the Local Agent open. Reconnecting automatically.':subtitle;
  return (
    <div className={`inline-flex min-w-0 items-center gap-3 ${className}`}>
      <div className="flex min-w-0 items-center gap-2">
        {shownStatus === "checking" ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#8a7f72]" />
        ) : shownStatus === "verified" ? (
          <CompanyAvatar name={avatarName ?? ""} verified />
        ) : (
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
        )}
        <div className="min-w-0">
          <div className="text-xs font-bold text-[#1a1a1a]">{shownTitle}</div>
          <div className="mt-0.5 truncate text-[11px] font-semibold text-[#8a8177]">
            {shownSubtitle}
          </div>
        </div>
      </div>
      <div className="flex gap-2 border-l border-[#ddd5c9] pl-3">
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-[#e5ddd0] bg-white px-3 text-xs font-bold text-[#5a5046] hover:bg-[#faf8f4] hover:text-[#1a1a1a] shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-60"
        >
          {refreshing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh
        </button>
        {secondaryAction ? (
          secondaryAction.href ? (
            <Link
              className="inline-flex h-8 items-center rounded-xl bg-[#2d2d2d] px-3.5 text-xs font-bold text-white hover:bg-[#1a1a1a] shadow-sm transition-all"
              href={secondaryAction.href}
            >
              {secondaryAction.label}
            </Link>
          ) : (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="inline-flex h-8 items-center rounded-xl bg-[#2d2d2d] px-3.5 text-xs font-bold text-white hover:bg-[#1a1a1a] shadow-sm transition-all"
            >
              {secondaryAction.label}
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}
