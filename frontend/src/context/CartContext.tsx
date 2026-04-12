'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { MedicineCatalogItem } from '@/lib/api';

const STORAGE_KEY = 'cho_medicine_cart';

export interface CartItem {
  medication: MedicineCatalogItem;
  quantity: number;
}

interface CartContextType {
  items: CartItem[];
  count: number;
  total: number;
  addItem: (medication: MedicineCatalogItem, qty?: number) => void;
  removeItem: (medicationSid: string) => void;
  updateQuantity: (medicationSid: string, qty: number) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

function loadFromStorage(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToStorage(items: CartItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch { /* quota exceeded or SSR — ignore */ }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  // Hydrate from localStorage on mount (avoids SSR mismatch).
  useEffect(() => { setItems(loadFromStorage()); }, []);

  // Persist whenever items change (skip the initial empty render).
  useEffect(() => { saveToStorage(items); }, [items]);

  const addItem = useCallback((medication: MedicineCatalogItem, qty = 1) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.medication.sid === medication.sid);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + qty };
        return next;
      }
      return [...prev, { medication, quantity: qty }];
    });
  }, []);

  const removeItem = useCallback((medicationSid: string) => {
    setItems((prev) => prev.filter((i) => i.medication.sid !== medicationSid));
  }, []);

  const updateQuantity = useCallback((medicationSid: string, qty: number) => {
    if (qty < 1) return;
    setItems((prev) =>
      prev.map((i) => (i.medication.sid === medicationSid ? { ...i, quantity: qty } : i)),
    );
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const count = items.reduce((s, i) => s + i.quantity, 0);
  const total = items.reduce((s, i) => s + Number(i.medication.cost) * i.quantity, 0);

  return (
    <CartContext.Provider value={{ items, count, total, addItem, removeItem, updateQuantity, clearCart }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
