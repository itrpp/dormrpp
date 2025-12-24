// components/LogoutButton.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
      });

      if (response.ok) {
        router.push('/login');
        router.refresh();
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="text-gray-500 hover:text-gray-700 text-xs sm:text-sm font-medium disabled:opacity-50 transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-100 whitespace-nowrap"
    >
      {loading ? 'กำลังออกจากระบบ...' : 'ออกจากระบบ'}
    </button>
  );
}

