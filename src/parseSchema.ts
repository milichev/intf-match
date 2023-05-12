import ts from "typescript";
import { TypeInfo } from "./types";
import { ProxyCompilerHost } from "./ProxyCompilerHost";
import { parseProgram } from "./parseProgram";
import { getCompilerOptions } from "./utils";

/**
 * Parses typescript `sources` and returns interface information.
 *
 * @param {{ [fileName: string]: string }} sources Dictionary of TypeScript sources by their file names.
 */
export function parseSchema(
  sources: Record<string, string>
): readonly TypeInfo[];
/**
 * Parses typescript `sources` and returns interface information.
 *
 * @param  sources Array of TypeScript file sources
 */
export function parseSchema(sources: readonly string[]): readonly TypeInfo[];
export function parseSchema(
  sources: readonly string[] | Record<string, string>
): readonly TypeInfo[] {
  const sourcesByFileName = Array.isArray(sources)
    ? sources.reduce((acc, src, i) => {
        acc[`src.${i}.ts`] = src;
        return acc;
      }, {} as Record<string, string>)
    : sources;
  const fileNames = Object.keys(sourcesByFileName);

  const host = new ProxyCompilerHost();
  fileNames.forEach((fileName) => {
    host.addFile(fileName, sourcesByFileName[fileName]);
  });

  const program = ts.createProgram(fileNames, getCompilerOptions(), host);
  return parseProgram(program, host.cwd);
}
