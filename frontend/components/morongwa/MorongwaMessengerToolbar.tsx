'use client';

import { useState } from 'react';
import { Video, Phone, UserPlus } from 'lucide-react';

type MorongwaMessengerToolbarProps = {
  onVideoCall: () => void;
  onAudioCall: () => void;
  onStartGroupChat: () => void;
  disabled?: boolean;
};

function ToolbarIconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        className={`relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          hover ? 'bg-slate-100' : 'bg-transparent'
        }`}
        aria-label={label}
      >
        {children}
      </button>
      {hover && (
        <div
          role="tooltip"
          className="absolute top-full left-1/2 z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 shadow-lg"
        >
          {label}
        </div>
      )}
    </div>
  );
}

/** Teams-style call + group actions for Morongwa messenger header. */
export function MorongwaMessengerToolbar({
  onVideoCall,
  onAudioCall,
  onStartGroupChat,
  disabled,
}: MorongwaMessengerToolbarProps) {
  return (
    <div className="flex items-center gap-0.5">
      <ToolbarIconButton label="Video call" onClick={onVideoCall} disabled={disabled}>
        <Video className="h-5 w-5 text-[#5B5FC7]" strokeWidth={2.25} />
      </ToolbarIconButton>
      <ToolbarIconButton label="Audio call" onClick={onAudioCall} disabled={disabled}>
        <Phone className="h-5 w-5 text-[#5B5FC7]" strokeWidth={2.25} />
      </ToolbarIconButton>
      <span className="mx-1 h-6 w-px bg-slate-200" aria-hidden />
      <ToolbarIconButton label="Start a group chat" onClick={onStartGroupChat} disabled={disabled}>
        <UserPlus className="h-5 w-5 text-slate-800" strokeWidth={2} />
      </ToolbarIconButton>
    </div>
  );
}
