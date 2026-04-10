import Link from "next/link";
import AuthBackground from "@/components/AuthBackground";

type Props = {
  searchParams?: {
    flow?: string;
    ref?: string;
  };
};

export default function PayCompletePage({ searchParams }: Props) {
  const flow = String(searchParams?.flow || "").trim().toLowerCase();
  const reference = String(searchParams?.ref || "").trim();
  const isWaSend = flow === "wa-send";

  return (
    <div className="relative min-h-screen flex flex-col">
      <AuthBackground />
      <div className="relative z-10 flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-white/95 p-8 shadow-xl text-center">
          <h1 className="text-2xl font-bold text-slate-900">Payment processing</h1>
          <p className="mt-3 text-slate-600">
            {isWaSend
              ? "Your PayGate payment was received. We are finalizing the transfer now."
              : "Your PayGate payment was received. We are finalizing it now."}
          </p>
          <p className="mt-2 text-slate-600">
            You will receive a WhatsApp confirmation once complete.
          </p>
          {reference ? (
            <p className="mt-4 text-xs text-slate-500 break-all">Reference: {reference}</p>
          ) : null}
          <div className="mt-6">
            <Link href="/login" className="text-sky-600 hover:underline">
              Go to login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
