import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { TranslationProvider } from "@/contexts/TranslationContext";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { Toaster } from "react-hot-toast";
import ErrorBoundary from "@/components/ErrorBoundary";
import { MorongwaChatButton } from "@/components/MorongwaChatButton";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Qwertymates - Join the Qwerty Revolution",
  description: "The Digital Home for Doers, Sellers & Creators. Qwertymates.com",
  metadataBase: new URL("https://www.qwertymates.com"),
  icons: {
    icon: [
      { url: "/qwertymates-logo-icon-transparent.svg?v=3", type: "image/svg+xml" },
      { url: "/qwertymates-logo-icon-transparent.svg?v=3", sizes: "any", type: "image/svg+xml" },
    ],
    shortcut: "/qwertymates-logo-icon-transparent.svg?v=3",
    apple: [{ url: "/qwertymates-logo-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Qwertymates - Join the Qwerty Revolution",
    description: "The Digital Home for Doers, Sellers & Creators. Qwertymates.com",
    siteName: "Qwertymates",
    type: "website",
    images: [{ url: "/qwertymates-logo-icon.png" }],
  },
  twitter: {
    card: "summary",
    title: "Qwertymates - Join the Qwerty Revolution",
    description: "The Digital Home for Doers, Sellers & Creators. Qwertymates.com",
    images: ["/qwertymates-logo-icon.png"],
  },
  /** Ask Pinterest not to overlay Save on images (extension may still inject; reduces official pin behavior). */
  other: {
    pinterest: "nopin",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ErrorBoundary>
          <AuthProvider>
            <CurrencyProvider>
            <TranslationProvider>
              <div className="min-h-screen flex flex-col">
                <div className="flex-1">{children}</div>
                <MorongwaChatButton />
              </div>
              <Toaster 
              position="top-right"
              toastOptions={{
                duration: 3000,
                style: {
                  background: '#363636',
                  color: '#fff',
                },
                success: {
                  duration: 3000,
                  iconTheme: {
                    primary: '#10b981',
                    secondary: '#fff',
                  },
                },
                error: {
                  duration: 4000,
                  iconTheme: {
                    primary: '#ef4444',
                    secondary: '#fff',
                  },
                },
              }}
              />
            </TranslationProvider>
            </CurrencyProvider>
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
