"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  FolderOpen,
  FileStack,
  FileText,
  Landmark,
  MessageCircle,
  Trash2,
  LogOut,
  ChevronsUpDown,
  Settings,
  ChevronLeft,
  PlugZap,
} from "lucide-react";

import styles from "./DashboardSidebar.module.css";
import { apiFetch } from "@/lib/api-client";
import { readPreferredTallyConnectionId } from "@/lib/tally-company-selection";

type TallyConnectionSummary = {
  id: string;
  bridgeConnected?: boolean;
  tallyReachable?: boolean;
  companyLoaded?: boolean;
  lastCompanyName?: string | null;
};

type TallyStatus =
  | "checking"
  | "connected"
  | "attention"
  | "disconnected"
  | "unavailable";

/* ── Sectioned nav ───────────────────────────── */
const SIDEBAR_SECTIONS = [
  {
    id: "main",
    title: "Main",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    id: "cases",
    title: "Cases",
    items: [
      { href: "/workspace", label: "Add Case", icon: FileStack },
      { href: "/cases", label: "All Cases", icon: FolderOpen },
    ],
  },
  {
    id: "reconciliation",
    title: "Reconciliation",
    items: [
      { href: "/bank-statements", label: "Bank Statements", icon: Landmark },
      { href: "/collections", label: "Cash Discounts", icon: FileText, exact: true },
      { href: "/collections/follow-ups", label: "Payment Follow-ups", icon: MessageCircle },
    ],
  },
  {
    id: "system",
    title: "System",
    items: [
      { href: "/tally-prime?view=connection", label: "Tally Connector", icon: PlugZap },
      { href: "/recycle-bin", label: "Recycle Bin", icon: Trash2 },
    ],
  },
];

function isActivePath(pathname: string, href: string, exact = false) {
  const hrefPath = href.split("?")[0];
  if (hrefPath === "/" || exact) return pathname === hrefPath;
  return pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
}

interface UserInfo {
  name: string;
  email: string;
}

export interface DashboardSidebarProps {
  user?: UserInfo;
  defaultCollapsed?: boolean;
}

