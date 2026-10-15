"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/** Как neurolis-rail-open: один жест сворачивает весь левый блок кабинета. */
const KEY = "tn-panels-open";

type NavCtx = {
  collapsed: boolean;
  panelsOpen: boolean;
  toggle: () => void;
  setCollapsed: (v: boolean) => void;
  setPanelsOpen: (v: boolean) => void;
};

const Ctx = createContext<NavCtx | null>(null);

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [panelsOpen, setPanelsOpenState] = useState(true);

  useEffect(() => {
    const raw = localStorage.getItem(KEY);
    if (raw === "0") setPanelsOpenState(false);
  }, []);

  const persist = useCallback((open: boolean) => {
    localStorage.setItem(KEY, open ? "1" : "0");
    setPanelsOpenState(open);
  }, []);

  const toggle = useCallback(() => {
    setPanelsOpenState((v) => {
      const next = !v;
      localStorage.setItem(KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      collapsed: !panelsOpen,
      panelsOpen,
      toggle,
      setCollapsed: (v: boolean) => persist(!v),
      setPanelsOpen: persist,
    }),
    [panelsOpen, toggle, persist]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNav() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useNav outside provider");
  return ctx;
}
