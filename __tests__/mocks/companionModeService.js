let mode = 'OPERATOR';
const listeners = [];

module.exports = {
  CompanionModeService: {
    isDocked: () => mode === 'DOCKED',
    getMode: () => mode,
    subscribe: listener => {
      listeners.push(listener);
      listener(mode);
      return () => {
        const idx = listeners.indexOf(listener);
        if (idx >= 0) {
          listeners.splice(idx, 1);
        }
      };
    },
    __setMode: next => {
      mode = next;
      listeners.slice().forEach(listener => listener(mode));
    },
  },
};
