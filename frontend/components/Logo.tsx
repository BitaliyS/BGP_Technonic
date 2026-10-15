import Image from "next/image";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <Image
        src="/technonicol-logo.png"
        alt="Технониколь"
        width={36}
        height={36}
        className="h-9 w-9 object-contain"
        priority
      />
      <div className="leading-tight">
        <div className="text-sm font-semibold tracking-tight text-tn-ink">
          ТЕХНОНИКОЛЬ
        </div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-tn-muted">ИИ</div>
      </div>
    </div>
  );
}
