# intf-match

> CLI and library for validating JSON data against TypeScript static type declarations.

## Getting Started

### Installation

NPM:

```shell
npm install -D intf-match
```

Yarn:

```shell
yarn add -D intf-match
```

You can add a `script` entry in your `package.json` file
with a shortcut command, which validates a dump JSON file.

Alternatively, you can install the CLI globally to execute it from anywhere.

### Usage

1. Suppose, you have dumped the server response to `mock/cart-data.json`.

2. The data schema is described in your TypeScript modules under `src/model`.
Also, some types are declared in `src/common.ts`

3. The interface that describes the data root is `WorkingOrderPostData`.

Thus, your command is:

```shell
intf-match mock/cart-data.json "src/model/index.ts,src/common.ts" WorkingOrderPostData
```
