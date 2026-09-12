const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld(
  'cosmos',
  Object.freeze({
    listSchoolSources: () => ipcRenderer.invoke('cosmos:list-school-sources'),
    openSchoolSource: (id) => ipcRenderer.invoke('cosmos:open-school-source', id),
    readSchoolSource: (input) => ipcRenderer.invoke('cosmos:read-school-source', input),
    getOpenAIStatus: () => ipcRenderer.invoke('cosmos:openai-status'),
    loginOpenAI: () => ipcRenderer.invoke('cosmos:openai-login'),
    cancelOpenAILogin: () => ipcRenderer.invoke('cosmos:openai-login-cancel'),
    logoutOpenAI: () => ipcRenderer.invoke('cosmos:openai-logout'),
    selectOpenAIModel: (id) => ipcRenderer.invoke('cosmos:openai-model-select', id),
    generateOpenAITutor: (input) => ipcRenderer.invoke('cosmos:openai-tutor', input),
    cancelOpenAITutor: () => ipcRenderer.invoke('cosmos:openai-tutor-cancel'),
    onOpenAITutorProgress: (listener) => {
      if (typeof listener !== 'function') return () => {};
      const receive = (_event, value) => listener(value);
      ipcRenderer.on('cosmos:openai-progress', receive);
      return () => ipcRenderer.removeListener('cosmos:openai-progress', receive);
    },
    loadState: () => ipcRenderer.invoke('cosmos:load-state'),
    saveState: (state) => ipcRenderer.invoke('cosmos:save-state', state),
    saveMathSheet: (image) => ipcRenderer.invoke('cosmos:save-math-sheet', image),
    saveHomeworkImage: (image) => ipcRenderer.invoke('cosmos:save-homework-image', image),
    readHomeworkImage: (id) => ipcRenderer.invoke('cosmos:read-homework-image', id),
    exportDocument: (document) => ipcRenderer.invoke('cosmos:export-document', document),
    openPath: (path) => ipcRenderer.invoke('cosmos:open-document', path),
    getDiagnostics: () => ipcRenderer.invoke('cosmos:diagnostics'),
    modelStatus: () => ipcRenderer.invoke('cosmos:model-status'),
    updateModelBackend: (backend) => ipcRenderer.invoke('cosmos:update-model-backend', backend),
    recordTutorCheck: (reason) => ipcRenderer.invoke('cosmos:record-tutor-check', reason),
    askModel: (request) => ipcRenderer.invoke('cosmos:ask-model', request),
    planTutorTurn: (request) => ipcRenderer.invoke('cosmos:plan-tutor-turn', request),
    cancelAskModel: () => ipcRenderer.invoke('cosmos:cancel-ask-model'),
    imageReaderStatus: () => ipcRenderer.invoke('cosmos:image-reader-status'),
    readProblemImage: (request) => ipcRenderer.invoke('cosmos:read-problem-image', request),
    cancelImageReading: () => ipcRenderer.invoke('cosmos:cancel-image-reading'),
    chooseModel: () => ipcRenderer.invoke('cosmos:choose-model'),
    importBackground: () => ipcRenderer.invoke('cosmos:import-background'),
    listBackgrounds: () => ipcRenderer.invoke('cosmos:list-backgrounds'),
    exportBuiltinBackground: (id) => ipcRenderer.invoke('cosmos:export-builtin-background', id),
    listReferences: () => ipcRenderer.invoke('cosmos:list-references'),
    openReference: (id) => ipcRenderer.invoke('cosmos:open-reference', id),
    getAppInfo: () => ipcRenderer.invoke('cosmos:app-info'),
    getWindowActivity: () => ipcRenderer.invoke('cosmos:window-activity'),
    onWindowVisible: (listener) => {
      if (typeof listener !== 'function') return () => {};
      const receive = (_event, visible) => listener(visible === true);
      ipcRenderer.on('cosmos:window-visible', receive);
      return () => ipcRenderer.removeListener('cosmos:window-visible', receive);
    },
  }),
);
