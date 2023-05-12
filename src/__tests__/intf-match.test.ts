import * as path from "path";
import { assertBool, expectDeepContaining } from "./test-utils";
import { PropInfo, TypeIndexInfo, TypeInfo } from "../types";
import { findPropInfo, findTypeInfo } from "./test-utils";
import { parseSchema } from "../parseSchema";
import { parseSchemaFiles } from "../parseSchemaFiles";

describe("parse-schema", () => {
  describe("parseSchema", () => {
    it("should parse simple interface", () => {
      expect(
        parseSchema([
          `
            export interface Test {
              id: number;
            }`,
        ])
      ).toMatchObject([
        {
          loc: "src.0.ts:1",
          name: "Test",
          properties: [{ name: "id", type: { typeName: "number" } }],
          typeName: "Test",
        },
      ]);
    });

    describe("when parsing interfaces", () => {
      let actual: readonly TypeInfo[];
      let owner: TypeInfo;
      let item: TypeInfo;

      beforeAll(() => {
        actual = parseSchema([
          `
          type Id = string;
          enum Role { m = "master", s = "slave" }
          enum Kind { t, u }
          type Value = Role | "wat" | Kind;    
          type Bucket = { id: string };
          type CustomFields = Record< string, string | number >;
          type Logger = { level: number; };
          type Ex = CustomFields & Logger;

          interface Item {
            name?: string;
            deps: string[];
            parent?: Item;
            children: Item[];
          }
  
          export interface Owner {
            bukas: string[];
            items: Item[];
            refId1: Id | "ref" | null;
            refId2: "ref" | Id | null;
            value: Value;
            buckets: Record < string, Bucket[] >;
          }
          
          export type OwnerEx = Owner & Ex;
          `,
        ]);

        owner = findTypeInfo(actual, "Owner");
        item = findTypeInfo(actual, "Item");
      });

      it("should parse interfaces", () => {
        expect(owner).toMatchObject({
          name: "Owner",
        });
        expect(item).toMatchObject({
          name: "Item",
        });
      });

      it("should parse props", () => {
        expect(owner.properties.map((p) => p.name)).toMatchObject([
          "bukas",
          "items",
          "refId1",
          "refId2",
          "value",
          "buckets",
        ]);
        expect(item.properties.map((p) => p.name)).toMatchObject([
          "name",
          "deps",
          "parent",
          "children",
        ]);
      });

      it("should reuse same types", () => {
        const stringType = findPropInfo(owner, "bukas").type.arrayOf;
        expect(stringType).toMatchObject<TypeInfo>({ typeName: "string" });
        expect(stringType).toBe(findPropInfo(item, "name").type);
        expect(stringType).toBe(findPropInfo(item, "deps").type.arrayOf);
      });

      it("should parse optional props", () => {
        expect(item.properties[0].isOptional).toBeTruthy();
      });

      it("should parse union prop type", () => {
        const refId1 = findPropInfo(owner, "refId1");
        expect(refId1).toMatchObject<PropInfo>({
          name: "refId1",
          type: {
            typeName: "string",
            allowedValues: ["ref"],
            isNullable: true,
          },
        });

        expect(refId1.type).toBe(findPropInfo(owner, "refId2").type);
      });

      it("should survive recursion", () => {
        const parent = findPropInfo(item, "parent");
        const children = findPropInfo(item, "children");
        expect(parent.type).toBe(item);
        expect(children.type.arrayOf).toBe(item);
      });

      it("should resolve enum values", () => {
        const value = findPropInfo(owner, "value");
        expect(value).toMatchObject({
          name: "value",
          type: {
            name: "Value",
            allowedValues: ["wat"],
            unionOf: [
              { name: "Role", allowedValues: ["master", "slave"] },
              { name: "Kind", allowedValues: [0, 1] },
            ],
          },
        });
      });

      it("should create indexed type for Record", () => {
        const buckets = findPropInfo(owner, "buckets");
        expect(buckets.type).toMatchObject<TypeInfo>({
          typeName: `Record<string, Bucket[]>`,
          indexes: [
            {
              keyType: { typeName: "string" },
              type: {
                typeName: "Bucket[]",
                arrayOf: {
                  name: "Bucket",
                  typeName: "Bucket",
                  properties: [{ name: "id", type: { typeName: "string" } }],
                },
              },
            },
          ],
        });
      });

      it("should parse intersection type", () => {
        const ownerEx = findTypeInfo(actual, "OwnerEx");
        expect(ownerEx).toMatchObject({
          name: "OwnerEx",
        });

        expect(ownerEx.indexes).toMatchObject<TypeIndexInfo[]>([
          {
            keyType: { typeName: "string" },
            type: {
              typeName: "string | number",
              unionOf: [{ typeName: "string" }, { typeName: "number" }],
            },
          },
        ]);

        expect(findPropInfo(ownerEx, "level")).toMatchObject({
          name: "level",
          type: { typeName: "number" },
        });
      });
    });

    /*
            ${"export type RefId = Id; export type Id = string"} | ${"RefId"} | ${{ typeName: "string" } satisfies TypeInfo}
              ${"export type Id = string"}                                   | ${{ typeName: "string" } satisfies TypeInfo}


             */
    it.each`
      def | expected
      ${"export type Value = number | string"} | ${{
  name: "Value",
  unionOf: [{ typeName: "number" }, { typeName: "string" }],
}}
      ${"export type Value = number | string | null"} | ${{
  name: "Value",
  isNullable: true,
  unionOf: [{ typeName: "number" }, { typeName: "string" }],
}}
      ${"type Id = string | null; export type Value = Id | number;"} | ${{
  name: "Value",
  isNullable: true,
  unionOf: [{ typeName: "string" }, { typeName: "number" }],
}}
      ${"type Id = string; export type Ids = (Id | null)[];"} | ${{
  typeName: "Ids",
  arrayOf: { isNullable: true, typeName: "string" },
}}
      ${`type Id1 = { id: string }; type Id2 = { _id: string }; export interface Boo extends Id1, Id2 {  boo: string; }`} | ${{
  name: "Boo",
  properties: [{ name: "boo", type: { typeName: "string" } }, {
      name: "id",
      type: { typeName: "string" },
    }, { name: "_id", type: { typeName: "string" } }],
}}
      ${`enum Role { master, slave } export type Value = Role | string | null`} | ${{
  name: "Value",
  isNullable: true,
  unionOf: [{ name: "Role", allowedValues: [0, 1] }, { typeName: "string" }],
}}
      ${`enum Role { master, slave } export type Value = Role | "wat" | null`} | ${{
  name: "Value",
  isNullable: true,
  allowedValues: ["wat"],
  unionOf: [{ name: "Role", allowedValues: [0, 1] }],
}}
      ${`enum Role { m = "master", s = "slave" } enum Kind { t, u } export type Value = Role | "wat" | Kind`} | ${{
  name: "Value",
  allowedValues: ["wat"],
  unionOf: [{ name: "Role", allowedValues: ["master", "slave"] }, { name: "Kind", allowedValues: [0, 1] }],
}}
    `("should parse `$def` as `$expected`", ({ def, expected }) => {
      const actual = parseSchema([def]);
      const typeInfo = findTypeInfo(actual, expected.name);
      expect(typeInfo).toMatchObject<Partial<TypeInfo>>(expected);
    });

    /*
     */
    it.each`
      refdef | typeref | expected | allowedValues
      ${`type Role = "plain" | "master";`} | ${"Role"} | ${{
  isEnum: false,
  isNullable: false,
  isOptional: false,
}} | ${["plain", "master"]}
      ${`type Role = "plain" | "master";`} | ${"Role"} | ${{
  isEnum: false,
  isNullable: false,
  isOptional: true,
}} | ${["plain", "master"]}
      ${`type Role = "plain" | 1 | null;`} | ${"Role"} | ${{
  isEnum: false,
  isNullable: true,
  isOptional: true,
}} | ${["plain", 1]}
      ${`type Role = "plain" | "master";`} | ${"Role | null"} | ${{
  isEnum: false,
  isNullable: true,
  isOptional: false,
}} | ${["plain", "master"]}
      ${`enum Role { p = "plain", m = "master" }`} | ${"Role"} | ${{
  isEnum: true,
  isNullable: false,
  isOptional: false,
}} | ${["plain", "master"]}
    `(
      "should parse `$refdef`, referenced as `$typeref`, to $expected with allowedValues: $allowedValues",
      ({
        refdef,
        typeref,
        expected: { isEnum, isNullable, isOptional },
        allowedValues,
      }) => {
        const actual = parseSchema([
          `
        ${refdef}
        
        export interface Test {
          prop${isOptional ? "?" : ""}: ${typeref};
        }`,
        ]);
        const typeInfo: TypeInfo = findTypeInfo(actual, "Test");

        expect(typeInfo.properties[0]).toMatchObject({
          name: "prop",
        });
        assertBool(typeInfo.properties[0].isOptional, isOptional);
        assertBool(typeInfo.properties[0].type.isNullable, isNullable);
        assertBool(typeInfo.properties[0].type.isEnum, isEnum);

        allowedValues
          ? expect(typeInfo.properties[0].type.allowedValues).toEqual(
              allowedValues
            )
          : expect(typeInfo.properties[0].type.allowedValues).toBeFalsy();
      }
    );

    describe("when parsing index types", () => {
      let actual: readonly TypeInfo[];

      beforeAll(() => {
        actual = parseSchema([
          `
          export interface Whatever {
            _id: string;
            [field: string | number]: string | number | Date;
          }
          
          interface ThingBase {
            kind: "belonging" | "ephemeral";
          }

          export type Thing = ThingBase & Record< string, string >;
        `,
        ]);
      });

      it("should parse indexed interface", () => {
        expect(actual).toEqual(
          expectDeepContaining<TypeInfo[]>([
            {
              name: "Whatever",
              properties: [{ name: "_id", type: { typeName: "string" } }],
              indexes: [
                {
                  keyType: {
                    typeName: expect.any(String),
                    unionOf: [{ typeName: "string" }, { typeName: "number" }],
                  },
                  type: {
                    typeName: "string | number | Date",
                    unionOf: [
                      { typeName: "string" },
                      { typeName: "number" },
                      { typeName: "Date" },
                    ],
                  },
                },
              ],
            },
          ])
        );
      });

      it("should parse union type with index", () => {
        expect(actual).toEqual(
          expectDeepContaining<TypeInfo[]>([
            {
              name: "Thing",
              indexes: [
                {
                  keyType: {
                    typeName: "string",
                  },
                  type: {
                    typeName: "string",
                  },
                },
              ],
            },
          ])
        );
      });
    });

    describe("when parsing intersection types along multiple files", () => {
      let actual: readonly TypeInfo[];

      beforeAll(() => {
        actual = parseSchema({
          "common.ts": `
            export type CustomFields = Record< string, string | number >;`,

          "line-item.ts": `
            import { CustomFields } from "common.ts";
            
            export interface LineItemBase {
              _id: string;
            }
            
            export type LineItem = LineItemBase & CustomFields;`,

          "order.ts": `
            import { CustomFields } from "common.ts";
            import { LineItem } from "line-item.ts";
            
            export interface OrderBase {
              _id: string;
              line_items: LineItem[];
            }
            
            export type Order = OrderBase & CustomFields;`,
        });
      });

      it("should collect props from intersection type", () => {
        expect(actual.map((intf) => intf.name)).toEqual(
          expect.arrayContaining(["OrderBase", "LineItemBase"])
        );
      });
    });
  });

  describe.skip("parseSchemaFiles", () => {
    const schemaTsFilePath = path.join(__dirname, "schema.ts");

    let actual: readonly TypeInfo[];

    beforeAll(() => {
      actual = parseSchemaFiles([schemaTsFilePath]);
    });

    it("should parse exported interfaces", () => {
      expect(actual).toEqual(
        expectDeepContaining<TypeInfo[]>([
          { name: "Order" },
          { name: "LineItem" },
          { name: "Product" },
          { name: "PostData" },
        ])
      );
    });
  });
});
