import {
  canStudentViewMaterial,
  getStudyMaterialsAdminClient,
  STUDY_MATERIAL_BUCKET,
} from '@/lib/study-materials-server';

const MATERIAL_SUBJECTS = [
  '国語演習', '古典探求', '物理', '生物', '数３', '数C',
  '公共', '英コミュ', '論表', '情報', '保健', 'その他',
] as const;

type MaterialSubject = typeof MATERIAL_SUBJECTS[number];

export type LineSchoolMaterialSearchRequest = {
  subject: MaterialSubject | null;
  term: string | null;
  titleQuery: string;
  version: string | null;
  requireSchoolRoot: boolean;
  requireSubjectFolder: boolean;
};

type MaterialRow = {
  id: string;
  title: string;
  description: string;
  subject: string;
  material_type: string;
  target_scope: string;
  target_value: string | null;
  folder_id: string | null;
  file_name: string;
  mime_type: string;
  file_size: number;
  storage_path: string;
};

type FolderRow = { id: string; name: string; parent_id: string | null };

export type LineSchoolMaterialMatch = {
  id: string;
  title: string;
  subject: string;
  fileName: string;
  fileSize: number;
  folderPath: string;
  signedUrl: string;
};

export type LineSchoolMaterialSearchResult =
  | { status: 'found' | 'ambiguous'; matches: LineSchoolMaterialMatch[] }
  | { status: 'not_found' | 'link_required' | 'class_unverified' | 'group_restricted' | 'unavailable' };

function normalizeMaterialText(value: string): string {
  return value.normalize('NFKC')
    .toLocaleLowerCase('ja-JP')
    .replace(/\.pdf$/iu, '')
    .replace(/[\s　\p{P}\p{S}]/gu, '');
}

/** CSAIの「学校資料 ... を開いて」のような指定を、フォルダー条件と資料名に分ける。 */
export function parseLineSchoolMaterialSearchRequest(input: string): LineSchoolMaterialSearchRequest | null {
  const normalized = input.normalize('NFKC').trim();
  if (!/(?:学校資料|資料室|資料|PDF|プリント)/iu.test(normalized)) return null;
  if (!/(?:開いて|開く|見せて|表示して|見たい|閲覧|送って|開けて)/u.test(normalized)) return null;

  const subject = MATERIAL_SUBJECTS.find(item => normalized.includes(item.normalize('NFKC'))) ?? null;
  const termMatch = normalized.match(/([1-3])学期/u);
  const term = termMatch ? termMatch[1] + '学期' : null;
  const requireSchoolRoot = /学校資料/u.test(normalized);
  const requireSubjectFolder = /教科別/u.test(normalized);

  let title = normalized
    .replace(/(?:を)?(?:開いて|開く|見せて|表示して|見たい|閲覧したい|送って|開けて|出して|探して|検索して).*$/u, '')
    .replace(/学校資料エクスプローラー|資料エクスプローラー|学校資料|資料室|教科別|PDF|プリント/giu, ' ')
    .replace(/(?:1|2|3)学期/gu, ' ');

  for (const knownSubject of MATERIAL_SUBJECTS) {
    title = title.split(knownSubject).join(' ');
  }

  title = title.replace(/(?:この|最後の|ファイル|資料|のPDF|PDFの)/gu, ' ')
    .replace(/[、。，．・「」『』（）()\[\]［］{}"'：:]/gu, ' ')
    .replace(/\s+/gu, '')
    .trim();

  const titleQuery = normalizeMaterialText(title);
  if (titleQuery.length < 2) return null;

  const versionMatch = titleQuery.match(/([abc])$/u);
  return {
    subject,
    term,
    titleQuery,
    version: versionMatch?.[1] ?? null,
    requireSchoolRoot,
    requireSubjectFolder,
  };
}

function getFolderSegments(folderId: string | null, folders: Map<string, FolderRow>): string[] {
  const segments: string[] = [];
  const visited = new Set<string>();
  let currentId = folderId;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const folder = folders.get(currentId);
    if (!folder) break;
    segments.push(folder.name);
    currentId = folder.parent_id;
  }

  return segments.reverse();
}

function getMaterialVersion(material: MaterialRow): string | null {
  for (const raw of [material.title, material.file_name]) {
    const value = raw.normalize('NFKC');
    const prefix = value.match(/^\s*([ABC])(?=[\s.．・_\-：:)）]|$)/iu);
    if (prefix) return prefix[1].toLowerCase();
    const suffix = value.replace(/\.pdf$/iu, '').match(/(?:^|[\s.．・_\-：:(（])([ABC])$/iu);
    if (suffix) return suffix[1].toLowerCase();
  }
  return null;
}

function diceSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return 0;
  const grams = new Map<string, number>();
  for (let index = 0; index < left.length - 1; index += 1) {
    const gram = left.slice(index, index + 2);
    grams.set(gram, (grams.get(gram) || 0) + 1);
  }
  let overlap = 0;
  for (let index = 0; index < right.length - 1; index += 1) {
    const gram = right.slice(index, index + 2);
    const count = grams.get(gram) || 0;
    if (count > 0) {
      overlap += 1;
      grams.set(gram, count - 1);
    }
  }
  return (2 * overlap) / ((left.length - 1) + (right.length - 1));
}

