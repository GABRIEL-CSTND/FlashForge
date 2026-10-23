import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/roles';
import { ADMIN_ROLES } from '@/lib/role-types';
import { getGenerationLimits, getUsage, quotaDay } from '@/lib/admin';
import { MAIN_MODEL_DAILY_QUOTA, MODEL_IDS } from '@/lib/gemini';
import { errorResponse } from '@/lib/route-helpers';

const USAGE_DAYS = 14;

// Study-guide generations for the last 14 quota days (#62): per day and model,
// failures, average wait, and the top users, plus the daily limits (#63).
// Admins only.
export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ADMIN_ROLES);
    const [usage, limits] = await Promise.all([getUsage(USAGE_DAYS), getGenerationLimits()]);
    return NextResponse.json({
      today: quotaDay(new Date()),
      periodDays: USAGE_DAYS,
      // In the order they're tried: the main model first, then the backups.
      models: MODEL_IDS,
      mainModelDailyQuota: MAIN_MODEL_DAILY_QUOTA,
      // The daily limits per role (#63).
      limits,
      ...usage,
    });
  } catch (err) {
    return errorResponse(err, 'admin/usage GET');
  }
}
