import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ProfileProvider } from "@/components/ProfileProvider";
import RoleChooser from "@/components/RoleChooser";

const geistSans = Geist({
  variable: "--font-geist-sans",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ProfileProvider>
          {children}
          <RoleChooser />
        </ProfileProvider>
      </body>
    </html>
  );
}
