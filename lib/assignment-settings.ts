import fs from 'fs';
import path from 'path';

interface SettingsData {
  assignments: Record<string, { allowBack?: boolean }>;
  sets: Record<string, { allowBack?: boolean }>;
}

const SETTINGS_FILE = path.join(process.cwd(), 'data', 'settings.json');

function readSettings(): SettingsData {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return { assignments: {}, sets: {} };
    const content = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { assignments: {}, sets: {} };
  }
}

function writeSettings(data: SettingsData): void {
  try {
    const dir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write settings:', err);
  }
}

export function getAssignmentSetting(assignmentId: string): { allowBack?: boolean } {
  return readSettings().assignments[assignmentId] ?? {};
}

export function saveAssignmentSetting(assignmentId: string, setting: { allowBack?: boolean }): void {
  const current = readSettings();
  current.assignments[assignmentId] = { ...(current.assignments[assignmentId] ?? {}), ...setting };
  writeSettings(current);
}

export function getSetSetting(setId: string): { allowBack?: boolean } {
  return readSettings().sets[setId] ?? {};
}

export function saveSetSetting(setId: string, setting: { allowBack?: boolean }): void {
  const current = readSettings();
  current.sets[setId] = { ...(current.sets[setId] ?? {}), ...setting };
  writeSettings(current);
}
