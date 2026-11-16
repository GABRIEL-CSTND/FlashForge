import type { Metadata } from "next";
import { Fraunces, Geist_Mono, Instrument_Sans } from "next/font/google";
import "./globals.css";
import { ProfileProvider } from "@/components/ProfileProvider";
import RoleChooser from "@/components/RoleChooser";
import Desk from "@/components/desk/Desk";

// Fraunces prints titles and card text; its optical-size axis keeps big titles
// crisp and small text sturdy. Instrument Sans is everything around the cards.
// Geist Mono stays for join codes.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
});

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Pages set their own title in their folder's layout.tsx: "My Sets · FlashForge".
  title: { default: "FlashForge", template: "%s · FlashForge" },
  description: "Upload your notes and get an AI-generated study guide: flashcards or multiple choice.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${instrumentSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* Every page sits on the desk: the card box and library card at the top,
          the page itself on a sheet of paper (components/desk/Desk.tsx). */}
      <body className="desk min-h-full flex flex-col">
        <ProfileProvider>
          <Desk>{children}</Desk>
          <RoleChooser />
        </ProfileProvider>
      </body>
    </html>
  );
}
