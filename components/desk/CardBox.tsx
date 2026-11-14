'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUser } from '@/lib/auth';
import { useProfile } from '@/components/ProfileProvider';
import { canUseTeacherTools, type Role } from '@/lib/role-types';

export interface CardBoxTab {
  label: string;
  href: string;
}

// The divider tabs that stick up out of the card box. Everyone gets the Guide tab;
// signed in, users also get My Sets, History, and the pages for their role.
export function cardBoxTabs(signedIn: boolean, role: Role | null | undefined): CardBoxTab[] {
  if (!signedIn) return [{ label: 'Guide', href: '/guide' }];
  const tabs: CardBoxTab[] = [
    { label: 'My Sets', href: '/my-sets' },
    { label: 'History', href: '/history' },
  ];
  if (role === 'student') tabs.push({ label: 'My Classes', href: '/classes' });
  if (canUseTeacherTools(role)) tabs.push({ label: 'Classes', href: '/teacher' });
  if (role === 'admin') tabs.push({ label: 'Admin', href: '/admin' });
  tabs.push({ label: 'Guide', href: '/guide' });
  return tabs;
}

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

// Tabs stand at slightly different heights, like real dividers; the open
// page's tab stands tallest. Every tab shows at least 44 px above the box.
const STAGGER = ['min-h-[3.75rem]', 'min-h-14', 'min-h-[3.25rem]', 'min-h-14'];

export default function CardBox() {
  const { user } = useUser();
  const { profile } = useProfile();
  const pathname = usePathname() ?? '/';
  const tabs = cardBoxTabs(!!user, profile?.role);

  return (
    <nav aria-label="Card box" className="shrink-0">
      {tabs.length > 0 && (
        <ul className="flex items-end gap-1.5 px-3 sm:gap-2 sm:px-4">
          {tabs.map((tab, i) => {
            const active = isActive(pathname, tab.href);
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  className={`card-box-tab paper -mb-3 flex items-start rounded-t-lg px-2.5 pb-4 pt-2 text-xs font-semibold text-ink transition-transform hover:-translate-y-1 sm:px-3.5 sm:text-[13px] ${
                    active ? 'min-h-[4.25rem]' : STAGGER[i % STAGGER.length]
                  }`}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <div className="card-box-front relative rounded-xl px-4 py-2.5 sm:px-6 sm:py-3.5">
        <Link
          href="/"
          title="Make a new study guide"
          className="brass inline-flex min-h-9 items-center rounded-md px-3 font-serif text-sm font-semibold tracking-wide sm:text-base"
        >
          FlashForge
        </Link>
      </div>
    </nav>
  );
}
