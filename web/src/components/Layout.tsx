import { Outlet, Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Monitor, Bell, BookOpen, Settings, Activity, Terminal,
  LayoutDashboard, Shield, ArrowUpCircle,
} from 'lucide-react';
import clsx from 'clsx';

const navSections = [
  {
    label: 'Management',
    items: [
      { path: '/', label: 'Devices', icon: LayoutDashboard },
      { path: '/alerts', label: 'Alerts', icon: Bell, badge: true },
    ],
  },
  {
    label: 'Tools',
    items: [
      { path: '/knowledge-base', label: 'Knowledge Base', icon: BookOpen },
    ],
  },
  {
    label: 'System',
    items: [
      { path: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

function UpdateBanner() {
  const { data } = useQuery({
    queryKey: ['versionCheck'],
    queryFn: api.version.check,
    refetchInterval: 6 * 60 * 60 * 1000, // check every 6 hours
    staleTime: 6 * 60 * 60 * 1000,
  });

  if (!data?.updateAvailable) return null;

  return (
    <div className="mx-2 mb-2">
      <a
        href={data.releaseUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg no-underline hover:bg-emerald-500/15 transition-colors"
      >
        <div className="flex items-center gap-2 text-emerald-400 text-xs font-medium mb-1">
          <ArrowUpCircle className="w-3.5 h-3.5" />
          Update available
        </div>
        <div className="text-[11px] text-gray-400">
          v{data.current} &rarr; v{data.latest}
        </div>
      </a>
    </div>
  );
}

export default function Layout() {
  const location = useLocation();
  const { data: alertSummary } = useQuery({
    queryKey: ['alertSummary'],
    queryFn: api.alerts.summary,
  });

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-56 bg-gray-900 border-r border-gray-800 flex flex-col z-50">
        {/* Brand */}
        <div className="px-4 py-4 border-b border-gray-800">
          <Link to="/" className="flex items-center gap-2.5 text-white no-underline">
            <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center">
              <Shield className="w-4.5 h-4.5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-sm font-bold leading-tight tracking-tight">AI Remote</h1>
              <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">RMM</p>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {navSections.map((section) => (
            <div key={section.label} className="mb-3">
              <div className="px-4 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                {section.label}
              </div>
              {section.items.map(({ path, label, icon: Icon, badge }) => {
                const isActive =
                  path === '/'
                    ? location.pathname === '/' || location.pathname.startsWith('/agents')
                    : location.pathname.startsWith(path);

                return (
                  <Link
                    key={path}
                    to={path}
                    className={clsx(
                      'flex items-center gap-2.5 mx-2 px-3 py-2 rounded-md text-[13px] no-underline transition-colors',
                      isActive
                        ? 'bg-emerald-500/10 text-emerald-400 font-medium'
                        : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                    {badge && alertSummary && alertSummary.totalUnresolved > 0 && (
                      <span className="ml-auto bg-red-500/90 text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full">
                        {alertSummary.totalUnresolved}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Update banner */}
        <UpdateBanner />

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-800 text-[10px] text-gray-600">
          AI Remote RMM v1.0
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-56 flex-1 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
