export type SchoolRangeSubjectRow = {
  id: string;
  subject: string;
  display_subject: string;
};

type RequiredSubjectGroup = {
  label: string;
  acceptedNames: string[];
};

// 考査日程側と学校公開範囲側で異なる科目名を同一科目として扱う。
// 複合科目は科目ごとに登録状況を判定し、一部だけ登録された状態を隠さない。
const REQUIRED_SUBJECT_GROUPS: Record<string, RequiredSubjectGroup[]> = {
  '英コミュⅡ': [
    { label: '英コミュⅡ', acceptedNames: ['英コミュⅡ', '英コミュ'] },
  ],
  '論理表現Ⅱ（30分）': [
    { label: '論理表現Ⅱ', acceptedNames: ['論理表現Ⅱ（30分）', '論理表現Ⅱ', '論表'] },
  ],
  '保健（30分）': [
    { label: '保健（30分）', acceptedNames: ['保健（30分）', '保健'] },
  ],
  '物理・生物': [
    { label: '物理', acceptedNames: ['物理', '物理・生物'] },
    { label: '生物', acceptedNames: ['生物', '物理・生物'] },
  ],
};

export function matchSchoolRangeSubjects<T extends SchoolRangeSubjectRow>(
  subjectName: string,
  ranges: readonly T[],
) {
  const requiredGroups = REQUIRED_SUBJECT_GROUPS[subjectName] || [
    { label: subjectName, acceptedNames: [subjectName] },
  ];

  const registeredGroups = requiredGroups.filter(group =>
    ranges.some(row => group.acceptedNames.some(name =>
      row.subject === name || row.display_subject === name
    ))
  );
  const registeredSubjects = registeredGroups.map(group => group.label);
  const missingSubjects = requiredGroups
    .filter(group => !registeredSubjects.includes(group.label))
    .map(group => group.label);

  const matchedRows = new Map<string, T>();
  for (const group of registeredGroups) {
    for (const row of ranges) {
      if (group.acceptedNames.some(name => row.subject === name || row.display_subject === name)) {
        matchedRows.set(row.id, row);
      }
    }
  }

  return {
    rows: Array.from(matchedRows.values()),
    expectedSubjects: requiredGroups.map(group => group.label),
    registeredSubjects,
    missingSubjects,
  };
}
