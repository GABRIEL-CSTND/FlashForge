import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/ids';
import { getAssignmentSetting, getSetSetting, saveSetSetting } from '@/lib/assignment-settings';
import { errorResponse, notFound, readJsonBody } from '@/lib/route-helpers';

type Context = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    if (!isUuid(id)) return notFound('Study set');

    const assignmentId = req.nextUrl.searchParams.get('assignment');
    if (assignmentId && isUuid(assignmentId)) {
      const assignmentSetting = getAssignmentSetting(assignmentId);
      if (assignmentSetting.allowBack !== undefined) {
        return NextResponse.json({ allowBack: assignmentSetting.allowBack });
      }
    }

    const setSetting = getSetSetting(id);
    return NextResponse.json({ allowBack: setSetting.allowBack ?? true });
  } catch (err) {
    return errorResponse(err, 'sets/[id]/settings GET');
  }
}

export async function PATCH(req: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    if (!isUuid(id)) return notFound('Study set');

    const body = await readJsonBody(req);
    if (typeof body?.allowBack === 'boolean') {
      saveSetSetting(id, { allowBack: body.allowBack });
      return NextResponse.json({ allowBack: body.allowBack });
    }
    return NextResponse.json({ error: 'Missing allowBack boolean.' }, { status: 400 });
  } catch (err) {
    return errorResponse(err, 'sets/[id]/settings PATCH');
  }
}
