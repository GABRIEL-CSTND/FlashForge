import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/roles';
import { STUDENT_ROLES } from '@/lib/role-types';
import { normalizeJoinCode } from '@/lib/classes-shared';
import {
  findClassByCode,
  getTeacherName,
  joinClass,
  listJoinedClasses,
  minutesUntilJoinAllowed,
  recordFailedJoin,
} from '@/lib/student-classes';
import { listStudentAssignments } from '@/lib/assignments';
import { progressForAssignments } from '@/lib/attempts';
import { errorResponse, readJsonBody } from '@/lib/route-helpers';

// The signed-in student's classes (#54), most recently joined first, each
// with its assignments, soonest due first (#56), and the student's own
// progress on each assignment, or null if not done yet (#57).
export async function GET(req: NextRequest) {
  try {
    const user = await requireRole(req, STUDENT_ROLES);
    const [classes, assignments] = await Promise.all([listJoinedClasses(user.id), listStudentAssignments(user.id)]);
    const progress = await progressForAssignments(user.id, assignments.map((a) => a.id));
    return NextResponse.json({
      classes: classes.map((c) => ({
        ...c,
        assignments: assignments
          .filter((a) => a.classId === c.id)
          .map(({ id, setId, setTitle, studyType, dueAt, createdAt }) => ({
            id,
            setId,
            setTitle,
            studyType,
            dueAt,
            createdAt,
            myProgress: progress.get(id) ?? null,
          })),
      })),
    });
  } catch (err) {
    return errorResponse(err, 'student/classes GET');
  }
}

// Join a class with its code: { code }. Codes are looked up here, with the
// service role, so they can't be listed or guessed through the database API.
// Wrong codes are rate-limited per student.
export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(req, STUDENT_ROLES);
    const raw = (await readJsonBody(req))?.code;
    const code = typeof raw === 'string' ? normalizeJoinCode(raw) : null;
    if (!code) {
      return NextResponse.json(
        { error: "That doesn't look like a class code. Codes have 6 letters and numbers, like K7M-2QX." },
        { status: 400 }
      );
    }

    const wait = await minutesUntilJoinAllowed(user.id);
    if (wait > 0) {
      return NextResponse.json(
        { error: `Too many wrong codes. Try again in ${wait} minute${wait === 1 ? '' : 's'}.` },
        { status: 429, headers: { 'Retry-After': String(wait * 60) } }
      );
    }

    const cls = await findClassByCode(code);
    if (!cls) {
      await recordFailedJoin(user.id);
      return NextResponse.json(
        { error: 'No class uses that code. Check it with your teacher.' },
        { status: 404 }
      );
    }
    // Only possible if an admin moved a teacher to the student role.
    if (cls.teacherId === user.id) {
      return NextResponse.json({ error: 'You teach this class.' }, { status: 409 });
    }

    const result = await joinClass(user.id, cls.id);
    const teacherName = await getTeacherName(cls.teacherId);
    return NextResponse.json(
      { class: { id: cls.id, name: cls.name, teacherName }, alreadyMember: result === 'already-member' },
      { status: result === 'joined' ? 201 : 200 }
    );
  } catch (err) {
    return errorResponse(err, 'student/classes POST');
  }
}