export function DashboardSidebar({ user, defaultCollapsed = false }: DashboardSidebarProps) {
  const pathname = usePathname();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [tallyStatus, setTallyStatus] = useState<TallyStatus>("checking");
  const [tallyCompanyName, setTallyCompanyName] = useState<string | null>(null);
  const userRowRef = useRef<HTMLDivElement>(null);

  const refreshTallyStatus = useCallback(async () => {
    try {
      const response = await apiFetch("/api/tally/connections", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Could not read Tally status");

      const payload = (await response.json()) as {
        connections?: TallyConnectionSummary[];
      };
      const connections = payload.connections ?? [];
      const preferredConnectionId = readPreferredTallyConnectionId();
      const connection =
        connections.find((item) => item.id === preferredConnectionId) ??
        connections.find(
          (item) =>
            item.bridgeConnected === true &&
            item.tallyReachable === true &&
            item.companyLoaded === true,
        ) ??
        connections[0];

      if (
        connection?.bridgeConnected === true &&
        connection.tallyReachable === true &&
        connection.companyLoaded === true
      ) {
        setTallyStatus("connected");
        setTallyCompanyName(connection.lastCompanyName ?? null);
        return;
      }

      setTallyCompanyName(null);
      setTallyStatus(
        connection?.bridgeConnected === true
          ? "attention"
          : "disconnected",
      );
    } catch {
      setTallyCompanyName(null);
      setTallyStatus("unavailable");
    }
  }, []);

  useEffect(() => {
    void refreshTallyStatus();

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshTallyStatus();
    }, 30_000);
    const handleFocus = () => void refreshTallyStatus();
    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", handleFocus);
    };
  }, [refreshTallyStatus]);

  const displayUser: UserInfo = user ?? {
    name: "Admin",
    email: "admin@kalika.local",
  };

  const initials = displayUser.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ""}`}>
      {/* ── BRAND ── */}
      <div className={`${styles.brandRow} ${collapsed ? styles.collapsed : ""}`}>
        <div className={styles.brandLeft}>
          <div className={styles.brandLogoMark}>K</div>
          <span className={styles.brandTitle}>Kalika</span>
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={styles.collapseBtn}
          type="button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronLeft className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* ── DESKTOP SECTIONED NAVIGATION ── */}
      <nav className={`${styles.navSection} ${styles.desktopNav}`}>
        {SIDEBAR_SECTIONS.map((section) => (
          <div key={section.id} className={styles.sectionGroup}>
            {!collapsed && <h3 className={styles.sectionHeader}>{section.title}</h3>}
            <ul className={styles.navList} role="list">
              {section.items.map((item) => {
                const active = isActivePath(pathname, item.href, item.exact);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
                      aria-label={collapsed ? item.label : undefined}
                      title={collapsed ? item.label : undefined}
                    >
                      <div className={styles.navItemLeft}>
                        {active && <div className={styles.activeBar} />}
                        <Icon className={styles.navIcon} />
                        <span className={styles.navTitle}>{item.label}</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* ── MOBILE FLAT NAVIGATION ── */}
      <nav className={`${styles.navSection} ${styles.mobileNav}`}>
        <ul className={styles.navList} role="list">
          {SIDEBAR_SECTIONS.flatMap((s) => s.items).map((item) => {
            const active = isActivePath(pathname, item.href, item.exact);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
                >
                  <div className={styles.navItemLeft}>
                    {active && <div className={styles.activeBar} />}
                    <Icon className={styles.navIcon} />
                    <span className={styles.navTitle}>{item.label}</span>
                  </div>
                </Link>
              </li>
            );
          })}
          <li className={styles.mobileLogoutItem}>
            <form action="/auth/signout" method="post">
              <button type="submit" className={`${styles.navItem} ${styles.mobileLogoutButton}`}>
                <div className={styles.navItemLeft}>
                  <LogOut className={styles.navIcon} />
                  <span className={styles.navTitle}>Logout</span>
                </div>
              </button>
            </form>
          </li>
        </ul>
      </nav>

      <div className={styles.spacer} />

      <div className={styles.tallyStatusWrapper}>
        <Link
          href="/tally-prime?view=connection"
          className={`${styles.tallyStatusChip} ${styles[`tallyStatus_${tallyStatus}`]}`}
          aria-label={
            tallyStatus === "connected"
              ? `Tally connected${tallyCompanyName ? ` to ${tallyCompanyName}` : ""}`
              : tallyStatus === "checking"
                ? "Checking Tally connection"
                : tallyStatus === "attention"
                  ? "Tally connection needs attention"
                  : tallyStatus === "unavailable"
                    ? "Tally status unavailable"
                    : "Tally disconnected"
          }
          title={
            tallyStatus === "connected" && tallyCompanyName
              ? `Connected to ${tallyCompanyName}`
              : "Open Tally Connector"
          }
        >
          <span className={styles.tallyStatusDot} aria-hidden="true" />
          <span className={styles.tallyStatusText}>
            {tallyStatus === "connected"
              ? "Tally connected"
              : tallyStatus === "checking"
                ? "Checking Tally…"
                : tallyStatus === "attention"
                  ? "Tally not ready"
                  : tallyStatus === "unavailable"
                    ? "Status unavailable"
                    : "Tally disconnected"}
          </span>
          <PlugZap className={styles.tallyStatusIcon} aria-hidden="true" />
        </Link>
      </div>

      {/* ── USER ROW (opens popover) ── */}
      <div className={styles.userRowWrapper} ref={userRowRef}>
        {/* Logout Popover */}
        {popoverOpen && (
          <>
            {/* Backdrop to close */}
            <div
              className={styles.popoverBackdrop}
              onClick={() => setPopoverOpen(false)}
            />
            <div className={styles.popover}>
              <div className={styles.popoverHeader}>
                <div className={styles.popoverUserAvatar}>{initials}</div>
                <div className={styles.popoverUserInfo}>
                  <div className={styles.popoverUserName}>{displayUser.name}</div>
                  <div className={styles.popoverUserEmail}>{displayUser.email}</div>
                </div>
              </div>
              
              <div className={styles.popoverMenu}>
                <Link href="/settings" className={styles.popoverMenuItem} onClick={() => setPopoverOpen(false)}>
                  <Settings size={14} className={styles.popoverMenuIcon} />
                  <span>Settings</span>
                </Link>
              </div>

              <div className={styles.popoverFooter}>
                <form action="/auth/signout" method="post" className="w-full">
                  <button type="submit" className={styles.popoverLogoutBtn}>
                    <LogOut size={14} />
                    <span>Sign out</span>
                  </button>
                </form>
              </div>
            </div>
          </>
        )}

        <div
          className={styles.userRow}
          onClick={() => setPopoverOpen((o) => !o)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && setPopoverOpen((o) => !o)}
          aria-expanded={popoverOpen}
          aria-haspopup="true"
        >
          <div className={styles.userLeft}>
            <div className={styles.userAvatar}>{initials}</div>
            <div className={styles.userInfo}>
              <span className={styles.userName}>{displayUser.name}</span>
              <span className={styles.userEmail}>{displayUser.email}</span>
            </div>
          </div>
          <ChevronsUpDown size={14} className={styles.userChevron} />
        </div>
      </div>
    </aside>
  );
}
