import { useEffect } from 'react';

/** صفحة مؤقتة لكل شاشة لم تُبنَ بعد. تُستبدل بالشاشة الحقيقية في مرحلتها. */
export function Placeholder({ title }: { title: string }) {
  useEffect(() => {
    document.title = `${title} · مكتب المدينة`;
  }, [title]);

  return (
    <main className="main">
      <header>
        <h1>{title}</h1>
        <p className="sub" style={{ margin: '4px 0 0' }}>
          قيد الإنشاء
        </p>
      </header>
    </main>
  );
}
