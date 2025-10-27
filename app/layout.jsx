import "./globals.css";

export const metadata = {
  title: "CSVNest Pro",
  description: "AI-powered metadata generator for creatives",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
        {children}
      </body>
    </html>
  );
}
