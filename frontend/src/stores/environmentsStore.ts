// Environments store: list, active env, CRUD, and resolution scope.
import { create } from 'zustand';

import { environmentsApi } from '@/lib/api/client';
import { KEYS, persistence } from '@/lib/persistence';
import { buildScope } from '@/lib/variableResolver';
import { useUiStore } from '@/stores/uiStore';
import type { Environment, EnvVar, VariableScope } from '@/types';

interface EnvState {
  environments: Environment[];
  activeEnvId: string | null;
  loading: boolean;

  load: () => Promise<void>;
  create: (name: string) => Promise<Environment | null>;
  replace: (id: string, name: string, variables: EnvVar[]) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setActive: (id: string | null) => Promise<void>;
}

export const useEnvironmentsStore = create<EnvState>((set, get) => ({
  environments: [],
  activeEnvId: persistence.get<string | null>(KEYS.activeEnv, null),
  loading: false,

  load: async () => {
    set({ loading: true });
    try {
      const environments = await environmentsApi.list();
      const serverActive = environments.find((e) => e.isActive)?.id ?? null;
      // Server is source of truth; fall back to cached localStorage value.
      const activeEnvId = serverActive ?? (get().activeEnvId && environments.some((e) => e.id === get().activeEnvId) ? get().activeEnvId : null);
      set({ environments, activeEnvId, loading: false });
      persistence.set(KEYS.activeEnv, activeEnvId);
    } catch (e) {
      set({ loading: false });
      useUiStore.getState().toast('error', 'Failed to load environments', String((e as Error).message));
    }
  },

  create: async (name) => {
    try {
      const env = await environmentsApi.create(name, []);
      set((s) => ({ environments: [...s.environments, env] }));
      useUiStore.getState().toast('success', `Environment "${name}" created`);
      return env;
    } catch (e) {
      useUiStore.getState().toast('error', 'Failed to create environment', String((e as Error).message));
      return null;
    }
  },

  replace: async (id, name, variables) => {
    const prev = get().environments;
    set((s) => ({ environments: s.environments.map((e) => (e.id === id ? { ...e, name, variables } : e)) }));
    try {
      const updated = await environmentsApi.replace(id, { name, variables });
      set((s) => ({ environments: s.environments.map((e) => (e.id === id ? updated : e)) }));
    } catch (e) {
      set({ environments: prev });
      useUiStore.getState().toast('error', 'Failed to save environment', String((e as Error).message));
    }
  },

  remove: async (id) => {
    const prev = get().environments;
    const wasActive = get().activeEnvId === id;
    set((s) => ({
      environments: s.environments.filter((e) => e.id !== id),
      activeEnvId: wasActive ? null : s.activeEnvId,
    }));
    try {
      await environmentsApi.remove(id);
      if (wasActive) persistence.set(KEYS.activeEnv, null);
    } catch (e) {
      set({ environments: prev, activeEnvId: get().activeEnvId });
      useUiStore.getState().toast('error', 'Failed to delete environment', String((e as Error).message));
    }
  },

  setActive: async (id) => {
    const prev = get().activeEnvId;
    set((s) => ({
      activeEnvId: id,
      environments: s.environments.map((e) => ({ ...e, isActive: e.id === id })),
    }));
    persistence.set(KEYS.activeEnv, id);
    try {
      if (id) await environmentsApi.patch(id, { isActive: true });
      else if (prev) await environmentsApi.patch(prev, { isActive: false });
    } catch (e) {
      set({ activeEnvId: prev });
      useUiStore.getState().toast('error', 'Failed to switch environment', String((e as Error).message));
    }
  },
}));

export function getActiveEnvironment(): Environment | null {
  const { environments, activeEnvId } = useEnvironmentsStore.getState();
  return environments.find((e) => e.id === activeEnvId) ?? null;
}

export function getScope(): VariableScope {
  return buildScope(getActiveEnvironment());
}
