export const base44 = {
  entities: {
    ProjectTemplate: {
      get: async (id) => ({ id }),
    },
  },
  integrations: {
    Core: {
      InvokeLLM: async () => { throw new Error('offline'); },
    },
  },
};
