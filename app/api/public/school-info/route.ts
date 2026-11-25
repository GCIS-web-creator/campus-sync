import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import {
  isAssignmentVisibleToClass,
  isExamAudienceVisibleToClass,
  isExamTargetedAtClass,
  isSchoolClassCode,
} from '@/lib/liff-public-portal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function tokyoDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

const EXAM_RANGE_SUBJECT_ALIASES: Record<string, readonly string[]> = {
  '英コミュⅡ': ['英コミュⅡ', '英コミュ'],
  '英コミュ': ['英コミュⅡ', '英コミュ'],
  '論理表現Ⅱ（30分）': ['論理表現Ⅱ（30分）', '論理表現Ⅱ', '論表'],
  '論理表現Ⅱ': ['論理表現Ⅱ（30分）', '論理表現Ⅱ', '論表'],
  '論表': ['論理表現Ⅱ（30分）', '論理表現Ⅱ', '論表'],
  '数学C': ['数学C', '数C'],
  '数C': ['数学C', '数C'],
  '古典探究': ['古典探究', '古典探求'],
  '古典探求': ['古典探究', '古典探求'],
  '物理・生物': ['物理・生物', '物理', '生物'],
  '物理': ['物理・生物', '物理'],
  '生物': ['物理・生物', '生物'],
  '数３': ['数３', '数3', '数Ⅲ', '数学Ⅲ', '数学３', '数学3'],
  '数3': ['数３', '数3', '数Ⅲ', '数学Ⅲ', '数学３', '数学3'],
  '数Ⅲ': ['数３', '数3', '数Ⅲ', '数学Ⅲ', '数学３', '数学3'],
  '数学Ⅲ': ['数３', '数3', '数Ⅲ', '数学Ⅲ', '数学３', '数学3'],
  '数学３': ['数３', '数3', '数Ⅲ', '数学Ⅲ', '数学３', '数学3'],
  '数学3': ['数３', '数3', '数Ⅲ', '数学Ⅲ', '数学３', '数学3'],
};

function matchesExamRangeSubject(
  examSubject: string,
  range: { subject: string; display_subject: string },
): boolean {
  const acceptedNames = EXAM_RANGE_SUBJECT_ALIASES[examSubject] || [examSubject];
  return acceptedNames.includes(range.subject) || acceptedNames.includes(range.display_subject);
}

export async function GET(request: Request) {
  const classCode = new URL(request.url).searchParams.get('class') || '';
  if (!isSchoolClassCode(classCode)) {
    return NextResponse.json(
      { success: false, message: '学年・クラスを選択してください。' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const db = createServerClient();
  if (!db) {
    return NextResponse.json(
      { success: false, message: '公開情報APIのサーバー設定が不足しています。' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const today = tokyoDateKey();
  try {
    const [examResult, assignmentResult] = await Promise.all([
      db.from('school_test_exams')
        .select('id,school_year,term,exam_type,start_date,end_date,target_classes')
        .gte('end_date', today)
        .order('start_date', { ascending: true })
        .limit(20),
      db.from('assignments')
        .select('id,title,details,source,type,due,due_at,subject,target_class,subject_option,priority,updated_at')
        .eq('is_active', true)
        .order('due_at', { ascending: true, nullsFirst: false })
        .limit(100),
    ]);

    if (examResult.error || assignmentResult.error) {
      console.error('LIFF public school data query failed:', examResult.error?.message || assignmentResult.error?.message);
      return NextResponse.json(
        { success: false, message: '学校公開情報を取得できませんでした。' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const exams = (examResult.data || []).filter(exam =>
      isExamTargetedAtClass(exam.target_classes, classCode),
    );
    const examIds = exams.map(exam => exam.id);

    let subjectRows: Array<{
      exam_id: string;
      subject: string;
      exam_date: string;
      sort_order: number;
    }> = [];
    let rangeRows: Array<{
      exam_id: string;
      subject: string;
      display_subject: string;
      audience: string;
      range_sections: unknown;
      sort_order: number;
      broadcast_on: string | null;
      updated_at: string;
    }> = [];

    if (examIds.length) {
      const [subjectsResult, rangesResult] = await Promise.all([
        db.from('school_test_subjects')
          .select('exam_id,subject,exam_date,sort_order')
          .in('exam_id', examIds)
          .order('sort_order', { ascending: true }),
        db.from('school_test_ranges')
          .select('exam_id,subject,display_subject,audience,range_sections,sort_order,broadcast_on,updated_at')
          .in('exam_id', examIds)
          .order('sort_order', { ascending: true }),
      ]);
      if (subjectsResult.error || rangesResult.error) {
        console.error('LIFF public exam range query failed:', subjectsResult.error?.message || rangesResult.error?.message);
        return NextResponse.json(
          { success: false, message: '試験範囲を取得できませんでした。' },
          { status: 503, headers: { 'Cache-Control': 'no-store' } },
        );
      }
      subjectRows = (subjectsResult.data || []) as typeof subjectRows;
      rangeRows = (rangesResult.data || []).filter(row =>
        isExamAudienceVisibleToClass(row.audience, classCode),
      ) as typeof rangeRows;
    }

    const examPayload = exams.map(exam => ({
      id: exam.id,
      schoolYear: exam.school_year,
      term: exam.term,
      examType: exam.exam_type,
      startDate: exam.start_date,
      endDate: exam.end_date,
      subjects: subjectRows
        .filter(subject => subject.exam_id === exam.id)
        .map(subject => ({
          subject: subject.subject,
          examDate: subject.exam_date,
          ranges: rangeRows
            .filter(range => range.exam_id === exam.id && matchesExamRangeSubject(subject.subject, range))
            .map(range => ({
              displaySubject: range.display_subject,
              audience: range.audience,
              sections: Array.isArray(range.range_sections) ? range.range_sections : [],
              broadcastOn: range.broadcast_on,
              updatedAt: range.updated_at,
            })),
        })),
    }));

    const assignments = (assignmentResult.data || [])
      .filter(row => isAssignmentVisibleToClass(row.target_class, classCode))
      .map(row => ({
        id: row.id,
        title: row.title,
        details: row.details,
        source: row.source,
        type: row.type,
        due: row.due,
        dueAt: row.due_at,
        subject: row.subject,
        targetClass: row.target_class,
        subjectOption: row.subject_option,
        priority: row.priority || 'normal',
        updatedAt: row.updated_at,
      }));

    return NextResponse.json(
      { success: true, classCode, today, exams: examPayload, assignments },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=90, stale-while-revalidate=180',
          'Vary': 'Accept-Encoding',
        },
      },
    );
  } catch (error) {
    console.error('LIFF public school info failed:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json(
      { success: false, message: '学校公開情報を取得できませんでした。' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
