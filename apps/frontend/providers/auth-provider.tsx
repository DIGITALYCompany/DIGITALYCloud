'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { roleAllows, type Action, type UpdateProfileInput } from '@digitalycloud/shared';
import { api, setRequestTeam } from '@/lib/api';
import { events } from '@/lib/api/events';
import { TEAM_UNAVAILABLE_EVENT, UNAUTHENTICATED_EVENT } from '@/lib/api/http-client';
import type { Team, User } from '@/lib/types';

/** A second factor is needed: the form shows the code step with this token. */
export interface TwoFactorChallenge {
  challengeToken: string;
}

interface AuthValue {
  user: User | null;
  /** Teams the user belongs to; `team` is the one this tab works in. */
  teams: Team[];
  team: Team | null;
  loading: boolean;
  login: (email: string, password: string, remember: boolean) => Promise<TwoFactorChallenge | null>;
  verifyTwoFactor: (challengeToken: string, code: string) => Promise<void>;
  /** Navigates to Google; the API brings the browser back to `from`. */
  loginWithGoogle: (from?: string) => void;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (patch: UpdateProfileInput) => Promise<User>;
  setUser: (user: User) => void;
  refreshUser: () => Promise<void>;
  refreshTeams: () => Promise<void>;
  switchTeam: (teamId: string) => Promise<void>;
  /** Whether the tab's team role allows an action (the API enforces the same matrix). */
  can: (action: Action) => boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

// The team is remembered per tab, so two tabs can work in two teams without mixing data.
const TAB_TEAM_KEY = 'dgc-tab-team';
const readTabTeam = () => {
  try {
    return sessionStorage.getItem(TAB_TEAM_KEY);
  } catch {
    return null;
  }
};
const writeTabTeam = (id: string | null) => {
  try {
    if (id) sessionStorage.setItem(TAB_TEAM_KEY, id);
    else sessionStorage.removeItem(TAB_TEAM_KEY);
  } catch {
    /* storage disabled: the session's default team is used */
  }
};

const DASHBOARD_PREFIXES = ['/dashboard', '/services', '/deployments', '/servers', '/billing', '/support', '/settings', '/admin'];
const isDashboardPath = (p: string) => DASHBOARD_PREFIXES.some((x) => p === x || p.startsWith(`${x}/`));

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUserState] = useState<User | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const pathRef = useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  const applyTeams = useCallback(async () => {
    const res = await api.teams.list();
    const wanted = readTabTeam();
    const chosen = res.data.find((t) => t.id === wanted) ?? res.data.find((t) => t.id === res.activeTeamId) ?? res.data[0] ?? null;
    setRequestTeam(chosen?.id ?? null);
    writeTabTeam(chosen?.id ?? null);
    setTeams(res.data);
    setTeam(chosen);
  }, []);

  const signedIn = useCallback(
    async (u: User) => {
      await applyTeams();
      setUserState(u);
    },
    [applyTeams]
  );

  const clear = useCallback(() => {
    events.disconnect();
    setRequestTeam(null);
    setUserState(null);
    setTeams([]);
    setTeam(null);
  }, []);

  useEffect(() => {
    let alive = true;
    api.auth
      .session()
      .then(async (u) => {
        if (!alive) return;
        if (u) await signedIn(u);
      })
      .catch(() => {
        /* API unreachable: treated as signed out; pages show their own errors */
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [signedIn]);

  // Expired or revoked session mid-use: drop all cached data and go to the login page.
  useEffect(() => {
    const onUnauthenticated = () => {
      clear();
      const p = pathRef.current;
      if (isDashboardPath(p)) router.replace(`/login?from=${encodeURIComponent(p)}`);
    };
    const onTeamUnavailable = () => {
      writeTabTeam(null);
      applyTeams().catch(() => {});
    };
    window.addEventListener(UNAUTHENTICATED_EVENT, onUnauthenticated);
    window.addEventListener(TEAM_UNAVAILABLE_EVENT, onTeamUnavailable);
    return () => {
      window.removeEventListener(UNAUTHENTICATED_EVENT, onUnauthenticated);
      window.removeEventListener(TEAM_UNAVAILABLE_EVENT, onTeamUnavailable);
    };
  }, [applyTeams, clear, router]);

  const login = useCallback(
    async (email: string, password: string, remember: boolean) => {
      const res = await api.auth.login(email, password, remember);
      if ('twoFactorRequired' in res) return { challengeToken: res.challengeToken };
      await signedIn(res);
      return null;
    },
    [signedIn]
  );

  const verifyTwoFactor = useCallback(async (challengeToken: string, code: string) => signedIn(await api.auth.verifyTwoFactor(challengeToken, code)), [signedIn]);

  const loginWithGoogle = useCallback((from = '/dashboard') => {
    window.location.assign(api.auth.googleUrl(from));
  }, []);

  const signup = useCallback(async (name: string, email: string, password: string) => signedIn(await api.auth.signup(name, email, password)), [signedIn]);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      writeTabTeam(null);
      clear();
    }
  }, [clear]);

  const updateProfile = useCallback(async (patch: UpdateProfileInput) => {
    const u = await api.account.updateProfile(patch);
    setUserState(u);
    return u;
  }, []);

  const refreshUser = useCallback(async () => {
    const u = await api.auth.session();
    if (u) setUserState(u);
    // Same path as a 401: clear cached data and send dashboard pages to the login screen.
    else window.dispatchEvent(new Event(UNAUTHENTICATED_EVENT));
  }, []);

  const switchTeam = useCallback(
    async (teamId: string) => {
      let target = teams.find((t) => t.id === teamId);
      if (!target) {
        // Just joined (invitation): the list in state is older than the membership.
        const res = await api.teams.list();
        setTeams(res.data);
        target = res.data.find((t) => t.id === teamId);
      }
      if (!target || target.id === team?.id) return;
      // This tab switches now; the session default (new tabs) follows.
      writeTabTeam(target.id);
      setRequestTeam(target.id);
      setTeam(target);
      await api.teams.select(target.id).catch(() => {});
      const u = await api.auth.session().catch(() => null);
      if (u) setUserState(u);
    },
    [teams, team]
  );

  const can = useCallback((action: Action) => roleAllows(action, team?.role), [team]);
  const value = useMemo<AuthValue>(
    () => ({ user, teams, team, loading, login, verifyTwoFactor, loginWithGoogle, signup, logout, updateProfile, setUser: setUserState, refreshUser, refreshTeams: applyTeams, switchTeam, can }),
    [user, teams, team, loading, login, verifyTwoFactor, loginWithGoogle, signup, logout, updateProfile, refreshUser, applyTeams, switchTeam, can]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
