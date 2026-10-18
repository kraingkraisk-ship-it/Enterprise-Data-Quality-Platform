import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Enterprise Data Quality Platform — แพลตฟอร์มบริหารคุณภาพข้อมูลองค์กร",
  description:
    "ตรวจสอบคุณภาพข้อมูลครบ 9 มิติ สร้างกฎแบบ No-code พร้อม AI ช่วยแจ้งเตือนที่ต้องมนุษย์ทบทวน ปฏิบัติตาม PDPA และมาตรฐาน ISO 8000 / DAMA-DMBOK (DQ validation, no-code rule builder, ML-assisted signals, PDPA compliant)",
  keywords: [
    "Data Quality",
    "Data Governance",
    "DQ Platform",
    "PDPA",
    "ISO 8000",
    "DAMA-DMBOK",
    "คุณภาพข้อมูล",
    "ธรรมาภิบาลข้อมูล",
  ],
  authors: [{ name: "Enterprise Data Quality Platform Team" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "Enterprise Data Quality Platform",
    description: "บริหารคุณภาพข้อมูลองค์กรอย่างถูกต้อง ตรวจสอบได้ ปลอดภัย (Data Quality validation & governance)",
    siteName: "Enterprise Data Quality Platform",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
