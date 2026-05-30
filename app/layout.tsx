import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { Providers } from "@/components/providers";
import { RoleProvider } from "@/components/role-context";
import { Shell } from "@/components/shell";
import { ShipmentsProvider } from "@/lib/shipments-store";

export const metadata: Metadata = {
  title: "SuiShip | Shipment Passport Infrastructure",
  description: "AI-ready, on-chain shipment document passports for global trade."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <Providers>
            <RoleProvider>
              <ShipmentsProvider>
                <Shell>{children}</Shell>
              </ShipmentsProvider>
            </RoleProvider>
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