function scoreMaterial(
  request: LineSchoolMaterialSearchRequest,
  material: MaterialRow,
): number {
  const candidateParts = [
    normalizeMaterialText(material.title),
    normalizeMaterialText(material.file_name),
  ];
  const candidateVersion = getMaterialVersion(material);
  const queryBase = request.version ? request.titleQuery.slice(0, -1) : request.titleQuery;
  const candidateBases = candidateParts.map(candidate =>
    candidateVersion && /^[abc]/u.test(candidate) ? candidate.slice(1) : candidate,
  );

  let score = candidateParts.some(candidate => candidate.includes(request.titleQuery))
    ? 145
    : candidateBases.some(candidate => candidate.includes(queryBase))
      ? 115
      : Math.round(Math.max(...candidateBases.map(candidate => diceSimilarity(queryBase, candidate))) * 90);

  if (request.version) {
    score += candidateVersion === request.version ? 45 : candidateVersion ? -65 : -20;
  }
  return score;
}

function materialFolderPath(material: MaterialRow, folders: Map<string, FolderRow>): string {
  return getFolderSegments(material.folder_id, folders).join(' / ');
}

/**
 * 検索結果は必ずLINE送信者の閲覧範囲に絞る。
 * グループでは、送信者が閲覧できる資料であってもクラス限定URLを共有しない。
 */
