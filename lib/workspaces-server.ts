import { createHash, randomBytes } from 'node:crypto';
import { getStudyStudentContext, getStudyMaterialsAdminClient } from '@/lib/study-materials-server';

type WorkspaceAdminClient = NonNullable<ReturnType<typeof getStudyMaterialsAdminClient>>;

export const WORKSPACE_FILE_BUCKET = 'workspace-files';
export const WORKSPACE_FILE_MAX_BYTES = 20 * 1024 * 1024;
export const WORKSPACE_FILE_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
] as const;

export const noStoreHeaders = { 'Cache-Control': 'no-store, private' };
export const workspaceIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getWorkspaceStudentContext(request: Request) {
  const context = await getStudyStudentContext(request);
  if (!context) return null;
  return {
    ...context,
    userId: context.authUserId,
    displayName: context.studentName.trim() || context.studentId,
  };
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function hashWorkspaceInvite(code: string) {
  return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

export function createWorkspaceInviteCode() {
  return randomBytes(18).toString('hex').toUpperCase();
}

export async function getWorkspaceMemberRole(admin: WorkspaceAdminClient, workspaceId: string, userId: string) {
  const { data, error } = await admin
    .from('workspace_members')
    .select('member_role,status')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.status !== 'active') return null;
  const { data: workspace, error: workspaceError } = await admin
    .from('workspaces')
    .select('status')
    .eq('id', workspaceId)
    .maybeSingle();
  if (workspaceError) throw workspaceError;
  if (!workspace || workspace.status !== 'active') return null;
  return String(data.member_role);
}

export async function recordWorkspaceAudit(
  admin: WorkspaceAdminClient,
  input: {
    workspaceId: string;
    actorUserId?: string | null;
    actorType?: 'student' | 'admin' | 'system';
    action: string;
    targetType?: string;
    targetId?: string | null;
    details?: Record<string, unknown>;
  },
) {
  const { error } = await admin.from('workspace_audit_logs').insert({
    workspace_id: input.workspaceId,
    actor_user_id: input.actorUserId ?? null,
    actor_type: input.actorType ?? 'student',
    action: input.action,
    target_type: input.targetType ?? '',
    target_id: input.targetId ?? null,
    details: input.details ?? {},
  });
  if (error) console.error('Workspace audit log insert failed:', error.message);
}

export async function ensureWorkspaceFilesBucket(admin: WorkspaceAdminClient) {
  const { data, error } = await admin.storage.getBucket(WORKSPACE_FILE_BUCKET);
  if (data && !error) {
    const { error: updateError } = await admin.storage.updateBucket(WORKSPACE_FILE_BUCKET, {
      public: false,
      fileSizeLimit: WORKSPACE_FILE_MAX_BYTES,
      allowedMimeTypes: [...WORKSPACE_FILE_MIME_TYPES],
    });
    if (updateError) throw updateError;
    return;
  }
  const { error: createError } = await admin.storage.createBucket(WORKSPACE_FILE_BUCKET, {
    public: false,
    fileSizeLimit: WORKSPACE_FILE_MAX_BYTES,
    allowedMimeTypes: [...WORKSPACE_FILE_MIME_TYPES],
  });
  if (createError && !/already exists|duplicate|409/i.test(createError.message || '')) throw createError;
}
