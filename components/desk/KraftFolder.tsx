import Link from 'next/link';

// Small tilts, so folders look laid down by hand.
const TILTS = ['-1deg', '0.8deg', '-0.4deg', '1.2deg'];

// A class on the teacher's desk (desk redesign, phase 6): a kraft folder with
// a tab, the class's name and a line or two, and its join code on a brass
// plate. The whole folder is the link that opens the class.
export default function KraftFolder({
  href,
  name,
  lines,
  code,
  index,
}: {
  href: string;
  name: string;
  lines: string[];
  // The join code as students type it, e.g. K7M-2QX.
  code: string;
  index: number;
}) {
  return (
    <Link
      href={href}
      aria-label={`Open ${name}, ${lines.join(', ')}, join code ${code}`}
      className="kraft-folder relative block h-[238px] w-full max-w-[420px] rounded-[10px] text-ink"
      style={{ rotate: TILTS[index % TILTS.length] }}
    >
      <span aria-hidden="true" className="kraft absolute left-0 top-0 h-10 w-1/2 rounded-[10px_14px_0_0]" />
      <span className="kraft kraft-body absolute inset-x-0 bottom-0 top-[30px] flex flex-col gap-1.5 rounded-[0_10px_10px_10px] px-[22px] py-[18px]">
        <span className="line-clamp-2 font-serif text-2xl leading-[1.15] [overflow-wrap:anywhere]">{name}</span>
        {lines.map((line) => (
          <span key={line} className="text-sm text-[#4e4538]">
            {line}
          </span>
        ))}
        <span className="mt-auto flex items-center justify-between gap-2.5">
          <span className="brass rounded px-3 py-1 font-serif text-[15px] tracking-[0.14em]">{code}</span>
        </span>
      </span>
    </Link>
  );
}
