import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { auth, signOut } from "@/lib/auth";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
	title: "最安値メモ",
	description: "商品の最安値と容量あたり単価を記録するアプリ",
};

async function Header() {
	const session = await auth();
	const user = session?.user;

	return (
		<header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
			<div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3">
				<Link href="/" className="text-lg font-bold tracking-tight">
					🛒 最安値メモ
				</Link>
				<nav className="flex items-center gap-3 text-sm">
					{user && (
						<>
							<Link href="/products/new" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
								商品追加
							</Link>
							<Link href="/categories" className="font-medium hover:underline">
								カテゴリ
							</Link>
							<form
								action={async () => {
									"use server";
									await signOut({ redirectTo: "/login" });
								}}
								className="flex items-center gap-2"
							>
								{user.image && <img src={user.image} alt="" className="h-7 w-7 rounded-full" referrerPolicy="no-referrer" />}
								<button type="submit" className="text-zinc-500 hover:underline">
									ログアウト
								</button>
							</form>
						</>
					)}
					<ThemeToggle />
				</nav>
			</div>
		</header>
	);
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="ja" suppressHydrationWarning>
			<head>
				<link rel="icon" href="/favicon.svg" type="image/svg+xml"></link>
				<script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
			</head>
			<body className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased`}>
				<Header />
				<main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
			</body>
		</html>
	);
}
