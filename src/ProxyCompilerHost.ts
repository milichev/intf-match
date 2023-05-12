import ts from "typescript";
import { log, rootDir } from "./utils";

export class ProxyCompilerHost implements ts.CompilerHost {
  private files: Map<string, ts.SourceFile> = new Map();

  constructor(public readonly cwd: string = rootDir) {}

  addFile(fileName: string, content: string) {
    const file = ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest);
    this.files.set(fileName, file);
  }

  getSourceFile(
    fileName: string,
    languageVersion: ts.ScriptTarget,
    onError?: (message: string) => void
  ): ts.SourceFile | undefined {
    if (this.files.has(fileName)) {
      return this.files.get(fileName);
    }
    if (this.fileExists(fileName)) {
      const src = this.readFile(fileName);
      if (!src) {
        return undefined;
      }
      const sourceFile = ts.createSourceFile(fileName, src, languageVersion);
      this.files.set(fileName, sourceFile);
      return sourceFile;
    }
  }

  getDefaultLibFileName(options: ts.CompilerOptions): string {
    return ts.getDefaultLibFilePath(options);
  }

  writeFile() {
    // Not necessary for this example, can be left blank
  }

  getCurrentDirectory(): string {
    return this.cwd ?? ts.sys.getCurrentDirectory();
  }

  getDirectories(path: string): string[] {
    return ts.sys.getDirectories(path);
  }

  getCanonicalFileName(fileName: string): string {
    return ts.sys.useCaseSensitiveFileNames ? fileName : fileName.toLowerCase();
  }

  useCaseSensitiveFileNames(): boolean {
    return ts.sys.useCaseSensitiveFileNames;
  }

  readFile(fileName: string): string | undefined {
    if (this.files.has(fileName)) {
      return this.files.get(fileName)?.text;
    }
    return ts.sys.readFile(fileName);
  }

  fileExists(fileName: string): boolean {
    return this.files.has(fileName) || ts.sys.fileExists(fileName);
  }

  realpath?(path: string): string {
    return ts.sys.realpath ? ts.sys.realpath(path) : path;
  }

  trace?(s: string): void {
    log(s);
  }

  directoryExists?(directoryName: string): boolean {
    return ts.sys.directoryExists
      ? ts.sys.directoryExists(directoryName)
      : true;
  }

  getNewLine(): string {
    return ts.sys.newLine;
  }
}
