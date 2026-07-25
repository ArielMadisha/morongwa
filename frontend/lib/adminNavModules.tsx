import type { LucideIcon } from 'lucide-react';
import {
  BarChart2,
  Building2,
  Car,
  ClipboardList,
  DollarSign,
  Film,
  Globe2,
  Home,
  Image,
  Layers,
  LayoutGrid,
  Mail,
  Megaphone,
  MessageSquare,
  Music2,
  Package,
  PackageSearch,
  Radio,
  Settings,
  Shield,
  Ship,
  ShoppingBag,
  Store,
  TrendingUp,
  Truck,
  MapPinned,
  Tv,
  Users,
  Video,
  Wallet,
  AlertTriangle,
  FileText,
  Trash2,
} from 'lucide-react';
import type { AdminNavGate, AdminPermissionsMe } from '@/lib/adminSectionAccess';
import { adminModuleVisible } from '@/lib/adminSectionAccess';

export type AdminQuickModule = {
  href: string;
  title: string;
  desc: string;
  color: string;
  icon: LucideIcon;
  gate: AdminNavGate;
  /** Sidebar / “Modules” menu grouping */
  group: string;
};

const S = (sections: readonly string[]): AdminNavGate => ({ kind: 'sections', sections });

/** Single source for admin nav + dashboard quick actions (must match API section gates). */
export const ADMIN_QUICK_MODULES: AdminQuickModule[] = [
  { href: '/admin', title: 'Dashboard', desc: 'Overview & stats', color: 'sky', icon: Home, group: 'Overview', gate: { kind: 'always' } },
  { href: '/admin/coverage', title: 'Site coverage', desc: 'Map public pages to admin tools', color: 'indigo', icon: ClipboardList, group: 'Platform', gate: { kind: 'superAdminOnly' } },
  { href: '/admin/admins', title: 'Create admins', desc: 'Delegated roles & sections', color: 'indigo', icon: Shield, group: 'Platform', gate: { kind: 'superAdminOnly' } },
  {
    href: '/admin/legacy-accounts',
    title: 'Legacy publisher accounts',
    desc: 'UAT / TV logins — usernames & password reset',
    color: 'indigo',
    icon: Users,
    group: 'Platform',
    gate: { kind: 'superAdminOnly' },
  },
  { href: '/admin/audit', title: 'Audit log', desc: 'Role-based actions & audit trail', color: 'indigo', icon: FileText, group: 'Platform', gate: { kind: 'superAdminOnly' } },
  {
    href: '/admin/supplier-deletion-requests',
    title: 'Supplier removal queue',
    desc: 'Approve permanent supplier deletions',
    color: 'orange',
    icon: Trash2,
    group: 'Platform',
    gate: { kind: 'superAdminOnly' },
  },
  {
    href: '/admin/store-deletion-requests',
    title: 'Store removal queue',
    desc: 'Approve permanent store deletions',
    color: 'orange',
    icon: Trash2,
    group: 'Platform',
    gate: { kind: 'superAdminOnly' },
  },
  { href: '/admin/pricing', title: 'Pricing config', desc: 'Manage fees & FX rates', color: 'cyan', icon: Settings, group: 'Platform', gate: { kind: 'superAdminOnly' } },
  { href: '/admin/worldpay-payouts', title: 'Worldpay payouts', desc: 'Payee profiles & payout tests', color: 'cyan', icon: Globe2, group: 'Platform', gate: { kind: 'superAdminOnly' } },
  { href: '/admin/messages', title: 'Direct messages', desc: 'Recent user-to-user DMs (oversight)', color: 'sky', icon: MessageSquare, group: 'Messages', gate: S(['messages_dm']) },
  {
    href: '/admin/broadcast',
    title: 'Message users',
    desc: 'Send announcements to all users or by area',
    color: 'sky',
    icon: Megaphone,
    group: 'Messages',
    gate: S(['user_broadcast']),
  },
  { href: '/admin/live', title: 'Live streaming', desc: 'HLS/RTMP status, broadcasters, force end', color: 'orange', icon: Radio, group: 'Media', gate: S(['live_streaming']) },
  { href: '/admin/tv-channel', title: 'QwertyTV linear channel', desc: '24/7 VOD queue & transport', color: 'purple', icon: Film, group: 'Media', gate: S(['tv_channel']) },
  { href: '/admin/tv', title: 'QwertyTV', desc: 'Moderate posts, comments & reports', color: 'purple', icon: Tv, group: 'Media', gate: S(['tv_posts', 'tv_comments', 'tv_reports']) },
  { href: '/admin/music', title: 'QwertyMusic', desc: 'Songs & albums catalog', color: 'purple', icon: Music2, group: 'Media', gate: S(['artist_accounts', 'music_sound_library']) },
  {
    href: '/admin/music-sound-library',
    title: 'Music Sounds (QwertyTV)',
    desc: 'Approve Sounds for video posts',
    color: 'purple',
    icon: Music2,
    group: 'Media',
    gate: S(['music_sound_library', 'artist_accounts']),
  },
  { href: '/admin/artists', title: 'Artist accounts', desc: 'Create / approve artist publishers', color: 'indigo', icon: Users, group: 'Media', gate: S(['artist_accounts']) },
  { href: '/admin/country-profiles', title: 'Country operations', desc: 'WhatsApp per country + currency', color: 'emerald', icon: Globe2, group: 'Operations', gate: S(['country_profiles']) },
  { href: '/admin/product-enquiries', title: 'Product enquiries', desc: 'Buyer–seller threads', color: 'emerald', icon: PackageSearch, group: 'Messages', gate: S(['product_enquiries']) },
  { href: '/admin/users', title: 'Manage users', desc: 'View, suspend, activate accounts', color: 'sky', icon: Users, group: 'People', gate: S(['users']) },
  { href: '/admin/merchant-agents', title: 'Merchant agents', desc: 'Approve cash agents (ACBPayWallet)', color: 'cyan', icon: Wallet, group: 'People', gate: S(['merchant_agents']) },
  {
    href: '/admin/merchant-fees',
    title: 'Merchant fee governance',
    desc: 'Per-country fee defaults & caps',
    color: 'cyan',
    icon: Settings,
    group: 'People',
    gate: S(['merchant_agents']),
  },
  {
    href: '/admin/tuckshop-cash-agents',
    title: 'Tuckshop cash agents',
    desc: 'WhatsApp tuckshop registrations',
    color: 'emerald',
    icon: Store,
    group: 'People',
    gate: S(['tuckshop_cash_agents']),
  },
  {
    href: '/admin/fraud-registration-exceptions',
    title: 'Registration fraud signals',
    desc: 'Duplicate IDs, docs, proximity',
    color: 'orange',
    icon: AlertTriangle,
    group: 'People',
    gate: S(['fraud_registration']),
  },
  { href: '/admin/runners', title: 'Runner applications', desc: 'PDP & vehicle verification', color: 'cyan', icon: Car, group: 'People', gate: S(['runner_applications']) },
  { href: '/admin/adverts', title: 'Adverts (slots)', desc: 'Sidebar image slots', color: 'purple', icon: Megaphone, group: 'Growth', gate: S(['adverts']) },
  {
    href: '/admin/sponsored-video',
    title: 'Sponsored video',
    desc: 'Advertisers & placements',
    color: 'emerald',
    icon: Video,
    group: 'Growth',
    gate: S(['sponsored_video', 'web_advertising']),
  },
  { href: '/admin/advertising', title: 'Web advertising', desc: 'Rate card & onboarding', color: 'purple', icon: Layers, group: 'Growth', gate: S(['web_advertising']) },
  { href: '/admin/landing-backgrounds', title: 'Landing backgrounds', desc: 'Login/register backgrounds', color: 'sky', icon: Image, group: 'Growth', gate: S(['landing_backgrounds']) },
  { href: '/admin/tasks', title: 'Manage tasks', desc: 'Monitor & cancel tasks', color: 'emerald', icon: Package, group: 'Operations', gate: S(['tasks']) },
  { href: '/admin/suppliers', title: 'Suppliers / Sellers', desc: 'Verify sellers', color: 'cyan', icon: Building2, group: 'Commerce', gate: S(['suppliers', 'supplier_uploads']) },
  { href: '/admin/orders', title: 'Marketplace orders', desc: 'Checkout & wallet orders', color: 'purple', icon: ShoppingBag, group: 'Commerce', gate: S(['orders']) },
  {
    href: '/admin/food-restaurants',
    title: 'Food restaurants',
    desc: 'Order Food/Restaurant pickup stores',
    color: 'orange',
    icon: ShoppingBag,
    group: 'Commerce',
    gate: S(['orders', 'products', 'stores']),
  },
  {
    href: '/admin/shipping',
    title: 'Shipping',
    desc: 'Courier config & parcel tracking',
    color: 'cyan',
    icon: Ship,
    group: 'Commerce',
    gate: S(['couriers', 'orders']),
  },
  { href: '/admin/money-metrics', title: 'Money metrics', desc: 'Date range totals & CSV', color: 'emerald', icon: TrendingUp, group: 'Finance', gate: S(['money_metrics']) },
  {
    href: '/admin/dropshipping-profit',
    title: 'Dropshipping profit',
    desc: 'COGS, fees, net margin',
    color: 'emerald',
    icon: BarChart2,
    group: 'Commerce',
    gate: S(['dropshipping', 'orders', 'products']),
  },
  { href: '/admin/products', title: 'Load Products', desc: 'Catalog & listings', color: 'emerald', icon: Package, group: 'Commerce', gate: S(['products', 'product_uploads']) },
  { href: '/admin/dropship', title: 'Dropshipping', desc: 'CJ, EPROLO, SHEIN — import & stock', color: 'cyan', icon: Truck, group: 'Commerce', gate: S(['dropshipping', 'products', 'product_uploads']) },
  { href: '/admin/stores', title: 'Stores', desc: 'Supplier & reseller stores', color: 'cyan', icon: Building2, group: 'Commerce', gate: S(['stores']) },
  { href: '/admin/reseller', title: 'Reseller stats', desc: 'Walls and products on walls', color: 'indigo', icon: LayoutGrid, group: 'Commerce', gate: S(['reseller_stats']) },
  { href: '/admin/escrows', title: 'Escrow & ledger', desc: 'Release, refund, payouts', color: 'orange', icon: DollarSign, group: 'Finance', gate: S(['escrows']) },
  { href: '/admin/payouts', title: 'FNB payouts', desc: 'Initiate & poll payouts', color: 'orange', icon: Wallet, group: 'Finance', gate: S(['escrows']) },
  { href: '/admin/support', title: 'Support tickets', desc: 'User support requests', color: 'sky', icon: Mail, group: 'Messages', gate: S(['support']) },
  { href: '/admin/policies', title: 'Policies', desc: 'Legal & platform policies', color: 'indigo', icon: FileText, group: 'Operations', gate: S(['policies']) },
];

