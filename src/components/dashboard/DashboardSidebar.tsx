"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileSearch,
  LayoutDashboard,
  ListTree,
  LogOut,
  Trash2,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Cloud
} from "lucide-react";

import { Button } from "@/components/ui/button";

import styles from "./DashboardSidebar.module.css";

const NAV_ITEMS = [
  {
    href: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    href: "/workspace",
    label: "Packet Workspace",
    icon: FileSearch,
  },
  {
    href: "/cases",
    label: "All Cases",
    icon: ListTree,
  },
  {
    href: "/recycle-bin",
    label: "Recycle Bin",
    icon: Trash2,
  },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export interface DashboardSidebarProps {
  stats?: Array<{ label: string; value: string | number }>;
  status?: {
    type: "idle" | "saving" | "saved" | "error";
    title: string;
    message: string;
  };
}

export function DashboardSidebar({ stats, status }: DashboardSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className={styles.sidebar}>
      {/* BRANDING */}
      <div className={styles.brandRow}>
        <div className={styles.brandIcon}>
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div className={styles.brandText}>
          <div className={styles.brandTitle}>Comparator</div>
        </div>
      </div>

      {/* NAVIGATION */}
      <nav className={styles.navSection}>
        <div className={styles.navList}>
          {NAV_ITEMS.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
              >
                <div className={styles.navItemLeft}>
                  <Icon className={styles.navIcon} />
                  <span className={styles.navTitle}>{item.label}</span>
                </div>
                {active && <div className={styles.activeDot} />}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* OPTIONAL STATS */}
      {stats && stats.length > 0 && (
        <div className={styles.statsSection}>
          <div className={styles.sectionHeader}>Overview</div>
          <div className={styles.statsGrid}>
            {stats.map((stat, idx) => (
              <div key={idx} className={styles.statCard}>
                <div className={styles.statValue}>{stat.value}</div>
                <div className={styles.statLabel}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* OPTIONAL SYSTEM STATUS */}
      {status && (
        <div className={styles.statusSection}>
          <div className={styles.sectionHeader}>System Status</div>
          <div
            className={`
              ${styles.statusCard} 
              ${status.type === "idle" ? styles.statusNeutral : ""}
              ${status.type === "saving" ? styles.statusSaving : ""}
              ${status.type === "saved" ? styles.statusSaved : ""}
              ${status.type === "error" ? styles.statusError : ""}
            `}
          >
            <div className={styles.statusTitle}>
              {status.type === "saved" && <CheckCircle2 className="h-4 w-4" />}
              {status.type === "error" && <AlertCircle className="h-4 w-4" />}
              {status.type === "saving" && <Loader2 className="h-4 w-4 animate-spin" />}
              {status.type === "idle" && <Cloud className="h-4 w-4" />}
              {status.title}
            </div>
            <div className={styles.statusBody}>{status.message}</div>
          </div>
        </div>
      )}

      <div className={styles.spacer} />

      {/* LOGOUT ACTION */}
      <form action="/auth/signout" method="post" className={styles.signOutForm}>
        <Button type="submit" variant="ghost" className={styles.signOutButton}>
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>
      </form>
    </aside>
  );
}
