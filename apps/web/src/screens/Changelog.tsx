/**
 * ⭐⭐ DEĞİŞİKLİK GÜNLÜĞÜ (kullanıcı, 2026-08-16).
 *
 * *"Düzenleme geçmişi gibi bir sayfada maddeler hâlinde tarihiyle beraber görünsün."*
 *
 * ⚠️ **Misafir dalında da mount ediliyor** (`GuestShell`): oyuna bakan biri için "denge son
 * zamanlarda ne yönde değişti" tam da merak edilen şey, ve uç zaten herkese açık.
 *
 * ⚠️ Gövde DÜZ METİN olarak geliyor (sözleşme kuralı) → `whitespace-pre-line` ile yalnız satır
 * sonları korunuyor. `dangerouslySetInnerHTML` YOK ve olmayacak: metnin kaynağı yönetim paneli
 * olsa bile, oyuncuya HTML basmanın tek sonucu bir gün birinin oraya betik yazması olur.
 */
import type React from 'react';
import { CHANGELOG_CATEGORY_LABEL, type ChangelogCategory } from '@mobilwar/contracts';
import { Badge, Card, Empty, ErrorBox, Skeleton } from '../components/ui.tsx';
import { useChangelog } from '../lib/queries.ts';

/** Kategori → rozet tonu. Denge nötr, yenilik olumlu, düzeltme uyarı tonunda. */
const TONE: Record<ChangelogCategory, 'muted' | 'success' | 'warning'> = {
  balance: 'muted',
  feature: 'success',
  fix: 'warning',
};

const tarih = (iso: string): string =>
  new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

export function ChangelogScreen(): React.ReactElement {
  const { data, isLoading, error } = useChangelog();

  /**
   * ⚠️ Ölçüler `Support.tsx`ten kopyalanmadı, ONUNLA AYNI: `p-4 sm:p-6` + `space-y-4`, kartlar
   * kendi `p-4`ünü taşıyor. `Card` bilerek padding'siz (bkz. `ui.tsx`) — kimi çağıran kartın
   * içine tam kenarlı liste koyuyor. Burada içerik düz metin, o yüzden padding çağırandan.
   *
   * ⚠️ `SectionTitle` KULLANILMIYOR: o bir **panel içi** bileşen ve kendi `px-3`ünü taşıyor;
   * sayfa köküne konunca başlık, altındaki metinden içeride kalıyor ve hizalar ayrışıyor.
   */
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="display text-base font-semibold tracking-wide text-ink uppercase">
          Değişiklikler
        </h1>
        <p className="text-[13px] leading-relaxed text-muted">
          Oyunun kurallarında ve dengesinde yapılan değişiklikler burada, en yenisi en üstte.
        </p>
      </header>

      {error ? <ErrorBox error={error} /> : null}

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton w="100%" />
          <Skeleton w="80%" />
          <Skeleton w="90%" />
        </div>
      ) : null}

      {!isLoading && !error && (data?.entries.length ?? 0) === 0 ? (
        <Empty>Henüz kayıtlı bir değişiklik yok.</Empty>
      ) : null}

      {data?.entries.length ? (
        <div className="space-y-3">
          {data.entries.map((e) => (
            <Card key={e.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={TONE[e.category]}>{CHANGELOG_CATEGORY_LABEL[e.category]}</Badge>
                <span className="tnum text-[12px] text-muted">{tarih(e.publishedAt)}</span>
              </div>
              <h2 className="mt-2 text-[15px] leading-snug font-semibold text-ink">{e.title}</h2>
              <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-muted">
                {e.body}
              </p>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}
