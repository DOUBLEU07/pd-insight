'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useApp } from '@/lib/app-context';

export default function Home() {
  const router = useRouter();
  const { user, ready } = useApp();

  useEffect(() => {
    if (!ready) return;
    router.replace(user ? '/dashboard' : '/login');
  }, [ready, user, router]);

  return (
    <div className="flex min-h-screen items-center justify-center gap-3 text-muted">
      <span className="spinner" />
    </div>
  );
}