export function filterAdminQuickModules(perms: AdminPermissionsMe | null): AdminQuickModule[] {
  return ADMIN_QUICK_MODULES.filter((m) => adminModuleVisible(perms, m.gate));
}

/** Modules shown in dashboard grid (exclude self-link to /admin). */
export function filterAdminQuickModulesForDashboard(perms: AdminPermissionsMe | null): AdminQuickModule[] {
  return filterAdminQuickModules(perms).filter((m) => m.href !== '/admin');
}

const GROUP_ORDER = ['Overview', 'Messages', 'Commerce', 'People', 'Media', 'Finance', 'Growth', 'Operations', 'Platform'];

function sortAdminModuleGroups(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const ia = GROUP_ORDER.indexOf(a);
    const ib = GROUP_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

function groupAdminModules(modules: AdminQuickModule[]): { group: string; items: AdminQuickModule[] }[] {
  const by = new Map<string, AdminQuickModule[]>();
  for (const m of modules) {
    const g = m.group;
    if (!by.has(g)) by.set(g, []);
    by.get(g)!.push(m);
  }
  return sortAdminModuleGroups([...by.keys()]).map((group) => ({ group, items: by.get(group)! }));
}

export function groupedAdminNavModules(perms: AdminPermissionsMe | null): { group: string; items: AdminQuickModule[] }[] {
  return groupAdminModules(filterAdminQuickModules(perms));
}

/** Dashboard quick actions grouped (excludes /admin overview link). */
export function groupedAdminQuickModulesForDashboard(perms: AdminPermissionsMe | null): { group: string; items: AdminQuickModule[] }[] {
  return groupAdminModules(filterAdminQuickModulesForDashboard(perms));
}
