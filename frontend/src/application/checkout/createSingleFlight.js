export const createSingleFlight = () => {
  let active = false;

  return {
    isActive: () => active,

    async run(task) {
      if (active) return { executed: false };

      active = true;
      try {
        return { executed: true, value: await task() };
      } finally {
        active = false;
      }
    },
  };
};
