/** خطأ من الخادم برسالة عربية جاهزة للعرض. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

export async function api<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('تعذّر الاتصال بالخادم. تُعاد المحاولة بعد قليل.', 0, 'NETWORK');
  }

  if (response.status === 204) return undefined as T;

  // رد ليس JSON = الطلب لم يصل إلى الخادم (خادم التطوير لا يحوّل /api، أو الخادم متوقف).
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) {
    throw new ApiError('تعذّر الوصول إلى الخادم. يُتحقق من أن الخادم يعمل ثم تُعاد المحاولة.', response.status, 'NETWORK');
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (data as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(
      error?.message ?? 'حدث خطأ غير متوقع. تُعاد المحاولة لاحقاً.',
      response.status,
      error?.code ?? 'UNKNOWN',
    );
  }
  return data as T;
}
