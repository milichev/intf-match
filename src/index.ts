import fs from "fs";
import path from "path";
import { validateData } from "./validateData";

import { parseSchemaFiles } from "./parseSchemaFiles";

const [, , jsonArg, schemaArg, typeArg] = process.argv;

if (!jsonArg || !schemaArg || !typeArg) {
  console.error(`
Missing arguments. Usage:
path/to/data.json "path/to/schema1.ts,path/to/schema1.ts" InterfaceName
`);
  process.exit(1);
}

const jsonFileName = path.resolve(process.cwd(), jsonArg);
if (!fs.existsSync(jsonFileName)) {
  console.error(`Input JSON file "${jsonFileName}" not found`);
  process.exit(1);
}

const schemaFiles = schemaArg
  .split(/\s*,\s*/)
  .map((fn) => path.resolve(process.cwd(), fn));
schemaFiles.forEach((fn) => {
  path.resolve(process.cwd(), jsonArg);
  if (!fs.existsSync(fn)) {
    console.error(`Schema file "${fn}" not found`);
    process.exit(1);
  }
});

if (!/^\w+$/.test(typeArg)) {
  console.error(`Expected type name as declared in schema, got "${typeArg}"`);
  process.exit(1);
}

function main() {
  const interfaces = parseSchemaFiles(schemaFiles);
  if (!interfaces.some((intf) => intf.name === typeArg)) {
    console.error(`Type ${typeArg} is not defined in the schema files`);
    process.exit(1);
  }
  const postData = JSON.parse(fs.readFileSync(jsonFileName, "utf-8"));
  const result = validateData(postData, interfaces, typeArg);

  if (result.errors?.length === 0) {
    console.log("Data matches the schema");
  } else {
    console.log(
      "The following schema mismatches detected:\n",
      JSON.stringify(result.errors, null, 2)
    );
  }
}

main();
