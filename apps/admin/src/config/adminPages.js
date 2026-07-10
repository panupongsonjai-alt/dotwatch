import {
  Activity,
  Bell,
  Cpu,
  CreditCard,
  Database,
  LayoutDashboard,
  MonitorSmartphone,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react'

export const ADMIN_PAGE_META = {
  overview: {
    section: 'Control Center',
    title: 'Overview',
    description: 'System-wide users, devices, subscriptions, and operations summary.',
    icon: LayoutDashboard,
  },
  users: {
    section: 'Management',
    title: 'Users',
    description: 'Manage user access, account status, device limits, and plan assignment.',
    icon: Users,
  },
  devices: {
    section: 'Management',
    title: 'Devices',
    description: 'Monitor all devices across organizations and users from one admin view.',
    icon: MonitorSmartphone,
  },
  models: {
    section: 'Product',
    title: 'Device Models',
    description: 'Maintain device model definitions and default metric mapping.',
    icon: Cpu,
  },
  subscriptions: {
    section: 'Commercial',
    title: 'Subscriptions',
    description: 'Review plans, limits, usage, and subscription readiness.',
    icon: CreditCard,
  },
  audit: {
    section: 'Security',
    title: 'Audit Logs',
    description: 'Track admin actions and important system changes.',
    icon: Bell,
  },
  system: {
    section: 'System',
    title: 'System',
    description: 'Review backend readiness, API mode, and admin runtime configuration.',
    icon: Database,
  },
  settings: {
    section: 'System',
    title: 'Settings',
    description: 'Admin console preferences and operational settings.',
    icon: Settings,
  },
}

export const ADMIN_MENU_GROUPS = [
  {
    section: 'Control Center',
    items: [{ id: 'overview', label: 'Overview', icon: LayoutDashboard }],
  },
  {
    section: 'Management',
    items: [
      { id: 'users', label: 'Users', icon: Users },
      { id: 'devices', label: 'Devices', icon: MonitorSmartphone },
    ],
  },
  {
    section: 'Product',
    items: [{ id: 'models', label: 'Device Models', icon: Cpu }],
  },
  {
    section: 'Commercial',
    items: [{ id: 'subscriptions', label: 'Subscriptions', icon: CreditCard }],
  },
  {
    section: 'Security',
    items: [{ id: 'audit', label: 'Audit Logs', icon: Bell }],
  },
  {
    section: 'System',
    items: [
      { id: 'system', label: 'System', icon: Database },
      { id: 'settings', label: 'Settings', icon: Settings },
    ],
  },
]

export const ADMIN_QUICK_LINKS = [
  { id: 'overview', label: 'View admin overview' },
  { id: 'users', label: 'Review users and roles' },
  { id: 'devices', label: 'Check device fleet status' },
  { id: 'models', label: 'Manage device model mapping' },
  { id: 'audit', label: 'Review recent admin activity' },
  { id: 'system', label: 'Check admin runtime health' },
]

export const ADMIN_PAGE_STORAGE_KEY = 'dotwatchAdminActivePage'
export const ADMIN_SIDEBAR_STORAGE_KEY = 'dotwatchAdminSidebarOpen'
export const ADMIN_PAGE_KEYS = Object.keys(ADMIN_PAGE_META)
export const ADMIN_BRAND_ICON = Activity
export const ADMIN_ACCESS_ICON = ShieldCheck
