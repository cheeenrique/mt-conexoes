'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

export function BackButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="mb-4 inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground"
    >
      <ArrowLeft size={15} /> Voltar
    </button>
  );
}
