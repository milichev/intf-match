import ts from "typescript";
import { getCompilerOptions, rootDir } from "./utils";
import { TypeInfo } from "./types";
import { parseProgram } from "./parseProgram";

/**
 * Parses physical TypeScript files for types.
 *
 * @param fileNames
 * @param baseDir
 */
export function parseSchemaFiles(
  fileNames: readonly string[],
  baseDir = rootDir
): readonly TypeInfo[] {
  const program = ts.createProgram(fileNames, getCompilerOptions());
  return parseProgram(program, baseDir);
}
