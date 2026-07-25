'use client';

import Image from 'next/image';
import {
  Bell,
  Calendar,
  FolderOpen,
  HelpCircle,
  MessageCircle,
  PhoneCall,
  Users,
  Video,
} from 'lucide-react';
import type { MorongwaSection } from '@/lib/api';

type Props = {
  active: MorongwaSection;
  onChange: (section: MorongwaSection) => void;
  chatUnread?: number;
  activityUnread?: number;
};

const ITEMS: {
  id: MorongwaSection;
  label: string;
  icon: React.ReactNode;
  badge?: boolean;
}[] = [
  { id: 'chat', label: 'Chat', icon: <MessageCircle className="h-5 w-5" />, badge: true },
  { id: 'meet', label: 'Meet', icon: <Video className="h-5 w-5" /> },
  { id: 'people', label: 'People', icon: <Users className="h-5 w-5" /> },
  { id: 'files', label: 'Files', icon: <FolderOpen className="h-5 w-5" /> },
  { id: 'calendar', label: 'Calendar', icon: <Calendar className="h-5 w-5" /> },
  { id: 'activity', label: 'Activity', icon: <Bell className="h-5 w-5" />, badge: true },
  { id: 'call', label: 'Call phone', icon: <PhoneCall className="h-5 w-5" /> },
  { id: 'support', label: 'Support', icon: <HelpCircle className="h-5 w-5" /> },
];

export function MorongwaRail({ active, onChange, chatUnread = 0, activityUnread = 0 }: Props) {
  const badgeFor = (id: MorongwaSection) => {
    if (id === 'chat' && chatUnread > 0) return chatUnread;
    if (id === 'activity' && activityUnread > 0) return activityUnread;
    return 0;
  };

  return (
    <nav
      className="flex shrink-0 flex-col items-center gap-1 border-r border-slate-200 bg-white px-1.5 py-3 w-[52px] sm:w-[56px]"
      aria-label="Morongwa navigation"
    >
      <div className="mb-2 hidden sm:block">
        <Image src="/messages-icon.png" alt="" width={28} height={28} className="h-7 w-7 object-contain" />
      </div>
      {ITEMS.map((item) => {
        const badge = item.badge ? badgeFor(item.id) : 0;
        const selected = active === item.id;
        return (
          <div key={item.id} className="group relative w-full flex justify-center">
            <button
              type="button"
              onClick={() => onChange(item.id)}
              className={`relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg transition-colors ${
                selected
                  ? 'bg-violet-100 text-violet-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-violet-700'
              }`}
              aria-label={item.label}
              aria-current={selected ? 'page' : undefined}
            >
              {item.icon}
              {badge > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white">
                  {badge > 9 ? '9+' : badge}
                </span>
              ) : null}
            </button>
            <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              {item.label}
            </span>
          </div>
        );
      })}
    </nav>
  );
}
