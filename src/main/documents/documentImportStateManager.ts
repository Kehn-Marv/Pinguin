import { notifyDocumentImportUpdate } from "./notifier";

const inititalState: DocumentImportState = [
  {
    stage: "Initialize",
    progress: "Finished",
  },
  {
    stage: "Parse",
    progress: "Not Started",
  },
  {
    stage: "Split",
    progress: "Not Started",
  },
  {
    stage: "Embed",
    progress: "Not Started",
  },
  {
    stage: "Save Excerpts",
    progress: "Not Started",
  },
];

class DocumentImportStateManager {
  private static instance: DocumentImportStateManager | null = null;

  public static getInstance(): DocumentImportStateManager {
    if (DocumentImportStateManager.instance === null) {
      DocumentImportStateManager.instance = new DocumentImportStateManager();
    }
    return DocumentImportStateManager.instance;
  }

  private documentStates: Map<string, DocumentImportState>;

  private constructor() {
    this.documentStates = new Map();
  }

  public getDocumentState(documentID: string): DocumentImportState {
    const state = this.documentStates.get(documentID);
    if (!state) {
      throw new Error(`Document state not found for: ${documentID}`);
    }
    return state;
  }

  public updateDocumentImportState(
    documentID: string,
    stage: DocumentImportStage,
    progress: DocumentImportProgress,
    completed?: number,
    total?: number
  ) {
    if (!this.documentStates.has(documentID)) {
      this.addDocumentToImporting(documentID);
    }
    const currentState = this.documentStates.get(documentID);
    if (!currentState) {
      throw new Error(`Document state not found for: ${documentID}`);
    }
    this.documentStates.set(
      documentID,
      currentState.map((step) => {
        if (step.stage === stage) {
          return {
            ...step,
            progress,
            completed,
            total,
          };
        }
        return step;
      })
    );
    const updatedState = this.documentStates.get(documentID);
    if (updatedState) {
      notifyDocumentImportUpdate(documentID, updatedState);
    }
  }

  public addDocumentToImporting(documentID: string) {
    this.documentStates.set(documentID, inititalState);
    notifyDocumentImportUpdate(documentID, inititalState);
  }

  public removeDocumentFromImporting(documentID: string) {
    this.documentStates.delete(documentID);
    notifyDocumentImportUpdate(documentID, [] as DocumentImportState);
  }

  public getAllLoadingDocuments(): string[] {
    return Array.from(this.documentStates.keys());
  }
}

const documentImportStateManager = DocumentImportStateManager.getInstance();

export default documentImportStateManager;
