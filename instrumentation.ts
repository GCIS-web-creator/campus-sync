import type { Instrumentation } from 'next';

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const normalizedError = error instanceof Error ? error : new Error(String(error ?? 'Unknown request error'));
  try {
    const { recordSystemDiagnostic, resolveSystemKeyFromPath } = await import('./lib/system-observability');
    await recordSystemDiagnostic({
      severity: 'error',
      source: 'next',
      systemKey: resolveSystemKeyFromPath(request.path),
      eventCode: 'NEXT_REQUEST_ERROR',
      message: normalizedError.message || 'サーバーリクエストで予期しないエラーが発生しました。',
      routePath: request.path,
      requestId: (normalizedError as Error & { digest?: string }).digest || null,
      details: {
        digest: (error as Error & { digest?: string }).digest || null,
        routerKind: context.routerKind,
        routeType: context.routeType,
        renderSource: context.renderSource,
        renderType: context.renderType,
        revalidateReason: context.revalidateReason,
      },
    });
  } catch {
    // Observability must never make the original request fail.
  }
};
