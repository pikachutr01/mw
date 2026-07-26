/**
 * Etkin şehir — kaynak çubuğu, Şehir sekmesi ve Dünya sekmesindeki saldırı hepsi aynı şehri
 * kullanır. Çok şehirli oyuncuda "hangi şehirden gönderdim" karışıklığını önleyen tek durum.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useCities } from './queries.ts';

interface ActiveCity {
  cityId: number | null;
  setCityId: (id: number) => void;
}

const Ctx = createContext<ActiveCity>({ cityId: null, setCityId: () => {} });

export function ActiveCityProvider({ children }: { children: ReactNode }) {
  const cities = useCities();
  const [cityId, setCityId] = useState<number | null>(() => {
    const saved = localStorage.getItem('mw-active-city');
    return saved ? Number(saved) : null;
  });

  const list = cities.data?.cities;
  useEffect(() => {
    if (!list || list.length === 0) return;
    // Kayıtlı şehir artık bize ait değilse (terk/fetih) sessizce başkente düş.
    if (cityId == null || !list.some((c) => c.id === cityId)) {
      setCityId(list[0]!.id);
    }
  }, [list, cityId]);

  useEffect(() => {
    if (cityId != null) localStorage.setItem('mw-active-city', String(cityId));
  }, [cityId]);

  const value = useMemo(() => ({ cityId, setCityId }), [cityId]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useActiveCity = (): ActiveCity => useContext(Ctx);