export async function findLineSchoolMaterialMatches(
  request: LineSchoolMaterialSearchRequest,
  lineUserId: string | null,
  isGroupOrRoom: boolean,
): Promise<LineSchoolMaterialSearchResult> {
  const admin = getStudyMaterialsAdminClient();
  if (!admin) return { status: 'unavailable' };

  let linked = false;
  let verifiedClass: string | null = null;

  if (lineUserId && /^U[A-Za-z0-9]{20,40}$/u.test(lineUserId)) {
    const { data: link, error: linkError } = await admin
      .from('line_student_links')
      .select('student_id,auth_user_id')
      .eq('line_user_id', lineUserId)
      .not('linked_at', 'is', null)
      .maybeSingle();

    if (linkError) {
      console.error('LINE material search identity lookup failed:', linkError.message);
      return { status: 'unavailable' };
    }

    if (link?.student_id && link?.auth_user_id) {
      linked = true;
      const { data: profile, error: profileError } = await admin
        .from('profiles')
        .select('verified_class')
        .eq('student_id', link.student_id)
        .eq('auth_user_id', link.auth_user_id)
        .maybeSingle();

      if (profileError) {
        console.error('LINE material search class lookup failed:', profileError.message);
        return { status: 'unavailable' };
      }

      const candidateClass = typeof profile?.verified_class === 'string' ? profile.verified_class : '';
      if (/^[1-3]-[1-8]$/u.test(candidateClass)) verifiedClass = candidateClass;
    }
  }

  let materialQuery = admin.from('study_materials')
    .select('id,title,description,subject,material_type,target_scope,target_value,folder_id,file_name,mime_type,file_size,storage_path')
    .eq('is_published', true)
    .is('archived_at', null)
    .eq('mime_type', 'application/pdf')
    .order('published_at', { ascending: false })
    .limit(1000);

  if (request.subject) materialQuery = materialQuery.eq('subject', request.subject);

  const [{ data: materialRows, error: materialError }, { data: folderRows, error: folderError }] = await Promise.all([
    materialQuery,
    admin.from('study_material_folders').select('id,name,parent_id').limit(1000),
  ]);

  if (materialError || folderError) {
    console.error('LINE material search query failed:', materialError?.message || folderError?.message);
    return { status: 'unavailable' };
  }

  const folders = new Map<string, FolderRow>(
    ((folderRows || []) as FolderRow[]).map(folder => [folder.id, folder]),
  );

  const ranked = ((materialRows || []) as MaterialRow[])
    .map(material => {
      const segments = getFolderSegments(material.folder_id, folders);
      const normalizedSegments = segments.map(normalizeMaterialText);

      if (request.requireSchoolRoot && !normalizedSegments.includes(normalizeMaterialText('学校資料'))) return null;
      if (request.requireSubjectFolder && !normalizedSegments.includes(normalizeMaterialText('教科別'))) return null;
      if (request.subject && !normalizedSegments.includes(normalizeMaterialText(request.subject))) return null;
      if (request.term && !normalizedSegments.includes(normalizeMaterialText(request.term))) return null;

      return {
        material,
        folderPath: materialFolderPath(material, folders),
        score: scoreMaterial(request, material),
      };
    })
    .filter((item): item is { material: MaterialRow; folderPath: string; score: number } => item !== null)
    .sort((left, right) => right.score - left.score);

  if (ranked.length === 0 || ranked[0].score < 35) return { status: 'not_found' };

  const accessible = ranked.filter(({ material }) => {
    if (material.target_scope === 'all') return true;
    if (isGroupOrRoom || !verifiedClass) return false;
    return canStudentViewMaterial(material, verifiedClass);
  });

  if (accessible.length === 0) {
    if (ranked.some(({ material }) => material.target_scope !== 'all')) {
      if (isGroupOrRoom) return { status: 'group_restricted' };
      if (!linked) return { status: 'link_required' };
      if (!verifiedClass) return { status: 'class_unverified' };
    }
    return { status: 'not_found' };
  }

  const ambiguous = !request.version
    && accessible.length > 1
    && accessible[0].score - accessible[1].score < 8;
  const selected = (ambiguous ? accessible.slice(0, 3) : accessible.slice(0, 1));
  const signedMatches = await Promise.all(selected.map(async ({ material, folderPath }) => {
    if (!/^uploads\/[0-9a-f-]{36}\.pdf$/iu.test(material.storage_path)) return null;
    const { data, error } = await admin.storage.from(STUDY_MATERIAL_BUCKET)
      .createSignedUrl(material.storage_path, 60 * 60, { download: false });
    if (error || !data?.signedUrl) {
      console.error('LINE material signed URL creation failed:', error?.message || 'signed URL missing');
      return null;
    }
    return {
      id: material.id,
      title: material.title,
      subject: material.subject,
      fileName: material.file_name,
      fileSize: Number(material.file_size) || 0,
      folderPath,
      signedUrl: data.signedUrl,
    };
  }));

  const matches = signedMatches.filter((item): item is LineSchoolMaterialMatch => item !== null);
  if (matches.length === 0) return { status: 'unavailable' };
  return { status: ambiguous && matches.length > 1 ? 'ambiguous' : 'found', matches };
}
