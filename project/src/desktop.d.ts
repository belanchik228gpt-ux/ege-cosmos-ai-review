export {};
declare global {
  type CosmosBackground = {
    id: string;
    title: string;
    version: string;
    author?: string;
    createdWith?: string;
    preview: string;
    static: string;
    previewUrl: string;
    staticUrl: string;
    variants: { high?: string; medium?: string; low?: string };
  };
  type CosmosModelStatus = {
    available: boolean;
    model?: string;
    state?: 'missing' | 'installed' | 'starting' | 'ready';
    detail?: string;
    backend?: 'auto' | 'gpu' | 'cpu';
    mode?: 'gpu' | 'cpu';
    busy?: boolean;
    lastElapsedMs?: number;
  };
  type CosmosOpenAIStatus = {
    available: boolean;
    runtimeAvailable: boolean;
    authenticated: boolean | null;
    state:
      | 'signed-out'
      | 'signing-in'
      | 'ready'
      | 'connecting'
      | 'offline'
      | 'error'
      | 'unavailable';
    busy: boolean;
    account?: { email?: string; planType?: string };
    models: Array<{ id: string; displayName: string; isDefault: boolean }>;
    selectedModel?: string;
    detail?: string;
    runtimeVersion?: string;
  };
  type CosmosOpenAITutorRequest = {
    mode?: 'ege' | 'school';
    grade?: 7 | 8 | 9 | 10 | 11;
    requestId?: string;
    conversationId: string;
    subject: string;
    instructions: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    model?: string;
    image?: { dataUrl: string; name: string };
  };
  type CosmosOpenAITutorResponse = {
    learningStep?: import('./domain/cloud-learning').LearningStep;
    verification?: import('./domain/answer-review').AnswerReview;
    ok: boolean;
    text?: string;
    title?: string;
    question?: string;
    phase?: 'understand' | 'explain' | 'practice' | 'review' | 'summary';
    scene?: {
      figure?: import('../shared/subject-figures.mjs').SubjectFigure;
      kind: 'number-line' | 'algebra' | 'function' | 'geometry' | 'syntax' | 'history' | 'concept';
      title: string;
      steps: Array<{ caption: string; formula?: string; values?: number[]; labels?: string[] }>;
    };
    summary?: string;
    model?: string;
    elapsedMs?: number;
    firstVisibleTextMs?: number;
    error?: string;
  };
  type CosmosOpenAITutorProgress = {
    requestId: string;
    conversationId: string;
    state: 'waiting' | 'writing';
    text: string;
    elapsedMs: number;
  };
  type CosmosSchoolSource = {
    id: string;
    subject: string;
    title: string;
    grades: number[];
    url: string;
    checkedAt: string;
    year?: number;
    kind: 'program' | 'guidance' | 'standard' | 'textbook-reference';
    status: 'official-program' | 'official-guidance' | 'official-standard' | 'textbook-reference';
    pageCount: number;
    pdfSha256: string;
    textSha256: string;
  };
  interface Window {
    cosmos?: {
      listSchoolSources(): Promise<CosmosSchoolSource[]>;
      openSchoolSource(id: string): Promise<{ ok: boolean; error?: string }>;
      readSchoolSource(input: {
        id: string;
        page?: number;
        query?: string;
        maxChars?: number;
      }): Promise<{
        ok: boolean;
        source?: CosmosSchoolSource;
        fragments?: Array<{ page: number; text: string }>;
        truncated?: boolean;
        error?: string;
      }>;
      getOpenAIStatus(): Promise<CosmosOpenAIStatus>;
      loginOpenAI(): Promise<{ ok: boolean; loginId?: string; authUrl?: string; error?: string }>;
      cancelOpenAILogin(): Promise<boolean>;
      logoutOpenAI(): Promise<{ ok: boolean; error?: string }>;
      selectOpenAIModel(id: string): Promise<{ ok: boolean; error?: string }>;
      generateOpenAITutor(input: CosmosOpenAITutorRequest): Promise<CosmosOpenAITutorResponse>;
      cancelOpenAITutor(): Promise<boolean>;
      onOpenAITutorProgress(listener: (progress: CosmosOpenAITutorProgress) => void): () => void;
      listReferences(): Promise<
        Array<{
          id: string;
          sourceId: string;
          subject: 'math' | 'russian' | 'history' | 'social';
          title: string;
          year: number;
          status: 'final' | 'draft';
          kind: 'codifier' | 'specification' | 'navigator';
          checkedAt: string;
        }>
      >;
      openReference(id: string): Promise<{ ok: boolean; error?: string }>;
      loadState(): Promise<unknown>;
      saveState(state: unknown): Promise<boolean>;
      exportDocument(input: {
        mode?: 'ege' | 'school';
        grade?: 7 | 8 | 9 | 10 | 11;
        drawings?: import('./domain/cloud-learning').TutorDrawing[];
        title: string;
        subject: string;
        content: string;
        format: 'txt' | 'md' | 'html' | 'pdf' | 'docx';
        topicId?: string;
        documentType?: string;
        style?: 'cosmos' | 'paper';
        scale?: 'comfortable' | 'large';
      }): Promise<{ ok: boolean; path?: string; error?: string }>;
      openPath(path: string): Promise<boolean>;
      getDiagnostics(): Promise<Array<{ at: string; scope: string; message: string }>>;
      getWindowActivity(): Promise<{ visible: boolean; focused: boolean }>;
      onWindowVisible?(listener: (visible: boolean) => void): () => void;
      modelStatus(): Promise<CosmosModelStatus>;
      readProblemImage(input: { dataUrl: string; subject?: string }): Promise<{
        ok: boolean;
        text?: string;
        method?: 'local-vision';
        model?: string;
        uncertain?: boolean;
        warnings?: string[];
        elapsedMs?: number;
        error?: string;
      }>;
      imageReaderStatus(): Promise<{
        available: boolean;
        busy: boolean;
        model?: string;
        method: 'local-vision';
        detail?: string;
      }>;
      cancelImageReading(): Promise<boolean>;
      cancelAskModel(): Promise<boolean>;
      planTutorTurn(input: {
        subject: 'math' | 'russian' | 'history' | 'social';
        message: string;
        currentStepId: string;
        stateKey: string;
        steps: Array<{
          id: string;
          title: string;
          explanation: string;
          question: string;
          purpose?: string;
          action: 'stay' | 'focus-step';
          sourceIds: string[];
        }>;
      }): Promise<{
        ok: boolean;
        method: 'local-model-step-selection';
        selectedStepId?: string;
        action?: 'stay' | 'focus-step';
        explanation?: string;
        explanationOrigin?: 'approved-material';
        sourceIds?: string[];
        stateKey?: string;
        model?: string;
        elapsedMs?: number;
        error?: string;
      }>;
      updateModelBackend(
        backend: 'auto' | 'gpu' | 'cpu',
      ): Promise<Partial<CosmosModelStatus> & { ok: boolean; error?: string }>;
      recordTutorCheck(reason: string): Promise<boolean>;
      askModel(input: {
        subject: string;
        topic: string;
        message: string;
        context?: string;
        evidence: Array<{ id: string; text: string; sourceIds: string[] }>;
      }): Promise<{
        ok: boolean;
        text?: string;
        error?: string;
        model?: string;
        elapsedMs?: number;
        verification?: {
          status: 'supported' | 'unsupported' | 'unavailable';
          method?: 'local-model-review';
          evidenceIds?: string[];
          evidence?: Array<{ id: string; quote: string }>;
        };
      }>;
      chooseModel(): Promise<
        Partial<CosmosModelStatus> & { ok: boolean; canceled?: boolean; error?: string }
      >;
      importBackground(): Promise<{
        ok: boolean;
        background?: CosmosBackground;
        canceled?: boolean;
        error?: string;
      }>;
      listBackgrounds(): Promise<CosmosBackground[]>;
      saveMathSheet(input: {
        dataUrl: string;
      }): Promise<{ ok: boolean; path?: string; error?: string }>;
      saveHomeworkImage(input: {
        dataUrl: string;
        name: string;
      }): Promise<{ ok: boolean; id?: string; error?: string }>;
      readHomeworkImage(id: string): Promise<{
        ok: boolean;
        dataUrl?: string;
        name?: string;
        error?: string;
      }>;
      exportBuiltinBackground(id: 'cosmos-ton618'): Promise<{
        ok: boolean;
        path?: string;
        canceled?: boolean;
        error?: string;
      }>;
      getAppInfo(): Promise<{
        name: string;
        version: string;
        packaged: boolean;
        userData: string;
        documentsDir: string;
        platform: string;
      }>;
    };
  }
}
