export type SchoolClassCode = `${1 | 2 | 3}-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;

export function isSchoolClassCode(value: string): value is SchoolClassCode {
  return /^[1-3]-[1-8]$/.test(value);
}

export function isExamTargetedAtClass(targetClasses: unknown, classCode: string): boolean {
  if (!isSchoolClassCode(classCode)) return false;
  if (!Array.isArray(targetClasses)) return false;
  if (targetClasses.length === 0) return true;
  return targetClasses.some(value => typeof value === 'string' && value.trim() === classCode);
}

export function isExamAudienceVisibleToClass(audience: string, classCode: string): boolean {
  if (!isSchoolClassCode(classCode)) return false;
  if (audience === '全生徒') return true;
  if (audience === '2年理系') return classCode === '2-7' || classCode === '2-8';
  return false;
}

export function isAssignmentVisibleToClass(targetClass: string, classCode: string): boolean {
  if (!isSchoolClassCode(classCode)) return false;
  if (targetClass === 'all') return true;
  if (targetClass === 'science') return classCode === '2-7' || classCode === '2-8';
  return false;
}
